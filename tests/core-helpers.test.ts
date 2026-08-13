import { homedir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveExtensionUiFile } from '../src/lib/ext-loader.js';
import { renderNotesPage } from '../src/lib/pages/notes-page.js';
import { getConfigRoot, getDataRoot, getSettingsPath } from '../src/lib/state-paths.js';
import { vscodeTheme } from '../src/lib/themes/index.js';

const originalEnv = { ...process.env };

afterEach(() => {
	process.env = { ...originalEnv };
});

describe('core helpers', () => {
	it('resolves dev and prod state paths', () => {
		delete process.env.TMUX_WEB_DEV;
		delete process.env.TMUX_WEB_MODE;
		delete process.env.NODE_ENV;
		delete process.env.npm_lifecycle_event;
		expect(getDataRoot()).toBe(path.join(homedir(), '.tmux-web'));
		expect(getConfigRoot()).toBe(path.join(homedir(), '.config'));
		expect(getSettingsPath()).toBe(path.join(homedir(), '.config', 'tmux-web', 'settings.json'));

		process.env.TMUX_WEB_DEV = '1';
		expect(getDataRoot()).toBe(path.join(homedir(), '.dev', '.tmux-web'));
		expect(getConfigRoot()).toBe(path.join(homedir(), '.dev', '.config'));
		expect(getSettingsPath()).toBe(path.join(homedir(), '.dev', '.config', 'tmux-web', 'settings.json'));
	});

	it('escapes hostile session names in rendered pages', () => {
		const hostile = `bad"><script>alert(1)</script>`;
		const notes = renderNotesPage(hostile, vscodeTheme);

		expect(notes).toContain('bad&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(notes).not.toContain(`<span>${hostile}</span>`);
	});

	it('keeps extension UI paths inside dist/ui', () => {
		const uiDir = path.join('/tmp', 'tmux-web-ext', 'dist', 'ui');
		expect(resolveExtensionUiFile(uiDir, 'index.html')).toBe(path.join(uiDir, 'index.html'));
		expect(resolveExtensionUiFile(uiDir, '../server.js')).toBeNull();
		expect(resolveExtensionUiFile(uiDir, '../../secret.txt')).toBeNull();
	});
});
