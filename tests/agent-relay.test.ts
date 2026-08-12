import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { AgentChannel, MAX_RELAY_CONNS_PER_AGENT } from '../src/lib/agent-relay.js';
import { encodeBinaryFrame, decodeBinaryFrame, BIN_KIND_TERM, BIN_KIND_HTTP_BODY } from '../src/lib/agent-channel.js';

describe('AgentChannel (hub side) over a real socket pair', () => {
	let wss: WebSocketServer;
	let port: number;
	let client: WebSocket;
	let serverSocket: WebSocket;
	let channel: AgentChannel;

	beforeAll(async () => {
		wss = new WebSocketServer({ port: 0 });
		await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
		port = (wss.address() as AddressInfo).port;

		const gotServer = new Promise<WebSocket>((resolve) => wss.once('connection', resolve));
		client = new WebSocket(`ws://127.0.0.1:${port}`);
		serverSocket = await gotServer;
		await new Promise<void>((resolve) => client.once('open', () => resolve()));

		channel = new AgentChannel(serverSocket, 'a1', {});

		// Wire the hub-side socket to the channel (as index.ts does).
		serverSocket.on('message', (raw) => {
			channel.handleMessage(raw.toString());
		});

		// Fake agent harness: echo attach acks and answer http requests.
		client.on('message', (raw) => {
			const msg = JSON.parse(raw.toString());
			if (msg.type === 'attach') {
				client.send(JSON.stringify({ type: 'attach_ok', connId: msg.connId, session: msg.session }));
			}
			if (msg.type === 'http_req') {
				client.send(JSON.stringify({
					type: 'http_resp',
					id: msg.id,
					status: 200,
					headers: { 'content-type': 'text/plain' },
					hasBody: false,
				}));
			}
		});
	});

	afterAll(() => {
		try { client.close(); } catch {}
		try { serverSocket.close(); } catch {}
		try { wss.close(); } catch {}
	});

	it('tunnels an HTTP request and correlates the response', async () => {
		const resp = await channel.httpRequest('GET', '/api/x', {}, null);
		expect(resp.status).toBe(200);
		expect(resp.headers.get('content-type')).toBe('text/plain');
	});

	it('relays attach ack to the browser socket', async () => {
		const sent: string[] = [];
		const browserWs = { readyState: 1, send: (d: string) => sent.push(d) } as unknown as WebSocket;
		channel.registerRelay(7, 'sess1', browserWs);
		expect(channel.attach(7, 'sess1')).toBe(true);
		await new Promise((r) => setTimeout(r, 50));
		const msgs = sent.map((s) => JSON.parse(s));
		expect(msgs.some((m) => m.type === 'auth.ok')).toBe(true);
	});

	it('relays ws_to_hub messages to the browser', () => {
		const sent: string[] = [];
		const browserWs = { readyState: 1, send: (d: string) => sent.push(d) } as unknown as WebSocket;
		channel.registerRelay(8, 'sess1', browserWs);
		channel.handleMessage(JSON.stringify({ type: 'ws_to_hub', connId: 8, msg: { type: 'data', data: 'hi' } }));
		const msgs = sent.map((s) => JSON.parse(s));
		expect(msgs).toContainEqual({ type: 'data', data: 'hi' });
	});

	it('relays binary terminal frames to the browser as data messages', () => {
		const sent: string[] = [];
		const browserWs = { readyState: 1, send: (d: string) => sent.push(d) } as unknown as WebSocket;
		channel.registerRelay(9, 'sess1', browserWs);
		channel.handleData(encodeBinaryFrame(BIN_KIND_TERM, 9, 'term output \x1b[32mok\x1b[0m'));
		const msgs = sent.map((s) => JSON.parse(s));
		expect(msgs).toContainEqual({ type: 'data', data: 'term output \x1b[32mok\x1b[0m' });
	});

	it('sends detach when the browser relay closes', async () => {
		const received: string[] = [];
		const onMsg = (raw: Buffer) => received.push(raw.toString());
		client.on('message', onMsg);
		const browserWs = { readyState: 1, send: () => {} } as unknown as WebSocket;
		channel.registerRelay(10, 'sess1', browserWs);
		channel.relayClosed(10);
		await new Promise((r) => setTimeout(r, 50));
		client.off('message', onMsg);
		expect(received.some((s) => JSON.parse(s).type === 'detach')).toBe(true);
	});

	it('handles attach_err by sending attach_failed (keeps socket open, no reconnect loop)', () => {
		const sent: string[] = [];
		const closed: { code: number; reason: string }[] = [];
		const browserWs = {
			readyState: 1,
			send: (s: string) => sent.push(s),
			close: (code: number, reason: string) => closed.push({ code, reason }),
		} as unknown as WebSocket;
		channel.registerRelay(11, 'ghost', browserWs);
		channel.handleMessage(JSON.stringify({ type: 'attach_err', connId: 11, session: 'ghost', message: 'no such session' }));
		// The client receives a machine-readable error and decides what to do;
		// the hub must NOT close the socket (closing makes the client reconnect
		// in a loop and the page looks blank).
		expect(closed.length).toBe(0);
		const msg = JSON.parse(sent[0] ?? '{}') as { type: string; message: string };
		expect(msg.type).toBe('attach_failed');
		expect(msg.message).toContain('no such session');
	});

	it('rejects pending HTTP requests when the agent disconnects', async () => {
		const ch2 = new AgentChannel(serverSocket, 'a1', {});
		const p = ch2.httpRequest('GET', '/slow', {}, null);
		ch2.dispose();
		await expect(p).rejects.toThrow('agent disconnected');
	});

	it('respects the relay conn cap', () => {
		// MAX_RELAY_CONNS_PER_AGENT is read from env at import; ensure the
		// channel counts relays and the hub uses it for the cap check.
		const ch3 = new AgentChannel(serverSocket, 'a1', {});
		for (let i = 0; i < MAX_RELAY_CONNS_PER_AGENT; i++) {
			ch3.registerRelay(1000 + i, 's', { readyState: 1, send: () => {} } as unknown as WebSocket);
		}
		expect(ch3.relayCount).toBe(MAX_RELAY_CONNS_PER_AGENT);
	});
});
