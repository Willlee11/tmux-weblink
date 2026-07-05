import { commandbarButtonHTML } from './commandbar.js';
import { escapeHtml } from './html.js';

export type ActivePage = 'home' | 'notes' | 'schedule' | 'agents' | 'history' | 'quickCommands';

type ThemeOption = { id: string; name: string; dot: string };

const THEME_OPTIONS: ThemeOption[] = [
	{ id: 'vscode', name: 'VS Code', dot: '#007acc' },
	{ id: 'ghostty', name: 'Ghostty', dot: '#ff5f00' },
	{ id: 'warm-clay', name: 'Warm Clay', dot: '#b86b52' },
	{ id: 'dark-cove', name: 'Dark Cove', dot: '#7aa2f7' },
];

function focusRing(accent = 'var(--panel-accent)'): string {
	return `box-shadow: 0 0 0 2px ${accent}; outline: none;`;
}

/** Reduced-motion helper: disables transform transitions. */
function reducedMotion(extra = ''): string {
	return `
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
    ${extra}
  }`;
}

/** HTML for the theme switcher popover trigger (used in fixed header + terminal header). */
export function themeSwitcherButtonHTML(currentTemplate: string = 'vscode'): string {
	const current = THEME_OPTIONS.find((o) => o.id === currentTemplate) ?? THEME_OPTIONS[0];
	const options = THEME_OPTIONS.map((o) => {
		const active = o.id === currentTemplate;
		return `<button type="button" class="theme-option${active ? ' active' : ''}" data-theme="${o.id}" role="menuitem">
      <span class="theme-dot" style="background:${o.dot}"></span>
      ${escapeHtml(o.name)}
      ${active ? '<svg class="theme-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
    </button>`;
	}).join('\n');
	return `<div class="theme-switcher" id="theme-switcher">
    <button type="button" class="theme-switcher-btn" aria-label="Theme" aria-haspopup="true" aria-expanded="false">
      <span class="theme-dot" style="background:${current.dot}"></span>
      <span>${escapeHtml(current.name)}</span>
    </button>
    <div class="theme-switcher-popover" role="menu">
      ${options}
    </div>
  </div>`;
}

/** Inline JS IIFE that opens the theme popover, POSTs a selection, and reloads. */
export function themeSwitcherScript(): string {
	return `(function() {
  const switcher = document.getElementById('theme-switcher');
  if (!switcher) return;
  const btn = switcher.querySelector('.theme-switcher-btn');
  const popover = switcher.querySelector('.theme-switcher-popover');
  function close() { switcher.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  function open() { switcher.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    switcher.classList.contains('open') ? close() : open();
  });
  popover.addEventListener('click', async (e) => {
    const opt = e.target.closest('.theme-option');
    if (!opt) return;
    const theme = opt.dataset.theme;
    try {
      await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });
      location.reload();
    } catch {}
  });
  document.addEventListener('click', (e) => {
    if (switcher.classList.contains('open') && !switcher.contains(e.target)) close();
  });
})();`;
}

/** Base CSS for the fixed header, two-column layout, sidebar, and new-session modal. */
export function sharedLayoutCSS(extraCSS = ''): string {
	return `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: var(--font-sans); margin: 0; padding: 0; }

  /* ── Fixed header ── */
  .fixed-header {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--panel-border);
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 16px; height: 56px;
  }
  .fixed-header .brand {
    font-size: var(--text-base); font-weight: 600; letter-spacing: -0.01em; color: var(--page-fg);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fixed-header .brand span { color: var(--panel-accent); font-weight: 500; }
  .header-actions { display: flex; align-items: center; gap: 4px; }
  .header-btn, .icon-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    min-width: 44px; min-height: 44px; padding: 8px 12px; border-radius: 10px;
    transition: color 0.15s, background 0.15s;
    font-size: var(--text-sm); text-decoration: none;
  }
  .header-btn:hover, .icon-btn:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .header-btn:focus-visible, .icon-btn:focus-visible { ${focusRing()} }
  .header-btn svg, .icon-btn svg { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }

  /* ── Theme switcher popover ── */
  .theme-switcher { position: relative; }
  .theme-switcher-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    min-width: 44px; min-height: 44px; padding: 8px 12px; border-radius: 10px;
    transition: color 0.15s, background 0.15s;
    font-size: var(--text-sm); text-decoration: none; font-family: inherit;
  }
  .theme-switcher-btn:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .theme-switcher-btn:focus-visible { ${focusRing()} }
  .theme-switcher-btn svg { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }
  .theme-switcher-popover {
    position: absolute; top: calc(100% + 6px); right: 0;
    min-width: 180px; max-width: calc(100vw - 24px);
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 6px;
    display: none; z-index: 300;
  }
  .theme-switcher.open .theme-switcher-popover { display: block; }
  .theme-option {
    display: flex; align-items: center; gap: 10px; width: 100%;
    min-height: 44px; padding: 10px 12px; border-radius: 8px; border: none; background: none;
    color: var(--page-fg); font-size: var(--text-sm); cursor: pointer; text-align: left; font-family: inherit;
  }
  .theme-option:hover { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); color: var(--panel-accent); }
  .theme-option:focus-visible { ${focusRing()} }
  .theme-option.active { color: var(--panel-accent); font-weight: 500; }
  .theme-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .theme-check { width: 16px; height: 16px; margin-left: auto; color: var(--panel-accent); }

  /* ── Page layout ── */
  .page-wrap { padding-top: 56px; }
  .page-layout {
    display: flex; gap: 24px; max-width: 1120px; margin: 0 auto; padding: 24px 16px;
    align-items: flex-start;
  }

  /* ── Main content panel ── */
  .main-panel { flex: 1; min-width: 0; }

  /* ── Action sidebar ── */
  .action-sidebar {
    flex: 0 0 220px; max-width: 220px; min-width: 180px;
    margin-right: 0; position: sticky; top: 80px;
  }
  .sidebar-label {
    font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--panel-muted); margin: 0 0 12px 4px; font-weight: 500;
  }
  .sidebar-btn {
    display: flex; align-items: center; gap: 12px;
    width: 100%; min-height: 44px;
    padding: 10px 14px; border: 1px solid transparent; border-radius: 12px;
    background: transparent; color: var(--page-fg); cursor: pointer;
    font-size: var(--text-sm); font-family: inherit; text-decoration: none;
    transition: background 0.15s, color 0.15s; margin-bottom: 4px;
    text-align: left;
  }
  .sidebar-btn:hover { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); color: var(--panel-accent); }
  .sidebar-btn:focus-visible { ${focusRing()} }
  .sidebar-btn.primary {
    background: var(--panel-accent); border-color: var(--panel-accent); color: #fff;
    font-weight: 500; margin-bottom: 16px; justify-content: center;
  }
  .sidebar-btn.primary:hover { opacity: 0.9; }
  .sidebar-btn.current {
    background: color-mix(in srgb, var(--panel-accent) 8%, transparent); color: var(--panel-accent);
    font-weight: 500; cursor: default; pointer-events: none;
  }
  .sidebar-btn svg { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }
  .sidebar-divider { border: none; border-top: 1px solid var(--panel-border); margin: 14px 0; }

  /* ── New session modal ── */
  .modal-backdrop {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.3);
    z-index: 500; align-items: center; justify-content: center;
    padding: 16px;
  }
  .modal-backdrop.open { display: flex; }
  .modal-panel {
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 20px; padding: 24px; width: 100%; max-width: 440px;
  }
  .modal-panel h2 { font-size: var(--text-lg); font-weight: 600; margin: 0 0 20px; color: var(--page-fg); }
  .modal-field { margin-bottom: 18px; position: relative; }
  .modal-field label { display: block; font-size: var(--text-sm); font-weight: 500; color: var(--page-fg); margin-bottom: 8px; }
  .modal-field input {
    width: 100%; padding: 13px 15px; background: var(--page-bg);
    border: 1px solid var(--panel-border); border-radius: 14px;
    color: var(--page-fg); font-size: var(--text-base); font-family: inherit;
    outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .modal-field input:focus { border-color: var(--panel-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  /* Custom directory autocomplete dropdown (replaces native <datalist>) */
  .modal-dropdown {
    display: none; position: absolute; left: 0; right: 0; top: 100%;
    margin-top: 4px; max-height: 220px; overflow-y: auto; z-index: 10;
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  }
  .modal-dropdown.open { display: block; }
  .modal-dropdown-item {
    display: flex; align-items: center;
    min-height: 44px; padding: 10px 14px; font-size: var(--text-sm); color: var(--page-fg); cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .modal-dropdown-item:hover, .modal-dropdown-item.active, .modal-dropdown-item:focus-visible {
    background: color-mix(in srgb, var(--panel-accent) 8%, transparent); color: var(--panel-accent);
  }
  .modal-dropdown-item:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--panel-accent); }
  .modal-error { font-size: var(--text-sm); color: #b91c1c; margin-bottom: 12px; display: none; }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
  .modal-btn {
    min-height: 44px; padding: 10px 20px; border-radius: 12px; font-size: var(--text-sm); font-family: inherit;
    cursor: pointer; border: 1px solid var(--panel-border); background: var(--panel-bg);
    color: var(--page-fg); transition: opacity 0.15s;
  }
  .modal-btn:hover { opacity: 0.85; }
  .modal-btn:focus-visible { ${focusRing()} }
  .modal-btn.confirm {
    background: var(--panel-accent); border-color: var(--panel-accent);
    color: #fff; font-weight: 500;
  }
  .modal-btn.confirm:hover { opacity: 0.9; }

  /* ── Mobile ── */
  @media (max-width: 767px) {
    .page-layout { flex-direction: column; padding: 16px; gap: 0; }
    .action-sidebar { max-width: 100%; min-width: 0; width: 100%; margin-right: 0; position: static; order: -1; }
    .sidebar-label { display: none; }
    .sidebar-btn { justify-content: center; }
    .fixed-header { padding: 0 12px; }
    .header-btn span,
    .theme-switcher-btn span { display: none; }
    .header-btn, .theme-switcher-btn { padding: 8px; }
  }

  ${reducedMotion()}
  ${extraCSS}`;
}

/** Fixed header HTML. Title defaults to "TMUX Sessions". */
export function sharedHeader(opts: {
	commandbarEnabled: boolean;
	title?: string;
	themeTemplate?: string;
}): string {
	const { commandbarEnabled, title = 'TMUX Sessions', themeTemplate = 'vscode' } = opts;
	return `<script>
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
  <div class="brand">tmux<span>-weblink</span></div>
  <div class="header-actions">
    ${commandbarEnabled ? commandbarButtonHTML('Search') : ''}
    <button class="header-btn" id="notes-toggle" title="Global notes">
      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>
      <span>Notes</span>
    </button>
    ${themeSwitcherButtonHTML(themeTemplate)}
    <a class="header-btn" href="/settings" title="Settings">
      <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
      <span>Settings</span>
    </a>
  </div>
</header>
<script>${themeSwitcherScript()}</script>`;
}

/** Sidebar HTML with the current page indicated and agents link conditional. */
export function sharedSidebar(opts: {
	activePage: ActivePage;
	agentsEnabled: boolean;
	refreshHref: string;
}): string {
	const { activePage, agentsEnabled, refreshHref } = opts;

	function btn(page: ActivePage | null, href: string, icon: string, label: string, extra = '') {
		const isCurrent = page !== null && page === activePage;
		const cls = isCurrent ? 'sidebar-btn current' : 'sidebar-btn';
		return `<a href="${href}" class="${cls}"${extra}>
        <svg viewBox="0 0 24 24">${icon}</svg>
        ${label}
      </a>`;
	}

	const sessionsIcon = '<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>';
	const notesIcon = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/>';
	const scheduleIcon = '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>';
	const agentsIcon = '<path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2zm0 12c-5.33 0-8 2.67-8 4v2h16v-2c0-1.33-2.67-4-8-4z"/>';
	const historyIcon = '<path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.97 8.97 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>';
	const quickCommandsIcon = '<path d="M13 3 4 14h7l-1 7 9-11h-7l1-7z"/>';
	const refreshIcon = '<path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>';

	return `<aside class="action-sidebar">
      <p class="sidebar-label">Actions</p>
      <button class="sidebar-btn primary" id="new-session-btn">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        New Session
      </button>
      <hr class="sidebar-divider">
      ${btn('home', '/', sessionsIcon, 'Sessions')}
      ${btn('notes', '/notes', notesIcon, 'All Notes')}
      ${btn('schedule', '/schedule', scheduleIcon, 'Scheduled')}
      ${btn('history', '/history', historyIcon, 'History')}
      ${btn('quickCommands', '/quick-commands', quickCommandsIcon, 'Quick Commands')}
      ${agentsEnabled ? btn('agents', '/agents', agentsIcon, 'All Agents') : ''}
      <hr class="sidebar-divider">
      <a href="${refreshHref}" class="sidebar-btn">
        <svg viewBox="0 0 24 24">${refreshIcon}</svg>
        Refresh
      </a>
    </aside>`;
}

/** New session modal HTML (hidden by default). */
export function newSessionModalHTML(): string {
	return `<div class="modal-backdrop" id="new-session-modal" role="dialog" aria-modal="true" aria-label="Create new tmux session">
  <div class="modal-panel">
    <h2>New Session</h2>
    <div class="modal-field">
      <label for="ns-name">Session name</label>
      <input type="text" id="ns-name" placeholder="e.g. myproject" autocomplete="off" spellcheck="false" />
    </div>
    <div class="modal-field">
      <label for="ns-dir">Start directory</label>
      <input type="text" id="ns-dir" placeholder="~" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ns-dir-list" />
      <div class="modal-dropdown" id="ns-dir-list" role="listbox"></div>
    </div>
    <p class="modal-error" id="ns-error"></p>
    <div class="modal-actions">
      <button class="modal-btn" id="ns-cancel">Cancel</button>
      <button class="modal-btn confirm" id="ns-submit">Create</button>
    </div>
  </div>
</div>`;
}

/** Inline JS IIFE for the new session modal. */
export function newSessionModalScript(): string {
	return `(function() {
  const modal = document.getElementById('new-session-modal');
  const openBtn = document.getElementById('new-session-btn');
  const cancelBtn = document.getElementById('ns-cancel');
  const submitBtn = document.getElementById('ns-submit');
  const nameInput = document.getElementById('ns-name');
  const dirInput = document.getElementById('ns-dir');
  const dirList = document.getElementById('ns-dir-list');
  const errorEl = document.getElementById('ns-error');

  function openModal() {
    modal.classList.add('open');
    nameInput.value = '';
    dirInput.value = '';
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    closeDropdown();
    setTimeout(() => nameInput.focus(), 50);
  }

  function closeModal() { modal.classList.remove('open'); }

  openBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

  let debounceTimer = null;
  let activeIdx = -1;

  function closeDropdown() {
    dirList.classList.remove('open');
    dirList.innerHTML = '';
    activeIdx = -1;
    dirInput.setAttribute('aria-expanded', 'false');
  }

  function setActive(idx) {
    const items = dirList.querySelectorAll('.modal-dropdown-item');
    if (!items.length) return;
    activeIdx = (idx + items.length) % items.length;
    items.forEach((it, i) => it.classList.toggle('active', i === activeIdx));
    items[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  function renderDropdown(dirs) {
    dirList.innerHTML = '';
    activeIdx = -1;
    if (!dirs.length) { closeDropdown(); return; }
    for (const d of dirs) {
      const item = document.createElement('div');
      item.className = 'modal-dropdown-item';
      item.setAttribute('role', 'option');
      item.textContent = d;
      // mousedown (not click) so the input doesn't blur before we read the value
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dirInput.value = d;
        closeDropdown();
        dirInput.focus();
      });
      dirList.appendChild(item);
    }
    dirList.classList.add('open');
    dirInput.setAttribute('aria-expanded', 'true');
  }

  dirInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = dirInput.value.trim();
    if (!val) { closeDropdown(); return; }
    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/fs/list?path=' + encodeURIComponent(val));
        const data = await res.json();
        renderDropdown(data.dirs || []);
      } catch { closeDropdown(); }
    }, 200);
  });

  dirInput.addEventListener('blur', () => { setTimeout(closeDropdown, 120); });

  async function submit() {
    const name = nameInput.value.trim();
    const dir = dirInput.value.trim();
    if (!name) { showError('Session name is required.'); nameInput.focus(); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';
    errorEl.style.display = 'none';
    try {
      const res = await fetch('/api/sessions/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dir: dir || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Failed to create session.'); return; }
      window.location.href = '/s/' + encodeURIComponent(name);
    } catch { showError('Network error. Please try again.'); }
    finally { submitBtn.disabled = false; submitBtn.textContent = 'Create'; }
  }

  function showError(msg) { errorEl.textContent = msg; errorEl.style.display = 'block'; }

  submitBtn.addEventListener('click', submit);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') dirInput.focus(); });
  dirInput.addEventListener('keydown', (e) => {
    const open = dirList.classList.contains('open');
    const items = dirList.querySelectorAll('.modal-dropdown-item');
    if (open && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDropdown(); return; }
      if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        dirInput.value = items[activeIdx].textContent;
        closeDropdown();
        return;
      }
    }
    if (e.key === 'Enter') submit();
  });
})();`;
}
