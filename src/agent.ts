#!/usr/bin/env node
import { createRequire } from 'node:module';
import { hostname } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { listSessions } from './sessions.js';
import { loadSecurityConfig } from './lib/security-config.js';
import { TokenStore } from './lib/auth.js';
import { RateLimiter } from './lib/rateLimiter.js';
import { db } from './lib/db.js';
import { loadExtensions, spawnExtensionBackend } from './lib/ext-loader.js';
import { SchedulerService } from './lib/scheduler.js';
import { handleClientMessage } from './lib/ws-message.js';
import { loadDotEnv } from './lib/load-env.js';
import { readSettings } from './lib/settings.js';
import { readActiveTheme } from './lib/theme-store.js';
import { buildApp } from './lib/build-app.js';
import { attachTerminal, type AttachedTerminal } from './lib/attach-terminal.js';
import { acquireControlClient } from './lib/tmux-control.js';
import { getSessionPaneTarget, capturePaneTail, capturePaneHistoryChunk, toCrlf } from './lib/tmux-capture.js';
import { readTerminalBufferConfig } from './lib/terminal-config.js';
import {
	encodeBinaryFrame,
	decodeBinaryFrame,
	BIN_KIND_HTTP_BODY,
	type HubToAgent,
} from './lib/agent-channel.js';

loadDotEnv();

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// ── Args ───────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { hub: string; token: string; name: string } {
	let hub = process.env.TMUX_WEB_AGENT_HUB || '';
	let token = process.env.TMUX_WEB_AGENT_TOKEN || '';
	let name = process.env.TMUX_WEB_AGENT_NAME || hostname();
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === 'agent') continue;
		if ((a === '--hub' || a === '-h') && argv[i + 1]) { hub = argv[++i]; continue; }
		if ((a === '--token' || a === '-t') && argv[i + 1]) { token = argv[++i]; continue; }
		if ((a === '--name' || a === '-n') && argv[i + 1]) { name = argv[++i]; continue; }
		if (a.startsWith('--hub=')) hub = a.slice(6);
		if (a.startsWith('--token=')) token = a.slice(8);
		if (a.startsWith('--name=')) name = a.slice(7);
	}
	if (!hub) {
		console.error('usage: tmux-web agent --hub wss://HOST[:PORT] --token TOKEN [--name NAME]');
		console.error('  (or set TMUX_WEB_AGENT_HUB / TMUX_WEB_AGENT_TOKEN)');
		process.exit(1);
	}
	if (!token) {
		console.error('agent token required (--token or TMUX_WEB_AGENT_TOKEN)');
		process.exit(1);
	}
	return { hub, token, name: name.slice(0, 64) };
}

const { hub: hubUrl, token, name } = parseArgs(process.argv.slice(2));

// ── Agent-local app (same route table as the hub, minus admin routes) ──────

const terminalBufferConfig = readTerminalBufferConfig();
const securityConfig = loadSecurityConfig();
const tokenStore = new TokenStore();
const rateLimiter = new RateLimiter();

await db.read();
db.data.sessionAccess ??= [];
db.data.pinnedViews ??= [];
db.data.watchedPanes ??= [];
db.data.triggeredTasks ??= [];
db.data.quickCommands ??= [];

const settings = await readSettings();
const activeTheme = await readActiveTheme();
const commandbarEnabled = settings.commandbar === true;
const scheduleHistoryDays = clampHistoryDays(settings.scheduleHistoryDays);
const extsDir = path.join(process.cwd(), 'extensions');
const extensions = await loadExtensions(extsDir);
for (const ext of extensions) {
	if (ext.start) spawnExtensionBackend(ext.dir, ext);
}

const scheduler = new SchedulerService({
	db,
	historyRetentionMs: scheduleHistoryDays * 86_400_000,
	onMissedTask: (task) =>
		console.warn(`[scheduler] dropped missed task ${task.id} (was due ${new Date(task.fireAt).toISOString()})`),
});
await scheduler.restoreFromDb();

let assignedAgentId: string | null = null;

const app = buildApp({
	mode: 'agent',
	securityConfig,
	tokenStore,
	rateLimiter,
	scheduler,
	settings,
	commandbarEnabled,
	terminalRenderer: settings.terminalRenderer === 'ghostty' ? 'ghostty' : 'xterm',
	scheduleHistoryDays,
	extsDir,
	extensions,
	terminalBufferConfig,
	getAgentId: () => assignedAgentId,
	state: { activeTheme, settingUpPassword: false },
});

// ── Channel state ─────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let connected = false;
let reconnectDelayMs = 1000;
const attachments = new Map<number, AttachedTerminal>();
const pendingHttpBodies = new Map<number, Buffer[]>();
let sessionsPollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastSessionsJson = '';

const AGENT_HEARTBEAT_MS = parseInt(process.env.TMUX_WEB_AGENT_HEARTBEAT_MS || '15000', 10);
const SESSIONS_POLL_MS = parseInt(process.env.TMUX_WEB_AGENT_SESSIONS_POLL_MS || '10000', 10);

function send(obj: unknown): void {
	if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function sendSessions(): void {
	const sessions = listSessions();
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

// ── HTTP tunnel executor ───────────────────────────────────────────────────

const HTTP_RESPONSE_HEADERS = new Set(['content-type', 'content-disposition', 'location', 'cache-control', 'etag']);

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
			app.request(new Request(url, init)),
			new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('app.request timed out')), 30000)),
		]);
		resp = result;
	} catch (err) {
		const msg2 = (err as Error).message || 'internal error';
		console.warn('[agent] tunnel request failed:', msg.method, msg.path, msg2);
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

// ── Terminal attach (relayed over the channel) ─────────────────────────────

function handleAttach(msg: Extract<HubToAgent, { type: 'attach' }>): void {
	const session = msg.session;
	if (!listSessions().some((s) => s.name === session)) {
		send({ type: 'attach_err', connId: msg.connId, session, message: 'no such session' });
		return;
	}

	let onMsg: ((raw: string) => void) | null = null;
	const attached = attachTerminal(session, {
		send: (m) => send({ type: 'ws_to_hub', connId: msg.connId, msg: m }),
		onMessage: (cb) => { onMsg = cb; },
		onClose: () => {},
	}, {
		terminalBufferConfig,
		getSessionPaneTarget,
		capturePaneTail,
		capturePaneHistoryChunk,
		toCrlf,
		handleClientMessage,
		acquireControlClient,
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

// ── Channel message dispatch ───────────────────────────────────────────────

function handleChannelMessage(raw: string): void {
	let msg: HubToAgent;
	try {
		msg = JSON.parse(raw) as HubToAgent;
	} catch {
		return;
	}

	switch (msg.type) {
		case 'hello_ok':
			assignedAgentId = msg.agentId;
			connected = true;
			reconnectDelayMs = 1000;
			console.log(`[agent] connected to hub as "${assignedAgentId}"`);
			sendSessions();
			startTimers();
			break;

		case 'hello_err':
			console.error(`[agent] hub rejected us: ${msg.reason}`);
			ws?.close(4003, 'hello rejected');
			process.exit(1);
			break;

		case 'sessions_req':
			sendSessions();
			break;

		case 'http_req':
			void handleHttpRequest(msg);
			break;

		case 'http_body_end': {
			// Request body finished; nothing to do — handleHttpRequest is
			// triggered from http_req and reads the accumulated chunks.
			break;
		}

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

// ── Connection lifecycle ───────────────────────────────────────────────────

function teardownConn(): void {
	connected = false;
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
	const delay = reconnectDelayMs + Math.random() * 500;
	console.log(`[agent] reconnecting in ${Math.round(delay)}ms…`);
	setTimeout(connect, delay);
	reconnectDelayMs = Math.min(reconnectDelayMs * 2, 60_000);
}

function connect(): void {
	if (ws) return;
	const wsUrl = hubUrl.replace(/\/+$/, '') + '/agent/ws';
	let socket: WebSocket;
	try {
		socket = new WebSocket(wsUrl);
	} catch (err) {
		console.error('[agent] bad hub URL:', (err as Error).message);
		process.exit(1);
	}
	ws = socket;

	socket.on('open', () => {
		console.log(`[agent] connecting to ${wsUrl}…`);
		send({ type: 'hello', token, name, version });
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
		console.error('[agent] connection error:', (err as Error).message);
		if (ws === socket) scheduleReconnect();
	});
}

function cleanup(): void {
	scheduler.cleanup();
	teardownConn();
	if (ws) { try { ws.close(1000, 'shutdown'); } catch {} }
	process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function clampHistoryDays(value: number | undefined): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return 7;
	return Math.min(365, Math.max(1, Math.round(value)));
}

connect();
