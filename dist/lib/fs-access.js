import path from "node:path";
import { readdirSync, statSync } from "node:fs";
export const MAX_FILE_BYTES = 1_048_576;
export function resolveFsRoots() {
    const raw = process.env.TMUX_WEB_FS_ROOTS;
    if (!raw)
        return [];
    return raw.split(":").map((p) => {
        p = p.trim();
        if (p.startsWith("~"))
            p = path.join(process.env.HOME || "/", p.slice(1));
        return path.resolve(p);
    });
}
export function resolveFsPath(raw) {
    const roots = resolveFsRoots();
    let p = raw;
    if (p.startsWith("~"))
        p = path.join(process.env.HOME || "/", p.slice(1));
    if (!path.isAbsolute(p))
        p = path.resolve(p);
    p = path.normalize(p);
    // No roots configured — allow any path (e.g. when following tmux session CWD)
    if (roots.length === 0)
        return p;
    const ok = roots.some((root) => p === root || p.startsWith(root + path.sep));
    if (!ok)
        throw new Error("PATH_NOT_ALLOWED");
    return p;
}
export function walkRecursive(dir, dirs, files, depth, limit = 5000) {
    if (depth > 8)
        return;
    let entries;
    try {
        entries = readdirSync(dir);
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (entry.startsWith("."))
            continue;
        const full = path.join(dir, entry);
        try {
            if (statSync(full).isDirectory()) {
                dirs.push(full);
                walkRecursive(full, dirs, files, depth + 1, limit);
            }
            else {
                files.push(full);
            }
        }
        catch { }
        if (dirs.length + files.length >= limit)
            return;
    }
}
