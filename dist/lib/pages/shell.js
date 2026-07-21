import { cssVarsStyle } from '../theme.js';
import { commandbarCSS, commandbarHTML, commandbarScript } from '../commandbar.js';
import { newSessionModalCSS, newSessionModalHTML, newSessionModalScript, reducedMotion } from '../shared-layout.js';
import { icon } from '../icons.js';
import { getSystemStatus } from '../system-monitor.js';
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function focusRing(accent = 'var(--panel-accent)') {
    return `box-shadow: 0 0 0 2px ${accent}; outline: none;`;
}
export function renderShell(cfg) {
    const { theme, commandbarEnabled, commandbarSessions, fsRoots, terminalCfg, renderer, scrollback } = cfg;
    const sys = getSystemStatus();
    const initMemPct = sys.memory.percent;
    const initCpuLoad = sys.cpu.loadAvg[0];
    const shellCSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    background: var(--page-bg); color: var(--page-fg);
    height: 100%; overflow: hidden;
    font-family: var(--font-sans); margin: 0; padding: 0;
  }

  /* ── Fixed header ── */
  .fixed-header {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    height: calc(48px + env(safe-area-inset-top, 0px));
    padding-top: env(safe-area-inset-top, 0px);
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--panel-border);
    display: flex; justify-content: space-between; align-items: center;
    padding-left: 12px; padding-right: 12px;
    box-sizing: border-box;
  }
  .fixed-header .brand {
    font-size: var(--text-base); font-weight: 600; color: var(--page-fg);
  }
  .fixed-header .brand span { color: var(--panel-accent); font-weight: 500; }
  .fixed-header .brand a { color: inherit; text-decoration: none; }
  .header-actions { display: flex; align-items: center; gap: 4px; }

  /* ── System status in header ── */
  .sys-status {
    display: flex; align-items: center;
    font-size: 11px; font-family: var(--font-mono);
    color: color-mix(in srgb, var(--page-fg) 55%, transparent);
    cursor: pointer;
    margin: 0 12px;
    white-space: nowrap;
    padding: 4px 6px;
    border-radius: 4px;
    transition: background 0.15s;
  }
  .sys-status:hover { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }

  /* ── Process popover ── */
  #process-panel {
    position: fixed; top: 52px; right: 12px; z-index: 300;
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    min-width: 340px; max-width: 480px;
    max-height: 70vh;
    display: none; flex-direction: column;
    font-size: 12px;
  }
  #process-panel.open { display: flex; }
  #process-panel .panel-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--panel-border);
    font-weight: 600; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.5px; color: var(--panel-muted);
  }
  #process-panel .panel-header button {
    background: none; border: none; color: var(--panel-muted);
    cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 14px;
  }
  #process-panel .panel-header button:hover { color: var(--page-fg); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  #process-panel .proc-list { overflow-y: auto; flex: 1; padding: 4px 0; }
  #process-panel .proc-row {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 12px;
  }
  #process-panel .proc-row:hover { background: color-mix(in srgb, var(--panel-accent) 4%, transparent); }
  #process-panel .proc-mem { width: 44px; text-align: right; font-family: var(--font-mono); color: var(--panel-muted); flex-shrink: 0; }
  #process-panel .proc-rss { width: 60px; text-align: right; font-family: var(--font-mono); color: var(--panel-muted); flex-shrink: 0; }
  #process-panel .proc-cmd {
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--page-fg);
  }
  #process-panel .proc-kill {
    background: none; border: none; color: var(--panel-muted);
    cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 13px; flex-shrink: 0;
  }
  #process-panel .proc-kill:hover { color: #ef4444; background: color-mix(in srgb, #ef4444 10%, transparent); }
  #process-panel .proc-empty { padding: 24px; text-align: center; color: var(--panel-muted); }

  @media (max-width: 600px) {
    #process-panel {
      top: auto; bottom: 0; left: 0; right: 0;
      min-width: 0; max-width: none; max-height: 60vh;
      border-radius: 12px 12px 0 0;
    }
  }

  /* ── App layout ── */
  .app-layout {
    display: flex;
    height: 100dvh;
    overflow: hidden;
    padding-top: calc(48px + env(safe-area-inset-top, 0px));
    transition: height 0.05s;
  }

  /* ── Sidebar ── */
  .sidebar {
    flex: 0 0 250px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--panel-border);
    background: var(--page-bg);
    overflow: hidden;
  }
  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  .sidebar-footer {
    display: flex;
    border-top: 1px solid var(--panel-border);
    padding: 4px 6px;
    gap: 2px;
  }
  .sidebar-footer .mode-btn {
    flex: 1;
    display: flex; align-items: center; justify-content: center;
    min-height: 40px;
    background: none; border: none; color: var(--panel-muted);
    cursor: pointer; border-radius: 8px;
    font-size: 18px; line-height: 1;
    transition: color 0.15s, background 0.15s;
  }
  .sidebar-footer .mode-btn:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .sidebar-footer .mode-btn.active { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 10%, transparent); }
  .sidebar-footer .mode-btn:focus-visible { ${focusRing()} }

  /* ── Sidebar session mode ── */
  .session-item {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; border-radius: 10px;
    cursor: pointer; font-size: var(--text-sm); color: var(--page-fg);
    text-decoration: none; margin-bottom: 2px;
    transition: background 0.1s;
  }
  .session-item:hover { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .session-item.active { background: color-mix(in srgb, var(--panel-accent) 12%, transparent); color: var(--panel-accent); font-weight: 500; }
  .session-item .meta { margin-left: auto; font-size: var(--text-xs); color: var(--panel-muted); white-space: nowrap; }
  .session-item svg { width: 16px; height: 16px; flex-shrink: 0; fill: currentColor; }
  .session-edit-btn {
    display: none; margin-left: auto; flex-shrink: 0;
    background: none; border: none; cursor: pointer;
    color: var(--panel-muted); padding: 2px 4px; border-radius: 4px;
    line-height: 1; transition: color 0.1s, background 0.1s;
  }
  .session-item:hover .session-edit-btn { display: flex; align-items: center; }
  .session-edit-btn:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .session-edit-btn:focus-visible { ${focusRing()} }

  .sidebar-section-label {
    font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--panel-muted); padding: 8px 12px 4px; font-weight: 500;
  }
  .new-session-sidebar-btn {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 10px 12px; border-radius: 10px; margin-bottom: 6px;
    background: none; border: 1px dashed var(--panel-border); color: var(--panel-muted);
    cursor: pointer; font-size: var(--text-sm); font-family: inherit;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .new-session-sidebar-btn:hover {
    color: var(--panel-accent); border-color: var(--panel-accent);
    background: color-mix(in srgb, var(--panel-accent) 6%, transparent);
  }
  .new-session-sidebar-btn:focus-visible { ${focusRing()} }
  .new-session-sidebar-btn svg { width: 16px; height: 16px; fill: currentColor; }

  /* ── Sidebar files mode ── */
  .file-tree-item {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-radius: 8px; cursor: pointer;
    font-size: var(--text-sm); color: var(--page-fg);
    transition: background 0.1s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .file-tree-item:hover { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .file-tree-item svg { width: 16px; height: 16px; flex-shrink: 0; fill: currentColor; }
  .file-tree-item.file { color: var(--panel-muted); }
  .file-tree-item .file-icon { flex-shrink: 0; }
  .file-tree-empty { font-size: var(--text-xs); color: var(--panel-muted); padding: 12px; text-align: center; }
  .file-tree-error { font-size: var(--text-xs); color: #b91c1c; padding: 12px; }
  .file-tree-info { font-size: var(--text-xs); color: var(--panel-muted); padding: 12px; line-height: 1.5; }
  .file-tree-info code { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); padding: 2px 6px; border-radius: 4px; }

  /* ── Main area ── */
  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }
  .main-placeholder {
    display: flex; align-items: center; justify-content: center;
    flex: 1; color: var(--panel-muted); font-size: var(--text-sm);
    text-align: center; line-height: 1.6; padding: 24px;
  }

  /* ── File editor in main area ── */
  .file-editor-toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; border-bottom: 1px solid var(--panel-border);
    flex-wrap: wrap;
  }
  .file-editor-toolbar .path {
    font-size: var(--text-xs); font-family: var(--font-mono);
    color: var(--panel-muted); flex: 1; word-break: break-all; min-width: 0;
  }
  .file-editor-toolbar .status { font-size: var(--text-xs); color: var(--panel-muted); }
  .file-editor-content {
    flex: 1; display: flex; flex-direction: column;
  }
  .file-editor-content textarea {
    flex: 1; width: 100%; padding: 16px;
    background: var(--page-bg); border: none;
    color: var(--page-fg); font-size: var(--text-sm); font-family: var(--font-mono);
    resize: none; outline: none;
  }
  .file-editor-new {
    display: flex; gap: 8px; padding: 8px 16px;
    border-top: 1px solid var(--panel-border);
  }
  .file-editor-new input {
    flex: 1; padding: 8px 12px;
    background: var(--page-bg); border: 1px solid var(--panel-border);
    border-radius: 8px; color: var(--page-fg); font-size: var(--text-sm);
    font-family: var(--font-mono); outline: none;
  }
  .file-editor-new input:focus { border-color: var(--panel-accent); }

  /* ── Buttons ── */
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 36px; padding: 6px 14px; border-radius: 8px;
    font-size: var(--text-sm); font-family: inherit; cursor: pointer;
    border: 1px solid var(--panel-border); background: var(--panel-bg);
    color: var(--page-fg); transition: opacity 0.15s; text-decoration: none;
  }
  .btn:hover { opacity: 0.85; }
  .btn:focus-visible { ${focusRing()} }
  .btn.primary { background: var(--panel-accent); border-color: var(--panel-accent); color: var(--panel-accent-on); font-weight: 500; }
  .btn.primary:hover { opacity: 0.9; }
  .btn.danger { color: #b91c1c; border-color: color-mix(in srgb, #b91c1c 30%, transparent); }
  .btn svg { width: 16px; height: 16px; fill: currentColor; }

  /* ── Settings popover ── */
  .popover-backdrop {
    display: none; position: fixed; inset: 0; z-index: 400;
  }
  .popover-backdrop.open { display: block; }
  .settings-popover {
    display: none; position: fixed; bottom: 56px; left: 12px;
    z-index: 500; min-width: 260px;
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    padding: 8px;
  }
  .settings-popover.open { display: block; }
  .settings-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-radius: 8px;
    font-size: var(--text-sm); color: var(--page-fg);
  }
  .settings-item:hover { background: color-mix(in srgb, var(--panel-accent) 6%, transparent); }
  .settings-item .toggle {
    width: 36px; height: 20px; border-radius: 10px;
    background: var(--panel-border); cursor: pointer; position: relative;
    border: none; padding: 0; transition: background 0.15s;
  }
  .settings-item .toggle.on { background: var(--panel-accent); }
  .settings-item .toggle::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 16px; height: 16px; border-radius: 50%; background: #fff;
    transition: transform 0.15s;
  }
  .settings-item .toggle.on::after { transform: translateX(16px); }
  .settings-divider { border: none; border-top: 1px solid var(--panel-border); margin: 6px 0; }
  .theme-option {
    display: flex; align-items: center; gap: 8px;
    width: 100%; min-height: 36px; padding: 8px 12px; border-radius: 8px;
    border: none; background: none; color: var(--page-fg);
    font-size: var(--text-sm); cursor: pointer; font-family: inherit; text-align: left;
  }
  .theme-option:hover { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); color: var(--panel-accent); }
  .theme-option .theme-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .theme-option .theme-check { margin-left: auto; width: 14px; height: 14px; }

  /* ── Session edit popover ── */
  .session-popover {
    position: fixed; z-index: 600;
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    padding: 12px; min-width: 200px;
  }
  .session-popover-backdrop {
    display: none; position: fixed; inset: 0; z-index: 550;
  }
  .session-popover-backdrop.open { display: block; }
  .sp-field { margin-bottom: 10px; }
  .sp-field label {
    display: block; font-size: var(--text-xs); color: var(--panel-muted);
    margin-bottom: 4px; font-weight: 500;
  }
  .sp-field input {
    width: 100%; padding: 10px 12px;
    background: var(--page-bg); border: 1px solid var(--panel-border);
    border-radius: 10px; color: var(--page-fg); font-size: var(--text-sm);
    font-family: inherit; outline: none;
  }
  .sp-field input:focus { border-color: var(--panel-accent); }
  .sp-actions { display: flex; gap: 6px; margin-top: 0; }
  .sp-divider { border: none; border-top: 1px solid var(--panel-border); margin: 10px 0; }

  /* ── Status indicator for terminal ── */
  .terminal-status {
    display: flex; align-items: center; gap: 6px;
    font-size: var(--text-xs); color: var(--panel-muted);
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #b91c1c; flex-shrink: 0;
  }
  .status-dot.connected { background: #16a34a; }

  /* ── Terminal container ── */
  #terminal-container {
    flex: 1; overflow: hidden;
  }
  #terminal-container.terminal-pending { visibility: hidden; }
  #terminal-container .terminal-drag-over {
    outline: 2px dashed var(--panel-accent);
    outline-offset: -2px;
  }

  /* ── Mobile key toolbar ── */
  .mobile-keys {
    display: none; flex-wrap: wrap; gap: 4px;
    padding: 6px 8px; border-top: 1px solid var(--panel-border);
    background: var(--panel-bg); flex-shrink: 0;
  }
  .mobile-keys button {
    min-width: 38px; min-height: 38px; padding: 4px 10px;
    border: 1px solid var(--panel-border); border-radius: 8px;
    background: var(--page-bg); color: var(--page-fg);
    font-size: 11px; font-family: var(--font-mono); cursor: pointer;
    touch-action: manipulation; user-select: none;
  }
  .mobile-keys button:active { opacity: 0.55; }
  .mobile-keys .mk-input {
    display: flex; gap: 4px; flex: 1 1 100%;
  }
  .mobile-keys .mk-input textarea {
    flex: 1; resize: none; box-sizing: border-box;
    min-height: 38px; max-height: 80px;
    background: color-mix(in srgb, var(--page-bg), var(--panel-bg) 50%);
    color: var(--page-fg);
    border: 1px solid var(--panel-border);
    border-radius: 8px; padding: 6px 10px;
    font-family: var(--font-mono); font-size: var(--text-base); line-height: 1.4;
    outline: none;
  }
  .mobile-keys .mk-input textarea:focus {
    border-color: var(--panel-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--panel-accent) 15%, transparent);
  }
  .mobile-keys .mk-input textarea::placeholder { color: var(--panel-muted); opacity: 0.6; }
  .mobile-keys .mk-input button {
    min-width: 44px; padding: 0 12px;
    border: none; color: white;
    background: var(--panel-success);
    border-radius: 8px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    touch-action: manipulation;
  }
  .mobile-keys .mk-input button:hover {
    filter: brightness(1.15);
  }
  .mobile-keys .mk-input button:active {
    filter: brightness(0.85);
  }

  /* ── File list view (when no root selected) ── */
  .file-roots-list { list-style: none; padding: 0; margin: 16px; }
  .file-roots-list li {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 16px; border: 1px solid var(--panel-border); border-radius: 12px;
    margin-bottom: 8px; cursor: pointer; font-size: var(--text-sm);
    font-family: var(--font-mono); color: var(--page-fg); background: var(--panel-bg);
    transition: border-color 0.15s;
  }
  .file-roots-list li:hover { border-color: var(--panel-accent); }
  .file-roots-list li svg { width: 20px; height: 20px; flex-shrink: 0; fill: var(--panel-accent); }

  /* ── Commandbar ── */
  ${commandbarEnabled ? commandbarCSS() : ''}
  ${reducedMotion()}
  ${newSessionModalCSS()}
  @media (max-width: 640px) {
    .app-layout { flex-direction: column; }
    .sidebar { flex: 0 0 auto; border-right: none; border-bottom: 1px solid var(--panel-border); transition: max-height 0.2s; }
    .sidebar.collapsed .sidebar-content { display: none; }
    .sidebar.collapsed .sidebar-footer { display: none; }
    .sidebar.collapsed { max-height: 48px; overflow: hidden; }
    .mobile-keys { display: flex; }
    .mobile-keys .mk-buttons { display: none; }
    .mobile-keys.mk-focused .mk-buttons { display: flex; flex-wrap: wrap; gap: 4px; }
  }
  `;
    const terminalThemeJson = JSON.stringify(theme.terminal).replace(/</g, '\\u003c');
    const shellConfigJson = JSON.stringify({
        terminal: terminalCfg,
        scrollback,
        theme: theme.terminal,
        renderer,
        fsRoots,
        commandbarEnabled,
    }).replace(/</g, '\\u003c');
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="tmux-web" />
<link rel="apple-touch-icon" href="/assets/icon-192.png" />
<link rel="manifest" href="/manifest.json" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>tmux-weblink</title>
<style>
  ${cssVarsStyle(theme.shell)}
  ${shellCSS}
</style>
</head>
<body>

<script>
(function() {
  const token = localStorage.getItem('tmux-web-token');
  if (token) {
    const orig = window.fetch;
    window.fetch = function(input, init) {
      init = init || {};
      const headers = init.headers || {};
      if (typeof headers === 'object' && !Array.isArray(headers) && !headers['Authorization'] && !headers['authorization']) {
        init.headers = { ...headers, Authorization: 'Bearer ' + token };
      }
      return orig(input, init);
    };
  }
})();
</script>

<header class="fixed-header">
  <div class="brand" id="brand-toggle">tmux<span>-weblink</span></div>
  <div class="header-actions">
    ${commandbarEnabled ? `<button class="header-btn" id="cmdbar-btn" title="Search" aria-label="Search">${icon('search')}</button>` : ''}
  </div>
  <div class="sys-status" id="sys-status">RAM ${initMemPct}% / CPU ${initCpuLoad < 10 ? initCpuLoad.toFixed(1) : Math.round(initCpuLoad)}</div>
</header>

<div id="process-panel">
  <div class="panel-header">
    <span>Top Processes</span>
    <button id="proc-close" aria-label="Close">&times;</button>
  </div>
  <div class="proc-list" id="proc-list"></div>
</div>

<div class="app-layout">
  <aside class="sidebar">
    <div class="sidebar-content" id="sidebar-content"></div>
    <div class="sidebar-footer">
      <button class="mode-btn active" id="mode-sessions" title="Sessions">${icon('sessions', 'width="20" height="20"')}</button>
      <button class="mode-btn" id="mode-files" title="Files">${icon('folder', 'width="20" height="20"')}</button>
      <button class="mode-btn" id="mode-settings" title="Settings">${icon('settings', 'width="20" height="20"')}</button>
    </div>
  </aside>

  <main class="main-area">
    <div class="main-placeholder" id="main-placeholder">
      Select a session from the sidebar to get started.
    </div>
    <div id="terminal-container" class="terminal-pending" style="display:none"></div>
    <div id="file-editor" style="display:none;flex:1;display:none;flex-direction:column">
      <div class="file-editor-toolbar">
        <span class="path" id="fe-path"></span>
        <span class="status" id="fe-status"></span>
        <button class="btn primary" id="fe-save" style="display:none">Save</button>
        <button class="btn danger" id="fe-delete">Delete</button>
        <button class="btn" id="fe-back">Back</button>
      </div>
      <div class="file-editor-content">
        <textarea id="fe-content" spellcheck="false"></textarea>
      </div>
      <div class="file-editor-new">
        <input type="text" id="fe-new-name" placeholder="filename.txt" spellcheck="false" />
        <button class="btn primary" id="fe-new-btn">New File</button>
      </div>
    </div>
    <div class="mobile-keys" id="mobile-keys">
      <div class="mk-input">
        <textarea id="mk-input" placeholder="Type or voice input…" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" rows="1"></textarea>
        <button id="mk-send" type="button" title="Send (Enter)"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
      </div>
      <div class="mk-buttons" id="mk-buttons">
        <button data-key="esc">ESC</button>
        <button data-key="tab">Tab</button>
        <button data-key="s-tab">S-Tab</button>
        <button data-key="up">↑</button>
        <button data-key="down">↓</button>
        <button data-key="left">←</button>
        <button data-key="right">→</button>
        <button data-key="space">␣</button>
        <button data-key="enter">↵ Enter</button>
        <button data-key="exit">Exit</button>
        <button data-key="yes">Yes</button>
      </div>
    </div>
  </main>
</div>

<!-- Settings popover -->
<div class="popover-backdrop" id="settings-backdrop"></div>
<div class="settings-popover" id="settings-popover">
  <div class="settings-item">
    <span>Command bar</span>
    <button class="toggle${commandbarEnabled ? ' on' : ''}" id="set-commandbar"></button>
  </div>
  <div class="settings-item">
  </div>
  <hr class="settings-divider" />
  <div class="settings-item">
    <span>Terminal renderer</span>
    <span style="font-size:var(--text-xs);color:var(--panel-muted)">${renderer === 'ghostty' ? 'Ghostty' : 'xterm.js'}</span>
  </div>
  <hr class="settings-divider" />
  <div style="padding:4px 0">
    <button class="theme-option" data-theme="vscode" title="VS Code"><span class="theme-dot" style="background:#007acc"></span>VS Code${theme.template === 'vscode' ? '<span class="theme-check">✓</span>' : ''}</button>
    <button class="theme-option" data-theme="ghostty" title="Ghostty"><span class="theme-dot" style="background:#ff5f00"></span>Ghostty${theme.template === 'ghostty' ? '<span class="theme-check">✓</span>' : ''}</button>
    <button class="theme-option" data-theme="warm-clay" title="Warm Clay"><span class="theme-dot" style="background:#b86b52"></span>Warm Clay${theme.template === 'warm-clay' ? '<span class="theme-check">✓</span>' : ''}</button>
    <button class="theme-option" data-theme="dark-cove" title="Dark Cove"><span class="theme-dot" style="background:#7aa2f7"></span>Dark Cove${theme.template === 'dark-cove' ? '<span class="theme-check">✓</span>' : ''}</button>
  </div>
  <hr class="settings-divider" />
  <div class="settings-item" style="cursor:pointer" id="set-plugins-link">
    <a href="/settings" style="color:inherit;text-decoration:none">Plugins & Settings</a>
    <span style="font-size:var(--text-xs);color:var(--panel-muted)">→</span>
  </div>
</div>

<script>
(function() {
  var popover = document.getElementById('settings-popover');
  popover.addEventListener('click', function(e) {
    var opt = e.target.closest('.theme-option');
    if (!opt) return;
    var theme = opt.dataset.theme;
    fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: theme }),
    }).then(function(r) {
      if (r.ok) location.reload();
    }).catch(function() {});
  });
})();
</script>

${newSessionModalHTML()}
${commandbarEnabled ? commandbarHTML() : ''}

<script>
window.__TMUX_WEB_SHELL__ = ${shellConfigJson};
</script>
<script type="module">
await import('/assets/shell-client.js');
${commandbarEnabled ? commandbarScript(commandbarSessions, []) : ''}
// Wrapper: refresh sidebar list, then open session
window.__onSessionCreated = async function(name) {
  await window.__refreshSidebar();
  window.__openSession(name);
};
${newSessionModalScript('__onSessionCreated')}
</script>
<script>
// Sync app-layout height to visual viewport so mobile keyboard doesn't overlap
(function(){
  var el = document.querySelector('.app-layout');
  var vv = window.visualViewport;
  if (!vv || !el) return;
  function sync(){ el.style.height = vv.height + 'px'; }
  vv.addEventListener('resize', sync);
  sync();
})();
</script>
<script>
(function(){
  var el = document.getElementById('sys-status');
  if (!el) return;
  function poll(){
    fetch('/api/system/status').then(function(r){ return r.json(); }).then(function(s){
      var p = s.memory.percent;
      var load = s.cpu.loadAvg[0];
      el.textContent = 'RAM ' + p + '% / CPU ' + (load < 10 ? load.toFixed(1) : Math.round(load));
    }).catch(function(){});
  }
  poll();
  setInterval(poll, 5000);
})();
</script>
<script>
(function(){
  var statusEl = document.getElementById('sys-status');
  var panel = document.getElementById('process-panel');
  var list = document.getElementById('proc-list');
  var closeBtn = document.getElementById('proc-close');
  if (!statusEl || !panel || !list || !closeBtn) return;

  function loadProcs(){
    list.innerHTML = '<div class="proc-empty">Loading\u2026</div>';
    fetch('/api/system/processes').then(function(r){ return r.json(); }).then(function(procs){
      if (!Array.isArray(procs) || !procs.length) {
        list.innerHTML = '<div class="proc-empty">No processes</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < procs.length; i++) {
        var p = procs[i];
        var rss = p.rss;
        var rssStr = rss < 1048576 ? (rss / 1024).toFixed(0) + 'K' : (rss / 1048576).toFixed(1) + 'M';
        html += '<div class="proc-row" data-pid="' + p.pid + '">'
          + '<span class="proc-mem">' + p.mem + '%</span>'
          + '<span class="proc-rss">' + rssStr + '</span>'
          + '<span class="proc-cmd" title="' + escAttr(p.command) + '">' + escHtml(p.command) + '</span>'
          + '<button class="proc-kill" title="Kill PID ' + p.pid + '">&times;</button>'
          + '</div>';
      }
      list.innerHTML = html;
      // Wire kill buttons
      var rows = list.querySelectorAll('.proc-row');
      for (var j = 0; j < rows.length; j++) {
        var btn = rows[j].querySelector('.proc-kill');
        if (!btn) continue;
        btn.addEventListener('click', function(e){
          var row = e.target.closest('.proc-row');
          if (!row || !confirm('Kill PID ' + row.dataset.pid + '?')) return;
          fetch('/api/system/kill', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ pid: parseInt(row.dataset.pid, 10) }),
          }).then(function(r){ return r.json(); }).then(function(data){
            if (data.ok) { row.style.opacity = '0.3'; }
            else { alert('Failed: ' + (data.error || 'unknown')); }
          }).catch(function(){ alert('Network error'); });
        });
      }
    }).catch(function(){
      list.innerHTML = '<div class="proc-empty">Failed to load</div>';
    });
  }

  function openPanel(){
    panel.classList.add('open');
    loadProcs();
  }

  function closePanel(){ panel.classList.remove('open'); }

  statusEl.addEventListener('click', function(e){
    if (panel.classList.contains('open')) { closePanel(); }
    else { openPanel(); }
  });
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('click', function(e){
    if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== statusEl) {
      closePanel();
    }
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
  });

  function escHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escAttr(s){ return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
})();
</script>
<script>
(function(){
  /* Logo toggle sidebar */
  var brand = document.getElementById('brand-toggle');
  var sbar = document.querySelector('.sidebar');
  if (brand && sbar) {
    brand.addEventListener('click', function(e) {
      sbar.classList.toggle('collapsed');
    });
  }

  /* Mobile keys: show buttons on input focus, hide on blur */
  var mkInput = document.getElementById('mk-input');
  var mobileKeys = document.getElementById('mobile-keys');
  var hideTimer = null;
  if (mkInput && mobileKeys) {
    mkInput.addEventListener('focus', function() {
      clearTimeout(hideTimer);
      mobileKeys.classList.add('mk-focused');
    });
    mkInput.addEventListener('blur', function() {
      hideTimer = setTimeout(function() {
        mobileKeys.classList.remove('mk-focused');
      }, 200);
    });
    mobileKeys.addEventListener('mousedown', function() {
      clearTimeout(hideTimer);
    });
  }
})();
</script>
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' });
}
</script>
</body>
</html>`;
}
