import { closeOtherDrawersExcept, wrapDrawerScript } from './drawer-script.js';
import { drawerResizeCSS, drawerResizeHandleHTML, drawerResizeScript } from './drawer-resize.js';
import { escapeHtml } from './html.js';

export function windowsDrawerCSS(): string {
	return `
  #windows-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  #windows-backdrop.open { opacity: 1; pointer-events: auto; }
  #windows-drawer {
    position: fixed; right: 0; top: 0; height: 100%; width: 360px; z-index: 1000;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.25s ease;
  }
  #windows-drawer.open { transform: translateX(0); }
  ${drawerResizeCSS()}
  header .windows-btn {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
  }
  header .windows-btn:hover { color: var(--panel-accent); }
  header .windows-btn svg { width: 15px; height: 15px; fill: currentColor; }
  #windows-error {
    padding: 8px 16px; font-size: 11px; color: #cc6666;
    font-family: 'JetBrains Mono', monospace; flex-shrink: 0;
    border-bottom: 1px solid var(--panel-border);
    display: none;
  }
  #windows-error.show { display: block; }
  #windows-list {
    flex: 1; overflow-y: auto; padding: 8px 0;
    scrollbar-width: thin;
    scrollbar-color: var(--panel-border) transparent;
  }
  #windows-list::-webkit-scrollbar { width: 4px; }
  #windows-list::-webkit-scrollbar-track { background: transparent; }
  #windows-list::-webkit-scrollbar-thumb {
    background: var(--panel-border); border-radius: 2px;
  }
  #windows-list::-webkit-scrollbar-thumb:hover { background: var(--panel-muted); }
  .windows-row {
    display: flex; align-items: center; gap: 10px;
    width: 100%; min-height: 48px; padding: 12px 16px;
    background: none; border: none; border-bottom: 1px solid rgba(36, 50, 65, 0.5);
    color: var(--page-fg); cursor: pointer; text-align: left;
    font-family: 'JetBrains Mono', monospace; transition: background 0.15s;
  }
  .windows-row:last-child { border-bottom: none; }
  .windows-row:not(.is-active):hover { background: rgba(125, 211, 252, 0.06); }
  .windows-row.is-active { cursor: default; opacity: 0.85; }
  .windows-row-index {
    font-size: 12px; color: var(--panel-muted); flex-shrink: 0; min-width: 24px;
  }
  .windows-row-name {
    flex: 1; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .windows-row-edit {
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: none; border: none; padding: 4px; border-radius: 4px;
    color: var(--panel-muted); cursor: pointer; opacity: 0;
    transition: opacity 0.15s, color 0.15s;
  }
  .windows-row:hover .windows-row-edit, .windows-row-edit:focus-visible { opacity: 1; }
  .windows-row-edit:hover { color: var(--panel-accent); }
  .windows-row-edit svg { width: 14px; height: 14px; fill: currentColor; display: block; }
  .windows-row-input {
    flex: 1; min-width: 0; font-family: 'JetBrains Mono', monospace; font-size: 14px;
    background: var(--page-bg); color: var(--page-fg);
    border: 1px solid var(--panel-accent); border-radius: 4px;
    padding: 4px 8px; outline: none;
  }
  .windows-row-badge {
    font-size: 10px; color: var(--panel-success); text-transform: uppercase;
    letter-spacing: 0.08em; flex-shrink: 0;
  }
  .windows-empty {
    padding: 24px 16px; text-align: center; color: var(--panel-muted);
    font-size: 12px; font-family: 'JetBrains Mono', monospace;
  }
  #windows-new-btn {
    display: flex; align-items: center; gap: 4px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 2px 8px; border-radius: 4px; font-size: 18px; line-height: 1;
    transition: color 0.15s;
  }
  #windows-new-btn:hover { color: var(--panel-accent); }
  @media (max-width: 560px) {
    #windows-drawer { width: min(100vw - 16px, 400px); }
    .windows-row { min-height: 52px; padding: 14px 16px; }
    .windows-row-name { font-size: 15px; }
    .windows-row-edit { opacity: 0.6; }
  }`;
}

export function windowsDrawerHTML(title: string): string {
	return `
<div id="windows-backdrop"></div>
<div id="windows-drawer" class="resizable-drawer">
  ${drawerResizeHandleHTML()}
  <div class="drawer-header">
    <span>${escapeHtml(title)}</span>
    <button id="windows-new-btn" title="New window">+</button>
    <button id="windows-close">&times;</button>
  </div>
  <div id="windows-error"></div>
  <div id="windows-list"></div>
</div>`;
}

export function windowsDrawerScript(sessionName: string): string {
	return wrapDrawerScript('windows', `
${drawerResizeScript('windows-drawer', 'tmux-web:drawer-width:windows', 360)}
const WIN_SESSION = ${JSON.stringify(sessionName)};
const windowsDrawer = document.getElementById('windows-drawer');
const windowsBackdrop = document.getElementById('windows-backdrop');
const windowsList = document.getElementById('windows-list');
const windowsError = document.getElementById('windows-error');
let windowsRefreshInterval = null;
let editingWindow = false;

const PENCIL_PATH = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';

function makeEditIcon() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'windows-row-edit';
  btn.title = 'Rename window';
  btn.setAttribute('aria-label', 'Rename window');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PENCIL_PATH);
  svg.appendChild(path);
  btn.appendChild(svg);
  return btn;
}

function showWindowsError(msg) {
  windowsError.textContent = msg;
  windowsError.classList.add('show');
}

function clearWindowsError() {
  windowsError.textContent = '';
  windowsError.classList.remove('show');
}

function clearWinList(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

async function fetchWinList() {
  try {
    const res = await fetch('/api/session/' + encodeURIComponent(WIN_SESSION) + '/windows');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function renderWindowsList(windows) {
  clearWinList(windowsList);
  if (!windows.length) {
    windowsList.appendChild(Object.assign(document.createElement('div'), {
      className: 'windows-empty',
      textContent: 'No windows in this session',
    }));
    return;
  }
  for (const w of windows) {
    const row = document.createElement('div');
    row.className = 'windows-row' + (w.active ? ' is-active' : '');

    const idx = document.createElement('span');
    idx.className = 'windows-row-index';
    idx.textContent = String(w.index);

    const name = document.createElement('span');
    name.className = 'windows-row-name';
    name.textContent = w.label || w.name;

    row.appendChild(idx);
    row.appendChild(name);

    const edit = makeEditIcon();
    edit.addEventListener('click', (e) => {
      e.stopPropagation();
      startWindowRename(w, name);
    });
    row.appendChild(edit);

    if (w.active) {
      const badge = document.createElement('span');
      badge.className = 'windows-row-badge';
      badge.textContent = 'current';
      row.appendChild(badge);
    } else {
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.addEventListener('click', () => selectWindow(w.index));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectWindow(w.index); }
      });
    }

    windowsList.appendChild(row);
  }
}

function startWindowRename(win, nameEl) {
  const row = nameEl.parentNode;
  if (!row || row.querySelector('.windows-row-input')) return;
  editingWindow = true;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'windows-row-input';
  input.value = win.name || '';
  input.placeholder = win.name || 'window name';

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    editingWindow = false;
    const newName = input.value.trim();
    if (save && newName && newName !== win.name) {
      try {
        const res = await fetch(
          '/api/session/' + encodeURIComponent(WIN_SESSION) + '/rename-window',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ windowIndex: win.index, name: newName }),
          },
        );
        if (res.ok) {
          win.name = newName;
          clearWindowsError();
        } else {
          const data = await res.json().catch(() => ({}));
          showWindowsError(data.error || 'Failed to rename window');
        }
      } catch {
        showWindowsError('Failed to rename window');
      }
    }
    nameEl.textContent = win.label || win.name;
    input.replaceWith(nameEl);
  };

  // Keep clicks/keys local so the row's switch handler and the drawer's global
  // Escape-to-close don't fire while editing.
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); void finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); void finish(false); }
  });
  input.addEventListener('blur', () => { void finish(true); });

  nameEl.replaceWith(input);
  input.focus();
  input.select();
}

async function selectWindow(windowIndex) {
  clearWindowsError();
  try {
    const res = await fetch(
      '/api/session/' + encodeURIComponent(WIN_SESSION) + '/select-window',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowIndex }),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showWindowsError(data.error || 'Failed to switch window');
      return;
    }
    closeWindowsDrawer();
  } catch {
    showWindowsError('Failed to switch window');
  }
}

function startWindowsRefresh() {
  stopWindowsRefresh();
  windowsRefreshInterval = setInterval(async () => {
    if (!windowsDrawer.classList.contains('open') || editingWindow) return;
    renderWindowsList(await fetchWinList());
  }, 2500);
}

function stopWindowsRefresh() {
  if (windowsRefreshInterval) {
    clearInterval(windowsRefreshInterval);
    windowsRefreshInterval = null;
  }
}

async function openWindowsDrawer() {
  ${closeOtherDrawersExcept('windows')}
  clearWindowsError();
  windowsDrawer.classList.add('open');
  windowsBackdrop.classList.add('open');
  renderWindowsList(await fetchWinList());
  startWindowsRefresh();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') !== 'windows') {
    url.searchParams.set('tab', 'windows');
    history.pushState({ windowsOpen: true }, '', url);
  }
}

function closeWindowsDrawer() {
  windowsDrawer.classList.remove('open');
  windowsBackdrop.classList.remove('open');
  stopWindowsRefresh();
  clearWindowsError();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') === 'windows') {
    url.searchParams.delete('tab');
    history.pushState({}, '', url);
  }
}

document.getElementById('windows-new-btn').addEventListener('click', async () => {
  clearWindowsError();
  try {
    const res = await fetch(
      '/api/session/' + encodeURIComponent(WIN_SESSION) + '/new-window',
      { method: 'POST' },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showWindowsError(data.error || 'Failed to create window');
      return;
    }
    renderWindowsList(await fetchWinList());
  } catch {
    showWindowsError('Failed to create window');
  }
});

document.getElementById('windows-toggle').addEventListener('click', () => {
  if (windowsDrawer.classList.contains('open')) closeWindowsDrawer();
  else openWindowsDrawer();
});
document.getElementById('windows-close').addEventListener('click', closeWindowsDrawer);
windowsBackdrop.addEventListener('click', closeWindowsDrawer);

// A tmux-side window switch (pushed over the terminal WebSocket) re-renders the
// list so the 'current' highlight tracks tmux. Re-fetch rather than trust the
// pushed payload so custom labels stay merged. Only when the drawer is open.
window.addEventListener('tmux:windows', async () => {
  if (windowsDrawer.classList.contains('open') && !editingWindow) {
    renderWindowsList(await fetchWinList());
  }
});

window.addEventListener('popstate', () => {
  const tab = new URLSearchParams(location.search).get('tab');
  if (tab === 'windows') openWindowsDrawer();
  else closeWindowsDrawer();
});

if (new URLSearchParams(location.search).get('tab') === 'windows') openWindowsDrawer();`, 'closeWindowsDrawer');
}
