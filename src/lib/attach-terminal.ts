import * as pty from 'node-pty';
import { tmuxEnv } from './tmux-env.js';

// The pty attach lifecycle for one terminal connection, extracted from the
// WebSocket handler so the exact same logic serves both:
//   - hub local mode:  io = the browser WebSocket
//   - agent mode:      io = a virtual connection relayed over the agent channel
//
// The io adapter is the only thing that differs; sync, snapshot, history,
// control-client mirroring and input handling are identical.

export type TerminalBufferConfigLike = {
	initialLines: number;
	historyChunk: number;
	syncIdleMs: number;
	syncMaxMs: number;
};

export interface AttachIO {
	/** Send a JSON message to the peer (browser or hub). */
	send(msg: Record<string, unknown>): void;
	/** Register the handler for inbound messages from the peer. */
	onMessage(cb: (raw: string) => void): void;
	/** Register the handler for peer connection close. */
	onClose(cb: () => void): void;
}

export interface AttachPty {
	write(data: string): void;
	resize(cols: number, rows: number): void;
	kill(signal?: string): void;
	onData(cb: (data: string) => void): void;
	onExit(cb: (e: { exitCode: number }) => void): void;
}

export type PtySpawnerLike = (session: string) => AttachPty;

export interface AttachDeps {
	terminalBufferConfig: TerminalBufferConfigLike;
	/** Resolve the session's active pane target, falling back to session name. */
	getSessionPaneTarget: (session: string) => string;
	/** Capture the tail of a pane for the initial snapshot. */
	capturePaneTail: (target: string, lines: number) => string;
	/** Capture an older history chunk for scrollback loading. */
	capturePaneHistoryChunk: (target: string, before: number, chunk: number) => { data: string; lines: number };
	toCrlf: (s: string) => string;
	/** Route input/resize messages to the pty; false means "not handled here". */
	handleClientMessage: (raw: string | Buffer, pty: { write(d: string): void; resize(c: number, r: number): void }) => boolean;
	/** Subscribe to tmux-side window changes; returns a release function. */
	acquireControlClient: (session: string, cb: (payload: { activeIndex: number; windows: { index: number; name: string; active: boolean }[] }) => void) => () => void;
	/** Override pty spawning (tests inject a fake; defaults to node-pty). */
	spawn?: PtySpawnerLike;
	/**
	 * Tmux server socket path (from resolveTmuxSocketPath). Passed to the
	 * spawned tmux via `-S` so the pty attaches to the same server the agent
	 * lists sessions from, even if the pty environment resolves a different
	 * socket (macOS spawn-helper strips TMPDIR).
	 */
	tmuxSocketPath?: string;
	/** Invoked when the pty exits (exit code notification). */
	onPtyExit?: (session: string, exitCode: number) => void;
	/** Invoked when the pty could not be spawned. */
	onSpawnError?: (session: string, message: string) => void;
	/** Invoked once the pty has been spawned successfully. */
	onAttached?: (session: string) => void;
}

export interface AttachedTerminal {
	onMessage(raw: string): void;
	dispose(): void;
}

// Module-level registry so server shutdown can tear down every live pty even
// if the owning WebSocket close events have not fired yet.
const liveAttachments = new Set<() => void>();

export function killAllAttachedPtys(): void {
	for (const dispose of [...liveAttachments]) {
		try { dispose(); } catch {}
	}
	liveAttachments.clear();
}

export function _liveAttachmentCount(): number {
	return liveAttachments.size;
}

export function attachTerminal(sessionName: string, io: AttachIO, deps: AttachDeps): AttachedTerminal {
	const { initialLines, historyChunk, syncIdleMs, syncMaxMs } = deps.terminalBufferConfig;
	const spawn = deps.spawn ?? ((session: string) => {
		const args = deps.tmuxSocketPath ? ['-S', deps.tmuxSocketPath] : [];
		args.push('attach-session', '-t', session);
		return pty.spawn(
			'tmux',
			args,
				{
				name: 'xterm-256color',
				cols: 80,
				rows: 24,
				cwd: process.env.HOME || '/',
				env: tmuxEnv(),
			},
		) as unknown as AttachPty;
	});

	let ptyProcess: AttachPty | null = null;
	let paneTarget = sessionName;
	let releaseControl: (() => void) | null = null;
	let ptySpawnedAt = 0;
	let preSyncOutput = '';

	let syncing = true;
	let syncBuffer = '';
	let syncIdleTimer: ReturnType<typeof setTimeout> | null = null;
	let syncMaxTimer: ReturnType<typeof setTimeout> | null = null;
	let disposed = false;

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
		if (!syncing || disposed) return;
		clearSyncTimers();
		syncing = false;

		try {
			paneTarget = deps.getSessionPaneTarget(sessionName);
		} catch {
			paneTarget = sessionName;
		}

		try {
			const data = deps.capturePaneTail(paneTarget, initialLines);
			io.send({ type: 'snapshot', data: deps.toCrlf(data), lines: initialLines });
		} catch {
			io.send({ type: 'data', data: '\r\n' });
		}

		// Flush buffered pty output so the client gets the full escape-sequence redraw.
		if (syncBuffer) {
			io.send({ type: 'data', data: syncBuffer });
			syncBuffer = '';
		}
	};

	const scheduleSyncEnd = () => {
		if (!syncing) return;
		if (syncIdleTimer) clearTimeout(syncIdleTimer);
		syncIdleTimer = setTimeout(finishSync, syncIdleMs);
	};

	function startPty() {
		if (disposed) return;
		try {
			ptyProcess = spawn(sessionName);
		} catch (err: any) {
			const message = err?.message ?? String(err);
			io.send({
				type: 'data',
				data: `\r\n\x1b[31mFailed to attach to tmux session "${sessionName}": ${message}\x1b[0m\r\n`,
			});
			deps.onSpawnError?.(sessionName, message);
			return;
		}

		let lastActiveIndex = -1;
		let lastWindowKey = '';
		releaseControl = deps.acquireControlClient(sessionName, ({ activeIndex, windows }) => {
			io.send({ type: 'window_changed', activeIndex, windows });
			const windowKey = windows.map((w) => w.index).join(',');
			const structural = activeIndex !== lastActiveIndex || windowKey !== lastWindowKey;
			lastActiveIndex = activeIndex;
			lastWindowKey = windowKey;
			if (structural) {
				// (mirror hook kept for parity with the original handler)
			}
		});

		ptySpawnedAt = Date.now();
		syncMaxTimer = setTimeout(finishSync, syncMaxMs);
		deps.onAttached?.(sessionName);
		io.onMessage(onMessage);

		ptyProcess.onData((data: string) => {
			if (disposed) return;
			if (Date.now() - ptySpawnedAt < syncMaxMs && preSyncOutput.length < 2048) preSyncOutput += data;
			if (syncing) {
				syncBuffer += data;
				scheduleSyncEnd();
				return;
			}
			io.send({ type: 'data', data });
		});

		ptyProcess.onExit(({ exitCode }) => {
			clearSyncTimers();
			if (ptyProcess) ptyProcess = null;
			if (disposed) return;
			// tmux attach-session prints "can't find session" (exit 1) and dies
			// quickly when it cannot attach. If it dies before the initial sync
			// window closes we treat it as an attach failure so the client shows
			// the reason instead of reconnecting into a blank loop. A successful
			// attach that ends later (session ended / user exit) is a normal exit.
			if (exitCode !== 0 && Date.now() - ptySpawnedAt < syncMaxMs) {
				// Include tmux's own stderr (e.g. "can't find session: x") in the
				// failure so the user sees the real reason, not a generic message.
				const stderr = preSyncOutput.trim();
				deps.onSpawnError?.(
					sessionName,
					stderr ? `tmux attach-session failed: ${stderr}` : `tmux attach-session exited with code ${exitCode}`,
				);
				return;
			}
			deps.onPtyExit?.(sessionName, exitCode);
			io.send({
				type: 'data',
				data: `\r\n\x1b[2m--- tmux exited (code ${exitCode}) ---\x1b[0m\r\n`,
			});
			dispose();
		});
	}

	function dispose() {
		if (disposed) return;
		disposed = true;
		clearSyncTimers();
		if (releaseControl) {
			releaseControl();
			releaseControl = null;
		}
		if (ptyProcess) {
			try { ptyProcess.kill(); } catch {}
			ptyProcess = null;
		}
		liveAttachments.delete(dispose);
	}

	io.onClose(dispose);

	// Message loop (post-auth).
	const onMessage = (raw: string) => {
		if (disposed || !ptyProcess) return;
		try {
			if (deps.handleClientMessage(raw, ptyProcess)) return;
		} catch {
			return;
		}

		let msg: { type?: unknown; before?: unknown };
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}

		if (msg.type === 'load_history' && typeof msg.before === 'number') {
			const before = Math.max(0, Math.floor(msg.before));
			try {
				const { data: chunk, lines } = deps.capturePaneHistoryChunk(paneTarget, before, historyChunk);
				io.send({ type: 'history', data: deps.toCrlf(chunk), before, lines });
			} catch {
				io.send({ type: 'history', data: '', before, lines: 0 });
			}
		}
	};

	startPty();
	liveAttachments.add(dispose);

	return { onMessage, dispose };
}
