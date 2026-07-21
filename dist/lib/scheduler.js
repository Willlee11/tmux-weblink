import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ARM_SCAN_INTERVAL_MS, isValidDelayMs, MAX_TIMER_MS } from './schedule-delay.js';
const DEFAULT_HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export function sendTmuxKeys(sessionName, windowIndex, text) {
    const target = `${sessionName}:${windowIndex}`;
    execFileSync('tmux', ['send-keys', '-t', target, '-l', text], { timeout: 5000 });
    execFileSync('tmux', ['send-keys', '-t', target, 'Enter'], { timeout: 5000 });
}
export function isValidRescheduleInput(input) {
    if (!input || typeof input !== 'object')
        return false;
    const body = input;
    return typeof body.delayMs === 'number' && isValidDelayMs(body.delayMs);
}
export function isValidScheduleInput(input) {
    if (!input || typeof input !== 'object')
        return false;
    const body = input;
    return (typeof body.sessionName === 'string' && body.sessionName.length > 0 &&
        typeof body.windowIndex === 'number' && Number.isInteger(body.windowIndex) && body.windowIndex >= 0 &&
        typeof body.text === 'string' && body.text.length > 0 && body.text.length <= 4096 &&
        typeof body.delayMs === 'number' && isValidDelayMs(body.delayMs));
}
export class SchedulerService {
    deps;
    scheduledTasks = new Map();
    now;
    setTimer;
    clearTimer;
    setIntervalFn;
    clearIntervalFn;
    armScanIntervalMs;
    createId;
    sendKeys;
    onError;
    onMissedTask;
    historyRetentionMs;
    scanIntervalHandle = null;
    constructor(deps) {
        this.deps = deps;
        this.now = deps.now ?? Date.now;
        this.setTimer = deps.setTimer ?? setTimeout;
        this.clearTimer = deps.clearTimer ?? clearTimeout;
        this.setIntervalFn = deps.setInterval ?? setInterval;
        this.clearIntervalFn = deps.clearInterval ?? clearInterval;
        this.armScanIntervalMs = deps.armScanIntervalMs ?? ARM_SCAN_INTERVAL_MS;
        this.createId = deps.createId ?? randomUUID;
        this.sendKeys = deps.sendKeys ?? sendTmuxKeys;
        this.onError = deps.onError ?? ((err) => console.error(err));
        this.onMissedTask = deps.onMissedTask ?? (() => { });
        this.historyRetentionMs = deps.historyRetentionMs ?? DEFAULT_HISTORY_RETENTION_MS;
    }
    /** Append a triggered-task record and prune any that fall outside the retention window. */
    record(rec) {
        this.deps.db.data.triggeredTasks ??= [];
        this.deps.db.data.triggeredTasks.push(rec);
        const cutoff = this.now() - this.historyRetentionMs;
        this.deps.db.data.triggeredTasks = this.deps.db.data.triggeredTasks.filter((r) => r.triggeredAt >= cutoff);
    }
    /** History of fired/missed tasks within the retention window, newest first. */
    listTriggered() {
        this.deps.db.data.triggeredTasks ??= [];
        const cutoff = this.now() - this.historyRetentionMs;
        return this.deps.db.data.triggeredTasks
            .filter((r) => r.triggeredAt >= cutoff)
            .sort((a, b) => b.triggeredAt - a.triggeredAt);
    }
    async restoreFromDb() {
        const now = this.now();
        const missed = [];
        for (const task of this.deps.db.data.scheduledTasks) {
            if (task.fireAt <= now) {
                missed.push(task.id);
                this.onMissedTask(task);
                this.record({ ...task, triggeredAt: now, status: 'missed' });
            }
            else {
                this.registerTask(task);
            }
        }
        // Prune stale history on startup even when nothing was missed.
        this.deps.db.data.triggeredTasks ??= [];
        const before = this.deps.db.data.triggeredTasks.length;
        const cutoff = now - this.historyRetentionMs;
        this.deps.db.data.triggeredTasks = this.deps.db.data.triggeredTasks.filter((r) => r.triggeredAt >= cutoff);
        const prunedHistory = this.deps.db.data.triggeredTasks.length !== before;
        if (missed.length) {
            this.deps.db.data.scheduledTasks = this.deps.db.data.scheduledTasks.filter((t) => !missed.includes(t.id));
        }
        if (missed.length || prunedHistory) {
            await this.deps.db.write();
        }
        this.scanPending();
        this.startScanLoop();
    }
    list(sessionName) {
        return [...this.scheduledTasks.values()]
            .filter((task) => !sessionName || task.sessionName === sessionName)
            .map(({ id, sessionName, windowIndex, text, fireAt, createdAt }) => ({
            id,
            sessionName,
            windowIndex,
            text,
            fireAt,
            createdAt,
            remainingMs: Math.max(0, fireAt - this.now()),
        }))
            .sort((a, b) => a.fireAt - b.fireAt);
    }
    async create(input) {
        const id = this.createId();
        const createdAt = this.now();
        const task = {
            id,
            sessionName: input.sessionName,
            windowIndex: input.windowIndex,
            text: input.text,
            fireAt: createdAt + input.delayMs,
            createdAt,
        };
        this.registerTask(task);
        this.deps.db.data.scheduledTasks.push(task);
        await this.deps.db.write();
        this.tryArm(task.id);
        return task;
    }
    async reschedule(id, delayMs) {
        const task = this.scheduledTasks.get(id);
        if (!task)
            return null;
        this.disarmTask(id);
        const updatedTask = { ...task, fireAt: this.now() + delayMs };
        this.registerTask(updatedTask);
        const idx = this.deps.db.data.scheduledTasks.findIndex((t) => t.id === id);
        if (idx >= 0)
            this.deps.db.data.scheduledTasks[idx] = updatedTask;
        await this.deps.db.write();
        this.tryArm(id);
        return updatedTask;
    }
    async delete(id) {
        const task = this.scheduledTasks.get(id);
        if (!task)
            return false;
        this.disarmTask(id);
        this.scheduledTasks.delete(id);
        this.deps.db.data.scheduledTasks = this.deps.db.data.scheduledTasks.filter((t) => t.id !== id);
        await this.deps.db.write();
        return true;
    }
    cleanup() {
        if (this.scanIntervalHandle != null) {
            try {
                this.clearIntervalFn(this.scanIntervalHandle);
            }
            catch { }
            this.scanIntervalHandle = null;
        }
        for (const task of this.scheduledTasks.values()) {
            if (task.timeoutHandle != null) {
                try {
                    this.clearTimer(task.timeoutHandle);
                }
                catch { }
            }
        }
        this.scheduledTasks.clear();
    }
    /** Visible for tests that need to trigger a scan without waiting for the interval. */
    scanPending() {
        for (const task of [...this.scheduledTasks.values()]) {
            const remaining = task.fireAt - this.now();
            if (remaining <= 0) {
                if (task.timeoutHandle != null)
                    this.disarmTask(task.id);
                this.fireTask(task);
                continue;
            }
            if (remaining <= MAX_TIMER_MS && task.timeoutHandle == null) {
                this.armTask(task);
            }
        }
    }
    registerTask(task) {
        this.scheduledTasks.set(task.id, { ...task, timeoutHandle: null });
    }
    disarmTask(id) {
        const task = this.scheduledTasks.get(id);
        if (!task)
            return;
        if (task.timeoutHandle != null) {
            this.clearTimer(task.timeoutHandle);
            task.timeoutHandle = null;
        }
    }
    tryArm(id) {
        const task = this.scheduledTasks.get(id);
        if (!task)
            return;
        const remaining = task.fireAt - this.now();
        if (remaining <= 0) {
            this.fireTask(task);
            return;
        }
        if (remaining <= MAX_TIMER_MS && task.timeoutHandle == null) {
            this.armTask(task);
        }
    }
    armTask(task) {
        const remaining = task.fireAt - this.now();
        if (remaining <= 0) {
            this.fireTask(task);
            return;
        }
        this.disarmTask(task.id);
        const delay = Math.min(remaining, MAX_TIMER_MS);
        const timeoutHandle = this.setTimer(() => this.onTimer(task.id), delay);
        this.scheduledTasks.set(task.id, { ...task, timeoutHandle });
    }
    onTimer(id) {
        const task = this.scheduledTasks.get(id);
        if (!task)
            return;
        task.timeoutHandle = null;
        if (task.fireAt <= this.now()) {
            this.fireTask(task);
            return;
        }
        this.armTask(task);
    }
    startScanLoop() {
        if (this.scanIntervalHandle != null)
            return;
        this.scanIntervalHandle = this.setIntervalFn(() => this.scanPending(), this.armScanIntervalMs);
    }
    fireTask(task) {
        if (!this.scheduledTasks.has(task.id))
            return;
        this.disarmTask(task.id);
        const triggeredAt = this.now();
        const recordBase = {
            id: task.id,
            sessionName: task.sessionName,
            windowIndex: task.windowIndex,
            text: task.text,
            fireAt: task.fireAt,
            createdAt: task.createdAt,
        };
        try {
            this.sendKeys(task.sessionName, task.windowIndex, task.text);
            this.record({ ...recordBase, triggeredAt, status: 'ok' });
        }
        catch (err) {
            const message = String(err?.message ?? err);
            this.onError(`[scheduler] send-keys to ${task.sessionName}:${task.windowIndex} failed: ${message}`);
            this.record({ ...recordBase, triggeredAt, status: 'error', error: message });
        }
        this.scheduledTasks.delete(task.id);
        this.deps.db.data.scheduledTasks = this.deps.db.data.scheduledTasks.filter((t) => t.id !== task.id);
        this.deps.db.write().catch(this.onError);
    }
}
