import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	acquireControlClient,
	killAllControlClients,
	shouldRequery,
	_controlClientCount,
	type ControlPty,
	type WindowChangePayload,
} from '../src/lib/tmux-control.js';

function makeFakePty() {
	let dataCb: (d: string) => void = () => {};
	let exitCb: (e: { exitCode: number }) => void = () => {};
	const pty: ControlPty = {
		onData(cb) {
			dataCb = cb;
		},
		onExit(cb) {
			exitCb = cb;
		},
		kill: vi.fn(),
	};
	return {
		pty,
		emit: (d: string) => dataCb(d),
		exit: (code = 0) => exitCb({ exitCode: code }),
	};
}

const PAYLOAD: WindowChangePayload = {
	activeIndex: 2,
	windows: [{ index: 2, name: 'x', active: true }],
};

afterEach(() => {
	killAllControlClients();
	vi.useRealTimers();
});

describe('shouldRequery', () => {
	it('matches window-affecting control events', () => {
		for (const line of [
			'%session-window-changed $0 @3',
			'%window-add @5',
			'%window-close @5',
			'%unlinked-window-close @5',
			'%window-renamed @5 build',
			'%session-renamed $0 work',
		]) {
			expect(shouldRequery(line)).toBe(true);
		}
	});

	it('ignores unrelated lines', () => {
		for (const line of [
			'%output %1 hello world',
			'%begin 1 1 0',
			'%end 1 1 0',
			'%layout-change @1 abc,80x24,0,0,1',
			'',
			'garbage',
		]) {
			expect(shouldRequery(line)).toBe(false);
		}
	});
});

describe('acquireControlClient', () => {
	it('spawns once and kills once across refcounted acquires', () => {
		vi.useFakeTimers();
		const fake = makeFakePty();
		const spawn = vi.fn(() => fake.pty);
		const requery = vi.fn(() => PAYLOAD);

		const r1 = acquireControlClient('s', vi.fn(), { spawn, requery, debounceMs: 10 });
		const r2 = acquireControlClient('s', vi.fn(), { spawn, requery, debounceMs: 10 });

		expect(spawn).toHaveBeenCalledTimes(1);
		expect(_controlClientCount()).toBe(1);

		r1();
		expect(_controlClientCount()).toBe(1);
		expect(fake.pty.kill).not.toHaveBeenCalled();

		r2();
		expect(_controlClientCount()).toBe(0);
		expect(fake.pty.kill).toHaveBeenCalledTimes(1);
	});

	it('pushes current state to a freshly-acquired subscriber', () => {
		vi.useFakeTimers();
		const fake = makeFakePty();
		const sub = vi.fn();
		acquireControlClient('s', sub, { spawn: () => fake.pty, requery: () => PAYLOAD, debounceMs: 10 });

		vi.advanceTimersByTime(10);
		expect(sub).toHaveBeenCalledWith(PAYLOAD);
	});

	it('re-queries and notifies on a window event line, debounced', () => {
		vi.useFakeTimers();
		const fake = makeFakePty();
		const requery = vi.fn(() => PAYLOAD);
		const sub = vi.fn();
		acquireControlClient('s', sub, { spawn: () => fake.pty, requery, debounceMs: 10 });

		// flush the initial on-connect push
		vi.advanceTimersByTime(10);
		requery.mockClear();
		sub.mockClear();

		// two events within the debounce window coalesce into one re-query
		fake.emit('%window-add @4\n');
		fake.emit('%session-window-changed $0 @4\n');
		vi.advanceTimersByTime(10);

		expect(requery).toHaveBeenCalledTimes(1);
		expect(sub).toHaveBeenCalledTimes(1);
	});

	it('ignores unrelated event lines', () => {
		vi.useFakeTimers();
		const fake = makeFakePty();
		const sub = vi.fn();
		acquireControlClient('s', sub, { spawn: () => fake.pty, requery: () => PAYLOAD, debounceMs: 10 });

		vi.advanceTimersByTime(10);
		sub.mockClear();

		fake.emit('%output %1 some pane output\n');
		vi.advanceTimersByTime(10);
		expect(sub).not.toHaveBeenCalled();
	});

	it('buffers partial lines across data chunks', () => {
		vi.useFakeTimers();
		const fake = makeFakePty();
		const requery = vi.fn(() => PAYLOAD);
		const sub = vi.fn();
		acquireControlClient('s', sub, { spawn: () => fake.pty, requery, debounceMs: 10 });

		vi.advanceTimersByTime(10);
		requery.mockClear();

		fake.emit('%window-');
		fake.emit('add @9\n');
		vi.advanceTimersByTime(10);
		expect(requery).toHaveBeenCalledTimes(1);
	});

	it('drops the client when the pty exits', () => {
		vi.useFakeTimers();
		const fake = makeFakePty();
		acquireControlClient('s', vi.fn(), { spawn: () => fake.pty, requery: () => PAYLOAD, debounceMs: 10 });
		expect(_controlClientCount()).toBe(1);

		fake.exit(0);
		expect(_controlClientCount()).toBe(0);
	});

	it('degrades gracefully when spawn throws', () => {
		const release = acquireControlClient('s', vi.fn(), {
			spawn: () => {
				throw new Error('tmux missing');
			},
			requery: () => PAYLOAD,
		});
		expect(_controlClientCount()).toBe(0);
		expect(() => release()).not.toThrow();
	});
});
