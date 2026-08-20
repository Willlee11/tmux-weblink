// Agent activity detection: "is this tmux session producing output right now?"
//
// Instead of per-agent feature heuristics (herdr-style agent signatures), we
// watch the raw terminal: every pane's screen content is hashed periodically
// and any change means the session is working. This is generic — any agent
// (claude, codex, pi, plain scripts) lights up automatically, and it works for
// sessions that are NOT open in the browser (it never depends on an attach
// connection).
//
// The probe runs on the machine that owns the tmux server:
//   - hub mode:      index.ts polls local sessions
//   - agent mode:    agent-client.ts polls the agent's own sessions and reports
//                    changes to the hub
//
// Cost: one capture-pane + hash per pane per scan (~4ms/pane), far below the
// default 2s scan interval.

import { execFile } from 'node:child_process';
import { tmuxEnv } from './tmux-env.js';

export const DEFAULT_ACTIVITY_IDLE_MS = 10_000;
export const DEFAULT_ACTIVITY_SCAN_MS = 2_000;

export type ActivityState = 'working' | 'idle';

export interface ActivityProbeOptions {
	/** Silence duration after which a session turns idle. */
	idleMs?: number;
	/** Scan interval used by callers; the probe itself just exposes scan(). */
	scanMs?: number;
	/** Injectable tmux runner (tests). Defaults to execFile('tmux'). */
	execTmux?: (args: string[]) => Promise<string>;
}

/** Pure state function: a session is working while it produced output within idleMs. */
export function computeAgentState(now: number, lastActivityAt: number, idleMs: number): ActivityState {
	return now - lastActivityAt <= idleMs ? 'working' : 'idle';
}

function defaultExecTmux(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile('tmux', args, { env: tmuxEnv(), maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
			if (err) reject(err);
			else resolve(stdout);
		});
	});
}

interface PaneRef {
	session: string;
	target: string;
}

export class ActivityProbe {
	readonly idleMs: number;
	readonly scanMs: number;
	private readonly execTmux: (args: string[]) => Promise<string>;
	private hashes = new Map<string, string>(); // pane target -> screen content
	private lastActivity = new Map<string, number>(); // session -> last change ts

	constructor(opts: ActivityProbeOptions = {}) {
		const idleMsEnv = parseInt(process.env.TMUX_WEB_ACTIVITY_IDLE_MS || String(DEFAULT_ACTIVITY_IDLE_MS), 10);
		this.idleMs = opts.idleMs ?? (idleMsEnv || DEFAULT_ACTIVITY_IDLE_MS);
		const scanMsEnv = parseInt(process.env.TMUX_WEB_ACTIVITY_SCAN_MS || String(DEFAULT_ACTIVITY_SCAN_MS), 10);
		this.scanMs = opts.scanMs ?? (scanMsEnv || DEFAULT_ACTIVITY_SCAN_MS);
		this.execTmux = opts.execTmux ?? defaultExecTmux;
	}

	/** One full scan round. Returns the current state for every known session. */
	async scan(now = Date.now()): Promise<Map<string, ActivityState>> {
		const panes = await this.listPanes();
		const seen = new Set<string>();
		for (const p of panes) {
			seen.add(p.session);
			let content: string;
			try {
				content = await this.execTmux(['capture-pane', '-p', '-e', '-t', p.target]);
			} catch {
				continue; // pane gone mid-scan
			}
			const prev = this.hashes.get(p.target);
			if (prev !== undefined && content !== prev) {
				this.lastActivity.set(p.session, now);
			}
			this.hashes.set(p.target, content);
		}
		// Forget panes that disappeared (session killed).
		for (const target of this.hashes.keys()) {
			if (!panes.some((p) => p.target === target)) this.hashes.delete(target);
		}
		// Sessions that vanished drop their activity state, so a recreated
		// session with the same name starts from a fresh baseline.
		for (const s of this.lastActivity.keys()) {
			if (!seen.has(s)) this.lastActivity.delete(s);
		}

		// First sighting of a session counts as idle baseline (no change yet):
		// set the baseline in the past so the first scan reports idle, not working.
		const out = new Map<string, ActivityState>();
		for (const s of seen) {
			if (!this.lastActivity.has(s)) this.lastActivity.set(s, now - this.idleMs - 1);
			out.set(s, computeAgentState(now, this.lastActivity.get(s)!, this.idleMs));
		}
		return out;
	}

	private async listPanes(): Promise<PaneRef[]> {
		const raw = await this.execTmux(['list-panes', '-a', '-F', '#{session_name}\t#{window_index}.#{pane_index}']);
		const out: PaneRef[] = [];
		for (const line of raw.split('\n')) {
			const [session, target] = line.split('\t');
			if (session && target) out.push({ session, target: `${session}:${target}` });
		}
		return out;
	}
}
