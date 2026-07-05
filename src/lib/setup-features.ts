import type { TmuxWebSettings } from './settings.js';
import { readSettings, writeSettings } from './settings.js';
import { cmdAdd, cmdRemove } from './plugins.js';

export type SetupFeature = {
  id: string;
  label: string;
  description: string;
  kind: 'builtin' | 'extension';
  isEnabled: (cfg: TmuxWebSettings) => boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

export const SETUP_FEATURES: SetupFeature[] = [
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
