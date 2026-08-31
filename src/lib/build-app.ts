import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync, mkdirSync, readFileSync as readFileSyncLocal } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execSync, execFileSync } from 'node:child_process';
import { tmuxEnv } from './tmux-env.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { listSessions } from '../sessions.js';
import { renderLoginPage, renderNotesIndex, renderNotesPage, renderSettings, renderThemeSettings, renderHistoryIndex, renderQuickCommandsPage, renderFilesIndex, renderShell } from '../frontend.js';
import { renderFederationPage } from './pages/federation.js';
import { createAgentToken, removeAgentToken, listAgentTokens } from './agent-tokens.js';
import type { AgentClientStatus } from './agent-client.js';
import type { FederationConfig } from './federation-config.js';
import type { TmuxWebSecurityConfig } from './security-config.js';
import { hashPassword, verifyPassword, validatePassword, type TokenStore, type StoredToken } from './auth.js';
import type { RateLimiter } from './rateLimiter.js';
import { atomicWriteFileSync } from './atomicWrite.js';
import { resolveFsPath, resolveFsRoots, MAX_FILE_BYTES, walkRecursive } from './fs-access.js';
import { captureSessionWindowsWithPath } from './tmux-windows.js';
import { audit } from './auditLog.js';
import { db } from './db.js';
import { recordSessionAccess, getSessionAccessMap } from './session-access.js';
import { listWindowHistory, clearWindowHistory } from './window-history.js';
import { saveSecurityConfig as saveSecurityConfigLocal } from './security-config.js';
import { ImageUploadError, saveUploadedImage } from './image-upload.js';
import type { TerminalBufferConfig } from './terminal-config.js';
import { readSettings, writeSettings, type TmuxWebSettings } from './settings.js';
import { readActiveTheme, setActiveThemeTemplate } from './theme-store.js';
import { isThemeTemplateId, THEME_TEMPLATE_IDS, type TmuxWebTheme } from './themes/index.js';
import type { ThemeTemplateId } from './themes/types.js';
import { pinView, unpinView, listPinnedViews } from './pinned-views.js';
import { listWindowLabels, setWindowLabel } from './window-labels.js';
import { captureAndStoreWindows, getStoredWindows } from './session-windows.js';
import { buildSidebarSessions } from './sessions-sidebar.js';
import { upsertSessionState, removeSessionState, renameSessionState, computeTombstones, getSessionState } from './session-state.js';
import { createQuickCommand, deleteQuickCommand, listQuickCommands, updateQuickCommand } from './quick-commands.js';
import { getSystemStatus, getTopProcesses, killProcess } from './system-monitor.js';
import {
	listSessionWindows,
	selectSessionWindow,
	newSessionWindow,
	renameSessionWindow,
	newTmuxSession,
	renameSession,
	killSession,
	sessionExists,
	TmuxWindowsError,
} from './tmux-windows.js';
import type { AgentRegistry } from './agent-registry.js';
import type { AgentChannel } from './agent-relay.js';
import { registerAgentTunnel } from './agent-tunnel.js';
import { injectScopeScript } from './scope-script.js';

const COOKIE_NAME = 'tmux-web-token';
const TOKEN_COOKIE_MAX_AGE_DAYS = 365;

export type AppMode = 'hub' | 'agent';

export interface BuildAppState {
	activeTheme: TmuxWebTheme;
	settingUpPassword: boolean;
}

export interface BuildAppDeps {
	mode: AppMode;
	securityConfig: TmuxWebSecurityConfig;
	tokenStore: TokenStore;
	rateLimiter: RateLimiter;
	settings: TmuxWebSettings;
	terminalBufferConfig: TerminalBufferConfig;
	/** Hub-assigned agent id (agent mode only; used to build the WS relay base). */
	getAgentId?: () => string | null;
	state: BuildAppState;
	/** Federation controls (hub mode): read/save the agent-join config and expose agent-token management. */
	federation?: {
		getConfig: () => FederationConfig;
		setConfig: (cfg: FederationConfig) => Promise<void>;
		status: () => AgentClientStatus;
		hostname: string;
	};
	hub?: {
		agents: AgentRegistry;
		getChannel: (agentId: string) => AgentChannel | null;
	};
}

// ── Auth helpers ──────────────────────────────────────────────────────────

function isLocalhostIp(ip: string): boolean {
	return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function buildApp(deps: BuildAppDeps): Hono {
	const {
		mode,
		securityConfig,
		tokenStore,
		rateLimiter,
		settings,
		terminalBufferConfig,
		getAgentId,
		state,
		federation,
		hub,
	} = deps;

	const isAgent = mode === 'agent';

	function resolveClientIp(c: import('hono').Context): string {
		if (securityConfig.security.trustProxy) {
			const fwd = (c.req.header('x-forwarded-for') || '').split(',')[0].trim();
			if (fwd) return fwd;
		}
		return c.env?.incoming?.socket?.remoteAddress || 'unknown';
	}

	function readBearerToken(c: import('hono').Context): string | null {
		const auth = c.req.header('authorization');
		if (auth?.startsWith('Bearer ')) return auth.slice(7);
		const cookie = c.req.header('cookie');
		if (!cookie) return null;
		const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
		if (match) return decodeURIComponent(match[1]);
		return null;
	}

	function validateToken(c: import('hono').Context): StoredToken | null {
		const plaintext = readBearerToken(c);
		if (!plaintext) return null;
		return tokenStore.validateToken(plaintext);
	}

	function setAuthCookie(c: import('hono').Context, token: string): void {
		const secure = c.req.header('x-forwarded-proto') === 'https' || c.req.url.startsWith('https:');
		c.header('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_COOKIE_MAX_AGE_DAYS * 86400}${secure ? '; Secure' : ''}`);
	}

	function clearAuthCookie(c: import('hono').Context): void {
		c.header('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
	}

	// In agent mode the hub has already authenticated the browser; every
	// request reaching the agent arrives through the tunnel, so auth is a
	// no-op. Hub mode enforces the real token/password auth.
	const requireAuth: () => import('hono').MiddlewareHandler = () =>
		isAgent
			? async (_c, next) => next()
			: async (c, next) => {
					const token = readBearerToken(c);
					if (!token || !tokenStore.validateToken(token)) {
						audit('http_unauthorized', { ip: resolveClientIp(c) });
						return c.json({ error: 'unauthorized' }, 401);
					}
					return next();
				};

	const requireAuthOrRedirect: () => import('hono').MiddlewareHandler = () =>
		isAgent
			? async (_c, next) => next()
			: async (c, next) => {
					const token = readBearerToken(c);
					if (!token || !tokenStore.validateToken(token)) {
						const returnTo = encodeURIComponent(c.req.url);
						return c.redirect(`/login?returnTo=${returnTo}`, 302);
					}
					return next();
				};

	// ── Merged sessions (hub only; agent mode returns local only) ─────────

	function sidebarSessionsPayload(currentSession?: string) {
		const sessions = listSessions();
		const localNames = new Set(sessions.map((s) => s.name));
		const base = buildSidebarSessions(sessions, getSessionAccessMap(), listPinnedViews());
		const remote: { agentId: string; agentName: string; online: boolean; sessions: { name: string; windows: number; attached: boolean; path?: string }[] }[] = [];
		const actualAgent = new Map<string, Set<string>>();
		const onlineAgents = new Map<string, boolean>();
		if (hub) {
			for (const a of hub.agents.list()) {
				const rec = hub.agents.get(a.agentId);
				actualAgent.set(a.agentId, new Set((rec ? rec.sessions : []).map((s) => s.name)));
				onlineAgents.set(a.agentId, a.online);
				remote.push({ agentId: a.agentId, agentName: a.name, online: a.online, sessions: rec ? rec.sessions : [] });
			}
		}
		const tombstones = computeTombstones(localNames, actualAgent, onlineAgents);
		return { ...base, currentSession: currentSession ?? null, agents: remote, tombstones };
	}

	function parsePinnedViewBody(body: { sessionName?: unknown; windowIndex?: unknown }) {
		const sessionName = typeof body.sessionName === 'string' ? body.sessionName.trim() : '';
		if (!sessionName) return { error: 'sessionName is required' as const };

		if (body.windowIndex === undefined) {
			return { sessionName };
		}

		const windowIndex = body.windowIndex;
		if (
			typeof windowIndex !== 'number' ||
			!Number.isInteger(windowIndex) ||
			windowIndex < 0
		) {
			return { error: 'windowIndex must be a non-negative integer' as const };
		}

		return { sessionName, windowIndex };
	}

	const app = new Hono();

	// ── Security headers ───────────────────────────────────────────────────
	app.use('*', async (c, next) => {
		await next();
		c.header('X-Content-Type-Options', 'nosniff');
		c.header('X-Frame-Options', 'DENY');
		c.header('Content-Security-Policy', [
			'default-src \'self\'',
			'script-src \'self\' \'unsafe-inline\'',
			'style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com',
			'connect-src \'self\' ws: wss: http: https:',
			'img-src \'self\' data:',
			'font-src \'self\' https://fonts.gstatic.com',
			'worker-src \'self\' blob:',
		].join('; '));
		c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
	});

	// ── CSRF defense (unchanged) ───────────────────────────────────────────
	app.use('*', async (c, next) => {
		const method = c.req.method;
		if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
		const site = c.req.header('sec-fetch-site');
		if (site && site !== 'same-origin' && site !== 'none') {
			return c.text('cross-site request blocked', 403);
		}
		return next();
	});

	// ── Scope script injection on hub-served HTML pages ───────────────────
	if (!isAgent) {
		app.use('*', async (c, next) => {
			await next();
			if (c.req.method !== 'GET') return;
			if (c.req.path === '/login') return;
			const ct = c.res.headers.get('content-type') ?? '';
			if (!ct.includes('text/html')) return;
			const html = await c.res.text();
			c.res = new Response(injectScopeScript(html, { prefix: '', agentId: null }), c.res);
		});
	}


	const moduleDir = path.dirname(fileURLToPath(import.meta.url));
	// Compiled client bundles live in <pkg>/dist/assets. build-app.js itself
	// sits in dist/lib/, so resolve assets relative to the module's parent
	// directory first (works for npm-global installs), then fall back to the
	// repo layout (cwd/dist/assets) and an in-place dist/lib/assets.
	const assetDirs = [
		path.join(moduleDir, '..', 'assets'),
		path.join(moduleDir, 'assets'),
		path.join(process.cwd(), 'dist', 'assets'),
	];

	app.get('/assets/:file', async (c) => {
		const file = c.req.param('file');
		if (!/^[a-zA-Z0-9._-]+$/.test(file)) return c.notFound();
		for (const dir of assetDirs) {
			const filePath = path.join(dir, file);
			if (!existsSync(filePath)) continue;
			const content = await readFile(filePath);
			const ext = path.extname(file);
			const mime: Record<string, string> = {
				'.css': 'text/css; charset=utf-8',
				'.js': 'application/javascript; charset=utf-8',
				'.map': 'application/json; charset=utf-8',
			};
			return c.body(content, 200, {
				'Content-Type': mime[ext] ?? 'application/octet-stream',
				'Cache-Control': ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=3600',
			});
		}
		return c.notFound();
	});

	const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="2.5" y="5.5" width="27" height="21" rx="4" fill="#0d1117" stroke="#7dd3fc" stroke-width="2"/>
  <path d="M8 13l4.2 3.1L8 19.2" fill="none" stroke="#7dd3fc" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="15.5" y1="19.6" x2="22.5" y2="19.6" stroke="#7dd3fc" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

	const serveFavicon = (c: import('hono').Context) =>
		c.body(FAVICON_SVG, 200, {
			'Content-Type': 'image/svg+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=86400',
		});

	app.get('/favicon.svg', serveFavicon);
	app.get('/favicon.ico', serveFavicon);

	const MANIFEST_JSON = {
		name: 'tmux-weblink',
		short_name: 'tmux-web',
		description: 'Access your tmux sessions from the browser',
		start_url: '/',
		display: 'standalone',
		background_color: '#0d1117',
		theme_color: '#0d1117',
		icons: [
			{ src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' },
			{ src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png' },
		],
	};

	app.get('/manifest.json', (c) =>
		c.json(MANIFEST_JSON, 200, {
			'Cache-Control': 'public, max-age=3600',
		}),
	);

	const SERVICE_WORKER_JS = `// tmux-weblink Service Worker
const CACHE = "tmux-weblink-v1";
const ASSETS = ["/", "/favicon.svg"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => { e.waitUntil(clients.claim()); });
self.addEventListener("fetch", (e) => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
`;

	app.get('/sw.js', (c) =>
		c.body(SERVICE_WORKER_JS, 200, {
			'Content-Type': 'application/javascript; charset=utf-8',
		}),
	);

	// ── Public routes ──────────────────────────────────────────────────────

	app.get('/login', (c) => {
		const setupParam = c.req.query('setup');
		const setupMode = setupParam === '1' ? true : !securityConfig.passwordHash;
		const error = c.req.query('error');
		return c.html(renderLoginPage({ setupMode, error: error ? decodeURIComponent(error) : undefined, theme: state.activeTheme }));
	});

	// ── Page routes (require authentication) ────────────────────────────────

	app.get('/', requireAuthOrRedirect(), (c) => {
		const roots = resolveFsRoots();
		return c.html(renderShell({
			theme: state.activeTheme,
			fsRoots: roots,
			terminalCfg: terminalBufferConfig,
			scrollback: terminalBufferConfig.initialLines + 2 * terminalBufferConfig.historyChunk,
			wsBase: isAgent && getAgentId?.() ? `/ws/a/${getAgentId()}` : undefined,
		}));
	});

	app.get('/notes', requireAuthOrRedirect(), (c) => {
		return c.html(renderNotesIndex(db.data.notes, state.activeTheme));
	});

	app.get('/notes/:session', requireAuthOrRedirect(), (c) => {
		const session = decodeURIComponent(c.req.param('session'));
		return c.html(renderNotesPage(session, state.activeTheme));
	});

	app.get('/history', requireAuthOrRedirect(), (c) => {
		const sessions = listSessions();
		const liveSessionNames = new Set(sessions.map((s) => s.name));
		return c.html(renderHistoryIndex(listWindowHistory(), state.activeTheme, liveSessionNames));
	});

	app.get('/quick-commands', requireAuthOrRedirect(), (c) => {
		return c.html(renderQuickCommandsPage(listQuickCommands(), state.activeTheme));
	});

	app.get('/files', requireAuthOrRedirect(), (c) => {
		const roots = resolveFsRoots();
		return c.html(renderFilesIndex(state.activeTheme, roots));
	});

	app.post('/api/history/clear', requireAuth(), async (c) => {
		await clearWindowHistory();
		return c.json({ ok: true });
	});

	app.get('/api/quick-commands', requireAuth(), (c) => {
		return c.json(listQuickCommands());
	});

	app.post('/api/quick-commands', requireAuth(), async (c) => {
		let body: Record<string, unknown>;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'invalid json' }, 400);
		}

		const result = await createQuickCommand(body);
		if ('error' in result) return c.json({ error: result.error }, 400);
		return c.json(result, 201);
	});

	app.patch('/api/quick-commands/:id', requireAuth(), async (c) => {
		let body: Record<string, unknown>;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'invalid json' }, 400);
		}

		const result = await updateQuickCommand(c.req.param('id'), body);
		if ('error' in result) return c.json({ error: result.error }, result.status as 400 | 404);
		return c.json(result);
	});

	app.delete('/api/quick-commands/:id', requireAuth(), (c) => {
		const deleted = deleteQuickCommand(c.req.param('id'));
		if (!deleted) return c.json({ error: 'not found' }, 404);
		return c.json({ ok: true });
	});

	// ── Auth API ────────────────────────────────────────────────────────────

	app.post('/api/auth/password', async (c) => {
		if (isAgent) return c.json({ error: 'hub only' }, 403);
		const ip = resolveClientIp(c);
		const rateResult = rateLimiter.check(ip);
		if (!rateResult.allowed) {
			audit('rate_limited', { ip, retryAfterMs: rateResult.retryAfterMs, permanentLock: rateResult.permanentLock });
			if (rateResult.permanentLock) {
				return c.json({ error: 'Server locked after too many failed attempts', permanentLock: true }, 403);
			}
			return c.json({ error: 'Too many attempts', retryAfterMs: rateResult.retryAfterMs }, 429);
		}

		let body: { password?: unknown };
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'invalid json' }, 400);
		}
		const password = typeof body.password === 'string' ? body.password : '';

		if (!securityConfig.passwordHash) {
			if (!securityConfig.security.allowRemoteSetup && !isLocalhostIp(ip)) {
				audit('setup_rejected_remote', { ip });
				return c.json({ error: 'First-run setup must be performed from localhost' }, 403);
			}
			if (state.settingUpPassword) {
				return c.json({ error: 'Password setup in progress' }, 409);
			}
			const validationError = validatePassword(password);
			if (validationError) {
				return c.json({ error: validationError }, 400);
			}
			state.settingUpPassword = true;
			try {
				securityConfig.passwordHash = await hashPassword(password);
				saveSecurityConfigLocal(securityConfig);
				audit('password_set', { ip });
			} finally {
				state.settingUpPassword = false;
			}
			const { plaintext } = tokenStore.createAccessToken('setup', securityConfig.security.tokenTtlDays);
			setAuthCookie(c, plaintext);
			return c.json({ ok: true, token: plaintext, setupMode: true });
		}

		const valid = await verifyPassword(password, securityConfig.passwordHash);
		if (!valid) {
			const rate = rateLimiter.recordFailure(ip);
			audit('auth_failed', { ip, method: 'password', failures: rate.failures, permanentLock: rate.permanentLock });
			if (rate.permanentLock) {
				tokenStore.revokeAll();
				audit('permanent_lock', { ip, failures: rate.failures });
				return c.json({ error: 'Server locked after too many failed attempts', permanentLock: true }, 403);
			}
			if (!rate.allowed) {
				return c.json({ error: 'Too many attempts', retryAfterMs: rate.retryAfterMs }, 429);
			}
			return c.json({ error: 'Incorrect password' }, 401);
		}

		rateLimiter.recordSuccess(ip);
		const name = `browser-${ip}`;
		const { plaintext } = tokenStore.createAccessToken(name, securityConfig.security.tokenTtlDays);
		setAuthCookie(c, plaintext);
		audit('auth_success', { ip, method: 'password', tokenName: name });
		return c.json({ ok: true, token: plaintext });
	});

	app.post('/api/auth/token', requireAuth(), async (c) => {
		if (isAgent) return c.json({ error: 'hub only' }, 403);
		const ip = resolveClientIp(c);
		let body: { name?: unknown; ttlDays?: unknown };
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'invalid json' }, 400);
		}
		const name = typeof body.name === 'string' ? body.name : `api-${ip}`;
		const ttlDays = typeof body.ttlDays === 'number' ? body.ttlDays : securityConfig.security.tokenTtlDays;
		const { stored, plaintext } = tokenStore.createAccessToken(name, ttlDays);
		audit('token_created', { ip, name: stored.name, tokenId: stored.id });
		return c.json({ id: stored.id, name: stored.name, token: plaintext, expiresAt: stored.expiresAt });
	});

	app.get('/api/auth/tokens', requireAuth(), (c) => {
		if (isAgent) return c.json({ error: 'hub only' }, 403);
		return c.json(tokenStore.list().map((t) => ({
			id: t.id,
			name: t.name,
			createdAt: t.createdAt,
			lastUsedAt: t.lastUsedAt,
			expiresAt: t.expiresAt,
		})));
	});

	app.delete('/api/auth/tokens/:id', requireAuth(), (c) => {
		if (isAgent) return c.json({ error: 'hub only' }, 403);
		const revoked = tokenStore.revoke(c.req.param('id'));
		if (!revoked) return c.json({ error: 'not found' }, 404);
		audit('token_revoked', { ip: resolveClientIp(c), tokenId: c.req.param('id') });
		return c.json({ ok: true });
	});

	app.post('/api/auth/logout', requireAuth(), (c) => {
		clearAuthCookie(c);
		return c.json({ ok: true });
	});

	// ── Settings ───────────────────────────────────────────────────────────

	app.get('/settings', requireAuthOrRedirect(), async (c) => {
		const current = await readSettings();
		return c.html(renderSettings({
			settings: current,
			theme: state.activeTheme,
			saved: c.req.query('saved') === '1',
			error: c.req.query('error') ? decodeURIComponent(c.req.query('error')!) : undefined,
		}));
	});

	app.post('/settings', requireAuth(), async (c) => {
		let body: Record<string, unknown>;
		try { body = await c.req.parseBody(); } catch { return c.redirect('/settings?error=' + encodeURIComponent('invalid form body'), 303); }

		const current = await readSettings();
		const defaultView = body.defaultView === 'recent' ? 'recent' : 'default';
		await writeSettings({
			...current,
			defaultView,
		});
		return c.redirect('/settings?saved=1', 303);
	});

	app.get('/settings/theme', requireAuthOrRedirect(), (c) => {
		return c.html(renderThemeSettings({
			theme: state.activeTheme,
			saved: c.req.query('saved') === '1',
		}));
	});

	app.post('/settings/theme', requireAuth(), async (c) => {
		let body: Record<string, unknown>;
		try { body = await c.req.parseBody(); } catch { return c.redirect('/settings/theme?error=1', 303); }

		const template = body.template;
		if (typeof template !== 'string' || !isThemeTemplateId(template)) {
			return c.redirect('/settings/theme', 303);
		}
		state.activeTheme = await setActiveThemeTemplate(template);
		return c.redirect('/settings/theme?saved=1', 303);
	});

	const THEME_NAMES: Record<ThemeTemplateId, string> = {
		vscode: 'VS Code',
		ghostty: 'Ghostty',
		'warm-clay': 'Warm Clay',
		'dark-cove': 'Dark Cove',
	};

	app.get('/api/theme', requireAuth(), (c) => {
		return c.json({
			active: state.activeTheme.template,
			templates: THEME_TEMPLATE_IDS.map((id) => ({ id, name: THEME_NAMES[id] })),
		});
	});

	app.post('/api/theme', requireAuth(), async (c) => {
		let body: { template?: unknown };
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'invalid json' }, 400);
		}
		const template = body.template;
		if (typeof template !== 'string' || !isThemeTemplateId(template)) {
			return c.json({ error: 'invalid theme template' }, 400);
		}
		state.activeTheme = await setActiveThemeTemplate(template);
		return c.json({ ok: true, active: state.activeTheme.template });
	});

	app.get('/api/system/status', requireAuth(), (c) => {
		return c.json(getSystemStatus());
	});

	app.get('/api/system/processes', requireAuth(), (c) => {
		return c.json(getTopProcesses());
	});

	// ── Machines (settings page + agent-token management) ───────────────────

	if (federation) {
		app.get('/settings/federation', requireAuthOrRedirect(), (c) => c.redirect('/settings/machines', 301));
		app.get('/settings/machines', requireAuthOrRedirect(), async (c) => {
			return c.html(renderFederationPage({
				config: federation.getConfig(),
				status: federation.status(),
				tokens: listAgentTokens().map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt })),
				hostname: federation.hostname,
			}, state.activeTheme));
		});

		app.get('/api/machines', requireAuth(), (c) => {
			return c.json({ config: federation.getConfig(), status: federation.status() });
		});

		app.post('/api/machines', requireAuth(), async (c) => {
			let body: { hub?: unknown; token?: unknown; name?: unknown; enabled?: unknown };
			try {
				body = await c.req.json();
			} catch {
				return c.json({ error: 'invalid json' }, 400);
			}
			const hub = typeof body.hub === 'string' ? body.hub.trim() : '';
			const token = typeof body.token === 'string' ? body.token.trim() : '';
			const name = typeof body.name === 'string' ? body.name.trim().slice(0, 64) : '';
			const enabled = body.enabled === true;
			if (enabled) {
				if (!hub) return c.json({ error: 'hub URL is required' }, 400);
				if (!/^wss?:\/\//i.test(hub)) return c.json({ error: 'hub URL must start with ws:// or wss://' }, 400);
				if (!token) return c.json({ error: 'registration token is required' }, 400);
			}
			const cfg: FederationConfig = { hub: hub || undefined, token: token || undefined, name: name || undefined, enabled };
			await federation.setConfig(cfg);
			return c.json({ ok: true, status: federation.status() });
		});

		app.get('/api/agent-tokens', requireAuth(), (c) => {
			return c.json(listAgentTokens().map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt })));
		});

		app.post('/api/agent-tokens', requireAuth(), async (c) => {
			let body: { name?: unknown };
			try {
				body = await c.req.json();
			} catch {
				return c.json({ error: 'invalid json' }, 400);
			}
			const name = typeof body.name === 'string' ? body.name.trim().slice(0, 64) : '';
			if (!name) return c.json({ error: 'name is required' }, 400);
			const { id, token } = createAgentToken(name);
			return c.json({ ok: true, id, name, token });
		});

		app.delete('/api/agent-tokens/:id', requireAuth(), (c) => {
			const id = c.req.param('id');
			const removed = removeAgentToken(id);
			if (!removed) return c.json({ error: 'no such token' }, 404);
			return c.json({ ok: true });
		});
	}

	app.post('/api/system/kill', requireAuth(), async (c) => {
		const { pid } = await c.req.json();
		if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
			return c.json({ error: 'invalid pid' }, 400);
		}
		const result = killProcess(pid);
		if (!result.ok) return c.json({ error: result.error }, 500);
		return c.json({ ok: true });
	});

	// ── Agent API (hub only) ───────────────────────────────────────────────

	app.get('/api/agents', requireAuth(), (c) => {
		if (!hub) return c.json([]);
		return c.json(hub.agents.list());
	});

	app.post('/api/sessions/new', requireAuth(), async (c) => {
		let body: { name?: unknown; dir?: unknown };
		try { body = await c.req.json(); } catch { return c.json({ error: 'invalid json' }, 400); }
		const name = typeof body.name === 'string' ? body.name.trim() : '';
		if (!name) return c.json({ error: 'name is required' }, 400);
		if (!/^[a-zA-Z0-9_\-. ]+$/.test(name)) return c.json({ error: 'name contains invalid characters' }, 400);
		const dir = typeof body.dir === 'string' && body.dir.trim() ? body.dir.trim() : undefined;
		const existing = listSessions();
		if (existing.some((s) => s.name === name)) return c.json({ error: 'session already exists' }, 409);
		try {
			newTmuxSession(name, dir);
			void upsertSessionState(name, { path: dir });
			return c.json({ ok: true });
		} catch (err) {
			const msg = err instanceof TmuxWindowsError ? err.message : 'failed to create session';
			return c.json({ error: msg }, 500);
		}
	});

	app.post('/api/sessions/rename', requireAuth(), async (c) => {
		try {
			const { oldName, newName } = await c.req.json();
			if (!oldName || !newName) return c.json({ error: 'oldName and newName required' }, 400);
			if (!/^[a-zA-Z0-9_\-. ]+$/.test(newName)) return c.json({ error: 'invalid characters in name' }, 400);
			renameSession(oldName, newName);
			void renameSessionState(oldName, newName);
			return c.json({ ok: true });
		} catch { return c.json({ error: 'rename failed' }, 500); }
	});

	app.post('/api/sessions/kill', requireAuth(), async (c) => {
		try {
			const { name } = await c.req.json();
			if (!name) return c.json({ error: 'name required' }, 400);
			killSession(name);
			void removeSessionState(name);
			return c.json({ ok: true });
		} catch { return c.json({ error: 'kill failed' }, 500); }
	});

	// Tombstone actions: rebuild a vanished session, dismiss its tombstone, or
	// rename the tombstone (optionally rebuilding under the new name).
	app.post('/api/sessions/rebuild', requireAuth(), async (c) => {
		try {
			const body = await c.req.json();
			const name = typeof body.name === 'string' ? body.name.trim() : '';
			if (!name) return c.json({ error: 'name required' }, 400);
			const agentId = typeof body.agentId === 'string' ? body.agentId : undefined;
			const rec = getSessionState().find((r) => r.name === name && (r.agentId ?? null) === (agentId ?? null));
			const dir = rec?.path;

			if (agentId) {
				if (!hub) return c.json({ error: 'not a hub' }, 400);
				const channel = hub.getChannel(agentId);
				if (!channel) return c.json({ error: 'agent offline' }, 409);
				const sent = channel.rebuildSession(name, dir);
				if (!sent) return c.json({ error: 'agent offline' }, 409);
				return c.json({ ok: true, async: true });
			}

			if (sessionExists(name)) return c.json({ error: 'session already exists' }, 409);
			try {
				newTmuxSession(name, dir);
			} catch (err) {
				const msg = err instanceof TmuxWindowsError ? err.message : 'rebuild failed';
				return c.json({ error: msg }, 500);
			}
			void upsertSessionState(name, { path: dir });
			return c.json({ ok: true });
		} catch { return c.json({ error: 'rebuild failed' }, 500); }
	});

	app.post('/api/sessions/dismiss', requireAuth(), async (c) => {
		try {
			const body = await c.req.json();
			const name = typeof body.name === 'string' ? body.name.trim() : '';
			if (!name) return c.json({ error: 'name required' }, 400);
			const agentId = typeof body.agentId === 'string' ? body.agentId : undefined;
			void removeSessionState(name, agentId);
			return c.json({ ok: true });
		} catch { return c.json({ error: 'dismiss failed' }, 500); }
	});

	app.post('/api/sessions/rename-tombstone', requireAuth(), async (c) => {
		try {
			const body = await c.req.json();
			const oldName = typeof body.oldName === 'string' ? body.oldName.trim() : '';
			const newName = typeof body.newName === 'string' ? body.newName.trim() : '';
			if (!oldName || !newName) return c.json({ error: 'oldName and newName required' }, 400);
			if (!/^[a-zA-Z0-9_\-. ]+$/.test(newName)) return c.json({ error: 'invalid characters in name' }, 400);
			const agentId = typeof body.agentId === 'string' ? body.agentId : undefined;
			void renameSessionState(oldName, newName, agentId);
			return c.json({ ok: true });
		} catch { return c.json({ error: 'rename failed' }, 500); }
	});

	// Program currently running in the session's active pane, so the touch
	// TUI-scroll zone can pick line-scroll keys the app understands
	// (vim-family uses Ctrl+Y/Ctrl+E, everything else the arrow keys).
	app.get('/api/session-program', requireAuth(), (c) => {
		const session = c.req.query('session');
		if (!session) return c.json({ program: null });
		try {
			const raw = execFileSync(
				'tmux',
				['display-message', '-p', '-t', session, '#{pane_current_command}'],
				{ encoding: 'utf-8', timeout: 3000, env: tmuxEnv() },
			);
			const program = raw.trim() || null;
			return c.json({ program });
		} catch {
			return c.json({ program: null });
		}
	});

	// Paste-an-image support: the browser uploads the clipboard image and the
	// terminal receives the saved path as typed input (tmux has no inline-image
	// protocol, so pasting an image = pasting its path, ready for cat/vim).
	app.post('/api/session/:name/upload', requireAuth(), async (c) => {
		try {
			const body = await c.req.parseBody();
			const file = body.file;
			if (!(file instanceof File)) {
				return c.json({ error: 'expected a file field named "file"' }, 400);
			}
			const buf = Buffer.from(await file.arrayBuffer());
			const { path } = await saveUploadedImage(buf, file.type, file.name);
			return c.json({ path });
		} catch (err) {
			if (err instanceof ImageUploadError) {
				return c.json({ error: err.message }, err.status);
			}
			return c.json({ error: 'upload failed' }, 500);
		}
	});

	app.get('/api/fs/session-path', requireAuth(), (c) => {
		const session = c.req.query('session');
		if (!session) return c.json({ path: process.env.HOME ?? '/' });
		try {
			const windows = captureSessionWindowsWithPath(session);
			const active = windows.find((w) => w.active);
			const p = active?.path ?? windows[0]?.path ?? process.env.HOME ?? '/';
			return c.json({ path: p });
		} catch {
			return c.json({ path: process.env.HOME ?? '/' });
		}
	});

	app.get('/api/fs/list', requireAuth(), (c) => {
		const home = process.env.HOME ?? '/';
		let rawPath = c.req.query('path') ?? home;
		if (rawPath.startsWith('~')) rawPath = home + rawPath.slice(1);
		if (!rawPath.startsWith('/')) rawPath = path.join(home, rawPath);

		const recursive = c.req.query('recursive') === 'true';

		let dirPath = rawPath;
		let prefix = '';
		let listDirectly = rawPath.endsWith('/');
		if (!listDirectly) {
			try {
				listDirectly = statSync(rawPath).isDirectory();
			} catch {}
		}
		if (!listDirectly) {
			dirPath = path.dirname(rawPath);
			prefix = path.basename(rawPath).toLowerCase();
		}

		try {
			const entries = readdirSync(dirPath);
			const dirs: string[] = [];
			const files: string[] = [];
			for (const entry of entries) {
				if (entry.startsWith('.')) continue;
				if (prefix && !entry.toLowerCase().startsWith(prefix)) continue;
				try {
					const full = path.join(dirPath, entry);
					if (statSync(full).isDirectory()) {
						dirs.push(full);
						if (recursive) {
							walkRecursive(full, dirs, files, 0);
						}
					} else {
						files.push(full);
					}
				} catch {}
				if (dirs.length + files.length >= 5000) break;
			}
			return c.json({ dirs, files });
		} catch {
			return c.json({ dirs: [], files: [] });
		}
	});

	// ── Git status API ─────────────────────────────────────────────────────

	interface GitFileEntry {
		path: string;
		status: string;
		staged: string;
		unstaged: string;
		additions: number;
		deletions: number;
	}

	interface GitStatusResult {
		repoRoot: string | null;
		branch: string | null;
		files: GitFileEntry[];
		linesAdded: number;
		linesRemoved: number;
	}

	function getGitStatus(dirPath: string): GitStatusResult {
		const empty: GitStatusResult = { repoRoot: null, branch: null, files: [], linesAdded: 0, linesRemoved: 0 };
		try {
			const repoRoot = execSync('git rev-parse --show-toplevel 2>/dev/null', {
				cwd: dirPath, encoding: 'utf-8', timeout: 3000,
			}).trim();
			if (!repoRoot) return empty;

			let branch: string;
			try {
				branch = execSync('git branch --show-current 2>/dev/null', {
					cwd: repoRoot, encoding: 'utf-8', timeout: 3000,
				}).trim();
			} catch {
				branch = execSync('git rev-parse --short HEAD 2>/dev/null', {
					cwd: repoRoot, encoding: 'utf-8', timeout: 3000,
				}).trim();
			}
			if (!branch) branch = 'HEAD';

			let porcelain = '';
			try {
				porcelain = execSync('git status --porcelain 2>/dev/null', {
					cwd: repoRoot, encoding: 'utf-8', timeout: 3000,
				});
			} catch {}

			const files: GitFileEntry[] = [];
			for (const line of porcelain.split('\n')) {
				if (!line.trim()) continue;
				const staged = line[0];
				const unstaged = line[1];
				const filePath = line.substring(3).trim();
				const effective = unstaged !== ' ' ? unstaged : staged;
				files.push({ path: filePath, status: effective, staged, unstaged, additions: 0, deletions: 0 });
			}

			const diffMap = new Map<string, { added: number; deleted: number }>();
			try {
				const numstat = execSync('git diff --numstat HEAD 2>/dev/null', {
					cwd: repoRoot, encoding: 'utf-8', timeout: 3000,
				});
				for (const line of numstat.split('\n')) {
					if (!line.trim()) continue;
					const parts = line.split('\t');
					if (parts.length >= 3) {
						const added = parseInt(parts[0], 10) || 0;
						const deleted = parseInt(parts[1], 10) || 0;
						diffMap.set(parts[2], { added, deleted });
					}
				}
			} catch {}

			for (const f of files) {
				const stats = diffMap.get(f.path);
				if (stats) {
					f.additions = stats.added;
					f.deletions = stats.deleted;
				}
			}

			let linesAdded = 0, linesRemoved = 0;
			for (const f of files) {
				linesAdded += f.additions;
				linesRemoved += f.deletions;
			}

			for (const f of files) {
				if (f.status === '?' && f.additions === 0) {
					try {
						const fullPath = path.join(repoRoot, f.path);
						const content = readFileSyncLocal(fullPath, 'utf-8');
						const lineCount = content.split('\n').length;
						f.additions = lineCount;
						linesAdded += lineCount;
					} catch {}
				}
			}

			return { repoRoot, branch, files, linesAdded, linesRemoved };
		} catch {
			return empty;
		}
	}

	app.get('/api/git/status', requireAuth(), (c) => {
		const rawPath = c.req.query('path');
		if (!rawPath) return c.json({ error: 'path is required' }, 400);
		try {
			const resolved = resolveFsPath(rawPath);
			const status = getGitStatus(resolved);
			return c.json(status);
		} catch (err) {
			if ((err as Error).message === 'FS_ROOTS_NOT_CONFIGURED') return c.json({ error: 'file access not configured' }, 403);
			if ((err as Error).message === 'PATH_NOT_ALLOWED') return c.json({ error: 'path not allowed' }, 403);
			return c.json({ repoRoot: null, branch: null, files: [], linesAdded: 0, linesRemoved: 0 });
		}
	});

	app.get('/api/git/diff', requireAuth(), (c) => {
		const repoPath = c.req.query('path');
		const file = c.req.query('file');
		if (!repoPath || !file) return c.json({ error: 'path and file are required' }, 400);
		try {
			const resolved = resolveFsPath(repoPath);
			if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
				return c.json({ error: 'invalid repository path: ' + resolved }, 400);
			}
			try {
				const diff = execFileSync('/usr/bin/git', ['diff', 'HEAD', '--', file], { cwd: resolved, encoding: 'utf-8', timeout: 5000 });
				const stagedDiff = execFileSync('/usr/bin/git', ['diff', '--cached', '--', file], { cwd: resolved, encoding: 'utf-8', timeout: 5000 });
				return c.json({ diff, stagedDiff });
			} catch (e) {
				console.error('[git/diff] execFileSync failed:', (e as any)?.code, (e as Error).message);
				throw e;
			}
		} catch (err) {
			if ((err as Error).message === 'FS_ROOTS_NOT_CONFIGURED') return c.json({ error: 'file access not configured' }, 403);
			if ((err as Error).message === 'PATH_NOT_ALLOWED') return c.json({ error: 'path not allowed' }, 403);
			console.error('[git/diff] exception:', err);
			return c.json({ error: String(err) }, 500);
		}
	});

	// ── File API ───────────────────────────────────────────────────────────

	app.get('/api/file', requireAuth(), (c) => {
		try {
			const rawPath = c.req.query('path');
			if (!rawPath) return c.json({ error: 'path is required' }, 400);
			const resolved = resolveFsPath(rawPath);
			if (!statSync(resolved).isFile()) return c.json({ error: 'not a file' }, 400);
			const size = statSync(resolved).size;
			if (size > MAX_FILE_BYTES) return c.json({ error: 'file too large', size, maxBytes: MAX_FILE_BYTES }, 413);
			const content = readFileSyncLocal(resolved, 'utf-8');
			return c.json({ path: resolved, content, size });
		} catch (err) {
			if ((err as Error).message === 'FS_ROOTS_NOT_CONFIGURED') return c.json({ error: 'file access not configured' }, 403);
			if ((err as Error).message === 'PATH_NOT_ALLOWED') return c.json({ error: 'path not allowed' }, 403);
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return c.json({ error: 'not found' }, 404);
			return c.json({ error: 'internal error' }, 500);
		}
	});

	app.put('/api/file', requireAuth(), async (c) => {
		try {
			const body: { path?: string; content?: string } = await c.req.json();
			if (!body.path || typeof body.content !== 'string') return c.json({ error: 'path and content are required' }, 400);
			const resolved = resolveFsPath(body.path);
			atomicWriteFileSync(resolved, body.content);
			return c.json({ ok: true });
		} catch (err) {
			if ((err as Error).message === 'FS_ROOTS_NOT_CONFIGURED') return c.json({ error: 'file access not configured' }, 403);
			if ((err as Error).message === 'PATH_NOT_ALLOWED') return c.json({ error: 'path not allowed' }, 403);
			return c.json({ error: 'write failed' }, 500);
		}
	});

	app.post('/api/file/delete', requireAuth(), async (c) => {
		try {
			const body: { path?: string } = await c.req.json();
			if (!body.path) return c.json({ error: 'path is required' }, 400);
			const resolved = resolveFsPath(body.path);
			if (!statSync(resolved).isFile()) return c.json({ error: 'not a file' }, 400);
			unlinkSync(resolved);
			return c.json({ ok: true });
		} catch (err) {
			if ((err as Error).message === 'FS_ROOTS_NOT_CONFIGURED') return c.json({ error: 'file access not configured' }, 403);
			if ((err as Error).message === 'PATH_NOT_ALLOWED') return c.json({ error: 'path not allowed' }, 403);
			return c.json({ error: 'delete failed' }, 500);
		}
	});

	app.post('/api/file/touch', requireAuth(), async (c) => {
		try {
			const body: { path?: string } = await c.req.json();
			if (!body.path) return c.json({ error: 'path is required' }, 400);
			const resolved = resolveFsPath(body.path);
			if (existsSync(resolved)) return c.json({ error: 'file already exists' }, 409);
			mkdirSync(path.dirname(resolved), { recursive: true });
			writeFileSync(resolved, '', 'utf-8');
			return c.json({ ok: true, path: resolved });
		} catch (err) {
			if ((err as Error).message === 'FS_ROOTS_NOT_CONFIGURED') return c.json({ error: 'file access not configured' }, 403);
			if ((err as Error).message === 'PATH_NOT_ALLOWED') return c.json({ error: 'path not allowed' }, 403);
			return c.json({ error: 'touch failed' }, 500);
		}
	});

	app.get('/api/sidebar/sessions', requireAuth(), (c) => {
		const currentSession = c.req.query('currentSession');
		return c.json(sidebarSessionsPayload(
			typeof currentSession === 'string' && currentSession ? currentSession : undefined,
		));
	});

	app.get('/api/sidebar/session-windows/:session', requireAuth(), (c) => {
		const session = decodeURIComponent(c.req.param('session'));
		return c.json(getStoredWindows(session));
	});

	app.post('/api/pinned-views', requireAuth(), async (c) => {
		let body: { sessionName?: unknown; windowIndex?: unknown };
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'invalid json' }, 400);
		}

		const parsed = parsePinnedViewBody(body);
		if ('error' in parsed) return c.json({ error: parsed.error }, 400);

		await pinView(parsed.sessionName, parsed.windowIndex);
		return c.json(sidebarSessionsPayload());
	});

	app.delete('/api/pinned-views', requireAuth(), async (c) => {
		let body: { sessionName?: unknown; windowIndex?: unknown };
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'invalid json' }, 400);
		}

		const parsed = parsePinnedViewBody(body);
		if ('error' in parsed) return c.json({ error: parsed.error }, 400);

		await unpinView(parsed.sessionName, parsed.windowIndex);
		return c.json(sidebarSessionsPayload());
	});

	// ── Notes API ──────────────────────────────────────────────────────────

	app.get('/api/notes', requireAuth(), (c) => {
		const sorted = [...db.data.notes].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
		return c.json(sorted);
	});

	app.get('/api/notes/:scope', requireAuth(), (c) => {
		const scope = decodeURIComponent(c.req.param('scope'));
		const note = db.data.notes.find((n) => n.scope === scope);
		return note ? c.json(note) : c.json(null, 404);
	});

	app.put('/api/notes/:scope', requireAuth(), async (c) => {
		const scope = decodeURIComponent(c.req.param('scope'));
		let body: { content?: unknown };
		try { body = await c.req.json(); } catch { return c.json({ error: 'invalid json' }, 400); }
		if (typeof body.content !== 'string') return c.json({ error: 'content must be string' }, 400);
		const record = { scope, content: body.content, updatedAt: Date.now() };
		const idx = db.data.notes.findIndex((n) => n.scope === scope);
		if (idx >= 0) db.data.notes[idx] = record;
		else db.data.notes.push(record);
		await db.write();
		return c.json({ ok: true });
	});

	// ── Agent tunnel (hub only) ────────────────────────────────────────────

	if (hub) {
		app.use('/a/:agentId/*', requireAuth());
		registerAgentTunnel(app, { getChannel: hub.getChannel });
	}

	return app;
}

// ── Small local helpers ───────────────────────────────────────────────────

