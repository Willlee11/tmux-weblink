import{cssVarsStyle as w}from"../theme.js";import{escapeHtml as i,escapeAttr as c}from"../html.js";import{notesDrawerCSS as v,notesDrawerHTML as y,notesDrawerScript as $}from"../notes-drawer.js";import{schedulerDrawerCSS as k,schedulerDrawerHTML as S,schedulerDrawerScript as L}from"../scheduler-drawer.js";import{windowsDrawerCSS as D,windowsDrawerHTML as E,windowsDrawerScript as F}from"../windows-drawer.js";import{sessionsDrawerCSS as M,sessionsDrawerHTML as I,sessionsDrawerScript as T}from"../sessions-drawer.js";import{mobileToolbarCSS as C,mobileToolbarHTML as B,mobileToolbarScript as O}from"../mobile-toolbar.js";import{icon as m,extIcon as W}from"../icons.js";import{commandbarButtonHTML as z,commandbarCSS as H,commandbarHTML as P,commandbarScript as R}from"../commandbar.js";import{drawerResizeCSS as A,drawerResizeHandleHTML as h,drawerResizeScript as x}from"../drawer-resize.js";import{themeSwitcherButtonHTML as j,themeSwitcherScript as J}from"../shared-layout.js";function _(){return`
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
  ${A()}
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
`}function U(e){const n=e.id;return`
<div id="ext-${n}-backdrop" class="ext-backdrop"></div>
<div id="ext-${n}-drawer" class="ext-drawer resizable-drawer">
  ${h()}
  <div class="drawer-header">
    <span>${i(e.icon)} ${i(e.name)}</span>
    <button id="ext-${n}-close">&times;</button>
  </div>
  <iframe id="ext-${n}-frame" src="/ext/${n}/ui/index.html"></iframe>
</div>`}function X(e){const n=e.id,t=e.panel;if(!t)return"";const r=t.title??e.name;return`
<div id="ext-${n}-panel-backdrop" class="ext-backdrop"></div>
<div id="ext-${n}-panel" class="ext-panel resizable-drawer">
  ${h()}
  <div class="drawer-header">
    <span>${i(e.icon)} ${i(r)}</span>
    <button id="ext-${n}-panel-close">&times;</button>
  </div>
  <iframe id="ext-${n}-panel-frame" src="/ext/${n}/ui/${c(t.entry)}"></iframe>
</div>`}function V(e,n){const t=e.id,r=JSON.stringify(e.config),o=e.panel?.entry??null,d=e.panel?.defaultWidth??960;return`
${x(`ext-${t}-drawer`,`tmux-web:drawer-width:ext:${t}`,360)}
${o?x(`ext-${t}-panel`,`tmux-web:panel-width:ext:${t}`,d):""}
(function() {
  const backdrop = document.getElementById('ext-${t}-backdrop');
  const drawer   = document.getElementById('ext-${t}-drawer');
  const frame    = document.getElementById('ext-${t}-frame');
  const toggle   = document.getElementById('ext-${t}-toggle');
  const close    = document.getElementById('ext-${t}-close');
  const panelBackdrop = document.getElementById('ext-${t}-panel-backdrop');
  const panel = document.getElementById('ext-${t}-panel');
  const panelFrame = document.getElementById('ext-${t}-panel-frame');
  const panelClose = document.getElementById('ext-${t}-panel-close');

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

  const cfg = ${r};

  function sendMessages(targetFrame) {
    if (!targetFrame || !targetFrame.contentWindow) return;
    targetFrame.contentWindow.postMessage({ type: 'ext:context', context: { session: ${JSON.stringify(n)}, host: location.origin } }, '*');
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
}());`}function re(e,n=[],t){const r=n.filter(a=>a.slot==="sidebar"),{commandbarEnabled:o=!1,commandbarSessions:d=[],quickCommands:g=[],agentsEnabled:b=!1,theme:s,renderer:f="xterm"}=t,l=t.terminal??{initialLines:1e3,historyChunk:500,syncIdleMs:200,syncMaxMs:3e3},u=l.initialLines+2*l.historyChunk,p=[{label:"Switch window",meta:`Windows in ${e}`,subView:"windows"},{label:"Quick Commands",meta:"Paste configured command",subView:"quickCommands"},{label:"Send Command",meta:"Send input to active window",clickTargetId:"type-toggle"},{label:"Open sessions sidebar",meta:"Recent and pinned sessions",clickTargetId:"sessions-toggle"},{label:"Open notes",meta:`Notes for ${e}`,clickTargetId:"notes-toggle"},{label:"Open scheduler",meta:`Schedule command in ${e}`,clickTargetId:"sched-toggle"}];return b&&p.push({label:"View All Agents",meta:"Running agents",href:"/agents"}),`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>tmux: ${i(e)}</title>
<style>
  ${w(s.shell)}
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
  header .ext-btn,
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
  header .ext-btn:hover,
  header .theme-switcher-btn:hover,
  header .cmdbar-btn:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .header-icon-btn:focus-visible,
  header .notes-btn:focus-visible,
  header .sched-btn:focus-visible,
  header .ext-btn:focus-visible,
  header .theme-switcher-btn:focus-visible,
  header .cmdbar-btn:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  .header-icon-btn svg,
  header .notes-btn svg,
  header .sched-btn svg,
  header .ext-btn svg,
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
  ${o?H():""}
  ${v()}
  ${k()}
  ${D()}
  ${M()}
  ${C()}
  ${_()}
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
  <div class="brand"><a href="/" aria-label="Go to home">tmux<span>-weblink</span></a></div>
  <span class="session">${i(e)}</span>
  ${o?z("Sessions"):""}
  <button class="notes-btn" id="notes-toggle" title="Session notes" aria-label="Session notes">
    ${m("notes")}
  </button>
  <button class="sched-btn" id="sched-toggle" title="Schedule command" aria-label="Schedule command">
    ${m("schedule")}
  </button>
  ${r.map(a=>`<button class="ext-btn" id="ext-${a.id}-toggle" title="${c(a.name)}" aria-label="${c(a.name)}">${W(a.id,a.icon)}</button>`).join(`
  `)}
  ${j(s.template)}
  <div class="status">
    <div class="dot" id="status-dot"></div>
    <span id="status-text">connecting</span>
  </div>
</header>
<script>${J()}</script>
<div id="terminal-container" class="terminal-pending"></div>
${B()}
${o?P():""}
${y(`Notes - ${e}`)}
${S(`Scheduler - ${e}`)}
${E(`Windows - ${e}`)}
${I()}
${r.map(a=>U(a)).join(`
`)}
${r.map(a=>X(a)).join(`
`)}

<script type="module">
window.__TMUX_WEB_TERMINAL__ = ${JSON.stringify({sessionName:e,terminal:l,scrollback:u,theme:s.terminal,renderer:f}).replace(/</g,"\\u003c")};
await import('/assets/terminal-client.js');

// ========== NOTES ==========
${$(`session:${e}`)}

// ========== SCHEDULER ==========
${L(e)}

// ========== WINDOWS ==========
${F(e)}

// ========== SESSIONS SIDEBAR ==========
${T(e)}

// ========== WINDOW DEEP-LINK (?window=N) ==========
{
  const wParam = new URLSearchParams(location.search).get('window');
  const wIndex = wParam === null ? NaN : parseInt(wParam, 10);
  if (Number.isInteger(wIndex) && wIndex >= 0) {
    fetch('/api/session/' + encodeURIComponent(${JSON.stringify(e)}) + '/select-window', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ windowIndex: wIndex }),
    }).catch(() => {});
  }
}

// ========== MOBILE TOOLBAR ==========
${O(e)}

// ========== COMMANDBAR ==========
${o?R(d,p,{sessionName:e},g):""}

// ========== NOTES ==========
// (notes and scheduler scripts already included above; extensions below)
</script>

${r.length>0?`<script>
// Extension bootstrap: plain script (not module) so it runs before the module
// awaits terminal-client import, avoiding a race where iframes load during that await.
${r.map(a=>V(a,e)).join(`
`)}
</script>`:""}
</body>
</html>`}export{re as renderTerminal};
