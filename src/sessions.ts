import { execFileSync } from "node:child_process";
import { tmuxEnv } from "./lib/tmux-env.js";

export interface TmuxSession {
	name: string;
	windows: number;
	attached: boolean;
}

/**
 * Resolve the tmux server socket this process talks to, so pty-spawned tmux
 * clients can be forced onto the same server with `tmux -S <path>`. This
 * matters on macOS, where node-pty's setuid spawn-helper can strip TMPDIR
 * from the child environment and make tmux resolve a different (empty)
 * socket — attach then fails with "can't find session". Returns null when no
 * server is reachable (the caller then uses tmux's default resolution).
 */
export function resolveTmuxSocketPath(): string | null {
	try {
		const out = execFileSync(
			"tmux",
			["display-message", "-p", "#{socket_path}"],
			{ encoding: "utf-8", timeout: 3000, env: tmuxEnv() },
		);
		const p = out.trim();
		return p || null;
	} catch {
		return null;
	}
}

export function listSessions(): TmuxSession[] {
	try {
		const output = execFileSync(
			"tmux",
			["list-sessions", "-F", "#{session_name}\t#{session_windows}\t#{session_attached}"],
			{ encoding: "utf-8", timeout: 3000, env: tmuxEnv() },
		);
		return output
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [name, windows, attached] = line.split("\t");
				return {
					name,
					windows: parseInt(windows, 10),
					attached: attached !== "0",
				};
			});
	} catch {
		return [];
	}
}
