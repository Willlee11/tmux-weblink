import * as pty from "node-pty";
import { captureAndStoreWindows } from "./session-windows.js";
import { recordWindowVisit } from "./window-history.js";
// Control-mode event prefixes that imply the active window or window list
// changed. Everything else in the stream (%begin/%end/%output/%layout-change…)
// is ignored.
const REQUERY_PREFIXES = [
    "%session-window-changed",
    "%window-add",
    "%window-close",
    "%unlinked-window-close",
    "%window-renamed",
    "%session-renamed",
];
/** Pure: does this control-mode line mean we should re-query window state? */
export function shouldRequery(line) {
    return REQUERY_PREFIXES.some((p) => line.startsWith(p));
}
const DEBOUNCE_MS = 75;
// `ignore-size` is critical: without it the control client counts as a real
// attached client and tmux shrinks the session's windows to the smallest
// client. `no-output` drops %output (pane content) events we never use.
const defaultSpawn = (session) => pty.spawn("tmux", ["-CC", "attach-session", "-t", session, "-f", "ignore-size,no-output"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || "/",
    env: process.env,
});
function defaultRequery(session) {
    const windows = captureAndStoreWindows(session);
    if (!windows.length)
        return null;
    const active = windows.find((w) => w.active);
    // Log the window we just landed on to visit history (fire-and-forget). This
    // fires on every active-window change tmux reports — web-driven or tmux-side.
    if (active)
        void recordWindowVisit(session, active.index, active.name);
    return {
        activeIndex: active ? active.index : windows[0].index,
        windows: windows.map((w) => ({ index: w.index, name: w.name, active: w.active })),
    };
}
const controlClients = new Map();
/**
 * Attach (or reuse) a control-mode client for `session` and subscribe to active
 * window changes. Returns a release() — call it once per acquire; the client is
 * torn down when the last subscriber releases.
 */
export function acquireControlClient(session, onChange, opts = {}) {
    const spawn = opts.spawn ?? defaultSpawn;
    const requery = opts.requery ?? defaultRequery;
    const debounceMs = opts.debounceMs ?? DEBOUNCE_MS;
    let client = controlClients.get(session);
    if (!client) {
        let proc;
        try {
            proc = spawn(session);
        }
        catch {
            // tmux missing / spawn failed: degrade to one-way (no live updates).
            return () => { };
        }
        const created = {
            pty: proc,
            refCount: 0,
            subscribers: new Set(),
            buf: "",
            debounceTimer: null,
            schedule: () => { },
        };
        const fire = () => {
            created.debounceTimer = null;
            let payload;
            try {
                payload = requery(session);
            }
            catch {
                payload = null;
            }
            if (!payload)
                return;
            for (const sub of created.subscribers) {
                try {
                    sub(payload);
                }
                catch { }
            }
        };
        created.schedule = () => {
            if (created.debounceTimer)
                clearTimeout(created.debounceTimer);
            created.debounceTimer = setTimeout(fire, debounceMs);
        };
        proc.onData((data) => {
            created.buf += data;
            let nl;
            while ((nl = created.buf.indexOf("\n")) >= 0) {
                const line = created.buf.slice(0, nl).replace(/\r$/, "");
                created.buf = created.buf.slice(nl + 1);
                if (shouldRequery(line))
                    created.schedule();
            }
        });
        proc.onExit(() => {
            if (created.debounceTimer)
                clearTimeout(created.debounceTimer);
            controlClients.delete(session);
        });
        controlClients.set(session, created);
        client = created;
    }
    client.subscribers.add(onChange);
    client.refCount += 1;
    // Push current state so a freshly-connected tab reflects reality on connect.
    client.schedule();
    let released = false;
    return () => {
        if (released)
            return;
        released = true;
        const c = controlClients.get(session);
        if (!c)
            return;
        c.subscribers.delete(onChange);
        c.refCount -= 1;
        if (c.refCount <= 0) {
            if (c.debounceTimer)
                clearTimeout(c.debounceTimer);
            try {
                c.pty.kill();
            }
            catch { }
            controlClients.delete(session);
        }
    };
}
/** Kill every control client. Used on server shutdown. */
export function killAllControlClients() {
    for (const c of controlClients.values()) {
        if (c.debounceTimer)
            clearTimeout(c.debounceTimer);
        try {
            c.pty.kill();
        }
        catch { }
    }
    controlClients.clear();
}
/** Test-only: number of live control clients. */
export function _controlClientCount() {
    return controlClients.size;
}
