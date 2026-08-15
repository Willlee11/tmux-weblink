import { afterEach, describe, expect, it } from 'vitest';
import { tmuxEnv } from '../src/lib/tmux-env.js';

describe('tmuxEnv', () => {
	const original = { ...process.env };

	it('injects a UTF-8 locale when the process has none', () => {
		delete process.env.LC_ALL;
		delete process.env.LANG;
		const env = tmuxEnv();
		expect(env.LC_ALL || env.LANG).toBeTruthy();
	});

	it('keeps an explicitly configured locale untouched', () => {
		process.env.LC_ALL = 'de_DE.UTF-8';
		const env = tmuxEnv();
		expect(env.LC_ALL).toBe('de_DE.UTF-8');
		delete process.env.LC_ALL;
	});

	it('preserves the rest of the environment', () => {
		process.env.TEST_KEEP_ME = 'yes';
		const env = tmuxEnv();
		expect(env.TEST_KEEP_ME).toBe('yes');
		delete process.env.TEST_KEEP_ME;
	});

	afterEach(() => {
		process.env = { ...original };
	});
});

describe('tmuxEnv tmux-context stripping', () => {
	it('removes inherited TMUX / TMUX_PANE so child tmux never thinks it is attached', async () => {
		const mod = await import('../src/lib/tmux-env.js');
		const orig = process.env;
		(process as any).env = { ...orig, TMUX: '/tmp/tmux-0/default,123,0', TMUX_PANE: '%5', LANG: 'en_US.UTF-8' };
		try {
			const env = mod.tmuxEnv();
			expect(env.TMUX).toBeUndefined();
			expect(env.TMUX_PANE).toBeUndefined();
			expect(env.LANG).toBe('en_US.UTF-8');
		} finally {
			(process as any).env = orig;
		}
	});
});
