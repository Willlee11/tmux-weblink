import { cssVarsStyle } from '../theme.js';
import type { TmuxWebTheme } from '../themes/types.js';
import { escapeHtml, escapeAttr } from '../html.js';
import { notesDrawerCSS, notesDrawerHTML, notesDrawerScript } from '../notes-drawer.js';
import { schedulerDrawerCSS, schedulerDrawerHTML, schedulerDrawerScript } from '../scheduler-drawer.js';
import { windowsDrawerCSS, windowsDrawerHTML, windowsDrawerScript } from '../windows-drawer.js';
import { sessionsDrawerCSS, sessionsDrawerButtonHTML, sessionsDrawerHTML, sessionsDrawerScript } from '../sessions-drawer.js';
import { mobileToolbarCSS, mobileToolbarHTML, mobileToolbarScript } from '../mobile-toolbar.js';
import { icon, extIcon } from '../icons.js';
import type { ExtManifest } from '../ext-loader.js';
import {
	commandbarButtonHTML,
	commandbarCSS,
	commandbarHTML,
	commandbarScript,
	type CommandbarSession,
	type CommandbarAction,
	type CommandbarQuickCommand,
} from '../commandbar.js';
import { drawerResizeCSS, drawerResizeHandleHTML, drawerResizeScript } from '../drawer-resize.js';
import { themeSwitcherButtonHTML, themeSwitcherScript } from '../shared-layout.js';
import type { TerminalBufferConfig } from '../terminal-config.js';

function extDrawerCSS(): string {
	return `
  .ext-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  .ext-backdrop.open { opacity: 1; pointer-events: auto; }
  .ext-drawer {
    position: fixed; right: 0; top: 0; height: 100%; width: 360px; z-index: 1000;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.25s ease;
  }
  .ext-drawer.open { transform: translateX(0); }
  .ext-panel {
    position: fixed; right: 0; top: 0; height: 100%; width: min(960px, calc(100vw - 48px)); z-index: 1001;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.25s ease;
  }
  .ext-panel.open { transform: translateX(0); }
  ${drawerResizeCSS()}
  .ext-drawer .drawer-header,
  .ext-panel .drawer-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px; border-bottom: 1px solid var(--panel-border);
    font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--panel-accent); font-family: var(--font-mono); flex-shrink: 0;
  }
  .ext-drawer .drawer-header button,
  .ext-panel .drawer-header button {
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    font-size: var(--text-lg); line-height: 1; padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
  }
  .ext-drawer .drawer-header button:hover,
  .ext-panel .drawer-header button:hover { color: var(--panel-accent); }
  .ext-drawer iframe { flex: 1; border: none; width: 100%; height: 0; }
  .ext-panel iframe { flex: 1; border: none; width: 100%; height: 100%; }
`;
}

function extDrawerHTML(manifest: ExtManifest): string {
	const id = manifest.id;
	return `
<div id="ext-${id}-backdrop" class="ext-backdrop"></div>
<div id="ext-${id}-drawer" class="ext-drawer resizable-drawer">
  ${drawerResizeHandleHTML()}
  <div class="drawer-header">
    <span>${escapeHtml(manifest.icon)} ${escapeHtml(manifest.name)}</span>
    <button id="ext-${id}-close">&times;</button>
  </div>
  <iframe id="ext-${id}-frame" src="/ext/${id}/ui/index.html"></iframe>
</div>`;
}

function extPanelHTML(manifest: ExtManifest): string {
	const id = manifest.id;
	const panel = manifest.panel;
	if (!panel) return '';
	const title = panel.title ?? manifest.name;
	return `
<div id="ext-${id}-panel-backdrop" class="ext-backdrop"></div>
<div id="ext-${id}-panel" class="ext-panel resizable-drawer">
  ${drawerResizeHandleHTML()}
  <div class="drawer-header">
    <span>${escapeHtml(manifest.icon)} ${escapeHtml(title)}</span>
    <button id="ext-${id}-panel-close">&times;</button>
  </div>
  <iframe id="ext-${id}-panel-frame" src="/ext/${id}/ui/${escapeAttr(panel.entry)}"></iframe>
</div>`;
}

function extDrawerScript(manifest: ExtManifest, sessionName: string): string {
	const id      = manifest.id;
	const cfgJson = JSON.stringify(manifest.config);
  const panelEntry = manifest.panel?.entry ?? null;
  const panelWidth = manifest.panel?.defaultWidth ?? 960;
	return `
${drawerResizeScript(`ext-${id}-drawer`, `tmux-web:drawer-width:ext:${id}`, 360)}
${panelEntry ? drawerResizeScript(`ext-${id}-panel`, `tmux-web:panel-width:ext:${id}`, panelWidth) : ''}
(function() {
  const backdrop = document.getElementById('ext-${id}-backdrop');
  const drawer   = document.getElementById('ext-${id}-drawer');
  const frame    = document.getElementById('ext-${id}-frame');
  const toggle   = document.getElementById('ext-${id}-toggle');
  const close    = document.getElementById('ext-${id}-close');
  const panelBackdrop = document.getElementById('ext-${id}-panel-backdrop');
  const panel = document.getElementById('ext-${id}-panel');
  const panelFrame = document.getElementById('ext-${id}-panel-frame');
  const panelClose = document.getElementById('ext-${id}-panel-close');

  function notifyFrame(targetFrame, type) {
    if (targetFrame && targetFrame.contentWindow) {
      targetFrame.contentWindow.postMessage({ type }, '*');
    }
  }

  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    sendMessages(frame);
    notifyFrame(frame, 'ext:open');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    notifyFrame(frame, 'ext:close');
  }

  function openPanel() {
    if (!panel || !panelBackdrop || !panelFrame) return;
    panel.classList.add('open');
    panelBackdrop.classList.add('open');
    closeDrawer();
    sendMessages(panelFrame);
    notifyFrame(panelFrame, 'ext:open');
  }

  function closePanel() {
    if (!panel || !panelBackdrop || !panelFrame) return;
    panel.classList.remove('open');
    panelBackdrop.classList.remove('open');
    notifyFrame(panelFrame, 'ext:close');
  }

  toggle.addEventListener('click', () => {
    drawer.classList.contains('open') ? closeDrawer() : openDrawer();
  });
  close.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  if (panelClose) panelClose.addEventListener('click', closePanel);
  if (panelBackdrop) panelBackdrop.addEventListener('click', closePanel);

  const cfg = ${cfgJson};

  function sendMessages(targetFrame) {
    if (!targetFrame || !targetFrame.contentWindow) return;
    targetFrame.contentWindow.postMessage({ type: 'ext:context', context: { session: ${JSON.stringify(sessionName)}, host: location.origin } }, '*');
    targetFrame.contentWindow.postMessage({ type: 'ext:config',  config: cfg }, '*');
  }

  // Defensive: if iframe already loaded (shouldn't happen), send immediately
  if (frame.contentDocument && frame.contentDocument.readyState === 'complete') {
    sendMessages(frame);
  } else {
    frame.addEventListener('load', () => sendMessages(frame), { once: true });
  }

  if (panelFrame) {
    if (panelFrame.contentDocument && panelFrame.contentDocument.readyState === 'complete') {
      sendMessages(panelFrame);
    } else {
      panelFrame.addEventListener('load', () => sendMessages(panelFrame), { once: true });
    }
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'ext:resize' && e.source === frame.contentWindow) {
      frame.style.height = e.data.height + 'px';
    }
    if (panelFrame && e.data?.type === 'ext:panel-open' && e.source === frame.contentWindow) {
      openPanel();
    }
    if (panelFrame && e.data?.type === 'ext:panel-close' && e.source === panelFrame.contentWindow) {
      closePanel();
    }
    // ext:ready fires when the bridge initialises; send (or re-send) config
    if (e.data?.type === 'ext:ready' && e.source === frame.contentWindow) {
      sendMessages(frame);
    }
    if (panelFrame && e.data?.type === 'ext:ready' && e.source === panelFrame.contentWindow) {
      sendMessages(panelFrame);
    }
  });
}());`;
}

export function renderTerminal(
	sessionName: string,
	extensions: ExtManifest[] = [],
	opts: {
		commandbarEnabled?: boolean;
		commandbarSessions?: CommandbarSession[];
		quickCommands?: CommandbarQuickCommand[];
		agentsEnabled?: boolean;
		terminal?: TerminalBufferConfig;
		theme: TmuxWebTheme;
		renderer?: 'xterm' | 'ghostty';
	},
): string {
	const sidebarExts = extensions.filter(e => e.slot === 'sidebar');
	const { commandbarEnabled = false, commandbarSessions = [], quickCommands = [], agentsEnabled = false, theme, renderer = 'xterm' } = opts;
	const terminalCfg = opts.terminal ?? {
		initialLines: 1000,
		historyChunk: 500,
		syncIdleMs: 200,
		syncMaxMs: 3000,
	};
	const scrollback = terminalCfg.initialLines + 2 * terminalCfg.historyChunk;
	const commandbarActions: CommandbarAction[] = [
		{ label: 'Switch window', meta: `Windows in ${sessionName}`, subView: 'windows' },
		{ label: 'Quick Commands', meta: 'Paste configured command', subView: 'quickCommands' },
		{ label: 'Send Command', meta: 'Send input to active window', clickTargetId: 'type-toggle' },
		{ label: 'Open sessions sidebar', meta: 'Recent and pinned sessions', clickTargetId: 'sessions-toggle' },
		{ label: 'Open notes', meta: `Notes for ${sessionName}`, clickTargetId: 'notes-toggle' },
		{ label: 'Open scheduler', meta: `Schedule command in ${sessionName}`, clickTargetId: 'sched-toggle' },
	];
	if (agentsEnabled) {
		commandbarActions.push({ label: 'View All Agents', meta: 'Running agents', href: '/agents' });
	}
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>tmux: ${escapeHtml(sessionName)}</title>
<style>
  ${cssVarsStyle(theme.shell)}
  html, body { background: var(--page-bg); color: var(--page-fg); height: 100%; width: 100%; overflow: hidden; }
  body { display: flex; flex-direction: column; }
  header {
    padding: 8px 12px;
    background: var(--header-gradient);
    border-bottom: 1px solid var(--panel-border);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    min-height: 56px;
  }
  header .brand {
    font-size: var(--text-base); font-weight: 600; letter-spacing: -0.01em; color: var(--page-fg);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  header .brand span { color: var(--panel-accent); font-weight: 500; }
  header .brand a { color: inherit; text-decoration: none; }
  header .session {
    font-size: var(--text-sm);
    color: var(--panel-muted);
    background: var(--page-bg);
    border: 1px solid var(--panel-border);
    padding: 7px 14px;
    border-radius: 10px;
    max-width: 200px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  header .status {
    margin-left: auto;
    font-size: var(--text-xs);
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--panel-muted);
  }
  header .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--panel-muted); transition: background 0.2s; }
  header .dot.connected { background: var(--panel-success); }
  @media (max-width: 560px) { header .status #status-text { display: none; } }
  #terminal-container { flex: 1; width: 100%; min-height: 0; overflow: hidden; background: var(--terminal-bg); }
  #terminal-container .xterm { height: 100%; padding: 0; }
  /* Hide whatever the active renderer mounts (xterm .xterm div or ghostty canvas)
     until the first fit, so neither renderer flashes an unsized terminal. */
  #terminal-container.terminal-pending > * { visibility: hidden; }
  #terminal-container .xterm-viewport { overflow-y: auto; }
  #terminal-container.terminal-drag-over {
    outline: 2px dashed var(--panel-accent);
    outline-offset: -2px;
    background: color-mix(in srgb, var(--panel-accent) 6%, transparent);
  }
  .header-icon-btn,
  header .notes-btn,
  header .sched-btn,
  header .windows-btn,
  header .ext-btn,
  header .sessions-btn,
  header .theme-switcher-btn,
  header .cmdbar-btn {
    display: flex; align-items: center; justify-content: center;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    min-width: 44px; min-height: 44px; padding: 8px; border-radius: 10px;
    transition: color 0.15s, background 0.15s;
    font-size: var(--text-sm); text-decoration: none; font-family: inherit;
  }
  .header-icon-btn:hover,
  header .notes-btn:hover,
  header .sched-btn:hover,
  header .windows-btn:hover,
  header .ext-btn:hover,
  header .sessions-btn:hover,
  header .theme-switcher-btn:hover,
  header .cmdbar-btn:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .header-icon-btn:focus-visible,
  header .notes-btn:focus-visible,
  header .sched-btn:focus-visible,
  header .windows-btn:focus-visible,
  header .ext-btn:focus-visible,
  header .sessions-btn:focus-visible,
  header .theme-switcher-btn:focus-visible,
  header .cmdbar-btn:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  .header-icon-btn svg,
  header .notes-btn svg,
  header .sched-btn svg,
  header .windows-btn svg,
  header .ext-btn svg,
  header .sessions-btn svg,
  header .theme-switcher-btn svg,
  header .cmdbar-btn svg { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }
  header .theme-switcher { position: relative; }
  header .theme-switcher-popover {
    position: absolute; top: calc(100% + 8px); right: 0;
    min-width: 180px; max-width: calc(100vw - 24px);
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 6px;
    display: none; z-index: 300;
  }
  header .theme-switcher.open .theme-switcher-popover { display: block; }
  header .theme-option {
    display: flex; align-items: center; gap: 10px; width: 100%;
    min-height: 44px; padding: 10px 12px; border-radius: 8px; border: none; background: none;
    color: var(--page-fg); font-size: var(--text-sm); cursor: pointer; text-align: left; font-family: inherit;
  }
  header .theme-option:hover { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); color: var(--panel-accent); }
  header .theme-option:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  header .theme-option.active { color: var(--panel-accent); font-weight: 500; }
  header .theme-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  header .theme-check { width: 16px; height: 16px; margin-left: auto; color: var(--panel-accent); }
  @media (max-width: 640px) {
    header { gap: 4px; padding: 8px; }
    header .session { display: none; }
    header .brand span { display: none; }
  }
  @media (max-width: 380px) {
    header .status { display: none; }
  }
  ${commandbarEnabled ? commandbarCSS() : ''}
  ${notesDrawerCSS()}
  ${schedulerDrawerCSS()}
  ${windowsDrawerCSS()}
  ${sessionsDrawerCSS()}
  ${mobileToolbarCSS()}
  ${extDrawerCSS()}
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
</style>
</head>
<body>
<header>
  ${sessionsDrawerButtonHTML()}
  <div class="brand"><a href="/" aria-label="Go to home">tmux</a><span>-weblink</span></div>
  <span class="session">${escapeHtml(sessionName)}</span>
  ${commandbarEnabled ? commandbarButtonHTML('Sessions') : ''}
  <button class="notes-btn" id="notes-toggle" title="Session notes" aria-label="Session notes">
    ${icon('notes')}
  </button>
  <button class="sched-btn" id="sched-toggle" title="Schedule command" aria-label="Schedule command">
    ${icon('schedule')}
  </button>
  <button class="windows-btn" id="windows-toggle" title="Switch window" aria-label="Switch window">
    ${icon('windows')}
  </button>
  ${sidebarExts.map(e => `<button class="ext-btn" id="ext-${e.id}-toggle" title="${escapeAttr(e.name)}" aria-label="${escapeAttr(e.name)}">${extIcon(e.id, e.icon)}</button>`).join('\n  ')}
  ${themeSwitcherButtonHTML(theme.template)}
  <div class="status">
    <div class="dot" id="status-dot"></div>
    <span id="status-text">connecting</span>
  </div>
</header>
<script>${themeSwitcherScript()}</script>
<div id="terminal-container" class="terminal-pending"></div>
${mobileToolbarHTML()}
${commandbarEnabled ? commandbarHTML() : ''}
${notesDrawerHTML(`Notes - ${sessionName}`)}
${schedulerDrawerHTML(`Scheduler - ${sessionName}`)}
${windowsDrawerHTML(`Windows - ${sessionName}`)}
${sessionsDrawerHTML()}
${sidebarExts.map(e => extDrawerHTML(e)).join('\n')}
${sidebarExts.map(e => extPanelHTML(e)).join('\n')}

<script type="module">
window.__TMUX_WEB_TERMINAL__ = ${JSON.stringify({
	sessionName,
	terminal: terminalCfg,
	scrollback,
	theme: theme.terminal,
	renderer,
}).replace(/</g, '\\u003c')};
await import('/assets/terminal-client.js');

// ========== NOTES ==========
${notesDrawerScript(`session:${sessionName}`)}

// ========== SCHEDULER ==========
${schedulerDrawerScript(sessionName)}

// ========== WINDOWS ==========
${windowsDrawerScript(sessionName)}

// ========== SESSIONS SIDEBAR ==========
${sessionsDrawerScript(sessionName)}

// ========== WINDOW DEEP-LINK (?window=N) ==========
{
  const wParam = new URLSearchParams(location.search).get('window');
  const wIndex = wParam === null ? NaN : parseInt(wParam, 10);
  if (Number.isInteger(wIndex) && wIndex >= 0) {
    fetch('/api/session/' + encodeURIComponent(${JSON.stringify(sessionName)}) + '/select-window', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ windowIndex: wIndex }),
    }).catch(() => {});
  }
}

// ========== MOBILE TOOLBAR ==========
${mobileToolbarScript(sessionName)}

// ========== COMMANDBAR ==========
${commandbarEnabled ? commandbarScript(commandbarSessions, commandbarActions, { sessionName }, quickCommands) : ''}

// ========== NOTES ==========
// (notes and scheduler scripts already included above; extensions below)
</script>

${sidebarExts.length > 0 ? `<script>
// Extension bootstrap: plain script (not module) so it runs before the module
// awaits terminal-client import, avoiding a race where iframes load during that await.
${sidebarExts.map(e => extDrawerScript(e, sessionName)).join('\n')}
</script>` : ''}
</body>
</html>`;
}
