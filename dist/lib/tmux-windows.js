import { execFileSync } from "node:child_process";
export class TmuxWindowsError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = "TmuxWindowsError";
    }
}
export function listSessionWindows(session) {
    try {
        const raw = execFileSync("tmux", ["list-windows", "-t", session, "-F", "#{window_index}\t#{window_name}\t#{window_active}"], { encoding: "utf-8", timeout: 3000 });
        return raw
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
            const [index, name, active] = line.split("\t");
            return {
                index: parseInt(index, 10),
                name,
                active: active === "1",
            };
        });
    }
    catch {
        return [];
    }
}
export function captureSessionWindowsWithPath(session) {
    try {
        const raw = execFileSync("tmux", [
            "list-windows",
            "-t",
            session,
            "-F",
            "#{window_index}\t#{window_name}\t#{window_active}\t#{pane_current_path}",
        ], { encoding: "utf-8", timeout: 3000 });
        return raw
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
            const [index, name, active, path] = line.split("\t");
            return {
                index: parseInt(index, 10),
                name,
                active: active === "1",
                path: path ?? "",
            };
        });
    }
    catch {
        return [];
    }
}
// A linked git worktree reports a different --git-dir than --git-common-dir;
// the main worktree reports them equal. Any non-git dir / error → not a worktree.
export function isGitWorktree(dir) {
    if (!dir)
        return false;
    try {
        const out = execFileSync("git", ["-C", dir, "rev-parse", "--git-dir", "--git-common-dir"], { encoding: "utf-8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
        const [gitDir, commonDir] = out.trim().split("\n");
        if (!gitDir || !commonDir)
            return false;
        return gitDir !== commonDir;
    }
    catch {
        return false;
    }
}
function sessionExists(session) {
    try {
        execFileSync("tmux", ["has-session", "-t", session], { timeout: 3000 });
        return true;
    }
    catch {
        return false;
    }
}
export function newSessionWindow(session) {
    if (!sessionExists(session)) {
        throw new TmuxWindowsError("session not found", 404);
    }
    try {
        execFileSync("tmux", ["new-window", "-t", session], { timeout: 3000 });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "new-window failed";
        throw new TmuxWindowsError(message, 500);
    }
}
export function newTmuxSession(name, dir) {
    const args = ["new-session", "-d", "-s", name];
    if (dir)
        args.push("-c", dir);
    try {
        execFileSync("tmux", args, { timeout: 5000 });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "new-session failed";
        throw new TmuxWindowsError(message, 500);
    }
}
export function renameSession(oldName, newName) {
    execFileSync("tmux", ["rename-session", "-t", oldName, newName], { timeout: 5000 });
}
export function killSession(name) {
    execFileSync("tmux", ["kill-session", "-t", name], { timeout: 5000 });
}
export function selectSessionWindow(session, windowIndex) {
    if (!sessionExists(session)) {
        throw new TmuxWindowsError("session not found", 404);
    }
    const windows = listSessionWindows(session);
    if (!windows.some((w) => w.index === windowIndex)) {
        throw new TmuxWindowsError("window not found", 404);
    }
    try {
        execFileSync("tmux", ["select-window", "-t", `${session}:${windowIndex}`], {
            timeout: 3000,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "select-window failed";
        throw new TmuxWindowsError(message, 500);
    }
}
export function renameSessionWindow(session, windowIndex, name) {
    if (!sessionExists(session)) {
        throw new TmuxWindowsError("session not found", 404);
    }
    const windows = listSessionWindows(session);
    if (!windows.some((w) => w.index === windowIndex)) {
        throw new TmuxWindowsError("window not found", 404);
    }
    const trimmed = name.trim();
    if (!trimmed) {
        throw new TmuxWindowsError("name is required", 500);
    }
    try {
        execFileSync("tmux", ["rename-window", "-t", `${session}:${windowIndex}`, trimmed], { timeout: 3000 });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "rename-window failed";
        throw new TmuxWindowsError(message, 500);
    }
}
