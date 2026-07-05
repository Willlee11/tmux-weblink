import { cssVarsStyle } from '../theme.js';
import { getThemeTemplates, THEME_TEMPLATE_IDS } from '../themes/index.js';
import type { TmuxWebTheme } from '../themes/types.js';
import type { TmuxWebSettings } from '../settings.js';
import { GITHUB_ACTIONS_PKG } from '../setup-features.js';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type TerminalRenderer = 'xterm' | 'ghostty';

// Shared <head> chrome + base CSS for the settings pages, matching the existing
// page style (notes-index.ts / landing.ts).
function pageHead(title: string, theme: TmuxWebTheme): string {
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>${escapeHtml(title)} — tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
  .container { max-width: 680px; margin: 80px auto; padding: 0 24px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
  h1 { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; color: var(--page-fg); }
  .back-link {
    font-size: 13px; color: var(--panel-muted); text-decoration: none;
    border: 1px solid var(--panel-border); padding: 8px 16px; border-radius: 10px; transition: all 0.15s;
  }
  .back-link:hover { border-color: var(--panel-accent); color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .restart-note {
    font-size: 13px; line-height: 1.6; color: var(--panel-muted);
    border: 1px dashed var(--panel-border); border-radius: 12px;
    padding: 12px 16px; margin-bottom: 24px;
  }
  .restart-note strong { color: var(--panel-accent); }
  .saved-flash {
    font-size: 13px; color: var(--panel-success);
    border: 1px solid var(--panel-success); border-radius: 12px;
    padding: 12px 16px; margin-bottom: 16px;
  }
  .error-flash {
    font-size: 13px; color: var(--page-fg); white-space: pre-wrap; word-break: break-word;
    border: 1px solid #e06c75; border-radius: 12px;
    padding: 12px 16px; margin-bottom: 16px; background: color-mix(in srgb, #e06c75 8%, var(--panel-bg));
  }
  .section { border: 1px solid var(--panel-border); border-radius: 16px; background: var(--panel-bg); padding: 20px; margin-bottom: 16px; }
  .section h2 { font-size: 14px; font-weight: 600; color: var(--page-fg); margin-bottom: 4px; }
  .section .desc { font-size: 13px; color: var(--panel-muted); line-height: 1.6; margin-bottom: 16px; }
  label.row { display: flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; padding: 5px 0; }
  label.row input { accent-color: var(--panel-success); }
  .radios { display: flex; flex-direction: column; gap: 6px; }
  .override-note { font-size: 12px; color: var(--panel-muted); margin-top: 10px; }
  .btn {
    font-size: 14px; color: var(--page-fg); background: var(--panel-bg);
    border: 1px solid var(--panel-border); padding: 9px 18px; border-radius: 12px;
    cursor: pointer; transition: all 0.15s; font-family: inherit;
  }
  .btn:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .btn.primary { border-color: var(--panel-success); color: var(--panel-success); }
  .btn.danger:hover { border-color: #e06c75; color: #e06c75; }
  .plugin-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; font-size: 14px; border-top: 1px solid var(--panel-border); }
  .plugin-row:first-of-type { border-top: none; }
  .plugin-row .pkg { word-break: break-all; }
  .plugin-add { display: flex; gap: 10px; margin-top: 14px; }
  .plugin-add input[type=text] {
    flex: 1; font-size: 14px; font-family: inherit; color: var(--page-fg);
    background: var(--page-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; padding: 9px 12px; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .plugin-add input[type=text]:focus { border-color: var(--panel-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .num-input {
    width: 100px; font-size: 14px; font-family: inherit; color: var(--page-fg);
    background: var(--page-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; padding: 9px 12px; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .num-input:focus { border-color: var(--panel-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .suggest { font-size: 13px; color: var(--panel-muted); margin-top: 10px; }
  .suggest button { background: none; border: none; color: var(--panel-accent); cursor: pointer; font: inherit; font-size: 13px; padding: 0; text-decoration: underline; }
  .theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .theme-card {
    border: 1px solid var(--panel-border); border-radius: 14px; padding: 16px;
    cursor: pointer; transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s; background: var(--panel-bg);
  }
  .theme-card:hover { border-color: var(--panel-accent); transform: translateY(-1px); box-shadow: 0 4px 20px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .theme-card.active { border-color: var(--panel-success); }
  .theme-card .tname { font-size: 14px; font-weight: 600; color: var(--page-fg); display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .theme-card .tname input { accent-color: var(--panel-success); }
  .swatches { display: flex; gap: 4px; flex-wrap: wrap; }
  .swatch { width: 18px; height: 18px; border-radius: 5px; border: 1px solid rgba(128,128,128,0.18); }
  .form-actions { margin-top: 12px; }
  .config-paths { font-size: 12px; color: var(--panel-muted); line-height: 1.6; margin-top: 28px; }
  .config-paths code { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); padding: 3px 7px; border-radius: 6px; }
  .btn { min-height: 44px; }
  @media (max-width: 640px) {
    .container { margin: 24px auto; padding: 0 16px; }
    .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
    .theme-grid { grid-template-columns: 1fr; }
    .num-input { width: 100%; }
  }
</style>
</head>`;
}

function flashes(saved: boolean, error?: string): string {
	let html = '';
	if (saved) html += `<div class="saved-flash">✓ Saved. Restart tmux-web to apply.</div>`;
	if (error) html += `<div class="error-flash">${escapeHtml(error)}</div>`;
	return html;
}

export function renderSettings(opts: {
	settings: TmuxWebSettings;
	renderer: TerminalRenderer;
	rendererOverridden: boolean;
	theme: TmuxWebTheme;
	plugins: string[];
	saved?: boolean;
	error?: string;
}): string {
	const { settings, renderer, rendererOverridden, theme, plugins, saved = false, error } = opts;
	const commandbarOn = settings.commandbar === true;
	const agentsOn = settings.agents === true;
	const agentsBackgroundWatchOn = settings.agentsBackgroundWatch === true;
	const savedRenderer = settings.terminalRenderer ?? 'xterm';
	const defaultView = settings.defaultView ?? 'default';
	const scheduleHistoryDays = settings.scheduleHistoryDays ?? 7;

	const pluginRows = plugins.length
		? plugins.map((p) => `<div class="plugin-row">
      <span class="pkg">${escapeHtml(p)}</span>
      <form method="POST" action="/settings/plugins" onsubmit="return confirm('Remove ${escapeHtml(p)}?');">
        <input type="hidden" name="action" value="remove" />
        <input type="hidden" name="pkg" value="${escapeHtml(p)}" />
        <button type="submit" class="btn danger">Remove</button>
      </form>
    </div>`).join('\n')
		: `<p class="desc" style="margin:0">No plugins enabled.</p>`;

	const suggestGithub = !plugins.includes(GITHUB_ACTIONS_PKG)
		? `<p class="suggest">Suggested: <button type="button" onclick="document.getElementById('pkg-input').value='${GITHUB_ACTIONS_PKG}'">${GITHUB_ACTIONS_PKG}</button> (sidebar CI status)</p>`
		: '';

	return /* html */ `${pageHead('Settings', theme)}
<body>
<div class="container">
  <div class="page-header">
    <h1>Settings</h1>
    <a href="/" class="back-link">Back</a>
  </div>

  <div class="restart-note">
    <strong>Note:</strong> these settings are read once at startup. You may need to
    <strong>restart the tmux-web process</strong> after making changes for them to take effect.
  </div>

  ${flashes(saved, error)}

  <form method="POST" action="/settings">
    <div class="section">
      <h2>Command bar</h2>
      <p class="desc">⌘K session search + quick actions.</p>
      <label class="row"><input type="checkbox" name="commandbar" ${commandbarOn ? 'checked' : ''} /> Enable command bar</label>
    </div>

    <div class="section">
      <h2>Agents page</h2>
      <p class="desc">Watch AI agents (Claude, Codex, OpenCode, Cursor) running in the last 10 panes you viewed, at <code>/agents</code>. Off by default.</p>
      <label class="row"><input type="checkbox" name="agents" ${agentsOn ? 'checked' : ''} /> Enable agents page</label>
      <label class="row"><input type="checkbox" name="agentsBackgroundWatch" ${agentsBackgroundWatchOn ? 'checked' : ''} /> Watch in the background (poll even when the page is closed)</label>
    </div>

    <div class="section">
      <h2>Terminal library</h2>
      <p class="desc">Rendering engine for the terminal view.</p>
      <div class="radios">
        <label class="row"><input type="radio" name="terminalRenderer" value="xterm" ${savedRenderer === 'xterm' ? 'checked' : ''} /> xterm.js (default)</label>
        <label class="row"><input type="radio" name="terminalRenderer" value="ghostty" ${savedRenderer === 'ghostty' ? 'checked' : ''} /> ghostty-web</label>
      </div>
      ${rendererOverridden ? `<p class="override-note">⚠ A CLI flag or <code>TMUX_WEB_TERMINAL_RENDERER</code> env var is currently forcing <strong>${renderer}</strong>, overriding this setting for the running process.</p>` : ''}
    </div>

    <div class="section">
      <h2>Default home tab</h2>
      <p class="desc">Which tab the home page opens on.</p>
      <div class="radios">
        <label class="row"><input type="radio" name="defaultView" value="default" ${defaultView === 'default' ? 'checked' : ''} /> Default</label>
        <label class="row"><input type="radio" name="defaultView" value="recent" ${defaultView === 'recent' ? 'checked' : ''} /> Last Updated</label>
      </div>
    </div>

    <div class="section">
      <h2>Schedule history</h2>
      <p class="desc">Days to keep the <code>/schedule</code> "Recently Triggered" history (fired &amp; missed tasks). 1–365, default 7.</p>
      <label class="row"><input type="number" class="num-input" name="scheduleHistoryDays" min="1" max="365" value="${scheduleHistoryDays}" /> days</label>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn primary">Save settings</button>
    </div>
  </form>

  <div class="section" style="margin-top:16px">
    <h2>Plugins</h2>
    <p class="desc">Installed via npm into the tmux-web data dir. Add/remove runs npm and may take a few seconds.</p>
    ${pluginRows}
    <form method="POST" action="/settings/plugins" class="plugin-add">
      <input type="hidden" name="action" value="add" />
      <input type="text" id="pkg-input" name="pkg" placeholder="npm package name" autocomplete="off" />
      <button type="submit" class="btn">Add</button>
    </form>
    ${suggestGithub}
  </div>

  <div class="section">
    <h2>Theme</h2>
    <p class="desc">Shell chrome + terminal colors.</p>
    <a href="/settings/theme" class="btn" style="display:inline-block;text-decoration:none">Customize theme →</a>
  </div>
</div>
</body>
</html>`;
}

const THEME_LABELS: Record<string, string> = {
	vscode: 'VS Code',
	ghostty: 'Ghostty',
	'warm-clay': 'Warm Clay',
	'dark-cove': 'Dark Cove',
};

const SWATCH_KEYS = ['background', 'foreground', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const;

export function renderThemeSettings(opts: {
	theme: TmuxWebTheme;
	saved?: boolean;
}): string {
	const { theme, saved = false } = opts;
	const templates = getThemeTemplates();

	const cards = THEME_TEMPLATE_IDS.map((id) => {
		const t = templates[id];
		const active = theme.template === id;
		const swatches = SWATCH_KEYS
			.map((k) => `<span class="swatch" style="background:${escapeHtml(t.terminal[k])}" title="${k}"></span>`)
			.join('');
		return `<label class="theme-card${active ? ' active' : ''}">
      <div class="tname">
        <input type="radio" name="template" value="${id}" ${active ? 'checked' : ''} style="accent-color:var(--panel-success)" />
        ${escapeHtml(THEME_LABELS[id] ?? id)}
      </div>
      <div class="swatches">${swatches}</div>
    </label>`;
	}).join('\n');

	return /* html */ `${pageHead('Theme', theme)}
<body>
<div class="container">
  <div class="page-header">
    <h1>Theme</h1>
    <a href="/settings" class="back-link">Back</a>
  </div>

  <div class="restart-note">
    <strong>Note:</strong> the active theme is applied immediately to new page renders.
  </div>

  ${saved ? '<div class="saved-flash">✓ Theme saved.</div>' : ''}

  <form method="POST" action="/settings/theme">
    <div class="theme-grid">
      ${cards}
    </div>
    <div class="form-actions" style="margin-top:16px">
      <button type="submit" class="btn primary">Save theme</button>
    </div>
  </form>
</div>
</body>
</html>`;
}
