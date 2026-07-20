import { readSettings, writeSettings } from './settings.js';
export const SETUP_FEATURES = [
    {
        id: 'commandbar',
        label: 'Command bar',
        description: '⌘K session search + quick actions',
        kind: 'builtin',
        isEnabled: (cfg) => cfg.commandbar === true,
        async enable() {
            const cfg = await readSettings();
            await writeSettings({ ...cfg, commandbar: true });
            console.log('✓ command bar enabled');
        },
        async disable() {
            const cfg = await readSettings();
            await writeSettings({ ...cfg, commandbar: false });
            console.log('✓ command bar disabled');
        },
    },
    {
        id: 'agents',
        label: 'Agents page',
        description: 'watch AI agents (Claude, Codex, OpenCode, Cursor) in recently-viewed panes',
        kind: 'builtin',
        isEnabled: (cfg) => cfg.agents === true,
        async enable() {
            const cfg = await readSettings();
            await writeSettings({ ...cfg, agents: true });
            console.log('✓ agents page enabled');
        },
        async disable() {
            const cfg = await readSettings();
            await writeSettings({ ...cfg, agents: false });
            console.log('✓ agents page disabled');
        },
    },
];
