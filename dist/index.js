#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
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
}
catch { }
import { listSessions } from "./sessions.js";
import { renderLoginPage, renderNotesIndex, renderNotesPage, renderSettings, renderThemeSettings, renderScheduleIndex, renderHistoryIndex, renderQuickCommandsPage, renderFilesIndex, renderShell } from "./frontend.js";
import { loadSecurityConfig, saveSecurityConfig } from "./lib/security-config.js";
import { hashPassword, verifyPassword, validatePassword, TokenStore } from "./lib/auth.js";
import { RateLimiter } from "./lib/rateLimiter.js";
import { atomicWriteFileSync } from "./lib/atomicWrite.js";
import { resolveFsPath, resolveFsRoots, MAX_FILE_BYTES, walkRecursive } from "./lib/fs-access.js";
import { captureSessionWindowsWithPath } from "./lib/tmux-windows.js";
import { audit } from "./lib/auditLog.js";
import { db } from "./lib/db.js";
import { getSessionAccessMap } from "./lib/session-access.js";
import { listWindowHistory, clearWindowHistory } from "./lib/window-history.js";
import { loadExtensions, spawnExtensionBackend, registerExtensionRoutes } from "./lib/ext-loader.js";
import { SchedulerService, isValidScheduleInput, isValidRescheduleInput } from "./lib/scheduler.js";
import { getScheduleDelayError } from "./lib/schedule-delay.js";
import { handleClientMessage } from "./lib/ws-message.js";
import { loadDotEnv } from "./lib/load-env.js";
import { cmdAdd, cmdRemove, cmdList, cmdSetup, cmdTheme, printUsage, printVersion } from "./lib/cli.js";
import { readSettings, writeSettings } from "./lib/settings.js";
import { readActiveTheme, setActiveThemeTemplate } from "./lib/theme-store.js";
import { isThemeTemplateId, THEME_TEMPLATE_IDS } from "./lib/themes/index.js";
import { installPlugin, uninstallPlugin } from "./lib/plugins.js";
import { buildCommandbarSessions } from "./lib/commandbar.js";
import { pinView, unpinView, listPinnedViews } from "./lib/pinned-views.js";
import { listWindowLabels, setWindowLabel } from "./lib/window-labels.js";
import { captureAndStoreWindows, getStoredWindows } from "./lib/session-windows.js";
import { acquireControlClient, killAllControlClients } from "./lib/tmux-control.js";
import { buildSidebarSessions } from "./lib/sessions-sidebar.js";
import { createQuickCommand, deleteQuickCommand, listQuickCommands, updateQuickCommand } from "./lib/quick-commands.js";
import { getSessionPaneTarget, capturePaneTail, capturePaneHistoryChunk, isAlternateScreen, toCrlf, } from "./lib/tmux-capture.js";
import { readTerminalBufferConfig } from "./lib/terminal-config.js";
import { ImageUploadError, saveUploadedImage } from "./lib/image-upload.js";
import { getSystemStatus, getTopProcesses, killProcess } from "./lib/system-monitor.js";
import { listSessionWindows, selectSessionWindow, newSessionWindow, renameSessionWindow, newTmuxSession, renameSession, killSession, TmuxWindowsError, } from "./lib/tmux-windows.js";
loadDotEnv();
const terminalBufferConfig = readTerminalBufferConfig();
const securityConfig = loadSecurityConfig();
const tokenStore = new TokenStore();
const rateLimiter = new RateLimiter();
let settingUpPassword = false;
const COOKIE_NAME = "tmux-web-token";
const TOKEN_COOKIE_MAX_AGE_DAYS = 365;
function isLocalhostIp(ip) {
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}
function resolveClientIp(c) {
    if (securityConfig.security.trustProxy) {
        const fwd = (c.req.header("x-forwarded-for") || "").split(",")[0].trim();
        if (fwd)
            return fwd;
    }
    return c.env?.incoming?.socket?.remoteAddress || "unknown";
}
function resolveClientIpFromReq(req) {
    if (securityConfig.security.trustProxy) {
        const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
        if (fwd)
            return fwd;
    }
    return req.socket.remoteAddress || "unknown";
}
function readBearerToken(c) {
    const auth = c.req.header("authorization");
    if (auth?.startsWith("Bearer "))
        return auth.slice(7);
    const cookie = c.req.header("cookie");
    if (!cookie)
        return null;
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    if (match)
        return decodeURIComponent(match[1]);
    return null;
}
function readBearerTokenFromReq(req) {
    const auth = req.headers.authorization;
    if (typeof auth === "string" && auth.startsWith("Bearer "))
        return auth.slice(7);
    const cookie = req.headers.cookie;
    if (typeof cookie !== "string")
        return null;
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    if (match)
        return decodeURIComponent(match[1]);
    return null;
}
function validateToken(c) {
    const plaintext = readBearerToken(c);
    if (!plaintext)
        return null;
    return tokenStore.validateToken(plaintext);
}
function validateTokenFromReq(req) {
    const plaintext = readBearerTokenFromReq(req);
    if (!plaintext)
        return null;
    return tokenStore.validateToken(plaintext);
}
function setAuthCookie(c, token) {
    const secure = c.req.header("x-forwarded-proto") === "https" || c.req.url.startsWith("https:");
    c.header("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_COOKIE_MAX_AGE_DAYS * 86400}${secure ? "; Secure" : ""}`);
}
function clearAuthCookie(c) {
    c.header("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
function requireAuth() {
    return async (c, next) => {
        const token = readBearerToken(c);
        if (!token || !tokenStore.validateToken(token)) {
            audit("http_unauthorized", { ip: resolveClientIp(c) });
            return c.json({ error: "unauthorized" }, 401);
        }
        return next();
    };
}
function redirectToLogin(c) {
    const returnTo = encodeURIComponent(c.req.url);
    return c.redirect(`/login?returnTo=${returnTo}`, 302);
}
function requireAuthOrRedirect() {
    return async (c, next) => {
        const token = readBearerToken(c);
        if (!token || !tokenStore.validateToken(token)) {
            return redirectToLogin(c);
        }
        return next();
    };
}
const wsClients = new Map();
function countWsConnectionsByIp(ip) {
    let n = 0;
    for (const c of wsClients.values()) {
        if (c.ip === ip)
            n++;
    }
    return n;
}
function closeWs(ws, code, reason) {
    try {
        ws.close(code, reason);
    }
    catch { }
}
function sendWsAuth(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}
// Resolve the terminal renderer with precedence: flag > env > setting > default.
// The CLI flag is explicit per-run, the env var is a session override, and the
// saved setting (settings.json terminalRenderer) is the persistent baseline.
function resolveTerminalRenderer(args, fromSettings) {
    let renderer = "xterm";
    if (fromSettings === "ghostty" || fromSettings === "xterm")
        renderer = fromSettings;
    const env = process.env.TMUX_WEB_TERMINAL_RENDERER?.trim().toLowerCase();
    if (env === "ghostty" || env === "xterm")
        renderer = env;
    for (const arg of args) {
        if (arg === "--ghostty")
            renderer = "ghostty";
        if (arg === "--xterm")
            renderer = "xterm";
    }
    return renderer;
}
// Clamp the schedule history retention to a sane integer day count (default 7).
const DEFAULT_SCHEDULE_HISTORY_DAYS = 7;
function clampHistoryDays(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
        return DEFAULT_SCHEDULE_HISTORY_DAYS;
    return Math.min(365, Math.max(1, Math.round(value)));
}
const startupArgs = process.argv.slice(2);
// ── CLI subcommand dispatch ───────────────────────────────────────────────
// Runs before any server setup so `tmux-web add/remove/list` are fast and
// don't try to bind a port or load the db.
{
    const args = startupArgs.filter((arg) => arg !== "--ghostty" && arg !== "--xterm");
    if (args.length > 0) {
        const [sub, arg] = args;
        switch (sub) {
            case "add":
                if (!arg) {
                    console.error("usage: tmux-web add <package>");
                    process.exit(1);
                }
                await cmdAdd(arg);
                process.exit(0);
            case "remove":
            case "rm":
                if (!arg) {
                    console.error("usage: tmux-web remove <package>");
                    process.exit(1);
                }
                await cmdRemove(arg);
                process.exit(0);
            case "list":
            case "ls":
                await cmdList();
                process.exit(0);
            case "setup":
                await cmdSetup(args);
                process.exit(0);
            case "theme":
                await cmdTheme(args.slice(1));
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
function sendServerMessage(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}
const activePtys = new Set();
const extChildren = [];
// Init db and read settings before constructing the scheduler so history
// retention (settings.scheduleHistoryDays) applies to the startup prune too.
await db.read();
db.data.sessionAccess ??= [];
db.data.pinnedViews ??= [];
db.data.watchedPanes ??= [];
db.data.triggeredTasks ??= [];
db.data.quickCommands ??= [];
const settings = await readSettings();
let activeTheme = await readActiveTheme();
const commandbarEnabled = settings.commandbar === true;
const terminalRenderer = resolveTerminalRenderer(startupArgs, settings.terminalRenderer);
const scheduleHistoryDays = clampHistoryDays(settings.scheduleHistoryDays);
const extsDir = path.join(process.cwd(), "extensions");
const extensions = await loadExtensions(extsDir);
for (const ext of extensions) {
    if (ext.start)
        extChildren.push(spawnExtensionBackend(ext.dir, ext));
}
const scheduler = new SchedulerService({
    db,
    historyRetentionMs: scheduleHistoryDays * 86_400_000,
    onMissedTask: (task) => console.warn(`[scheduler] dropped missed task ${task.id} (was due ${new Date(task.fireAt).toISOString()})`),
});
await scheduler.restoreFromDb();
const app = new Hono();
// Security headers for every response.
app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Content-Security-Policy", [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self' ws: wss: http: https:",
        "img-src 'self' data:",
        "font-src 'self'",
        "worker-src 'self' blob:",
    ].join("; "));
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});
// CSRF defense for every state-changing request. The classic CSRF vector is a
// cross-origin <form> POST auto-submitted by a page the user happens to be
// visiting; here that is especially dangerous because POST /settings/plugins
// shells out to `npm install`, whose lifecycle scripts run arbitrary code
// (CSRF -> RCE). Browsers attach Sec-Fetch-Site on navigations/submissions:
// our own same-origin pages send "same-origin", direct navigation / non-browser
// clients (curl) send "none" or omit it entirely, while a cross-site attacker
// form carries "cross-site"/"same-site". Allow the first two, reject the rest.
app.use("*", async (c, next) => {
    const method = c.req.method;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS")
        return next();
    const site = c.req.header("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
        return c.text("cross-site request blocked", 403);
    }
    return next();
});
registerExtensionRoutes(app, extsDir, extensions);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const assetDirs = [
    path.join(moduleDir, "assets"),
    path.join(process.cwd(), "dist", "assets"),
];
app.get("/assets/:file", async (c) => {
    const file = c.req.param("file");
    if (!/^[a-zA-Z0-9._-]+$/.test(file))
        return c.notFound();
    for (const dir of assetDirs) {
        const filePath = path.join(dir, file);
        if (!existsSync(filePath))
            continue;
        const content = await readFile(filePath);
        const ext = path.extname(file);
        const mime = {
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".map": "application/json; charset=utf-8",
        };
        return c.body(content, 200, {
            "Content-Type": mime[ext] ?? "application/octet-stream",
            "Cache-Control": ext === ".js" || ext === ".css" ? "no-cache" : "public, max-age=3600",
        });
    }
    return c.notFound();
});
// Terminal-window favicon (SVG). Served at both /favicon.svg and the path
// browsers auto-request, /favicon.ico, so every page resolves it without a 404.
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="2.5" y="5.5" width="27" height="21" rx="4" fill="#0d1117" stroke="#7dd3fc" stroke-width="2"/>
  <path d="M8 13l4.2 3.1L8 19.2" fill="none" stroke="#7dd3fc" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="15.5" y1="19.6" x2="22.5" y2="19.6" stroke="#7dd3fc" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;
const serveFavicon = (c) => c.body(FAVICON_SVG, 200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=86400",
});
app.get("/favicon.svg", serveFavicon);
app.get("/favicon.ico", serveFavicon);
// ── PWA / manifest ─────────────────────────────────────────────────────────
const MANIFEST_JSON = {
    name: "tmux-weblink",
    short_name: "tmux-web",
    description: "Access your tmux sessions from the browser",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1117",
    theme_color: "#0d1117",
    icons: [
        { src: "/assets/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
};
app.get("/manifest.json", (c) => c.json(MANIFEST_JSON, 200, {
    "Cache-Control": "public, max-age=3600",
}));
// ── Service Worker ─────────────────────────────────────────────────────────
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
app.get("/sw.js", (c) => c.body(SERVICE_WORKER_JS, 200, {
    "Content-Type": "application/javascript; charset=utf-8",
}));
// ── Public routes ──────────────────────────────────────────────────────────
app.get("/login", (c) => {
    const setupParam = c.req.query("setup");
    const setupMode = setupParam === "1" ? true : !securityConfig.passwordHash;
    const error = c.req.query("error");
    return c.html(renderLoginPage({ setupMode, error: error ? decodeURIComponent(error) : undefined, theme: activeTheme }));
});
// ── Page routes (require authentication) ────────────────────────────────────
app.get("/", requireAuthOrRedirect(), (c) => {
    const commandbarSessions = commandbarEnabled ? buildCommandbarSessions(listSessions(), getSessionAccessMap()) : [];
    const roots = resolveFsRoots();
    return c.html(renderShell({
        theme: activeTheme,
        commandbarEnabled,
        commandbarSessions,
        fsRoots: roots,
        terminalCfg: terminalBufferConfig,
        renderer: terminalRenderer,
        scrollback: terminalBufferConfig.initialLines + 2 * terminalBufferConfig.historyChunk,
    }));
});
app.get("/notes", requireAuthOrRedirect(), (c) => {
    const commandbarSessions = commandbarEnabled ? buildCommandbarSessions(listSessions(), getSessionAccessMap()) : [];
    return c.html(renderNotesIndex(db.data.notes, activeTheme, commandbarEnabled, commandbarSessions));
});
app.get("/notes/:session", requireAuthOrRedirect(), (c) => {
    const session = decodeURIComponent(c.req.param("session"));
    const commandbarSessions = commandbarEnabled ? buildCommandbarSessions(listSessions(), getSessionAccessMap()) : [];
    return c.html(renderNotesPage(session, activeTheme, commandbarEnabled, commandbarSessions));
});
app.get("/schedule", requireAuthOrRedirect(), (c) => {
    const commandbarSessions = commandbarEnabled ? buildCommandbarSessions(listSessions(), getSessionAccessMap()) : [];
    return c.html(renderScheduleIndex(scheduler.list(), scheduler.listTriggered(), activeTheme, scheduleHistoryDays, commandbarEnabled, commandbarSessions));
});
app.get("/history", requireAuthOrRedirect(), (c) => {
    const sessions = listSessions();
    const commandbarSessions = commandbarEnabled ? buildCommandbarSessions(sessions, getSessionAccessMap()) : [];
    const liveSessionNames = new Set(sessions.map((s) => s.name));
    return c.html(renderHistoryIndex(listWindowHistory(), activeTheme, commandbarEnabled, commandbarSessions, liveSessionNames));
});
app.get("/quick-commands", requireAuthOrRedirect(), (c) => {
    const commandbarSessions = commandbarEnabled ? buildCommandbarSessions(listSessions(), getSessionAccessMap()) : [];
    return c.html(renderQuickCommandsPage(listQuickCommands(), activeTheme, commandbarEnabled, commandbarSessions));
});
app.get("/files", requireAuthOrRedirect(), (c) => {
    const commandbarSessions = commandbarEnabled ? buildCommandbarSessions(listSessions(), getSessionAccessMap()) : [];
    const roots = resolveFsRoots();
    return c.html(renderFilesIndex(activeTheme, commandbarEnabled, commandbarSessions, roots));
});
app.post("/api/history/clear", requireAuth(), async (c) => {
    await clearWindowHistory();
    return c.json({ ok: true });
});
app.get("/api/quick-commands", requireAuth(), (c) => {
    return c.json(listQuickCommands());
});
app.post("/api/quick-commands", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const result = await createQuickCommand(body);
    if ("error" in result)
        return c.json({ error: result.error }, 400);
    return c.json(result, 201);
});
app.patch("/api/quick-commands/:id", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const result = await updateQuickCommand(c.req.param("id"), body);
    if ("error" in result)
        return c.json({ error: result.error }, result.status);
    return c.json(result);
});
app.delete("/api/quick-commands/:id", requireAuth(), async (c) => {
    const deleted = await deleteQuickCommand(c.req.param("id"));
    if (!deleted)
        return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
});
// ── Auth API (password endpoint is public; token management requires auth) ───
app.post("/api/auth/password", async (c) => {
    const ip = resolveClientIp(c);
    const rateResult = rateLimiter.check(ip);
    if (!rateResult.allowed) {
        audit("rate_limited", { ip, retryAfterMs: rateResult.retryAfterMs, permanentLock: rateResult.permanentLock });
        if (rateResult.permanentLock) {
            return c.json({ error: "Server locked after too many failed attempts", permanentLock: true }, 403);
        }
        return c.json({ error: "Too many attempts", retryAfterMs: rateResult.retryAfterMs }, 429);
    }
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const password = typeof body.password === "string" ? body.password : "";
    if (!securityConfig.passwordHash) {
        if (!securityConfig.security.allowRemoteSetup && !isLocalhostIp(ip)) {
            audit("setup_rejected_remote", { ip });
            return c.json({ error: "First-run setup must be performed from localhost" }, 403);
        }
        if (settingUpPassword) {
            return c.json({ error: "Password setup in progress" }, 409);
        }
        const validationError = validatePassword(password);
        if (validationError) {
            return c.json({ error: validationError }, 400);
        }
        settingUpPassword = true;
        try {
            securityConfig.passwordHash = await hashPassword(password);
            saveSecurityConfig(securityConfig);
            audit("password_set", { ip });
        }
        finally {
            settingUpPassword = false;
        }
        const { plaintext } = tokenStore.createAccessToken("setup", securityConfig.security.tokenTtlDays);
        setAuthCookie(c, plaintext);
        return c.json({ ok: true, token: plaintext, setupMode: true });
    }
    const valid = await verifyPassword(password, securityConfig.passwordHash);
    if (!valid) {
        const rate = rateLimiter.recordFailure(ip);
        audit("auth_failed", { ip, method: "password", failures: rate.failures, permanentLock: rate.permanentLock });
        if (rate.permanentLock) {
            tokenStore.revokeAll();
            audit("permanent_lock", { ip, failures: rate.failures });
            return c.json({ error: "Server locked after too many failed attempts", permanentLock: true }, 403);
        }
        if (!rate.allowed) {
            return c.json({ error: "Too many attempts", retryAfterMs: rate.retryAfterMs }, 429);
        }
        return c.json({ error: "Incorrect password" }, 401);
    }
    rateLimiter.recordSuccess(ip);
    const name = `browser-${ip}`;
    const { plaintext } = tokenStore.createAccessToken(name, securityConfig.security.tokenTtlDays);
    setAuthCookie(c, plaintext);
    audit("auth_success", { ip, method: "password", tokenName: name });
    return c.json({ ok: true, token: plaintext });
});
app.post("/api/auth/token", requireAuth(), async (c) => {
    const ip = resolveClientIp(c);
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const name = typeof body.name === "string" ? body.name : `api-${ip}`;
    const ttlDays = typeof body.ttlDays === "number" ? body.ttlDays : securityConfig.security.tokenTtlDays;
    const { stored, plaintext } = tokenStore.createAccessToken(name, ttlDays);
    audit("token_created", { ip, name: stored.name, tokenId: stored.id });
    return c.json({ id: stored.id, name: stored.name, token: plaintext, expiresAt: stored.expiresAt });
});
app.get("/api/auth/tokens", requireAuth(), (c) => {
    return c.json(tokenStore.list().map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
    })));
});
app.delete("/api/auth/tokens/:id", requireAuth(), (c) => {
    const revoked = tokenStore.revoke(c.req.param("id"));
    if (!revoked)
        return c.json({ error: "not found" }, 404);
    audit("token_revoked", { ip: resolveClientIp(c), tokenId: c.req.param("id") });
    return c.json({ ok: true });
});
app.post("/api/auth/logout", requireAuth(), (c) => {
    clearAuthCookie(c);
    return c.json({ ok: true });
});
// ── Settings pages ───────────────────────────────────────────────────────────
app.get("/settings", requireAuthOrRedirect(), async (c) => {
    const current = await readSettings();
    const savedRenderer = current.terminalRenderer ?? "xterm";
    return c.html(renderSettings({
        settings: current,
        renderer: terminalRenderer,
        rendererOverridden: terminalRenderer !== savedRenderer,
        theme: activeTheme,
        plugins: current.plugins ?? [],
        saved: c.req.query("saved") === "1",
        error: c.req.query("error") ? decodeURIComponent(c.req.query("error")) : undefined,
    }));
});
app.post("/settings", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.parseBody();
    }
    catch {
        return c.redirect("/settings?error=" + encodeURIComponent("invalid form body"), 303);
    }
    const current = await readSettings();
    const renderer = body.terminalRenderer === "ghostty" ? "ghostty" : "xterm";
    const defaultView = body.defaultView === "recent" ? "recent" : "default";
    const historyDays = clampHistoryDays(typeof body.scheduleHistoryDays === "string" ? Number(body.scheduleHistoryDays) : undefined);
    await writeSettings({
        ...current,
        commandbar: body.commandbar !== undefined,
        terminalRenderer: renderer,
        defaultView,
        scheduleHistoryDays: historyDays,
    });
    return c.redirect("/settings?saved=1", 303);
});
app.post("/settings/plugins", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.parseBody();
    }
    catch {
        return c.redirect("/settings?error=" + encodeURIComponent("invalid form body"), 303);
    }
    const action = body.action;
    const pkg = typeof body.pkg === "string" ? body.pkg.trim() : "";
    if (!pkg)
        return c.redirect("/settings?error=" + encodeURIComponent("missing package name"), 303);
    const result = action === "remove"
        ? await uninstallPlugin(pkg)
        : action === "add"
            ? await installPlugin(pkg)
            : { ok: false, output: "unknown action" };
    if (!result.ok) {
        return c.redirect("/settings?error=" + encodeURIComponent(result.output.slice(0, 800)), 303);
    }
    return c.redirect("/settings?saved=1", 303);
});
app.get("/settings/theme", requireAuthOrRedirect(), (c) => {
    return c.html(renderThemeSettings({
        theme: activeTheme,
        saved: c.req.query("saved") === "1",
    }));
});
app.post("/settings/theme", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.parseBody();
    }
    catch {
        return c.redirect("/settings/theme?error=1", 303);
    }
    const template = body.template;
    if (typeof template !== "string" || !isThemeTemplateId(template)) {
        return c.redirect("/settings/theme", 303);
    }
    activeTheme = await setActiveThemeTemplate(template);
    return c.redirect("/settings/theme?saved=1", 303);
});
const THEME_NAMES = {
    vscode: "VS Code",
    ghostty: "Ghostty",
    "warm-clay": "Warm Clay",
    "dark-cove": "Dark Cove",
};
app.get("/api/theme", requireAuth(), (c) => {
    return c.json({
        active: activeTheme.template,
        templates: THEME_TEMPLATE_IDS.map((id) => ({ id, name: THEME_NAMES[id] })),
    });
});
app.post("/api/theme", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const template = body.template;
    if (typeof template !== "string" || !isThemeTemplateId(template)) {
        return c.json({ error: "invalid theme template" }, 400);
    }
    activeTheme = await setActiveThemeTemplate(template);
    return c.json({ ok: true, active: activeTheme.template });
});
app.get("/api/system/status", requireAuth(), (c) => {
    return c.json(getSystemStatus());
});
app.get("/api/system/processes", requireAuth(), (c) => {
    return c.json(getTopProcesses());
});
app.post("/api/system/kill", requireAuth(), async (c) => {
    const { pid } = await c.req.json();
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
        return c.json({ error: "invalid pid" }, 400);
    }
    const result = killProcess(pid);
    if (!result.ok)
        return c.json({ error: result.error }, 500);
    return c.json({ ok: true });
});
app.get("/api/sessions", requireAuth(), (c) => {
    if (!commandbarEnabled)
        return c.json({ error: "commandbar disabled" }, 404);
    return c.json(buildCommandbarSessions(listSessions(), getSessionAccessMap()));
});
app.post("/api/sessions/new", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name)
        return c.json({ error: "name is required" }, 400);
    if (!/^[a-zA-Z0-9_\-. ]+$/.test(name))
        return c.json({ error: "name contains invalid characters" }, 400);
    const dir = typeof body.dir === "string" && body.dir.trim() ? body.dir.trim() : undefined;
    const existing = listSessions();
    if (existing.some((s) => s.name === name))
        return c.json({ error: "session already exists" }, 409);
    try {
        newTmuxSession(name, dir);
        return c.json({ ok: true });
    }
    catch (err) {
        const msg = err instanceof TmuxWindowsError ? err.message : "failed to create session";
        return c.json({ error: msg }, 500);
    }
});
app.post("/api/sessions/rename", requireAuth(), async (c) => {
    try {
        const { oldName, newName } = await c.req.json();
        if (!oldName || !newName)
            return c.json({ error: "oldName and newName required" }, 400);
        if (!/^[a-zA-Z0-9_\-. ]+$/.test(newName))
            return c.json({ error: "invalid characters in name" }, 400);
        renameSession(oldName, newName);
        return c.json({ ok: true });
    }
    catch {
        return c.json({ error: "rename failed" }, 500);
    }
});
app.post("/api/sessions/kill", requireAuth(), async (c) => {
    try {
        const { name } = await c.req.json();
        if (!name)
            return c.json({ error: "name required" }, 400);
        killSession(name);
        return c.json({ ok: true });
    }
    catch {
        return c.json({ error: "kill failed" }, 500);
    }
});
app.get("/api/fs/session-path", requireAuth(), (c) => {
    const session = c.req.query("session");
    if (!session)
        return c.json({ error: "session is required" }, 400);
    try {
        const windows = captureSessionWindowsWithPath(session);
        const active = windows.find((w) => w.active);
        const p = active?.path ?? windows[0]?.path ?? process.env.HOME ?? "/";
        return c.json({ path: p });
    }
    catch {
        return c.json({ path: process.env.HOME ?? "/" });
    }
});
app.get("/api/fs/list", requireAuth(), (c) => {
    const home = process.env.HOME ?? "/";
    let rawPath = c.req.query("path") ?? home;
    if (rawPath.startsWith("~"))
        rawPath = home + rawPath.slice(1);
    if (!rawPath.startsWith("/"))
        rawPath = path.join(home, rawPath);
    const recursive = c.req.query("recursive") === "true";
    // If rawPath is an existing directory (or ends with "/"), list its contents.
    // Otherwise treat the trailing segment as a prefix and list/filter its parent,
    // so partial input like "~/Doc" suggests "~/Documents".
    let dirPath = rawPath;
    let prefix = "";
    let listDirectly = rawPath.endsWith("/");
    if (!listDirectly) {
        try {
            listDirectly = statSync(rawPath).isDirectory();
        }
        catch { }
    }
    if (!listDirectly) {
        dirPath = path.dirname(rawPath);
        prefix = path.basename(rawPath).toLowerCase();
    }
    try {
        const entries = readdirSync(dirPath);
        const dirs = [];
        const files = [];
        for (const entry of entries) {
            if (entry.startsWith("."))
                continue;
            if (prefix && !entry.toLowerCase().startsWith(prefix))
                continue;
            try {
                const full = path.join(dirPath, entry);
                if (statSync(full).isDirectory()) {
                    dirs.push(full);
                    if (recursive) {
                        walkRecursive(full, dirs, files, 0);
                    }
                }
                else {
                    files.push(full);
                }
            }
            catch { }
            if (dirs.length + files.length >= 5000)
                break;
        }
        return c.json({ dirs, files });
    }
    catch {
        return c.json({ dirs: [], files: [] });
    }
});
function getGitStatus(dirPath) {
    const empty = { repoRoot: null, branch: null, files: [], linesAdded: 0, linesRemoved: 0 };
    try {
        // Find repo root
        const repoRoot = execSync("git rev-parse --show-toplevel 2>/dev/null", {
            cwd: dirPath, encoding: "utf-8", timeout: 3000,
        }).trim();
        if (!repoRoot)
            return empty;
        // Current branch
        let branch;
        try {
            branch = execSync("git branch --show-current 2>/dev/null", {
                cwd: repoRoot, encoding: "utf-8", timeout: 3000,
            }).trim();
        }
        catch {
            branch = execSync("git rev-parse --short HEAD 2>/dev/null", {
                cwd: repoRoot, encoding: "utf-8", timeout: 3000,
            }).trim();
        }
        if (!branch)
            branch = "HEAD";
        // Porcelain status
        let porcelain = "";
        try {
            porcelain = execSync("git status --porcelain 2>/dev/null", {
                cwd: repoRoot, encoding: "utf-8", timeout: 3000,
            });
        }
        catch { }
        const files = [];
        for (const line of porcelain.split("\n")) {
            if (!line.trim())
                continue;
            const staged = line[0];
            const unstaged = line[1];
            const filePath = line.substring(3).trim();
            // Determine effective status for display
            const effective = unstaged !== " " ? unstaged : staged;
            files.push({ path: filePath, status: effective, staged, unstaged, additions: 0, deletions: 0 });
        }
        // Per-file diff stats (working tree vs HEAD)
        const diffMap = new Map();
        try {
            const numstat = execSync("git diff --numstat HEAD 2>/dev/null", {
                cwd: repoRoot, encoding: "utf-8", timeout: 3000,
            });
            for (const line of numstat.split("\n")) {
                if (!line.trim())
                    continue;
                const parts = line.split("\t");
                if (parts.length >= 3) {
                    const added = parseInt(parts[0], 10) || 0;
                    const deleted = parseInt(parts[1], 10) || 0;
                    diffMap.set(parts[2], { added, deleted });
                }
            }
        }
        catch { }
        // Apply diff stats to file entries
        for (const f of files) {
            const stats = diffMap.get(f.path);
            if (stats) {
                f.additions = stats.added;
                f.deletions = stats.deleted;
            }
        }
        // Total diff stats
        let linesAdded = 0, linesRemoved = 0;
        for (const f of files) {
            linesAdded += f.additions;
            linesRemoved += f.deletions;
        }
        // Count untracked file lines as additions (git diff --numstat skips them)
        for (const f of files) {
            if (f.status === "?" && f.additions === 0) {
                try {
                    const fullPath = path.join(repoRoot, f.path);
                    const content = readFileSync(fullPath, "utf-8");
                    const lineCount = content.split("\n").length;
                    f.additions = lineCount;
                    linesAdded += lineCount;
                }
                catch { }
            }
        }
        return { repoRoot, branch, files, linesAdded, linesRemoved };
    }
    catch {
        return empty;
    }
}
app.get("/api/git/status", requireAuth(), (c) => {
    const rawPath = c.req.query("path");
    if (!rawPath)
        return c.json({ error: "path is required" }, 400);
    try {
        const resolved = resolveFsPath(rawPath);
        const status = getGitStatus(resolved);
        return c.json(status);
    }
    catch (err) {
        if (err.message === "FS_ROOTS_NOT_CONFIGURED")
            return c.json({ error: "file access not configured" }, 403);
        if (err.message === "PATH_NOT_ALLOWED")
            return c.json({ error: "path not allowed" }, 403);
        return c.json({ repoRoot: null, branch: null, files: [], linesAdded: 0, linesRemoved: 0 });
    }
});
// ── File API (requires TMUX_WEB_FS_ROOTS) ─────────────────────────────────
app.get("/api/file", requireAuth(), (c) => {
    try {
        const rawPath = c.req.query("path");
        if (!rawPath)
            return c.json({ error: "path is required" }, 400);
        const resolved = resolveFsPath(rawPath);
        if (!statSync(resolved).isFile())
            return c.json({ error: "not a file" }, 400);
        const size = statSync(resolved).size;
        if (size > MAX_FILE_BYTES)
            return c.json({ error: "file too large", size, maxBytes: MAX_FILE_BYTES }, 413);
        const content = readFileSync(resolved, "utf-8");
        return c.json({ path: resolved, content, size });
    }
    catch (err) {
        if (err.message === "FS_ROOTS_NOT_CONFIGURED")
            return c.json({ error: "file access not configured" }, 403);
        if (err.message === "PATH_NOT_ALLOWED")
            return c.json({ error: "path not allowed" }, 403);
        if (err.code === "ENOENT")
            return c.json({ error: "not found" }, 404);
        return c.json({ error: "internal error" }, 500);
    }
});
app.put("/api/file", requireAuth(), async (c) => {
    try {
        const body = await c.req.json();
        if (!body.path || typeof body.content !== "string")
            return c.json({ error: "path and content are required" }, 400);
        const resolved = resolveFsPath(body.path);
        atomicWriteFileSync(resolved, body.content);
        return c.json({ ok: true });
    }
    catch (err) {
        if (err.message === "FS_ROOTS_NOT_CONFIGURED")
            return c.json({ error: "file access not configured" }, 403);
        if (err.message === "PATH_NOT_ALLOWED")
            return c.json({ error: "path not allowed" }, 403);
        return c.json({ error: "write failed" }, 500);
    }
});
app.post("/api/file/delete", requireAuth(), async (c) => {
    try {
        const body = await c.req.json();
        if (!body.path)
            return c.json({ error: "path is required" }, 400);
        const resolved = resolveFsPath(body.path);
        if (!statSync(resolved).isFile())
            return c.json({ error: "not a file" }, 400);
        unlinkSync(resolved);
        return c.json({ ok: true });
    }
    catch (err) {
        if (err.message === "FS_ROOTS_NOT_CONFIGURED")
            return c.json({ error: "file access not configured" }, 403);
        if (err.message === "PATH_NOT_ALLOWED")
            return c.json({ error: "path not allowed" }, 403);
        if (err.code === "ENOENT")
            return c.json({ error: "not found" }, 404);
        return c.json({ error: "delete failed" }, 500);
    }
});
app.post("/api/file/touch", requireAuth(), async (c) => {
    try {
        const body = await c.req.json();
        if (!body.path)
            return c.json({ error: "path is required" }, 400);
        const resolved = resolveFsPath(body.path);
        if (existsSync(resolved))
            return c.json({ error: "file already exists" }, 409);
        mkdirSync(path.dirname(resolved), { recursive: true });
        writeFileSync(resolved, "", "utf-8");
        return c.json({ ok: true, path: resolved });
    }
    catch (err) {
        if (err.message === "FS_ROOTS_NOT_CONFIGURED")
            return c.json({ error: "file access not configured" }, 403);
        if (err.message === "PATH_NOT_ALLOWED")
            return c.json({ error: "path not allowed" }, 403);
        return c.json({ error: "touch failed" }, 500);
    }
});
function sidebarSessionsPayload(currentSession) {
    return {
        ...buildSidebarSessions(listSessions(), getSessionAccessMap(), listPinnedViews()),
        currentSession: currentSession ?? null,
    };
}
function parsePinnedViewBody(body) {
    const sessionName = typeof body.sessionName === "string" ? body.sessionName.trim() : "";
    if (!sessionName)
        return { error: "sessionName is required" };
    if (body.windowIndex === undefined) {
        return { sessionName };
    }
    const windowIndex = body.windowIndex;
    if (typeof windowIndex !== "number" ||
        !Number.isInteger(windowIndex) ||
        windowIndex < 0) {
        return { error: "windowIndex must be a non-negative integer" };
    }
    return { sessionName, windowIndex };
}
app.get("/api/sidebar/sessions", requireAuth(), (c) => {
    const currentSession = c.req.query("currentSession");
    return c.json(sidebarSessionsPayload(typeof currentSession === "string" && currentSession ? currentSession : undefined));
});
// Sidebar window list — served from lowdb (captured on focus); never spawns tmux.
app.get("/api/sidebar/session-windows/:session", requireAuth(), (c) => {
    const session = decodeURIComponent(c.req.param("session"));
    return c.json(getStoredWindows(session));
});
app.post("/api/pinned-views", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const parsed = parsePinnedViewBody(body);
    if ("error" in parsed)
        return c.json({ error: parsed.error }, 400);
    await pinView(parsed.sessionName, parsed.windowIndex);
    return c.json(sidebarSessionsPayload());
});
app.delete("/api/pinned-views", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const parsed = parsePinnedViewBody(body);
    if ("error" in parsed)
        return c.json({ error: parsed.error }, 400);
    await unpinView(parsed.sessionName, parsed.windowIndex);
    return c.json(sidebarSessionsPayload());
});
// ── Notes API ──────────────────────────────────────────────────────────────
app.get("/api/notes", requireAuth(), (c) => {
    const sorted = [...db.data.notes].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return c.json(sorted);
});
app.get("/api/notes/:scope", requireAuth(), (c) => {
    const scope = decodeURIComponent(c.req.param("scope"));
    const note = db.data.notes.find((n) => n.scope === scope);
    return note ? c.json(note) : c.json(null, 404);
});
app.put("/api/notes/:scope", requireAuth(), async (c) => {
    const scope = decodeURIComponent(c.req.param("scope"));
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    if (typeof body.content !== "string")
        return c.json({ error: "content must be string" }, 400);
    const record = { scope, content: body.content, updatedAt: Date.now() };
    const idx = db.data.notes.findIndex((n) => n.scope === scope);
    if (idx >= 0)
        db.data.notes[idx] = record;
    else
        db.data.notes.push(record);
    await db.write();
    return c.json({ ok: true });
});
// ── Scheduler API ──────────────────────────────────────────────────────────
app.post("/api/session/:session/upload", requireAuth(), async (c) => {
    const session = decodeURIComponent(c.req.param("session"));
    const sessions = listSessions();
    if (!sessions.some((s) => s.name === session)) {
        return c.json({ error: "session not found" }, 404);
    }
    let body;
    try {
        body = await c.req.parseBody();
    }
    catch {
        return c.json({ error: "invalid multipart body" }, 400);
    }
    const file = body.file;
    if (!(file instanceof File)) {
        return c.json({ error: "missing file field" }, 400);
    }
    try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const { path: filePath } = await saveUploadedImage(buffer, file.type || undefined, file.name || undefined);
        return c.json({ path: filePath });
    }
    catch (err) {
        if (err instanceof ImageUploadError) {
            return c.json({ error: err.message }, err.status);
        }
        console.error("[upload]", err);
        return c.json({ error: "upload failed" }, 500);
    }
});
app.get("/api/session/:session/windows", requireAuth(), (c) => {
    const session = decodeURIComponent(c.req.param("session"));
    const labels = new Map(listWindowLabels(session).map((l) => [l.windowIndex, l.label]));
    const stored = new Map(getStoredWindows(session).map((w) => [w.index, w]));
    const windows = listSessionWindows(session).map((w) => ({
        ...w,
        label: labels.get(w.index) ?? null,
        worktree: stored.get(w.index)?.worktree ?? false,
    }));
    return c.json(windows);
});
app.post("/api/session/:session/window-label", requireAuth(), async (c) => {
    const session = decodeURIComponent(c.req.param("session"));
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const { windowIndex } = body;
    if (typeof windowIndex !== "number" || !Number.isInteger(windowIndex) || windowIndex < 0) {
        return c.json({ error: "windowIndex must be a non-negative integer" }, 400);
    }
    const label = typeof body.label === "string" ? body.label : "";
    const labels = await setWindowLabel(session, windowIndex, label);
    return c.json(labels);
});
app.post("/api/session/:session/select-window", requireAuth(), async (c) => {
    const session = decodeURIComponent(c.req.param("session"));
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const { windowIndex } = body;
    if (typeof windowIndex !== "number" ||
        !Number.isInteger(windowIndex) ||
        windowIndex < 0) {
        return c.json({ error: "windowIndex must be a non-negative integer" }, 400);
    }
    try {
        selectSessionWindow(session, windowIndex);
        return c.json({ ok: true });
    }
    catch (err) {
        if (err instanceof TmuxWindowsError) {
            return c.json({ error: err.message }, err.status);
        }
        console.error("[select-window]", err);
        return c.json({ error: "select-window failed" }, 500);
    }
});
app.post("/api/session/:session/rename-window", requireAuth(), async (c) => {
    const session = decodeURIComponent(c.req.param("session"));
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const { windowIndex } = body;
    if (typeof windowIndex !== "number" ||
        !Number.isInteger(windowIndex) ||
        windowIndex < 0) {
        return c.json({ error: "windowIndex must be a non-negative integer" }, 400);
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
        return c.json({ error: "name is required" }, 400);
    }
    try {
        renameSessionWindow(session, windowIndex, body.name);
        captureAndStoreWindows(session);
        return c.json({ ok: true });
    }
    catch (err) {
        if (err instanceof TmuxWindowsError) {
            return c.json({ error: err.message }, err.status);
        }
        console.error("[rename-window]", err);
        return c.json({ error: "rename-window failed" }, 500);
    }
});
app.post("/api/session/:session/new-window", requireAuth(), (c) => {
    const session = decodeURIComponent(c.req.param("session"));
    try {
        newSessionWindow(session);
        captureAndStoreWindows(session);
        return c.json({ ok: true });
    }
    catch (err) {
        if (err instanceof TmuxWindowsError) {
            return c.json({ error: err.message }, err.status);
        }
        console.error("[new-window]", err);
        return c.json({ error: "new-window failed" }, 500);
    }
});
app.get("/api/schedule", requireAuth(), (c) => {
    return c.json(scheduler.list(c.req.query("session")));
});
app.post("/api/schedule", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const delayError = getScheduleDelayError(body);
    if (delayError)
        return c.json({ error: delayError }, 400);
    if (!isValidScheduleInput(body))
        return c.json({ error: "invalid body" }, 400);
    const task = await scheduler.create(body);
    return c.json({ id: task.id, fireAt: task.fireAt });
});
app.delete("/api/schedule/:id", requireAuth(), async (c) => {
    const deleted = await scheduler.delete(c.req.param("id"));
    if (!deleted)
        return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
});
app.patch("/api/schedule/:id", requireAuth(), async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json({ error: "invalid json" }, 400);
    }
    const delayError = getScheduleDelayError(body);
    if (delayError)
        return c.json({ error: delayError }, 400);
    if (!isValidRescheduleInput(body))
        return c.json({ error: "invalid body" }, 400);
    const updated = await scheduler.reschedule(c.req.param("id"), body.delayMs);
    if (!updated)
        return c.json({ error: "not found" }, 404);
    return c.json({ id: updated.id, fireAt: updated.fireAt });
});
// ── WebSocket server ───────────────────────────────────────────────────────
const port = parseInt(process.env.PORT || "21000", 10);
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    console.log(`tmux-web running at http://${info.port}`);
});
// watched panes and caches the result for /api/agents. Off unless enabled.
const wss = new WebSocketServer({ noServer: true });
function rejectUpgrade(socket, code, message) {
    socket.write(`HTTP/1.1 ${code} ${message}\r\n\r\n`);
    socket.destroy();
}
server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/ws\/(.+)$/);
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
wss.on("connection", (ws, _req, sessionName, ip, preflightToken) => {
    const client = { ws, ip, authenticated: false, authTimeout: null };
    wsClients.set(ws, client);
    audit("ws_connected", { ip });
    let ptyProcess = null;
    const { initialLines, historyChunk, syncIdleMs, syncMaxMs } = terminalBufferConfig;
    let syncing = true;
    let syncIdleTimer = null;
    let syncMaxTimer = null;
    let paneTarget = sessionName;
    let releaseControl = null;
    const clearSyncTimers = () => {
        if (syncIdleTimer) {
            clearTimeout(syncIdleTimer);
            syncIdleTimer = null;
        }
        if (syncMaxTimer) {
            clearTimeout(syncMaxTimer);
            syncMaxTimer = null;
        }
    };
    const finishSync = () => {
        if (!syncing)
            return;
        clearSyncTimers();
        syncing = false;
        try {
            paneTarget = getSessionPaneTarget(sessionName);
        }
        catch {
            paneTarget = sessionName;
        }
        if (!isAlternateScreen(paneTarget)) {
            try {
                const data = capturePaneTail(paneTarget, initialLines);
                sendServerMessage(ws, { type: "snapshot", data: toCrlf(data), lines: initialLines });
            }
            catch {
                sendServerMessage(ws, { type: "data", data: "\r\n" });
            }
        }
    };
    const scheduleSyncEnd = () => {
        if (!syncing)
            return;
        if (syncIdleTimer)
            clearTimeout(syncIdleTimer);
        syncIdleTimer = setTimeout(finishSync, syncIdleMs);
    };
    function startPty() {
        try {
            ptyProcess = pty.spawn("tmux", ["attach-session", "-t", sessionName], {
                name: "xterm-256color",
                cols: 80,
                rows: 24,
                cwd: process.env.HOME || "/",
                env: process.env,
            });
        }
        catch (err) {
            sendServerMessage(ws, {
                type: "data",
                data: `\r\n\x1b[31mFailed to attach to tmux session "${sessionName}": ${err.message}\x1b[0m\r\n`,
            });
            closeWs(ws, 1011, "pty spawn failed");
            return;
        }
        activePtys.add(ptyProcess);
        // Mirror tmux-side window switches back to this tab.
        let lastActiveIndex = -1;
        let lastWindowKey = "";
        releaseControl = acquireControlClient(sessionName, ({ activeIndex, windows }) => {
            sendServerMessage(ws, { type: "window_changed", activeIndex, windows });
            const windowKey = windows.map((w) => w.index).join(",");
            const structural = activeIndex !== lastActiveIndex || windowKey !== lastWindowKey;
            lastActiveIndex = activeIndex;
            lastWindowKey = windowKey;
            if (structural) {
            }
        });
        syncMaxTimer = setTimeout(finishSync, syncMaxMs);
        ptyProcess.onData((data) => {
            if (syncing) {
                scheduleSyncEnd();
                return;
            }
            sendServerMessage(ws, { type: "data", data });
        });
        ptyProcess.onExit(({ exitCode }) => {
            clearSyncTimers();
            if (ptyProcess)
                activePtys.delete(ptyProcess);
            ptyProcess = null;
            sendServerMessage(ws, {
                type: "data",
                data: `\r\n\x1b[2m--- tmux exited (code ${exitCode}) ---\x1b[0m\r\n`,
            });
            closeWs(ws, 1000, "pty exited");
        });
    }
    function completeAuth(method, tokenName) {
        client.authenticated = true;
        if (client.authTimeout) {
            clearTimeout(client.authTimeout);
            client.authTimeout = null;
        }
        audit("auth_success", { ip, method, tokenName });
        sendServerMessage(ws, { type: "auth.ok", setupMode: !securityConfig.passwordHash });
        startPty();
    }
    function sendAuthFailed(message, extra = {}) {
        sendServerMessage(ws, { type: "auth.failed", message, ...extra });
    }
    async function handleAuthMessage(data) {
        let msg;
        try {
            msg = JSON.parse(data);
        }
        catch {
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
                }
                finally {
                    settingUpPassword = false;
                }
                const { stored, plaintext } = tokenStore.createAccessToken("setup", securityConfig.security.tokenTtlDays);
                sendServerMessage(ws, { type: "auth.ok", setupMode: true, token: plaintext });
                audit("token_created", { ip, name: stored.name, tokenId: stored.id });
                audit("auth_success", { ip, method: "password", tokenName: stored.name });
                startPty();
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
    }
    else {
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
        if (!ptyProcess)
            return;
        try {
            if (handleClientMessage(data, ptyProcess))
                return;
        }
        catch {
            return;
        }
        let msg;
        try {
            msg = JSON.parse(data);
        }
        catch {
            return;
        }
        if (msg.type === "load_history" && typeof msg.before === "number") {
            const before = Math.max(0, Math.floor(msg.before));
            try {
                const { data: chunk, lines } = capturePaneHistoryChunk(paneTarget, before, historyChunk);
                sendServerMessage(ws, { type: "history", data: toCrlf(chunk), before, lines });
            }
            catch {
                sendServerMessage(ws, { type: "history", data: "", before, lines: 0 });
            }
        }
    });
    ws.on("close", () => {
        if (client.authTimeout)
            clearTimeout(client.authTimeout);
        wsClients.delete(ws);
        audit("ws_disconnected", { ip });
        clearSyncTimers();
        if (releaseControl) {
            releaseControl();
            releaseControl = null;
        }
        if (ptyProcess) {
            activePtys.delete(ptyProcess);
            ptyProcess.kill();
            ptyProcess = null;
        }
    });
    ws.on("error", () => {
        if (client.authTimeout)
            clearTimeout(client.authTimeout);
        wsClients.delete(ws);
        clearSyncTimers();
        if (releaseControl) {
            releaseControl();
            releaseControl = null;
        }
        if (ptyProcess) {
            activePtys.delete(ptyProcess);
            ptyProcess.kill();
            ptyProcess = null;
        }
    });
});
function cleanup() {
    scheduler.cleanup();
    killAllControlClients();
    for (const [ws, client] of wsClients) {
        try {
            ws.close(1001, "Server shutting down");
        }
        catch { }
        if (client.authTimeout)
            clearTimeout(client.authTimeout);
    }
    wsClients.clear();
    for (const p of activePtys) {
        try {
            p.kill();
        }
        catch { }
    }
    activePtys.clear();
    for (const child of extChildren) {
        try {
            child.kill("SIGTERM");
        }
        catch { }
    }
    rateLimiter.dispose();
    process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
// Purge expired tokens hourly.
setInterval(() => {
    tokenStore.purgeExpired();
}, 60 * 60 * 1000).unref();
