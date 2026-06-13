import { describe, expect, it } from 'vitest';
import {
	DELAY_RANGE_MESSAGE,
	getScheduleDelayError,
	isValidDelayMs,
	MAX_SCHEDULE_MS,
	parseDelayMs,
} from '../src/lib/schedule-delay.js';

describe('schedule-delay', () => {
	it('parses h/m/s/d combinations', () => {
		expect(parseDelayMs('30s')).toBe(30_000);
		expect(parseDelayMs('5m')).toBe(300_000);
		expect(parseDelayMs('1h')).toBe(3_600_000);
		expect(parseDelayMs('70h')).toBe(70 * 3_600_000);
		expect(parseDelayMs('30d')).toBe(30 * 86_400_000);
		expect(parseDelayMs('1m30s')).toBe(90_000);
		expect(parseDelayMs('1d2h3m4s')).toBe(((86_400 + 7_200 + 180 + 4) * 1000));
	});

	it('rejects invalid delay strings', () => {
		expect(parseDelayMs('')).toBeNull();
		expect(parseDelayMs('abc')).toBeNull();
		expect(parseDelayMs('1x')).toBeNull();
		expect(parseDelayMs('0h')).toBeNull();
	});

	it('validates delay bounds', () => {
		expect(isValidDelayMs(1)).toBe(true);
		expect(isValidDelayMs(MAX_SCHEDULE_MS)).toBe(true);
		expect(isValidDelayMs(0)).toBe(false);
		expect(isValidDelayMs(MAX_SCHEDULE_MS + 1)).toBe(false);
	});

	it('reports delay range errors for API bodies', () => {
		expect(getScheduleDelayError({ delayMs: 5_000 })).toBeNull();
		expect(getScheduleDelayError({ delayMs: MAX_SCHEDULE_MS + 1 })).toBe(DELAY_RANGE_MESSAGE);
		expect(getScheduleDelayError({ delayMs: 0 })).toBe(DELAY_RANGE_MESSAGE);
		expect(getScheduleDelayError({ delayMs: '5' })).toBeNull();
	});
});
