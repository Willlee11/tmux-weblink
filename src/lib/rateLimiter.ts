/**
 * @file Auth rate limiter with tiered backoff and permanent-lock cliff.
 * @description Per-IP failure tracking with escalating lockout.
 *   Failures from one IP do not affect other IPs.
 *   After MAX_FAILURES from a single IP that bucket permanently locks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDataRoot } from './state-paths.js';
import { atomicWriteFileSync } from './atomicWrite.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const SCHEDULE: readonly number[] = [
	0,           // 0: n/a
	0,           // 1: no lockout
	0,           // 2: no lockout
	1 * MINUTE,  // 3
	5 * MINUTE,  // 4
	15 * MINUTE, // 5
	30 * MINUTE, // 6
	1 * HOUR,    // 7
	4 * HOUR,    // 8
	24 * HOUR,   // 9
	-1,          // 10+: permanent
];

const MAX_FAILURES = SCHEDULE.length - 1;
const MAX_BUCKETS = 1024;

const CONFIG_DIR = getDataRoot();
const STATE_FILE = path.join(CONFIG_DIR, 'rate-limits.json');

export interface RateLimitResult {
	allowed: boolean;
	retryAfterMs?: number;
	permanentLock?: boolean;
	failures?: number;
}

interface IpState {
	failures: number;
	lockedUntil: number;
	permanentLock: boolean;
	lastSeen: number;
}

interface PersistedState {
	ips: Record<string, IpState>;
	_version: 2;
}

function lockoutDurationFor(failureCount: number): number {
	if (failureCount >= MAX_FAILURES) return -1;
	return SCHEDULE[failureCount] ?? 0;
}

function newIpState(): IpState {
	return { failures: 0, lockedUntil: 0, permanentLock: false, lastSeen: Date.now() };
}

export class RateLimiter {
	private buckets = new Map<string, IpState>();

	constructor() {
		this.load();
	}

	check(ip: string): RateLimitResult {
		const bucket = this.buckets.get(ip);
		if (!bucket) return { allowed: true, failures: 0 };
		bucket.lastSeen = Date.now();
		if (bucket.permanentLock) {
			return { allowed: false, permanentLock: true, failures: bucket.failures };
		}
		if (bucket.lockedUntil > Date.now()) {
			return {
				allowed: false,
				retryAfterMs: bucket.lockedUntil - Date.now(),
				failures: bucket.failures,
			};
		}
		return { allowed: true, failures: bucket.failures };
	}

	recordFailure(ip: string): RateLimitResult {
		let bucket = this.buckets.get(ip);
		if (!bucket) {
			this.evictIfFull();
			bucket = newIpState();
			this.buckets.set(ip, bucket);
		}
		bucket.failures++;
		bucket.lastSeen = Date.now();
		const duration = lockoutDurationFor(bucket.failures);
		if (duration === -1) {
			bucket.permanentLock = true;
			bucket.lockedUntil = 0;
		} else if (duration > 0) {
			bucket.lockedUntil = Date.now() + duration;
		}
		this.save();
		return this.check(ip);
	}

	recordSuccess(ip: string): void {
		if (!this.buckets.has(ip)) return;
		this.buckets.delete(ip);
		this.save();
	}

	getFailureCount(ip: string): number {
		return this.buckets.get(ip)?.failures ?? 0;
	}

	isPermanentlyLocked(ip: string): boolean {
		return this.buckets.get(ip)?.permanentLock ?? false;
	}

	dispose(): void { /* writes are synchronous */ }

	private evictIfFull(): void {
		if (this.buckets.size < MAX_BUCKETS) return;
		let oldestKey: string | null = null;
		let oldestSeen = Infinity;
		for (const [k, v] of this.buckets) {
			if (v.permanentLock) continue;
			if (v.lastSeen < oldestSeen) {
				oldestSeen = v.lastSeen;
				oldestKey = k;
			}
		}
		if (oldestKey) this.buckets.delete(oldestKey);
	}

	private load(): void {
		let raw: string;
		try {
			raw = fs.readFileSync(STATE_FILE, 'utf8');
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
			console.error('[RateLimiter] failed to read state, starting empty:', err);
			return;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			console.error('[RateLimiter] corrupt state, starting empty');
			return;
		}
		if (parsed && typeof parsed === 'object' && (parsed as PersistedState)._version === 2 && typeof (parsed as PersistedState).ips === 'object') {
			this.buckets = new Map(Object.entries((parsed as PersistedState).ips));
		}
	}

	private save(): void {
		if (!fs.existsSync(CONFIG_DIR)) {
			fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
		}
		const state: PersistedState = {
			ips: Object.fromEntries(this.buckets),
			_version: 2,
		};
		atomicWriteFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 0o600);
	}
}
