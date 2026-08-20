import { WebSocket } from 'ws';
import {
	decodeBinaryFrame,
	encodeBinaryFrame,
	BIN_KIND_TERM,
	BIN_KIND_HTTP_BODY,
	type AgentToHub,
	type HubToAgent,
} from './agent-channel.js';

// Hub-side per-agent channel. Wraps one persistent agent WebSocket and provides:
//   - message dispatch (sessions, http responses, attach acks, ws relay, ping)
//   - HTTP request tunneling with streaming bodies and request correlation
//   - browser WebSocket relay (attach/detach, input/resize, pty output)
//
// Browser-facing relay messages reuse the existing ServerMessage shapes, so the
// browser terminal code is identical for local and remote sessions.

export const MAX_RELAY_CONNS_PER_AGENT = parseInt(process.env.TMUX_WEB_MAX_AGENT_CONNS || '64', 10);
export const TUNNEL_REQUEST_TIMEOUT_MS = parseInt(process.env.TMUX_WEB_TUNNEL_TIMEOUT_MS || '30000', 10);

type PendingHttp = {
	id: number;
	resolve: (res: Response) => void;
	reject: (err: Error) => void;
	status: number | null;
	headers: Record<string, string> | null;
	body: Buffer[];
	hasBody: boolean;
	timer: ReturnType<typeof setTimeout>;
};

type RelayConn = {
	connId: number;
	session: string;
	ws: WebSocket;
	closed: boolean;
};

let nextConnId = 1;
let nextHttpId = 1;

export class AgentChannel {
	private ws: WebSocket;
	readonly agentId: string;
	private pending = new Map<number, PendingHttp>();
	private relays = new Map<number, RelayConn>();
	private onSessions?: (sessions: unknown[]) => void;
	private onActivity?: (activities: { session: string; state: 'working' | 'idle' }[]) => void;
	private onClose?: (channel: AgentChannel) => void;
	disposed = false;

	constructor(ws: WebSocket, agentId: string, hooks: { onSessions?: (s: unknown[]) => void; onActivity?: (a: { session: string; state: 'working' | 'idle' }[]) => void; onClose?: (c: AgentChannel) => void }) {
		this.ws = ws;
		this.agentId = agentId;
		this.onSessions = hooks.onSessions;
		this.onActivity = hooks.onActivity;
		this.onClose = hooks.onClose;
	}

	// ── Outbound (hub → agent) ────────────────────────────────────────────

	private send(msg: HubToAgent): boolean {
		if (this.disposed || this.ws.readyState !== WebSocket.OPEN) return false;
		this.ws.send(JSON.stringify(msg));
		return true;
	}

	attach(connId: number, session: string, size?: { cols?: number; rows?: number }): boolean {
		return this.send({ type: 'attach', connId, session, cols: size?.cols, rows: size?.rows });
	}

	detach(connId: number): void {
		this.send({ type: 'detach', connId });
	}

	sendToAgent(connId: number, msg: Record<string, unknown>): void {
		this.send({ type: 'ws_to_agent', connId, msg });
	}

	sendSessionsReq(): void {
		this.send({ type: 'sessions_req' });
	}

	/** Tunnel an HTTP request to the agent. `path` must already be prefix-stripped. */
	async httpRequest(
		method: string,
		path: string,
		headers: Record<string, string>,
		body: ReadableStream<Uint8Array> | null,
	): Promise<Response> {
		const id = nextHttpId++;
		const hasBody = !!body;

		const promise = new Promise<Response>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error('tunnel request timed out'));
			}, TUNNEL_REQUEST_TIMEOUT_MS);
			this.pending.set(id, { id, resolve, reject, status: null, headers: null, body: [], hasBody, timer });
		});

		if (!this.send({ type: 'http_req', id, method, path, headers, hasBody })) {
			this.pending.delete(id);
			return Promise.reject(new Error('agent offline'));
		}

		if (body) {
			const reader = body.getReader();
			const pump = async () => {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const chunk = Buffer.from(value);
					this.ws.send(encodeBinaryFrame(BIN_KIND_HTTP_BODY, id, chunk));
				}
				this.send({ type: 'http_body_end', id });
			};
			pump().catch(() => {
				this.send({ type: 'http_body_end', id });
			});
		}

		return promise;
	}

	// ── Relay bookkeeping ─────────────────────────────────────────────────

	registerRelay(connId: number, session: string, ws: WebSocket): void {
		this.relays.set(connId, { connId, session, ws, closed: false });
	}

	relayClosed(connId: number): void {
		const r = this.relays.get(connId);
		if (r && !r.closed) {
			r.closed = true;
			this.relays.delete(connId);
			this.detach(connId);
		}
	}

	get relayCount(): number {
		return this.relays.size;
	}

	// ── Inbound (agent → hub) ─────────────────────────────────────────────

	handleData(data: Buffer | ArrayBuffer | Buffer[]): void {
		const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
		const frame = decodeBinaryFrame(buf);
		if (!frame) return;
		if (frame.kind === BIN_KIND_TERM) {
			const relay = this.relays.get(frame.id);
			if (relay && !relay.closed && relay.ws.readyState === WebSocket.OPEN) {
				relay.ws.send(JSON.stringify({ type: 'data', data: frame.payload.toString('utf-8') }));
			}
			return;
		}
		if (frame.kind === BIN_KIND_HTTP_BODY) {
			const pending = this.pending.get(frame.id);
			if (pending) pending.body.push(frame.payload);
		}
	}

	handleMessage(raw: string): void {
		let msg: AgentToHub;
		try {
			msg = JSON.parse(raw) as AgentToHub;
		} catch {
			return;
		}

		switch (msg.type) {
			case 'sessions':
				this.onSessions?.(msg.sessions);
				break;

			case 'activity':
				this.onActivity?.(msg.activities);
				break;

			case 'http_resp': {
				const pending = this.pending.get(msg.id);
				if (!pending) break;
				pending.status = msg.status;
				pending.headers = msg.headers;
				if (!msg.hasBody) this.finalizeHttp(pending.id);
				break;
			}

			case 'http_body_end':
				this.finalizeHttp(msg.id);
				break;

			case 'attach_ok': {
				const relay = this.relays.get(msg.connId);
				if (relay && !relay.closed && relay.ws.readyState === WebSocket.OPEN) {
					relay.ws.send(JSON.stringify({ type: 'auth.ok', setupMode: false }));
				}
				break;
			}

			case 'attach_err': {
				const relay = this.relays.get(msg.connId);
				if (relay && !relay.closed && relay.ws.readyState === WebSocket.OPEN) {
					relay.ws.send(JSON.stringify({
						type: 'attach_failed',
						message: `Agent "${this.agentId}": cannot attach to session "${msg.session}": ${msg.message}`,
					}));
					// Keep the browser socket open; the client shows the error and
					// closes itself. Closing here would make the client auto-reconnect
					// in a tight loop (page looks blank while it spins).
				}
				break;
			}

			case 'ws_to_hub': {
				const relay = this.relays.get(msg.connId);
				if (relay && !relay.closed && relay.ws.readyState === WebSocket.OPEN) {
					relay.ws.send(JSON.stringify(msg.msg));
				}
				break;
			}

			case 'ws_close': {
				const relay = this.relays.get(msg.connId);
				if (relay && !relay.closed) {
					relay.closed = true;
					try { relay.ws.close(msg.code ?? 1000, msg.reason ?? 'agent closed'); } catch {}
					this.relays.delete(msg.connId);
				}
				break;
			}

			case 'ping':
				this.send({ type: 'pong', ts: msg.ts });
				break;

			default:
				break;
		}
	}

	private finalizeHttp(id: number): void {
		const pending = this.pending.get(id);
		if (!pending) return;
		this.pending.delete(id);
		clearTimeout(pending.timer);
		const status = pending.status ?? 500;
		const headers = pending.headers ?? {};
		const body = Buffer.concat(pending.body);
		const respHeaders: Record<string, string> = {};
		for (const [k, v] of Object.entries(headers)) {
			const lk = k.toLowerCase();
			if (lk === 'content-type' || lk === 'content-disposition' || lk === 'cache-control' || lk === 'etag' || lk === 'location') {
				respHeaders[k] = v;
			}
		}
		pending.resolve(new Response(body, { status, headers: respHeaders }));
	}

	/** Reject everything in flight (agent went away). */
	failAll(reason: string): void {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error(reason));
		}
		this.pending.clear();
		for (const relay of this.relays.values()) {
			if (!relay.closed && relay.ws.readyState === WebSocket.OPEN) {
				relay.ws.send(JSON.stringify({
					type: 'data',
					data: `\r\n\x1b[31m--- agent disconnected (${reason}) ---\x1b[0m\r\n`,
				}));
				try { relay.ws.close(1011, 'agent disconnected'); } catch {}
			}
			relay.closed = true;
		}
		this.relays.clear();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.failAll('agent disconnected');
		this.onClose?.(this);
	}
}
