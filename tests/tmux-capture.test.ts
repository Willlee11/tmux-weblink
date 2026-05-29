import { describe, expect, it } from 'vitest';
import { toCrlf } from '../src/lib/tmux-capture.js';

describe('toCrlf', () => {
	it('converts bare LF line endings to CRLF', () => {
		expect(toCrlf('a\nb\nc')).toBe('a\r\nb\r\nc');
	});

	it('is idempotent on existing CRLF (no doubled carriage returns)', () => {
		expect(toCrlf('a\r\nb')).toBe('a\r\nb');
		expect(toCrlf(toCrlf('a\nb'))).toBe('a\r\nb');
	});

	it('normalizes mixed LF and CRLF input', () => {
		expect(toCrlf('a\nb\r\nc')).toBe('a\r\nb\r\nc');
	});

	it('leaves text without newlines unchanged', () => {
		expect(toCrlf('prompt #')).toBe('prompt #');
	});

	it('returns empty string unchanged', () => {
		expect(toCrlf('')).toBe('');
	});

	it('preserves a trailing newline', () => {
		expect(toCrlf('line\n')).toBe('line\r\n');
	});

	it('leaves no bare LF in a multi-line short-prompt block (staircase regression)', () => {
		const snapshot = [
			'Node: v22.12.0  arm64  arb-dev (fix/reminders)  #',
			'1',
			'Node: v22.12.0  arm64  arb-dev (fix/reminders)  #',
			'1',
			'Node: v22.12.0  arm64  arb-dev (main)  #',
		].join('\n');

		expect(/(?<!\r)\n/.test(toCrlf(snapshot))).toBe(false);
	});
});
