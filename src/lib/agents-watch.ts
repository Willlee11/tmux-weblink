/**
 * Orchestrates agent detection over the user's recently-viewed panes.
 *
 * Compute budget is deliberately tight: we only ever look at the (≤10) panes in
 * the watch list, and only when something asks us to — either the /agents page
 * polling on demand, or the optional background watcher. Each probe cycle costs
 * at most: one `ps` snapshot + one `tmux list-panes` per distinct watched
 * session + one `tmux capture-pane` per alive watched pane.
 */
import { execFileSync } from 'node:child_process';
import { capturePaneLines } from './tmux-capture.js';
import { listSessionPanes, type PaneInfo } from './tmux-panes.js';
import { getWatchedPanes, pruneWatchedPanes } from './watched-panes.js';
import { identifyAgent, detectState, type Agent, type AgentState } from './agent-detect.js';

export interface AgentStatus {
	paneId: string;
	sessionName: string;
	windowIndex: number;
	paneIndex: number;
	agent: Agent;
	state: AgentState;
	watchedAt: number;
}

// ── Process snapshot (for unwrapping node/bun launchers) ───────────────────────

interface ProcNode {
	ppid: number;
	command: string; // full argv line
}

/** One `ps` call per cycle, shared across all watched panes. */
function buildProcessSnapshot(): Map<number, ProcNode> {
	const map = new Map<number, ProcNode>();
	try {
		const out = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], {
			encoding: 'utf-8',
			timeout: 3000,
			maxBuffer: 8 * 1024 * 1024,
		});
		for (const line of out.split('\n')) {
			const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
			if (!m) continue;
			map.set(parseInt(m[1], 10), { ppid: parseInt(m[2], 10), command: m[3] });
		}
	} catch {
		// No snapshot — identification falls back to the pane's current command.
	}
	return map;
}

/** Collect argv lines for a pid and its descendants (bounded breadth/depth). */
function descendantArgv(rootPid: number, snapshot: Map<number, ProcNode>): string[] {
	if (snapshot.size === 0 || rootPid <= 0) return [];
	// Index children by ppid once.
	const childrenOf = new Map<number, number[]>();
	for (const [pid, node] of snapshot) {
		const arr = childrenOf.get(node.ppid);
		if (arr) arr.push(pid);
		else childrenOf.set(node.ppid, [pid]);
	}
	const out: string[] = [];
	const queue: number[] = [...(childrenOf.get(rootPid) ?? [])];
	const self = snapshot.get(rootPid);
	if (self) out.push(self.command);
	let guard = 0;
	while (queue.length && guard < 200) {
		guard++;
		const pid = queue.shift()!;
		const node = snapshot.get(pid);
		if (node) out.push(node.command);
		const kids = childrenOf.get(pid);
		if (kids) queue.push(...kids);
	}
	return out;
}

// ── Probe ──────────────────────────────────────────────────────────────────

/**
 * Probe every watched pane, prune dead ones, and return the agent panes with
 * their current state. Panes/sessions that have vanished are skipped silently.
 */
export async function probeWatchedPanes(): Promise<AgentStatus[]> {
	const watched = getWatchedPanes();
	if (watched.length === 0) return [];

	// One list-panes per distinct session; build the alive-pane index.
	const panesBySession = new Map<string, PaneInfo[]>();
	for (const w of watched) {
		if (!panesBySession.has(w.sessionName)) {
			panesBySession.set(w.sessionName, listSessionPanes(w.sessionName));
		}
	}

	const aliveIds = new Set<string>();
	for (const panes of panesBySession.values()) {
		for (const p of panes) aliveIds.add(p.paneId);
	}
	await pruneWatchedPanes(aliveIds);

	const snapshot = buildProcessSnapshot();
	const results: AgentStatus[] = [];

	for (const w of watched) {
		const pane = panesBySession.get(w.sessionName)?.find((p) => p.paneId === w.paneId);
		if (!pane) continue; // dead — already pruned

		const argv = descendantArgv(pane.pid, snapshot);
		const agent = identifyAgent(pane.command, argv);
		if (!agent) continue;

		let state: AgentState = 'unknown';
		try {
			// Capture the visible screen (works for both normal and alternate-
			// screen TUIs like Claude Code, where the agent chrome lives).
			const screen = capturePaneLines(pane.target, 0);
			state = detectState(agent, screen);
		} catch {
			// Pane vanished mid-cycle; leave state unknown.
		}

		results.push({
			paneId: pane.paneId,
			sessionName: w.sessionName,
			windowIndex: pane.windowIndex,
			paneIndex: pane.paneIndex,
			agent,
			state,
			watchedAt: w.watchedAt,
		});
	}

	return results;
}

// ── Background watcher (optional, single timer) ────────────────────────────────

let watchTimer: ReturnType<typeof setInterval> | null = null;
let cache: AgentStatus[] = [];

/** Latest cached snapshot from the background watcher (empty if not running). */
export function getCachedAgentStatuses(): AgentStatus[] {
	return cache;
}

export function isBackgroundWatchRunning(): boolean {
	return watchTimer !== null;
}

/**
 * Start the background watcher. Runs one probe immediately, then every
 * `intervalMs`, caching the result. Idempotent.
 */
export function startBackgroundWatch(intervalMs = 3500): void {
	if (watchTimer) return;
	const run = () => {
		probeWatchedPanes()
			.then((r) => { cache = r; })
			.catch(() => { /* keep last cache */ });
	};
	run();
	watchTimer = setInterval(run, intervalMs);
	// Don't keep the process alive solely for this timer.
	if (typeof watchTimer.unref === 'function') watchTimer.unref();
}

export function stopBackgroundWatch(): void {
	if (watchTimer) {
		clearInterval(watchTimer);
		watchTimer = null;
	}
	cache = [];
}
