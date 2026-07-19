import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getThemePath } from './state-paths.js';
import { isThemeTemplateId, resolveTheme, } from './themes/index.js';
const THEME_PATH = getThemePath();
function isValidTheme(data) {
    if (!data || typeof data !== 'object')
        return false;
    const t = data;
    return (isThemeTemplateId(t.template) &&
        typeof t.shell === 'object' &&
        t.shell !== null &&
        typeof t.shell.pageBg === 'string' &&
        typeof t.terminal === 'object' &&
        t.terminal !== null &&
        typeof t.terminal.background === 'string');
}
function themesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
export async function writeActiveTheme(theme) {
    await mkdir(path.dirname(THEME_PATH), { recursive: true });
    await writeFile(THEME_PATH, JSON.stringify(theme, null, 2) + '\n');
}
export async function readActiveTheme() {
    const defaultTheme = resolveTheme('vscode');
    let raw;
    try {
        raw = JSON.parse(await readFile(THEME_PATH, 'utf-8'));
    }
    catch {
        // missing or invalid — seed default
        await writeActiveTheme(defaultTheme);
        return defaultTheme;
    }
    if (!isValidTheme(raw)) {
        await writeActiveTheme(defaultTheme);
        return defaultTheme;
    }
    // Always follow the built-in default theme. If the persisted theme matches
    // the current default, keep it; otherwise upgrade to the latest default.
    // This ensures theme updates in new releases are picked up automatically.
    if (themesEqual(raw, defaultTheme)) {
        return raw;
    }
    await writeActiveTheme(defaultTheme);
    return defaultTheme;
}
export async function setActiveThemeTemplate(templateId) {
    const theme = resolveTheme(templateId);
    await writeActiveTheme(theme);
    return theme;
}
