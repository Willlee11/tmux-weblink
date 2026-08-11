import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { startAgentClient } from '../src/lib/agent-client.js';
import { decodeBinaryFrame, BIN_KIND_HTTP_BODY } from '../src/lib/agent-channel.js';

// A minimal fake hub: accepts one /agent/ws connection, answers hello,
// records inbound text + binary messages, and can inject outbound ones.
function makeFakeHub() {
	const server = createServer();
	const wss = new WebSocketServer({ noServer: true });
	const textIn: { type: string; [k: string]: unknown }[] = [];
	const binaryIn: Buffer[] = [];
	let conn: WebSocket | null = null;
	let onText: ((m: { type: string; [k: string]: unknown }) => void) | null = null;

	server.on('upgrade', (req, socket, head) => {
		const url = new URL(req.url || '/', 'http://x');
		if (url.pathname !== '/agent/ws') {
			socket.destroy();
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => {
			conn = ws;
			ws.on('message', (raw, isBinary) => {
				if (isBinary) {
					const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
					binaryIn.push(buf);
					return;
				}
				const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
				let msg: { type: string; [k: string]: unknown };
				try { msg = JSON.parse(text); } catch { return; }
				textIn.push(msg);
				onText?.(msg);
			});
		});
	});

	server.listen(0);
	const port = () => (server.address() as AddressInfo).port;

	return {
		url: () => `ws://127.0.0.1:${port()}`,
		textIn,
		binaryIn,
		send: (m: unknown) => conn?.send(JSON.stringify(m)),
		onText: (cb: (m: { type: string; [k: string]: unknown }) => void) => { onText = cb; },
		waitFor: (type: string, timeoutMs = 5000) =>
			new Promise<{ type: string; [k: string]: unknown }>((resolve, reject) => {
				const existing = textIn.find((m) => m.type === type);
				if (existing) return resolve(existing);
				const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
				onText = (m) => {
					if (m.type === type) {
						clearTimeout(timer);
						resolve(m);
					}
				};
			}),
		close: async () => {
			conn?.close();
			await new Promise<void>((resolve) => wss.close(() => resolve()));
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}

const fakeApp = {
	request: async (req: Request) => {
		if (req.url.includes('/api/ping')) return new Response(JSON.stringify({ pong: true }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
		return new Response('nope', { status: 404 });
	},
} as unknown as import('hono').Hono;

const baseDeps = {
	app: fakeApp,
	listSessions: () => [{ name: 'work', windows: 1, attached: false }],
	terminalBufferConfig: { initialLines: 10, historyChunk: 10, syncIdleMs: 100, syncMaxMs: 5000 },
	getSessionPaneTarget: (s: string) => s,
	capturePaneTail: () => '',
	capturePaneHistoryChunk: () => ({ data: '', lines: 0 }),
	toCrlf: (s: string) => s,
	handleClientMessage: () => false,
	acquireControlClient: () => () => {},
	log: () => {},
} as const;

describe('agent-client (in-process agent channel)', () => {
	let hub: ReturnType<typeof makeFakeHub>;

	beforeEach(() => {
		hub = makeFakeHub();
	});

	afterEach(async () => {
		await hub.close();
	});

	it('sends hello, gets hello_ok and reports sessions', async () => {
		const handle = startAgentClient({
			...baseDeps,
			hub: hub.url(),
			token: 'tok-1',
			name: 'testbox',
			version: '1.0.0',
		});

		const hello = await hub.waitFor('hello');
		hub.send({ type: 'hello_ok', agentId: 'abc123' });

		const sessions = await hub.waitFor('sessions');
		expect(handle.status().state).toBe('connected');
		expect(handle.status().agentId).toBe('abc123');
		expect(hello).toMatchObject({ token: 'tok-1', name: 'testbox' });
		expect(sessions.sessions).toEqual([{ name: 'work', windows: 1, attached: false }]);

		handle.stop();
	});

	it('answers tunneled HTTP requests and streams the body as binary chunks', async () => {
		const handle = startAgentClient({
			...baseDeps,
			hub: hub.url(),
			token: 'tok-2',
			name: 'testbox',
			version: '1.0.0',
		});

		const helloP = hub.waitFor('hello');
		await helloP;
		hub.send({ type: 'hello_ok', agentId: 'abc' });
		await hub.waitFor('sessions');

		// Tell the agent about the tunneled request.
		hub.send({ type: 'http_req', id: 7, method: 'GET', path: '/api/ping', headers: {}, hasBody: false });

		const resp = await hub.waitFor('http_resp');
		expect(resp.id).toBe(7);
		expect(resp.status).toBe(200);
		expect((resp.headers as Record<string, string>)['content-type']).toBe('application/json');
		expect(resp.hasBody).toBe(true);

		// The response body is chunked as binary frames (kind HTTP_BODY) for id 7.
		const deadline = Date.now() + 3000;
		while (Date.now() < deadline) {
			const frame = decodeBinaryFrame(hub.binaryIn.find((b) => {
				const f = decodeBinaryFrame(b);
				return f && f.kind === BIN_KIND_HTTP_BODY && f.id === 7;
			}) ?? Buffer.alloc(0));
			if (frame) {
				expect(frame.payload.toString('utf-8')).toBe(JSON.stringify({ pong: true }));
				break;
			}
			await new Promise((r) => setTimeout(r, 50));
		}
		await hub.waitFor('http_body_end');

		handle.stop();
	});

	it('rejects with attach_err for a missing session', async () => {
		const handle = startAgentClient({
			...baseDeps,
			listSessions: () => [{ name: 'other', windows: 1, attached: false }],
			hub: hub.url(),
			token: 'tok-3',
			name: 'testbox',
			version: '1.0.0',
		});

		await hub.waitFor('hello');
		hub.send({ type: 'hello_ok', agentId: 'abc' });
		await hub.waitFor('sessions');

		hub.send({ type: 'attach', connId: 11, session: 'work' });
		const err = await hub.waitFor('attach_err');
		expect(err.connId).toBe(11);
		expect(err.message).toContain('no such session');

		handle.stop();
	});

	it('stop() tears down the connection and reports idle', async () => {
		const handle = startAgentClient({
			...baseDeps,
			hub: hub.url(),
			token: 'tok-4',
			name: 'testbox',
			version: '1.0.0',
		});

		await hub.waitFor('hello');
		hub.send({ type: 'hello_ok', agentId: 'xyz' });
		await hub.waitFor('sessions');
		expect(handle.status().state).toBe('connected');

		handle.stop();
		expect(handle.status().state).toBe('idle');
		expect(handle.status().agentId).toBeNull();
	});
});
