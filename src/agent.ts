#!/usr/bin/env node
import { createRequire } from 'node:module';
import { hostname } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { listSessions, resolveTmuxSocketPath } from './sessions.js';
import { loadSecurityConfig } from './lib/security-config.js';
import { TokenStore } from './lib/auth.js';
import { RateLimiter } from './lib/rateLimiter.js';
import { db } from './lib/db.js';
import { handleClientMessage } from './lib/ws-message.js';
import { loadDotEnv } from './lib/load-env.js';
import { readSettings } from './lib/settings.js';
import { readActiveTheme } from './lib/theme-store.js';
import { buildApp } from './lib/build-app.js';
import { acquireControlClient } from './lib/tmux-control.js';
import { getSessionPaneTarget, capturePaneTail, capturePaneHistoryChunk, toCrlf } from './lib/tmux-capture.js';
import { readTerminalBufferConfig } from './lib/terminal-config.js';
import { startAgentClient } from './lib/agent-client.js';

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
db.data.quickCommands ??= [];

const settings = await readSettings();
const activeTheme = await readActiveTheme();
const app = buildApp({
	mode: 'agent',
	securityConfig,
	tokenStore,
	rateLimiter,
	settings,
	terminalRenderer: settings.terminalRenderer === 'ghostty' ? 'ghostty' : 'xterm',
	terminalBufferConfig,
	getAgentId: () => null,
	state: { activeTheme, settingUpPassword: false },
});

// ── Agent channel ─────────────────────────────────────────────────────────

const handle = startAgentClient({
	hub: hubUrl,
	token,
	name,
	version,
	app,
	listSessions,
	terminalBufferConfig,
	getSessionPaneTarget,
	capturePaneTail,
	capturePaneHistoryChunk,
	toCrlf,
	handleClientMessage,
	acquireControlClient,
	tmuxSocketPath: resolveTmuxSocketPath() ?? undefined,
});

function cleanup(): void {
	handle.stop();
	process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

