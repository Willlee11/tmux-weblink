import { describe, expect, it, vi } from 'vitest';
import { attachTerminal, type AttachPty, type AttachIO, type AttachDeps } from '../src/lib/attach-terminal.js';

function makeFakePty() {
	const handlers: { data?: (d: string) => void; exit?: (e: { exitCode: number }) => void } = {};
	const pty: AttachPty = {
		write: vi.fn(),
		resize: vi.fn(),
		kill: vi.fn(),
		onData: (cb) => { handlers.data = cb; },
		onExit: (cb) => { handlers.exit = cb; },
	};
	return { pty, handlers };
}

function makeDeps(spawn: (s: string) => AttachPty): AttachDeps & { onPtyExit: ReturnType<typeof vi.fn>; onSpawnError: ReturnType<typeof vi.fn>; onAttached: ReturnType<typeof vi.fn> } {
	const onPtyExit = vi.fn();
	const onSpawnError = vi.fn();
	const onAttached = vi.fn();
	return {
		terminalBufferConfig: { initialLines: 100, historyChunk: 500, syncIdleMs: 50, syncMaxMs: 2000 },
		getSessionPaneTarget: (s) => s,
		capturePaneTail: () => 'tail',
		capturePaneHistoryChunk: () => ({ data: '', lines: 0 }),
		toCrlf: (s) => s,
		handleClientMessage: () => false,
		acquireControlClient: () => () => {},
		spawn,
		onPtyExit,
		onSpawnError,
		onAttached,
	};
}

describe('attachTerminal pty lifecycle', () => {
	it('treats an early tmux exit (attach-session failure) as a spawn error, not a normal exit', () => {
		const { pty, handlers } = makeFakePty();
		const deps = makeDeps(() => pty);
		const io: AttachIO = { send: vi.fn(), onMessage: vi.fn(), onClose: vi.fn() };

		attachTerminal('ghost', io, deps);
		// tmux attach-session prints "can't find session" and exits 1 before the
		// client ever saw a live session.
		handlers.exit?.({ exitCode: 1 });

		expect(deps.onSpawnError).toHaveBeenCalledWith('ghost', expect.stringContaining('code 1'));
		expect(deps.onPtyExit).not.toHaveBeenCalled();
	});

	it('reports a normal exit via onPtyExit once the attach succeeded', () => {
		const { pty, handlers } = makeFakePty();
		const deps = makeDeps(() => pty);
		const io: AttachIO = { send: vi.fn(), onMessage: vi.fn(), onClose: vi.fn() };

		attachTerminal('sess', io, deps);
		expect(deps.onAttached).toHaveBeenCalledWith('sess');
		handlers.exit?.({ exitCode: 0 });

		expect(deps.onPtyExit).toHaveBeenCalledWith('sess', 0);
		expect(deps.onSpawnError).not.toHaveBeenCalled();
	});

	it('reports an abnormal exit after the sync window via onPtyExit (attach was live)', () => {
		vi.useFakeTimers();
		try {
			const { pty, handlers } = makeFakePty();
			const deps = makeDeps(() => pty);
			const io: AttachIO = { send: vi.fn(), onMessage: vi.fn(), onClose: vi.fn() };

			attachTerminal('sess', io, deps);
			vi.advanceTimersByTime(3000); // past syncMaxMs (2000)
			handlers.exit?.({ exitCode: 1 }); // session killed later

			expect(deps.onPtyExit).toHaveBeenCalledWith('sess', 1);
			expect(deps.onSpawnError).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
