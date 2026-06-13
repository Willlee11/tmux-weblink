import { describe, expect, it, vi } from 'vitest';
import { SchedulerService, isValidScheduleInput, isValidRescheduleInput } from '../src/lib/scheduler.js';
import { MAX_SCHEDULE_MS, MAX_TIMER_MS } from '../src/lib/schedule-delay.js';
import type { DbSchema } from '../src/lib/db.js';

function createDb(initial?: Partial<DbSchema>) {
	return {
		data: {
			notes: [],
			scheduledTasks: [],
			triggeredTasks: [],
			sessionAccess: [],
			pinnedViews: [],
			watchedPanes: [],
			windowLabels: [],
			sessionWindows: [],
			windowHistory: [],
			quickCommands: [],
			...initial,
		},
		write: vi.fn(async () => {}),
	};
}

describe('SchedulerService', () => {
	it('validates schedule request bodies', () => {
		expect(isValidScheduleInput({ sessionName: 'dev', windowIndex: 0, text: 'npm test', delayMs: 1 })).toBe(true);
		expect(isValidScheduleInput({ sessionName: 'dev', windowIndex: 0, text: 'npm test', delayMs: MAX_SCHEDULE_MS })).toBe(true);
		expect(isValidScheduleInput({ sessionName: '', windowIndex: 0, text: 'npm test', delayMs: 1 })).toBe(false);
		expect(isValidScheduleInput({ sessionName: 'dev', windowIndex: -1, text: 'npm test', delayMs: 1 })).toBe(false);
		expect(isValidScheduleInput({ sessionName: 'dev', windowIndex: 0, text: '', delayMs: 1 })).toBe(false);
		expect(isValidScheduleInput({ sessionName: 'dev', windowIndex: 0, text: 'npm test', delayMs: MAX_SCHEDULE_MS + 1 })).toBe(false);
	});

	it('creates, lists, and deletes scheduled tasks with persisted state', async () => {
		const db = createDb();
		const clearTimer = vi.fn();
		const scheduler = new SchedulerService({
			db,
			now: () => 1_000,
			createId: () => 'task-1',
			setTimer: vi.fn(() => 123 as any) as any,
			clearTimer: clearTimer as any,
			sendKeys: vi.fn(),
		});

		const task = await scheduler.create({ sessionName: 'dev', windowIndex: 2, text: 'npm test', delayMs: 5_000 });

		expect(task).toMatchObject({ id: 'task-1', sessionName: 'dev', windowIndex: 2, text: 'npm test', fireAt: 6_000, createdAt: 1_000 });
		expect(db.data.scheduledTasks).toHaveLength(1);
		expect(db.write).toHaveBeenCalledTimes(1);
		expect(scheduler.list('dev')).toEqual([{ ...task, remainingMs: 5_000 }]);

		await expect(scheduler.delete('missing')).resolves.toBe(false);
		await expect(scheduler.delete('task-1')).resolves.toBe(true);
		expect(clearTimer).toHaveBeenCalledWith(123);
		expect(db.data.scheduledTasks).toEqual([]);
		expect(db.write).toHaveBeenCalledTimes(2);
	});

	it('fires a task once and removes it from persistence', async () => {
		const db = createDb();
		const sendKeys = vi.fn();
		let now = 10;
		let callback: (() => void) | undefined;
		const scheduler = new SchedulerService({
			db,
			now: () => now,
			createId: () => 'task-1',
			setTimer: vi.fn((cb) => {
				callback = cb;
				return 456 as any;
			}) as any,
			sendKeys,
		});

		await scheduler.create({ sessionName: 'dev', windowIndex: 1, text: 'echo ok', delayMs: 20 });
		expect(callback).toBeTypeOf('function');

		now = 30;
		callback?.();

		expect(sendKeys).toHaveBeenCalledWith('dev', 1, 'echo ok');
		expect(db.data.scheduledTasks).toEqual([]);
		expect(scheduler.list()).toEqual([]);
		expect(db.write).toHaveBeenCalledTimes(2);

		expect(db.data.triggeredTasks).toEqual([
			expect.objectContaining({ id: 'task-1', sessionName: 'dev', windowIndex: 1, text: 'echo ok', triggeredAt: 30, status: 'ok' }),
		]);
		expect(scheduler.listTriggered()).toEqual([expect.objectContaining({ id: 'task-1', status: 'ok' })]);
	});

	it('records an error when send-keys throws but still removes the task', async () => {
		const db = createDb();
		let now = 10;
		let callback: (() => void) | undefined;
		const scheduler = new SchedulerService({
			db,
			now: () => now,
			createId: () => 'task-1',
			setTimer: vi.fn((cb) => {
				callback = cb;
				return 1 as any;
			}) as any,
			sendKeys: vi.fn(() => { throw new Error('no such window'); }),
			onError: vi.fn(),
		});

		await scheduler.create({ sessionName: 'dev', windowIndex: 9, text: 'boom', delayMs: 20 });
		now = 30;
		callback?.();

		expect(db.data.scheduledTasks).toEqual([]);
		expect(db.data.triggeredTasks).toEqual([
			expect.objectContaining({ id: 'task-1', status: 'error', error: 'no such window' }),
		]);
	});

	it('prunes triggered history outside the retention window', async () => {
		const now = 10_000_000;
		const db = createDb({
			triggeredTasks: [
				{ id: 'old', sessionName: 'a', windowIndex: 0, text: 'old', fireAt: 1, createdAt: 1, triggeredAt: now - 200, status: 'ok' },
				{ id: 'fresh', sessionName: 'a', windowIndex: 0, text: 'fresh', fireAt: 1, createdAt: 1, triggeredAt: now - 50, status: 'ok' },
			],
		});
		const scheduler = new SchedulerService({
			db,
			now: () => now,
			historyRetentionMs: 100,
			setTimer: vi.fn(() => 1 as any) as any,
			sendKeys: vi.fn(),
		});

		await scheduler.restoreFromDb();

		expect(db.data.triggeredTasks.map((r) => r.id)).toEqual(['fresh']);
		expect(scheduler.listTriggered().map((r) => r.id)).toEqual(['fresh']);
	});

	it('restores future tasks and drops missed tasks', async () => {
		const db = createDb({
			scheduledTasks: [
				{ id: 'missed', sessionName: 'old', windowIndex: 0, text: 'old', fireAt: 10, createdAt: 1 },
				{ id: 'future', sessionName: 'new', windowIndex: 1, text: 'new', fireAt: 100, createdAt: 2 },
			],
		});
		const missed = vi.fn();
		const setTimer = vi.fn(() => 789 as any) as any;
		const scheduler = new SchedulerService({
			db,
			now: () => 50,
			setTimer,
			onMissedTask: missed,
			sendKeys: vi.fn(),
		});

		await scheduler.restoreFromDb();

		expect(missed).toHaveBeenCalledWith(expect.objectContaining({ id: 'missed' }));
		expect(db.data.scheduledTasks.map((task) => task.id)).toEqual(['future']);
		expect(scheduler.list()).toEqual([expect.objectContaining({ id: 'future', remainingMs: 50 })]);
		expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 50);
		expect(db.write).toHaveBeenCalledTimes(1);

		expect(db.data.triggeredTasks).toEqual([
			expect.objectContaining({ id: 'missed', triggeredAt: 50, status: 'missed' }),
		]);
		expect(scheduler.listTriggered()).toEqual([expect.objectContaining({ id: 'missed', status: 'missed' })]);
	});

	it('validates reschedule request bodies', () => {
		expect(isValidRescheduleInput({ delayMs: 5000 })).toBe(true);
		expect(isValidRescheduleInput({ delayMs: 1 })).toBe(true);
		expect(isValidRescheduleInput({ delayMs: MAX_SCHEDULE_MS })).toBe(true);
		expect(isValidRescheduleInput({ delayMs: 0 })).toBe(false);
		expect(isValidRescheduleInput({ delayMs: MAX_SCHEDULE_MS + 1 })).toBe(false);
		expect(isValidRescheduleInput({ delayMs: '5000' })).toBe(false);
		expect(isValidRescheduleInput(null)).toBe(false);
		expect(isValidRescheduleInput({})).toBe(false);
	});

	it('reschedules a task: cancels old timer, sets new fireAt, persists', async () => {
		const db = createDb();
		const clearTimer = vi.fn();
		let timerHandle = 0;
		const scheduler = new SchedulerService({
			db,
			now: () => 1_000,
			createId: () => 'task-1',
			setTimer: vi.fn(() => ++timerHandle as any) as any,
			clearTimer: clearTimer as any,
			sendKeys: vi.fn(),
		});

		await scheduler.create({ sessionName: 'dev', windowIndex: 0, text: 'echo hi', delayMs: 60_000 });
		const oldHandle = timerHandle;

		const updated = await scheduler.reschedule('task-1', 5_000);

		expect(updated).not.toBeNull();
		expect(updated!.fireAt).toBe(1_000 + 5_000);
		expect(updated!.id).toBe('task-1');
		expect(clearTimer).toHaveBeenCalledWith(oldHandle);
		expect(db.data.scheduledTasks[0].fireAt).toBe(6_000);
		expect(db.write).toHaveBeenCalledTimes(2);

		const view = scheduler.list('dev');
		expect(view[0].fireAt).toBe(6_000);
		expect(view[0].remainingMs).toBe(5_000);
	});

	it('reschedule returns null for unknown id', async () => {
		const db = createDb();
		const scheduler = new SchedulerService({
			db,
			setTimer: vi.fn(() => 1 as any) as any,
			sendKeys: vi.fn(),
		});
		const result = await scheduler.reschedule('nonexistent', 5_000);
		expect(result).toBeNull();
	});

	it('does not arm long tasks immediately on create', async () => {
		const db = createDb();
		const setTimer = vi.fn(() => 1 as any) as any;
		const scheduler = new SchedulerService({
			db,
			now: () => 1_000,
			createId: () => 'task-long',
			setTimer,
			sendKeys: vi.fn(),
		});

		const delayMs = 70 * 3_600_000;
		const task = await scheduler.create({ sessionName: 'dev', windowIndex: 0, text: 'later', delayMs });

		expect(task.fireAt).toBe(1_000 + delayMs);
		expect(setTimer).not.toHaveBeenCalled();
		expect(scheduler.list()).toEqual([expect.objectContaining({ id: 'task-long', remainingMs: delayMs })]);
	});

	it('arms short tasks immediately on create', async () => {
		const db = createDb();
		const setTimer = vi.fn(() => 1 as any) as any;
		const scheduler = new SchedulerService({
			db,
			now: () => 1_000,
			createId: () => 'task-short',
			setTimer,
			sendKeys: vi.fn(),
		});

		await scheduler.create({ sessionName: 'dev', windowIndex: 0, text: 'soon', delayMs: 3_600_000 });

		expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 3_600_000);
	});

	it('restages long tasks until fireAt is reached', async () => {
		const db = createDb();
		const sendKeys = vi.fn();
		let now = 1_000;
		const callbacks: Array<() => void> = [];
		const scheduler = new SchedulerService({
			db,
			now: () => now,
			createId: () => 'task-stage',
			setTimer: vi.fn((cb) => {
				callbacks.push(cb);
				return callbacks.length as any;
			}) as any,
			sendKeys,
		});

		const delayMs = 70 * 3_600_000;
		await scheduler.create({ sessionName: 'dev', windowIndex: 0, text: 'stage me', delayMs });
		expect(callbacks).toHaveLength(0);

		scheduler.scanPending();
		expect(callbacks).toHaveLength(0);

		now = 1_000 + delayMs - MAX_TIMER_MS;
		scheduler.scanPending();
		expect(callbacks).toHaveLength(1);

		callbacks[0]();
		expect(sendKeys).not.toHaveBeenCalled();
		expect(callbacks).toHaveLength(2);
		expect(scheduler.list()).toEqual([expect.objectContaining({ id: 'task-stage', remainingMs: MAX_TIMER_MS })]);

		now = 1_000 + delayMs;
		callbacks[1]();
		expect(sendKeys).toHaveBeenCalledWith('dev', 0, 'stage me');
		expect(scheduler.list()).toEqual([]);
	});

	it('scanPending arms sleeping tasks entering the 24h window and fires overdue tasks', async () => {
		const db = createDb();
		const sendKeys = vi.fn();
		let now = 1_000;
		let nextId = 0;
		const setTimer = vi.fn(() => 99 as any) as any;
		const scheduler = new SchedulerService({
			db,
			now: () => now,
			createId: () => `task-${++nextId}`,
			setTimer,
			sendKeys,
		});

		await scheduler.create({ sessionName: 'dev', windowIndex: 0, text: 'sleep', delayMs: 25 * 3_600_000 });
		expect(setTimer).not.toHaveBeenCalled();

		now = 1_000 + 2 * 3_600_000;
		scheduler.scanPending();
		expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 23 * 3_600_000);

		const overdue = await scheduler.create({ sessionName: 'dev', windowIndex: 1, text: 'late', delayMs: 5_000 });
		now = overdue.fireAt + 1;
		scheduler.scanPending();

		expect(sendKeys).toHaveBeenCalledWith('dev', 1, 'late');
		expect(scheduler.list().map((task) => task.id)).toEqual(['task-1']);
	});

	it('restoreFromDb leaves long tasks sleeping until scanPending arms them', async () => {
		const now = 1_000;
		const fireAt = now + 70 * 3_600_000;
		const db = createDb({
			scheduledTasks: [
				{ id: 'long', sessionName: 'dev', windowIndex: 0, text: 'later', fireAt, createdAt: now },
			],
		});
		const setTimer = vi.fn(() => 1 as any) as any;
		const scheduler = new SchedulerService({
			db,
			now: () => now,
			setTimer,
			sendKeys: vi.fn(),
		});

		await scheduler.restoreFromDb();
		expect(setTimer).not.toHaveBeenCalled();
		expect(scheduler.list()).toEqual([expect.objectContaining({ id: 'long', remainingMs: 70 * 3_600_000 })]);
	});

	it('reschedule to a long delay clears the old timer and leaves the task sleeping', async () => {
		const db = createDb();
		const clearTimer = vi.fn();
		let timerHandle = 0;
		const setTimer = vi.fn(() => ++timerHandle as any) as any;
		const scheduler = new SchedulerService({
			db,
			now: () => 1_000,
			createId: () => 'task-1',
			setTimer,
			clearTimer: clearTimer as any,
			sendKeys: vi.fn(),
		});

		await scheduler.create({ sessionName: 'dev', windowIndex: 0, text: 'echo hi', delayMs: 60_000 });
		const oldHandle = timerHandle;
		expect(setTimer).toHaveBeenCalledTimes(1);

		const updated = await scheduler.reschedule('task-1', 100 * 3_600_000);

		expect(updated!.fireAt).toBe(1_000 + 100 * 3_600_000);
		expect(clearTimer).toHaveBeenCalledWith(oldHandle);
		expect(setTimer).toHaveBeenCalledTimes(1);
	});

	it('cleanup clears scan interval and armed timers', async () => {
		const db = createDb();
		const clearTimer = vi.fn();
		const clearInterval = vi.fn();
		let scanCallback: (() => void) | undefined;
		const scheduler = new SchedulerService({
			db,
			now: () => 1_000,
			createId: () => 'task-1',
			setTimer: vi.fn(() => 123 as any) as any,
			clearTimer: clearTimer as any,
			setInterval: vi.fn((cb) => {
				scanCallback = cb;
				return 456 as any;
			}) as any,
			clearInterval: clearInterval as any,
			armScanIntervalMs: 1_000,
			sendKeys: vi.fn(),
		});

		await scheduler.create({ sessionName: 'dev', windowIndex: 0, text: 'soon', delayMs: 1_000 });
		await scheduler.restoreFromDb();
		expect(scanCallback).toBeTypeOf('function');

		scheduler.cleanup();

		expect(clearInterval).toHaveBeenCalledWith(456);
		expect(clearTimer).toHaveBeenCalledWith(123);
		expect(scheduler.list()).toEqual([]);
	});
});
