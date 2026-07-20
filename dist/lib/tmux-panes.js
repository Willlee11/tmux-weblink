import { execFileSync } from "node:child_process";
const TMUX_TIMEOUT_MS = 3000;
const PANE_FORMAT = "#{pane_id}\t#{pane_index}\t#{window_index}\t#{pane_pid}\t#{pane_current_command}\t#{pane_active}\t#{window_active}";
function parsePaneLine(session, line) {
    const [paneId, paneIndex, windowIndex, pid, command, active, windowActive] = line.split("\t");
    if (!paneId)
        return null;
    const winIdx = parseInt(windowIndex, 10);
    const pIdx = parseInt(paneIndex, 10);
    return {
        paneId,
        paneIndex: Number.isFinite(pIdx) ? pIdx : 0,
        windowIndex: Number.isFinite(winIdx) ? winIdx : 0,
        pid: parseInt(pid, 10) || 0,
        command: command ?? "",
        active: active === "1",
        windowActive: windowActive === "1",
        target: `${session}:${winIdx}.${pIdx}`,
    };
}
/** All panes across every window of a session. Returns [] on any tmux error. */
export function listSessionPanes(session) {
    try {
        const out = execFileSync("tmux", ["list-panes", "-s", "-t", session, "-F", PANE_FORMAT], { encoding: "utf-8", timeout: TMUX_TIMEOUT_MS });
        return out
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((l) => parsePaneLine(session, l))
            .filter((p) => p !== null);
    }
    catch {
        return [];
    }
}
/** The session's current active pane (active pane of the active window). */
export function getActivePaneInfo(session) {
    const panes = listSessionPanes(session);
    return panes.find((p) => p.active && p.windowActive) ?? null;
}
