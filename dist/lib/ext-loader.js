import { readdir, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { getDataRoot, getExtensionDataDir, getPluginDir } from './state-paths.js';
import { readSettings } from './settings.js';
async function deriveId(extDir) {
    // Authoritative source: the npm package name (sans scope).
    // Falls back to the directory basename for unpackaged local extensions.
    const pkgPath = path.join(extDir, 'package.json');
    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
            if (typeof pkg.name === 'string' && pkg.name) {
                return pkg.name.startsWith('@') ? pkg.name.split('/')[1] : pkg.name;
            }
        }
        catch { /* fall through */ }
    }
    return path.basename(extDir);
}
async function tryLoadManifest(extDir) {
    const manifestPath = path.join(extDir, 'tmux-extension.json');
    if (!existsSync(manifestPath))
        return null;
    try {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
        manifest.dir = extDir;
        manifest.id = await deriveId(extDir);
        return manifest;
    }
    catch (err) {
        console.warn(`[extensions] Failed to load ${manifestPath}: ${err.message}`);
        return null;
    }
}
function resolvePluginDir(pkgName) {
    // Canonical: <data root>/node_modules/ — managed by `tmux-web add`.
    // Fallback: <cwd>/node_modules/ — for project-local development.
    const searchPaths = [
        getPluginDir(),
        path.join(process.cwd(), 'node_modules'),
    ];
    for (const base of searchPaths) {
        const dir = path.join(base, pkgName);
        if (existsSync(dir))
            return dir;
    }
    return null;
}
export async function loadExtensions(extsDir) {
    const seen = new Set();
    const all = [];
    function collect(m) {
        if (seen.has(m.id))
            return;
        seen.add(m.id);
        all.push(m);
    }
    // 1. Local extensions/ — dev overrides, always loaded
    if (existsSync(extsDir)) {
        const entries = await readdir(extsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const m = await tryLoadManifest(path.join(extsDir, entry.name));
            if (m)
                collect(m);
        }
    }
    // 2. Plugins listed in settings.json
    const cfg = await readSettings();
    for (const pkgName of cfg.plugins ?? []) {
        const pkgDir = resolvePluginDir(pkgName);
        if (!pkgDir) {
            console.warn(`[extensions] Plugin "${pkgName}" not installed — run: tmux-web add ${pkgName}`);
            continue;
        }
        const m = await tryLoadManifest(pkgDir);
        if (m)
            collect(m);
    }
    return all;
}
export function spawnExtensionBackend(extDir, manifest) {
    const sockPath = path.join(os.tmpdir(), `tmux-web-ext-${manifest.id}.sock`);
    const dataDir = getExtensionDataDir(manifest.id);
    const dataRoot = getDataRoot();
    mkdirSync(dataDir, { recursive: true });
    manifest._socket = sockPath;
    const [cmd, ...args] = manifest.start.split(' ');
    const child = spawn(cmd, args, {
        cwd: extDir,
        env: { ...process.env, TMUX_WEB_DATA_ROOT: dataRoot, EXT_SOCKET: sockPath, EXT_DATA_DIR: dataDir },
        stdio: 'pipe',
    });
    const prefix = `[ext:${manifest.id}]`;
    child.stdout?.on('data', (d) => process.stdout.write(`${prefix} ${d}`));
    child.stderr?.on('data', (d) => process.stderr.write(`${prefix} ${d}`));
    child.on('exit', (code) => {
        if (code !== 0)
            console.warn(`${prefix} exited with code ${code}`);
    });
    return child;
}
function socketProxy(sockPath, method, reqPath, headers, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({ socketPath: sockPath, path: reqPath, method, headers }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode ?? 200,
                contentType: res.headers['content-type'] ?? 'application/json',
                body: Buffer.concat(chunks),
            }));
        });
        req.on('error', reject);
        if (body?.length)
            req.write(body);
        req.end();
    });
}
export function resolveExtensionUiFile(uiDir, file) {
    const filePath = path.resolve(uiDir, file);
    const uiRoot = path.resolve(uiDir);
    if (!filePath.startsWith(uiRoot + path.sep))
        return null;
    return filePath;
}
export function registerExtensionRoutes(app, _extsDir, manifests) {
    for (const manifest of manifests) {
        const id = manifest.id;
        const uiDir = path.join(manifest.dir, 'dist', 'ui');
        const socket = manifest._socket;
        // ── Static UI files: GET /ext/:id/ui/* ─────────────────────────────────
        app.get(`/ext/${id}/ui/:file{.+}`, async (c) => {
            const file = c.req.param('file');
            const filePath = resolveExtensionUiFile(uiDir, file);
            if (!filePath || !existsSync(filePath))
                return c.notFound();
            const { readFile: rf } = await import('node:fs/promises');
            const content = await rf(filePath);
            const ext = path.extname(file);
            const mime = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
            };
            return c.body(content, 200, {
                'Content-Type': mime[ext] ?? 'application/octet-stream',
            });
        });
        if (!socket)
            continue;
        // ── Proxy: ALL /ext/:id/api/* → extension Unix socket ───────────────────
        app.all(`/ext/${id}/api/*`, async (c) => {
            const reqPath = c.req.path.slice(`/ext/${id}/api`.length) + new URL(c.req.url).search;
            const hasBody = !['GET', 'HEAD', 'DELETE'].includes(c.req.method);
            const bodyBuf = hasBody ? Buffer.from(await c.req.arrayBuffer()) : undefined;
            const headers = Object.fromEntries([...c.req.raw.headers.entries()].filter(([k]) => k !== 'host'));
            const result = await socketProxy(socket, c.req.method, reqPath, headers, bodyBuf);
            return c.body(result.body.buffer.slice(result.body.byteOffset, result.body.byteOffset + result.body.byteLength), result.status, { 'Content-Type': result.contentType });
        });
    }
}
