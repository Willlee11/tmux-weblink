/**
 * Environment for tmux child processes.
 *
 * tmux's text output depends on the process locale: tmux 3.6a running under a
 * C locale renders the tab separators used in `-F` formats as underscores
 * (session "iip" came back as "iip_1_0"), which corrupted the session names
 * agents report and try to attach. Daemon-launched processes (launchd,
 * systemd without Environment) often carry no LANG/LC_ALL at all, so this
 * guarantees a UTF-8 locale whenever the caller didn't set one explicitly —
 * tmux output stays stable no matter how the server/agent was started.
 */
export function tmuxEnv(): Record<string, string> {
	const env: Record<string, string> = { ...(process.env as Record<string, string>) };
	// Never inherit the parent's tmux context. If the server/agent itself was
	// started from inside a tmux session, TMUX/TMUX_PANE would make every
	// child tmux think it is already attached ("open terminal failed: not a
	// terminal") and point execFileSync calls at the wrong socket.
	delete env.TMUX;
	delete env.TMUX_PANE;
	if (!env.LC_ALL && !env.LANG) {
		// en_US.UTF-8 ships with macOS; C.UTF-8 is built into glibc >= 2.35
		// (Ubuntu 22.04+). Prefer the platform's guaranteed UTF-8 locale.
		env.LC_ALL = process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8';
	}
	return env;
}
