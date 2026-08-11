/**
 * In-process agent client: the outbound WebSocket channel that joins a hub.
 *
 * This is the same channel logic the standalone `tmux-web agent` entry uses,
 * extracted so a normal server can run it in-process. The machine keeps
 * serving its own local UI while also appearing as a remote machine on the
 * hub (terminal, files, notes, scheduler, monitor and git all tunnel over the
 * channel — the hub forwards browser requests to the local `app` passed in).
 */

import { WebSocket } from 'ws';
import type { Hono } from 'hono';
import { attachTerminal, type AttachedTerminal } from './attach-terminal.js';
import {
	encodeBinaryFrame,
	decodeBinaryFrame,
	BIN_KIND_HTTP_BODY,
	type HubToAgent,
} from './agent-channel.js';
import type { TerminalBufferConfig } from './terminal-config.js';

export type SessionInfo = { name: string; windows: number; attached: boolean };

export interface AgentClientOptions {
	hub: string;
	token: string;
	name: string;
	version: string;
	/** Agent-mode app used to execute tunneled HTTP requests. */
	app: Hono;
	listSessions: () => SessionInfo[];
	terminalBufferConfig: TerminalBufferConfig;
	getSessionPaneTarget: (session: string) => string;
	capturePaneTail: (target: string, lines: number) => string;
	capturePaneHistoryChunk: (target: string, before: number, chunk: number) => { data: string; lines: number };
	toCrlf: (s: string) => string;
	handleClientMessage: (raw: string | Buffer, pty: { write(d: string): void; resize(c: number, r: number): void }) => boolean;
	acquireControlClient: (session: string, cb: (payload: { activeIndex: number; windows: { index: number; name: string; active: boolean }[] }) => void) => () => void;
	/** Status callback (for the federation settings page). */
	onStatus?: (status: AgentClientStatus) => void;
	log?: (msg: string) => void;
}

export interface AgentClientStatus {
	state: 'idle' | 'connecting' | 'connected' | 'error';
	agentId: string | null;
	hub: string;
	name: string;
	lastError?: string;
}

export interface AgentClientHandle {
	stop(): void;
	status(): AgentClientStatus;
}

const AGENT_HEARTBEAT_MS = parseInt(process.env.TMUX_WEB_AGENT_HEARTBEAT_MS || '15000', 10);
const SESSIONS_POLL_MS = parseInt(process.env.TMUX_WEB_AGENT_SESSIONS_POLL_MS || '10000', 10);
const HTTP_RESPONSE_HEADERS = new Set(['content-type', 'content-disposition', 'location', 'cache-control', 'etag']);

export function startAgentClient(opts: AgentClientOptions): AgentClientHandle {
	const log = opts.log ?? ((msg: string) => console.log(`[agent] ${msg}`));
	const logErr = (msg: string) => console.error(`[agent] ${msg}`);

	let ws: WebSocket | null = null;
	let reconnectDelayMs = 1000;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;
	const attachments = new Map<number, AttachedTerminal>();
	const pendingHttpBodies = new Map<number, Buffer[]>();
	let sessionsPollTimer: ReturnType<typeof setInterval> | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let lastSessionsJson = '';
	let agentId: string | null = null;

	const status: AgentClientStatus = {
		state: 'idle',
		agentId: null,
		hub: opts.hub,
		name: opts.name,
	};

	function setState(state: AgentClientStatus['state'], lastError?: string): void {
		if (lastError !== undefined) status.lastError = lastError;
		status.state = state;
		status.agentId = agentId;
		opts.onStatus?.({ ...status });
	}

	function send(obj: unknown): void {
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
	}

	function sendSessions(): void {
		let sessions: SessionInfo[];
		try {
			sessions = opts.listSessions();
		} catch {
			return;
		}
		const json = JSON.stringify(sessions);
		if (json !== lastSessionsJson) {
			lastSessionsJson = json;
			send({ type: 'sessions', sessions });
		}
	}

	function startTimers(): void {
		if (!sessionsPollTimer) {
			sessionsPollTimer = setInterval(sendSessions, SESSIONS_POLL_MS);
		}
		if (!heartbeatTimer) {
			heartbeatTimer = setInterval(() => send({ type: 'ping', ts: Date.now() }), AGENT_HEARTBEAT_MS);
		}
	}

	function stopTimers(): void {
		if (sessionsPollTimer) { clearInterval(sessionsPollTimer); sessionsPollTimer = null; }
		if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
	}

	async function handleHttpRequest(msg: Extract<HubToAgent, { type: 'http_req' }>): Promise<void> {
		let body: Buffer | undefined;
		if (msg.hasBody) {
			const chunks = pendingHttpBodies.get(msg.id);
			pendingHttpBodies.delete(msg.id);
			body = chunks && chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
		}

		const url = new URL(msg.path, 'http://agent.invalid');
		let resp: Response;
		try {
			const init: RequestInit = {
				method: msg.method,
				headers: msg.headers,
			};
			if (body && body.length) init.body = body as unknown as BodyInit;
			const result = await Promise.race([
				opts.app.request(new Request(url, init)),
				new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('app.request timed out')), 30000)),
			]);
			resp = result;
		} catch (err) {
			logErr(`tunnel request failed: ${msg.method} ${msg.path} ${(err as Error).message}`);
			send({ type: 'http_resp', id: msg.id, status: 500, headers: { 'content-type': 'application/json' }, hasBody: false });
			return;
		}

		const headers: Record<string, string> = {};
		resp.headers.forEach((v, k) => {
			if (HTTP_RESPONSE_HEADERS.has(k.toLowerCase())) headers[k] = v;
		});

		const buf = Buffer.from(await resp.arrayBuffer());
		send({ type: 'http_resp', id: msg.id, status: resp.status, headers, hasBody: buf.length > 0 });
		if (buf.length > 0) {
			const CHUNK = 64 * 1024;
			for (let off = 0; off < buf.length; off += CHUNK) {
				if (!ws || ws.readyState !== WebSocket.OPEN) return;
				ws.send(encodeBinaryFrame(BIN_KIND_HTTP_BODY, msg.id, buf.subarray(off, off + CHUNK)));
			}
			send({ type: 'http_body_end', id: msg.id });
		}
	}

	function handleAttach(msg: Extract<HubToAgent, { type: 'attach' }>): void {
		const session = msg.session;
		let hasSession = false;
		try {
			hasSession = opts.listSessions().some((s) => s.name === session);
		} catch {
			hasSession = false;
		}
		if (!hasSession) {
			send({ type: 'attach_err', connId: msg.connId, session, message: 'no such session' });
			return;
		}

		let onMsg: ((raw: string) => void) | null = null;
		const attached = attachTerminal(session, {
			send: (m) => send({ type: 'ws_to_hub', connId: msg.connId, msg: m }),
			onMessage: (cb) => { onMsg = cb; },
			onClose: () => {},
		}, {
			terminalBufferConfig: opts.terminalBufferConfig,
			getSessionPaneTarget: opts.getSessionPaneTarget,
			capturePaneTail: opts.capturePaneTail,
			capturePaneHistoryChunk: opts.capturePaneHistoryChunk,
			toCrlf: opts.toCrlf,
			handleClientMessage: opts.handleClientMessage,
			acquireControlClient: opts.acquireControlClient,
			onPtyExit: (_s, code) => {
				send({ type: 'ws_close', connId: msg.connId, code: 1000, reason: `tmux exited (${code})` });
			},
			onSpawnError: (_s, message) => {
				send({ type: 'attach_err', connId: msg.connId, session, message });
			},
			onAttached: (_s) => {
				send({ type: 'attach_ok', connId: msg.connId, session });
			},
		});
		attachments.set(msg.connId, {
			onMessage: (raw) => onMsg?.(raw),
			dispose: () => {
				attachments.delete(msg.connId);
				attached.dispose();
			},
		});
	}

	function handleChannelMessage(raw: string): void {
		let msg: HubToAgent;
		try {
			msg = JSON.parse(raw) as HubToAgent;
		} catch {
			return;
		}

		switch (msg.type) {
			case 'hello_ok':
				agentId = msg.agentId;
				reconnectDelayMs = 1000;
				log(`connected to hub as "${agentId}"`);
				setState('connected');
				sendSessions();
				startTimers();
				break;

			case 'hello_err':
				logErr(`hub rejected us: ${msg.reason}`);
				setState('error', msg.reason);
				if (ws) { try { ws.close(4003, 'hello rejected'); } catch {} }
				break;

			case 'sessions_req':
				sendSessions();
				break;

			case 'http_req':
				void handleHttpRequest(msg);
				break;

			case 'http_body_end':
				// Request body finished; handleHttpRequest reads accumulated chunks.
				break;

			case 'attach':
				handleAttach(msg);
				break;

			case 'ws_to_agent': {
				const att = attachments.get(msg.connId);
				if (att) {
					try {
						att.onMessage(JSON.stringify(msg.msg));
					} catch {}
				}
				break;
			}

			case 'detach': {
				const att = attachments.get(msg.connId);
				if (att) att.dispose();
				break;
			}

			case 'pong':
				break;

			default:
				break;
		}
	}

	function handleChannelBinary(data: Buffer): void {
		const frame = decodeBinaryFrame(data);
		if (!frame) return;
		if (frame.kind === BIN_KIND_HTTP_BODY) {
			const chunks = pendingHttpBodies.get(frame.id) ?? [];
			chunks.push(frame.payload);
			pendingHttpBodies.set(frame.id, chunks);
		}
	}

	function teardownConn(): void {
		stopTimers();
		for (const att of attachments.values()) {
			try { att.dispose(); } catch {}
		}
		attachments.clear();
		pendingHttpBodies.clear();
		lastSessionsJson = '';
	}

	function scheduleReconnect(): void {
		if (ws) { try { ws.removeAllListeners(); } catch {} ws = null; }
		teardownConn();
		if (stopped) return;
		setState('connecting');
		const delay = reconnectDelayMs + Math.random() * 500;
		log(`reconnecting in ${Math.round(delay)}ms…`);
		reconnectTimer = setTimeout(connect, delay);
		reconnectDelayMs = Math.min(reconnectDelayMs * 2, 60_000);
	}

	function connect(): void {
		if (stopped || ws) return;
		const wsUrl = opts.hub.replace(/\/+$/, '') + '/agent/ws';
		let socket: WebSocket;
		try {
			socket = new WebSocket(wsUrl);
		} catch (err) {
			setState('error', `bad hub URL: ${(err as Error).message}`);
			return;
		}
		ws = socket;
		setState('connecting');

		socket.on('open', () => {
			log(`connecting to ${wsUrl}…`);
			send({ type: 'hello', token: opts.token, name: opts.name, version: opts.version });
		});

		socket.on('message', (data, isBinary) => {
			if (isBinary) {
				handleChannelBinary(
					Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer),
				);
			} else {
				handleChannelMessage(typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString('utf-8'));
			}
		});

		socket.on('close', () => {
			if (ws === socket) scheduleReconnect();
		});

		socket.on('error', (err) => {
			logErr(`connection error: ${(err as Error).message}`);
			if (ws === socket) scheduleReconnect();
		});
	}

	function stop(): void {
		if (stopped) return;
		stopped = true;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		teardownConn();
		if (ws) {
			try { ws.removeAllListeners(); ws.close(1000, 'shutdown'); } catch {}
			ws = null;
		}
		agentId = null;
		setState('idle');
	}

	connect();

	return {
		stop,
		status: () => ({ ...status }),
	};
}
