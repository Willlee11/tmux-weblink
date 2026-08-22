#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { hostname, networkInterfaces } from "node:os";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";

// Ensure node-pty's spawn-helper is executable. Some installers (notably npx
// with hoisted deps) strip the +x bit, which makes pty.spawn fail with
// posix_spawnp.
try {
	const ptyDir = path.dirname(createRequire(import.meta.url).resolve("node-pty/package.json"));
	const prebuilds = path.join(ptyDir, "prebuilds");
	if (existsSync(prebuilds)) {
		for (const arch of readdirSync(prebuilds)) {
			const helper = path.join(prebuilds, arch, "spawn-helper");
			if (existsSync(helper) && !(statSync(helper).mode & 0o111)) {
				chmodSync(helper, 0o755);
			}
		}
	}
} catch {}
import { loadSecurityConfig, type TmuxWebSecurityConfig } from "./lib/security-config.js";
import { TokenStore, type StoredToken, hashPassword, verifyPassword, validatePassword } from "./lib/auth.js";
import { RateLimiter } from "./lib/rateLimiter.js";
import { audit } from "./lib/auditLog.js";
import { db } from "./lib/db.js";
import { handleClientMessage } from "./lib/ws-message.js";
import { loadDotEnv } from "./lib/load-env.js";
import { listSessions, resolveTmuxSocketPath } from "./sessions.js";
import { cmdSetup, cmdTheme, printUsage, printVersion } from "./lib/cli.js";
import { readSettings } from "./lib/settings.js";
import { readActiveTheme } from "./lib/theme-store.js";
import { buildApp } from "./lib/build-app.js";
import { attachTerminal, type AttachedTerminal, killAllAttachedPtys } from "./lib/attach-terminal.js";
import { acquireControlClient, killAllControlClients } from "./lib/tmux-control.js";
import { getSessionPaneTarget, capturePaneTail, capturePaneHistoryChunk, toCrlf } from "./lib/tmux-capture.js";
import { readTerminalBufferConfig } from "./lib/terminal-config.js";
import { AgentRegistry } from "./lib/agent-registry.js";
import { AgentChannel, MAX_RELAY_CONNS_PER_AGENT } from "./lib/agent-relay.js";
import { findAgentTokenByPlaintext, listAgentTokens, createAgentToken, removeAgentToken } from "./lib/agent-tokens.js";
import { saveSecurityConfig } from "./lib/security-config.js";
import { readFederationConfig, writeFederationConfig, type FederationConfig } from "./lib/federation-config.js";
import { startAgentClient, type AgentClientHandle, type AgentClientStatus } from "./lib/agent-client.js";
import { ActivityProbe } from "./lib/activity-probe.js";
import { upsertSessionState, computeTombstones } from "./lib/session-state.js";
import { sessionWorkingPath } from "./lib/sessions-sidebar.js";
loadDotEnv();

const terminalBufferConfig = readTerminalBufferConfig();
const securityConfig = loadSecurityConfig();
const tokenStore = new TokenStore();
const rateLimiter = new RateLimiter();
let settingUpPassword = false;

const COOKIE_NAME = "tmux-web-token";

function resolveClientIpFromReq(req: import("http").IncomingMessage): string {
	if (securityConfig.security.trustProxy) {
		const fwd = (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim();
		if (fwd) return fwd;
	}
	return req.socket.remoteAddress || "unknown";
}

function readBearerTokenFromReq(req: import("http").IncomingMessage): string | null {
	const auth = req.headers.authorization;
	if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7);
	const cookie = req.headers.cookie;
	if (typeof cookie !== "string") return null;
	const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
	if (match) return decodeURIComponent(match[1]);
	return null;
}

function validateTokenFromReq(req: import("http").IncomingMessage): StoredToken | null {
	const plaintext = readBearerTokenFromReq(req);
	if (!plaintext) return null;
	return tokenStore.validateToken(plaintext);
}

interface WsClient {
	ws: WebSocket;
	ip: string;
	authenticated: boolean;
	authTimeout: ReturnType<typeof setTimeout> | null;
	sessionName?: string;
}

const wsClients = new Map<WebSocket, WsClient>();

function countWsConnectionsByIp(ip: string): number {
	let n = 0;
	for (const c of wsClients.values()) {
		if (c.ip === ip) n++;
	}
	return n;
}

function closeWs(ws: WebSocket, code: number, reason: string): void {
	try { ws.close(code, reason); } catch {}
}

function sendWsAuth(ws: WebSocket, msg: { type: string; [key: string]: unknown }): void {
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(msg));
	}
}

const startupArgs = process.argv.slice(2);
const args = startupArgs;

// ── CLI subcommand dispatch ───────────────────────────────────────────────
{
		if (args.length > 0) {
		const [sub, arg] = args;
		switch (sub) {
			case "setup":
				await cmdSetup(args);
				process.exit(0);
			case "theme":
				await cmdTheme(args.slice(1));
				process.exit(0);
			case "agent": {
				// Agent mode: run the agent entry as a child process (it must stay
				// alive and must not fall through to hub startup).
				const agentEntry = path.join(path.dirname(fileURLToPath(import.meta.url)), "agent.js");
				const { spawn } = await import("node:child_process");
				const child = spawn(process.execPath, [agentEntry, ...startupArgs], { stdio: "inherit" });
				child.on("error", (err) => {
					console.error(err);
					process.exit(1);
				});
				child.on("exit", (code) => process.exit(code ?? 0));
				await new Promise(() => {}); // keep this process (and the child) alive
			}
			case "agent-token":
				await cmdAgentToken(args.slice(1));
				process.exit(0);
			case "help":
			case "--help":
			case "-h":
				printUsage();
				process.exit(0);
			case "-V":
			case "--version":
			case "-v":
				printVersion();
				process.exit(0);
			default:
				console.error(`unknown argument: ${sub}`);
				printUsage();
				process.exit(1);
		}
	}
}

type ServerMessage =
	| { type: "auth.required"; setupMode: boolean }
	| { type: "auth.ok"; setupMode: boolean; token?: string }
	| { type: "auth.failed"; message: string; retryAfterMs?: number; permanentLock?: boolean }
	| { type: "snapshot"; data: string; lines: number }
	| { type: "data"; data: string }
	| { type: "history"; data: string; before: number; lines: number }
	| {
			type: "window_changed";
			activeIndex: number;
			windows: { index: number; name: string; active: boolean }[];
	  };

function sendServerMessage(ws: WebSocket, msg: ServerMessage) {
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(msg));
	}
}

const activePtys = new Set<{ kill(): void }>();

// ── Startup state ─────────────────────────────────────────────────────────
await db.read();
db.data.sessionAccess ??= [];
db.data.pinnedViews ??= [];
db.data.watchedPanes ??= [];
db.data.quickCommands ??= [];

const settings = await readSettings();
let activeTheme = await readActiveTheme();
// ── Agent registry + channels (hub side) ──────────────────────────────────
const agents = new AgentRegistry({ onChange: () => {} });
const agentChannels = new Map<string, AgentChannel>();

function getChannel(agentId: string): AgentChannel | null {
	const rec = agents.get(agentId);
	if (!rec) return null;
	return agentChannels.get(agentId) ?? null;
}

const appState = { activeTheme, settingUpPassword: false };

const app = buildApp({
	mode: "hub",
	securityConfig,
	tokenStore,
	rateLimiter,
	settings,
	terminalBufferConfig,
	state: appState,
	federation: {
		getConfig: () => federationConfig,
		setConfig: async (cfg) => {
			federationConfig = cfg;
			await writeFederationConfig(cfg);
			startAgentClientFromConfig(cfg);
		},
		status: federationStatus,
		hostname: hostname(),
	},
	hub: { agents, getChannel },
});

// ── Machines: run this machine as an agent of a hub (in-process) ──────────
// Every machine starts the same way (`tmux-web`); the settings page saves a
// hub URL + token and the agent client runs in-process alongside the local UI.

const tunnelApp = buildApp({
	mode: "agent",
	securityConfig,
	tokenStore,
	rateLimiter,
	settings,
	terminalBufferConfig,
	state: appState,
});

let federationConfig: FederationConfig = await readFederationConfig();
let agentClient: AgentClientHandle | null = null;

function stopAgentClient(): void {
	if (agentClient) {
		agentClient.stop();
		agentClient = null;
	}
}

function startAgentClientFromConfig(cfg: FederationConfig): void {
	stopAgentClient();
	if (!cfg.enabled || !cfg.hub || !cfg.token) return;
	agentClient = startAgentClient({
		hub: cfg.hub,
		token: cfg.token,
		name: cfg.name?.trim() || hostname(),
		version,
		app: tunnelApp,
		listSessions,
		terminalBufferConfig,
		getSessionPaneTarget,
		capturePaneTail,
		capturePaneHistoryChunk,
		toCrlf,
		handleClientMessage,
		acquireControlClient,
	});
}

function federationStatus(): AgentClientStatus {
	if (!federationConfig.enabled) {
		return { state: "idle", agentId: null, hub: federationConfig.hub ?? "", name: federationConfig.name ?? hostname() };
	}
	return agentClient ? agentClient.status() : { state: "idle", agentId: null, hub: federationConfig.hub ?? "", name: federationConfig.name ?? hostname() };
}

startAgentClientFromConfig(federationConfig);

// ── Local session activity probe (hub probes its own tmux; agent mode's
// sessions are reported by the agent client over the channel) ───────────────

const localProbe = new ActivityProbe();
const localActivityStates = new Map<string, "working" | "idle">();
setInterval(() => {
	void (async () => {
		try {
			const states = await localProbe.scan();
			const changes: { session: string; state: "working" | "idle" }[] = [];
			for (const [session, state] of states) {
				if (localActivityStates.get(session) !== state) changes.push({ session, state });
			}
			// Sessions that disappeared reset to idle so stale colors clear.
			for (const session of localActivityStates.keys()) {
				if (!states.has(session)) changes.push({ session, state: "idle" });
			}
			localActivityStates.clear();
			for (const [session, state] of states) localActivityStates.set(session, state);
			for (const c of changes) broadcastActivity({ type: "session.activity", session: c.session, state: c.state });
		} catch {
			// Probe failures are transient (e.g. tmux briefly unavailable).
		}
	})();
}, localProbe.scanMs);

// ── WebSocket server ──────────────────────────────────────────────────────

const port = parseInt(process.env.PORT || "21000", 10);

function lanIPv4Addresses(): string[] {
	const out: string[] = [];
	try {
		for (const addrs of Object.values(networkInterfaces())) {
			for (const a of addrs ?? []) {
				if (a.family === "IPv4" && !a.internal) out.push(a.address);
			}
		}
	} catch {}
	return out;
}

const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
	console.log(`tmux-web running at http://localhost:${info.port}`);
	for (const ip of lanIPv4Addresses()) {
		console.log(`  also on http://${ip}:${info.port}`);
	}
});

const wss = new WebSocketServer({ noServer: true });

// ── Agent activity broadcast ─────────────────────────────────────────────
// Browsers subscribe to /ws/activity (token-authenticated) and receive
// { type: 'session.activity', agentId?, session, state } pushes. Local
// sessions are probed in this process; remote sessions arrive via the
// agent channel 'activity' messages.

const activityClients = new Set<WebSocket>();

function broadcastActivity(msg: { type: 'session.activity'; agentId?: string; session: string; state: 'working' | 'idle' }): void {
	const json = JSON.stringify(msg);
	for (const ws of activityClients) {
		if (ws.readyState === WebSocket.OPEN) ws.send(json);
	}
}

function rejectUpgrade(socket: import("net").Socket, code: number, message: string): void {
	socket.write(`HTTP/1.1 ${code} ${message}\r\n\r\n`);
	socket.destroy();
}

server.on("upgrade", (req, socket, head) => {
	const url = new URL(req.url || "/", `http://${req.headers.host}`);
	const pathname = url.pathname;

	// ── Activity monitor (browser, token-authenticated) ──
	if (pathname === "/ws/activity") {
		const ip = resolveClientIpFromReq(req);
		const token = readBearerTokenFromReq(req) || url.searchParams.get("token") || "";
		const storedToken = token ? tokenStore.validateToken(token) : null;
		if (!storedToken) {
			rejectUpgrade(socket, 401, "Unauthorized");
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => {
			ws.on("close", () => activityClients.delete(ws));
			activityClients.add(ws);
		});
		return;
	}

	// ── Agent channel acceptor (no Origin check; agents are not browsers) ──
	if (pathname === "/agent/ws") {
		handleAgentUpgrade(req, socket, head);
		return;
	}

	// ── Remote (agent) terminal relay ──
	const remoteMatch = pathname.match(/^\/ws\/a\/([^/]+)\/(.+)$/);
	if (remoteMatch) {
		handleRemoteRelayUpgrade(req, socket, head, decodeURIComponent(remoteMatch[1]), decodeURIComponent(remoteMatch[2]));
		return;
	}

	const match = pathname.match(/^\/ws\/(.+)$/);
	if (!match) {
		socket.destroy();
		return;
	}

	const ip = resolveClientIpFromReq(req);

	// Origin allowlist — empty list means same-origin only.
	const origin = req.headers.origin;
	const allowed = securityConfig.security.allowedOrigins;
	if (origin) {
		const sameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
		if (!sameOrigin && (allowed.length === 0 || !allowed.includes(origin))) {
			audit("ws_rejected_origin", { ip, origin });
			rejectUpgrade(socket, 403, "Origin not allowed");
			return;
		}
	}

	// Per-IP concurrent connection cap.
	const liveFromIp = countWsConnectionsByIp(ip);
	if (liveFromIp >= securityConfig.security.maxConnectionsPerIp) {
		audit("ws_rejected_per_ip_cap", { ip, liveFromIp });
		rejectUpgrade(socket, 429, "Too many connections");
		return;
	}

	// Validate token from cookie or query param before completing upgrade.
	const token = readBearerTokenFromReq(req) || url.searchParams.get("token") || "";
	const storedToken = token ? tokenStore.validateToken(token) : null;

	wss.handleUpgrade(req, socket, head, (ws) => {
		wss.emit("connection", ws, req, decodeURIComponent(match[1]), ip, storedToken);
	});
});

// ── Local session attach (unchanged behavior, attach logic extracted) ─────

wss.on("connection", (ws: WebSocket, req: import("http").IncomingMessage, sessionName: string, ip: string, preflightToken: StoredToken | null) => {
	const client: WsClient = { ws, ip, authenticated: false, authTimeout: null };
	const initialSize = (() => {
		try {
			const q = new URL(req.url || "/", `http://${req.headers.host}`).searchParams;
			const cols = Number(q.get("cols"));
			const rows = Number(q.get("rows"));
			if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0 && cols <= 1000 && rows <= 1000) {
				return { cols, rows };
			}
		} catch {}
		return undefined;
	})();
	wsClients.set(ws, client);
	audit("ws_connected", { ip });

	let attached: AttachedTerminal | null = null;
	let onMessageCb: ((raw: string) => void) | null = null;

	function completeAuth(method: "password" | "token", tokenName: string): void {
		client.authenticated = true;
		if (client.authTimeout) {
			clearTimeout(client.authTimeout);
			client.authTimeout = null;
		}
		audit("auth_success", { ip, method, tokenName });
		sendServerMessage(ws, { type: "auth.ok", setupMode: !securityConfig.passwordHash });
		startAttach();
	}

	function sendAuthFailed(message: string, extra: { retryAfterMs?: number; permanentLock?: boolean } = {}): void {
		sendServerMessage(ws, { type: "auth.failed", message, ...extra });
	}

	function startAttach(): void {
		if (attached) return;
		// Remember the session in state so an external loss later renders a tombstone.
		void upsertSessionState(sessionName, { path: sessionWorkingPath(sessionName) });
		attached = attachTerminal(sessionName, {
			send: (msg) => sendServerMessage(ws, msg as ServerMessage),
			onMessage: (cb) => { onMessageCb = cb; },
			onClose: (cb) => {
				// Fired when the pty exits or the peer is gone; ws.on('close')
				// below handles the actual teardown.
				peerCloseCb = cb;
			},
		}, {
			terminalBufferConfig,
			getSessionPaneTarget,
			capturePaneTail,
			capturePaneHistoryChunk,
			toCrlf,
			handleClientMessage,
			acquireControlClient,
			initialCols: initialSize?.cols,
			initialRows: initialSize?.rows,
			tmuxSocketPath: resolveTmuxSocketPath() ?? undefined,
			onPtyExit: (_s, _code) => closeWs(ws, 1000, "pty exited"),
			onSpawnError: (_s, _msg) => closeWs(ws, 1011, "pty spawn failed"),
		});
	}

	let peerCloseCb: (() => void) | null = null;

	async function handleAuthMessage(data: string): Promise<boolean> {
		let msg: { type?: unknown; password?: unknown; token?: unknown };
		try {
			msg = JSON.parse(data);
		} catch {
			return false;
		}

		if (msg.type === "auth.token" && typeof msg.token === "string") {
			const stored = tokenStore.validateToken(msg.token);
			if (!stored) {
				audit("token_auth_failed", { ip });
				const rate = rateLimiter.recordFailure(ip);
				if (rate.permanentLock) {
					tokenStore.revokeAll();
					audit("permanent_lock", { ip, failures: rate.failures });
				}
				sendAuthFailed("Invalid or expired token", { permanentLock: rate.permanentLock, retryAfterMs: rate.retryAfterMs });
				return true;
			}
			tokenStore.touch(stored.tokenHash);
			completeAuth("token", stored.name);
			return true;
		}

		if (msg.type === "auth" && typeof msg.password === "string") {
			const rateResult = rateLimiter.check(ip);
			if (!rateResult.allowed) {
				audit("rate_limited", { ip, retryAfterMs: rateResult.retryAfterMs, permanentLock: rateResult.permanentLock });
				sendAuthFailed("Too many attempts", { permanentLock: rateResult.permanentLock, retryAfterMs: rateResult.retryAfterMs });
				return true;
			}

			// Setup mode.
			if (!securityConfig.passwordHash) {
				if (!securityConfig.security.allowRemoteSetup && !isLocalhostIp(ip)) {
					audit("setup_rejected_remote", { ip });
					sendAuthFailed("First-run setup must be performed from localhost");
					return true;
				}
				if (settingUpPassword) {
					sendAuthFailed("Password setup in progress");
					return true;
				}
				const validationError = validatePassword(msg.password);
				if (validationError) {
					sendAuthFailed(validationError);
					return true;
				}
				settingUpPassword = true;
				try {
					securityConfig.passwordHash = await hashPassword(msg.password);
					saveSecurityConfig(securityConfig);
					audit("password_set", { ip });
				} finally {
					settingUpPassword = false;
				}
				const { stored, plaintext } = tokenStore.createAccessToken("setup", securityConfig.security.tokenTtlDays);
				sendServerMessage(ws, { type: "auth.ok", setupMode: true, token: plaintext });
				audit("token_created", { ip, name: stored.name, tokenId: stored.id });
				audit("auth_success", { ip, method: "password", tokenName: stored.name });
				startAttach();
				return true;
			}

			// Normal password verification.
			if (!securityConfig.passwordHash) {
				sendAuthFailed("Server not configured");
				return true;
			}
			const valid = await verifyPassword(msg.password, securityConfig.passwordHash);
			if (!valid) {
				const rate = rateLimiter.recordFailure(ip);
				audit("auth_failed", { ip, method: "password", failures: rate.failures, permanentLock: rate.permanentLock });
				if (rate.permanentLock) {
					tokenStore.revokeAll();
					audit("permanent_lock", { ip, failures: rate.failures });
				}
				sendAuthFailed("Incorrect password", { permanentLock: rate.permanentLock, retryAfterMs: rate.retryAfterMs });
				return true;
			}

			rateLimiter.recordSuccess(ip);
			const name = `ws-${ip}`;
			const { plaintext } = tokenStore.createAccessToken(name, securityConfig.security.tokenTtlDays);
			completeAuth("password", name);
			sendServerMessage(ws, { type: "auth.ok", setupMode: false, token: plaintext });
			return true;
		}

		return false;
	}

	// Pre-flight token from cookie/query param allows immediate attachment.
	if (preflightToken) {
		tokenStore.touch(preflightToken.tokenHash);
		completeAuth("token", preflightToken.name);
	} else {
		sendServerMessage(ws, { type: "auth.required", setupMode: !securityConfig.passwordHash });
		client.authTimeout = setTimeout(() => {
			if (!client.authenticated) {
				audit("auth_timeout", { ip });
				sendAuthFailed("Authentication timeout");
				closeWs(ws, 4000, "Auth timeout");
			}
		}, securityConfig.security.authTimeoutMs);
	}

	ws.on("message", async (raw) => {
		const data = typeof raw === "string" ? raw : raw.toString("utf-8");

		if (!client.authenticated) {
			// Ignore oversized messages before auth.
			if (data.length > 1_000_000) {
				sendServerMessage(ws, { type: "auth.failed", message: "Message too large" });
				return;
			}
			const handled = await handleAuthMessage(data);
			if (!handled) {
				sendAuthFailed("Authentication required");
			}
			return;
		}

		if (!onMessageCb) return;
		try {
			onMessageCb(data);
		} catch {
			// message handler is best-effort
		}
	});

	ws.on("close", () => {
		if (client.authTimeout) clearTimeout(client.authTimeout);
		wsClients.delete(ws);
		audit("ws_disconnected", { ip });
		peerCloseCb?.();
		if (attached) {
			attached.dispose();
			attached = null;
		}
	});

	ws.on("error", () => {
		if (client.authTimeout) clearTimeout(client.authTimeout);
		wsClients.delete(ws);
		peerCloseCb?.();
		if (attached) {
			attached.dispose();
			attached = null;
		}
	});
});

// ── Remote (agent) terminal relay ─────────────────────────────────────────

function handleRemoteRelayUpgrade(
	req: import("http").IncomingMessage,
	socket: import("net").Socket,
	head: Buffer,
	agentId: string,
	sessionName: string,
): void {
	const ip = resolveClientIpFromReq(req);

	// Browser must be authenticated against the hub.
	const url = new URL(req.url || "/", `http://${req.headers.host}`);
	const token = readBearerTokenFromReq(req) || url.searchParams.get("token") || "";
	const storedToken = token ? tokenStore.validateToken(token) : null;
	if (!storedToken) {
		audit("ws_rejected_remote_auth", { ip, agentId });
		rejectUpgrade(socket, 401, "Unauthorized");
		return;
	}

	const channel = getChannel(agentId);
	if (!channel) {
		audit("ws_rejected_remote_offline", { ip, agentId });
		rejectUpgrade(socket, 503, "Agent offline");
		return;
	}

	if (channel.relayCount >= MAX_RELAY_CONNS_PER_AGENT) {
		rejectUpgrade(socket, 429, "Too many connections to agent");
		return;
	}

	// Origin check like local mode.
	const origin = req.headers.origin;
	const allowed = securityConfig.security.allowedOrigins;
	if (origin) {
		const sameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
		if (!sameOrigin && (allowed.length === 0 || !allowed.includes(origin))) {
			rejectUpgrade(socket, 403, "Origin not allowed");
			return;
		}
	}

	const connId = allocConnId();
	const initialSize = (() => {
		try {
			const q = new URL(req.url || "/", `http://${req.headers.host}`).searchParams;
			const cols = Number(q.get("cols"));
			const rows = Number(q.get("rows"));
			if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0 && cols <= 1000 && rows <= 1000) {
				return { cols, rows };
			}
		} catch {}
		return undefined;
	})();
	wss.handleUpgrade(req, socket, head, (ws) => {
		channel.registerRelay(connId, sessionName, ws);
		agents.bumpRelayConns(agentId, 1);

		// Remember the agent session in state so an external loss later renders a tombstone.
		void upsertSessionState(sessionName, { agentId });

		if (!channel.attach(connId, sessionName, initialSize)) {
			ws.send(JSON.stringify({ type: "data", data: "\r\n\x1b[31magent offline\x1b[0m\r\n" }));
			ws.close(1011, "agent offline");
			channel.relayClosed(connId);
			agents.bumpRelayConns(agentId, -1);
			return;
		}

		ws.on("message", (raw) => {
			const data = typeof raw === "string" ? raw : raw.toString("utf-8");
			let msg: { type?: unknown };
			try {
				msg = JSON.parse(data);
			} catch {
				return;
			}
			// Forward only the terminal-control messages the agent understands.
			if (msg.type === "input" || msg.type === "resize" || msg.type === "load_history") {
				channel.sendToAgent(connId, msg as Record<string, unknown>);
			}
		});

		const cleanup = () => {
			channel.relayClosed(connId);
			agents.bumpRelayConns(agentId, -1);
		};
		ws.on("close", cleanup);
		ws.on("error", cleanup);
	});
}

let connIdCounter = 1;
function allocConnId(): number {
	return connIdCounter++;
}

// ── Agent channel acceptor ────────────────────────────────────────────────

function handleAgentUpgrade(req: import("http").IncomingMessage, socket: import("net").Socket, head: Buffer): void {
	const ip = resolveClientIpFromReq(req);

	// Origin check: agents are not browsers and send no Origin header.
	const origin = req.headers.origin;
	if (origin) {
		audit("agent_rejected_origin", { ip, origin });
		rejectUpgrade(socket, 403, "Origin not allowed");
		return;
	}

	wss.handleUpgrade(req, socket, head, (ws) => {
		let channel: AgentChannel | null = null;
		let helloTimer = setTimeout(() => {
			audit("agent_hello_timeout", { ip });
			closeWs(ws, 4000, "hello timeout");
		}, 10_000);

		ws.on("message", (raw, isBinary) => {
			if (channel) {
				agents.touch(channel.agentId);
				if (isBinary) {
					channel.handleData(Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw as ArrayBuffer));
				} else {
					channel.handleMessage(typeof raw === "string" ? raw : Buffer.from(raw as ArrayBuffer).toString("utf-8"));
				}
				return;
			}

			// Awaiting hello.
			const data = typeof raw === "string" ? raw : raw.toString("utf-8");
			let msg: { type?: unknown; token?: unknown; name?: unknown; version?: unknown };
			try {
				msg = JSON.parse(data);
			} catch {
				closeWs(ws, 1008, "bad hello");
				return;
			}
			if (msg.type !== "hello" || typeof msg.token !== "string") {
				closeWs(ws, 1008, "expected hello");
				return;
			}

			const rate = rateLimiter.check(ip);
			if (!rate.allowed) {
				audit("agent_rate_limited", { ip });
				closeWs(ws, 429, "Too many attempts");
				return;
			}

			const record = findAgentTokenByPlaintext(msg.token);
			if (!record) {
				rateLimiter.recordFailure(ip);
				audit("agent_bad_token", { ip });
				sendWsAuth(ws, { type: "hello_err", reason: "invalid token" });
				closeWs(ws, 4003, "invalid token");
				return;
			}

			// Token revoked check: if the record no longer exists this fails above.
			const name = typeof msg.name === "string" && msg.name.trim() ? msg.name.trim().slice(0, 64) : "agent";
			const agentId = record.id;
			const registered = agents.register(agentId, name, ws, record.tokenHash);
			if (!registered) {
				audit("agent_cap_reached", { ip });
				sendWsAuth(ws, { type: "hello_err", reason: "too many agents" });
				closeWs(ws, 4004, "too many agents");
				return;
			}

			clearTimeout(helloTimer);
			rateLimiter.recordSuccess(ip);
			audit("agent_connected", { ip, agentId, name });

		channel = new AgentChannel(ws, agentId, {
				onSessions: (sessions) => agents.setSessions(agentId, sessions as never),
				onActivity: (activities) => {
					for (const a of activities) broadcastActivity({ type: "session.activity", agentId, session: a.session, state: a.state });
				},
				onRebuildResult: (result) => {
					console.log(`[agent ${agentId}] rebuild ${result.session}: ${result.ok ? 'ok' : result.message}`);
				},
				onClose: (ch) => {
					if (agentChannels.get(agentId) === ch) agentChannels.delete(agentId);
				},
			});
			agentChannels.set(agentId, channel);
			agents.touch(agentId);
			ws.send(JSON.stringify({ type: "hello_ok", agentId }));

			// Request an immediate session list.
			channel.sendSessionsReq();
		});

		ws.on("close", () => {
			if (channel) {
				channel.dispose();
				agentChannels.delete(channel.agentId);
				agents.unregister(channel.agentId);
				audit("agent_disconnected", { ip, agentId: channel.agentId });
			}
			clearTimeout(helloTimer);
		});

		ws.on("error", () => {
			if (channel) {
				channel.dispose();
				agentChannels.delete(channel.agentId);
				agents.unregister(channel.agentId);
			}
			clearTimeout(helloTimer);
		});
	});
}

// ── Maintenance ───────────────────────────────────────────────────────────

const AGENT_OFFLINE_MS = parseInt(process.env.TMUX_WEB_AGENT_OFFLINE_MS || "45000", 10);
setInterval(() => {
	const stale = agents.pruneOffline(AGENT_OFFLINE_MS);
	for (const agentId of stale) {
		const rec = agents.peek(agentId);
		if (rec && rec.ws.readyState === WebSocket.CLOSED) {
			agents.unregister(agentId);
			agentChannels.get(agentId)?.dispose();
			agentChannels.delete(agentId);
		}
	}
	// Kick agents whose registration token was revoked (agent-token remove).
	const validHashes = new Set(listAgentTokens().map((t) => t.tokenHash));
	for (const [agentId, channel] of agentChannels) {
		const rec = agents.peek(agentId);
		if (!rec || validHashes.has(rec.tokenHash)) continue;
		audit("agent_token_revoked", { agentId });
		channel.dispose();
		agentChannels.delete(agentId);
		agents.unregister(agentId);
		try { rec.ws.close(4003, "token revoked"); } catch {}
	}
	tokenStore.purgeExpired();
}, 10 * 1000).unref();

function cleanup() {

	stopAgentClient();
	killAllControlClients();
	killAllAttachedPtys();
	for (const ch of agentChannels.values()) ch.dispose();
	agentChannels.clear();
	for (const [ws, client] of wsClients) {
		try { ws.close(1001, "Server shutting down"); } catch {}
		if (client.authTimeout) clearTimeout(client.authTimeout);
	}
	wsClients.clear();
	for (const p of activePtys) {
		try { p.kill(); } catch {}
	}
	activePtys.clear();
	rateLimiter.dispose();
	process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────

function isLocalhostIp(ip: string): boolean {
	return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

async function cmdAgentToken(argv: string[]): Promise<void> {
	const { createAgentToken, listAgentTokens, removeAgentToken } = await import("./lib/agent-tokens.js");
	const [sub, ...rest] = argv;
	switch (sub) {
		case "add": {
			const name = rest.find((a) => !a.startsWith("-")) || "agent";
			const { id, token } = createAgentToken(name);
			console.log(`✓ agent token created`);
			console.log(`  id:    ${id}`);
			console.log(`  name:  ${name}`);
			console.log(`  token: ${token}`);
			console.log(`\nRun on the remote machine:`);
			console.log(`  tmux-web agent --hub wss://YOUR_HUB --token ${token} --name "${name}"`);
			return;
		}
		case "list": {
			const tokens = listAgentTokens();
			if (!tokens.length) {
				console.log("No agent tokens. Create one with: tmux-web agent-token add --name <name>");
				return;
			}
			console.log("Agent tokens:");
			for (const t of tokens) {
				console.log(`  ${t.id}  ${t.name}  (created ${new Date(t.createdAt).toISOString()})`);
			}
			return;
		}
		case "remove": {
			const id = rest.find((a) => !a.startsWith("-"));
			if (!id) {
				console.error("usage: tmux-web agent-token remove <id>");
				process.exit(1);
			}
			const removed = removeAgentToken(id);
			if (!removed) {
				console.error(`no token with id ${id}`);
				process.exit(1);
			}
			console.log(`✓ token ${id} removed`);
			return;
		}
		default:
			console.error("usage: tmux-web agent-token <add|list|remove>");
			process.exit(1);
	}
}
