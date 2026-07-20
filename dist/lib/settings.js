import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getSettingsPath } from './state-paths.js';
const CONFIG_PATH = getSettingsPath();
export async function readSettings() {
    try {
        return JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    }
    catch {
        return {};
    }
}
export async function writeSettings(cfg) {
    await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}
