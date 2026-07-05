import { commandbarButtonHTML } from './commandbar.js';

export type ActivePage = 'home' | 'notes' | 'schedule' | 'agents' | 'history' | 'quickCommands';

type ThemeOption = { id: string; name: string; dot: string };

const THEME_OPTIONS: ThemeOption[] = [
	{ id: 'vscode', name: 'VS Code', dot: '#007acc' },
	{ id: 'ghostty', name: 'Ghostty', dot: '#ff5f00' },
	{ id: 'warm-clay', name: 'Warm Clay', dot: '#b86b52' },
	{ id: 'dark-cove', name: 'Dark Cove', dot: '#7aa2f7' },
];

/** Base CSS for the fixed header, two-column layout, sidebar, and new-session modal. */
export function sharedLayoutCSS(extraCSS = ''): string {
	return `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: 'Inter', system-ui, -apple-system, sans-serif; margin: 0; padding: 0; }

  /* ── Fixed header ── */
  .fixed-header {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--panel-border);
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 24px; height: 64px;
  }
  .fixed-header .brand {
    font-size: 16px; font-weight: 600; letter-spacing: -0.01em; color: var(--page-fg);
  }
  .fixed-header .brand span { color: var(--panel-accent); font-weight: 500; }
  .header-actions { display: flex; align-items: center; gap: 8px; }
  .header-btn, .icon-btn {
    display: flex; align-items: center; gap: 6px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 8px 12px; border-radius: 10px; transition: color 0.15s, background 0.15s;
    font-size: 13px; text-decoration: none;
  }
  .header-btn:hover, .icon-btn:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .header-btn svg, .icon-btn svg { width: 16px; height: 16px; fill: currentColor; flex-shrink: 0; }

  /* ── Theme switcher popover ── */
  .theme-switcher { position: relative; }
  .theme-switcher-btn {
    display: flex; align-items: center; gap: 6px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    padding: 8px 12px; border-radius: 10px; transition: color 0.15s, background 0.15s;
    font-size: 13px; text-decoration: none; font-family: inherit;
  }
  .theme-switcher-btn:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .theme-switcher-btn svg { width: 16px; height: 16px; fill: currentColor; flex-shrink: 0; }
  .theme-switcher-popover {
    position: absolute; top: calc(100% + 8px); right: 0;
    min-width: 170px; background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 6px;
    display: none; z-index: 300;
  }
  .theme-switcher.open .theme-switcher-popover { display: block; }
  .theme-option {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 8px 10px; border-radius: 8px; border: none; background: none;
    color: var(--page-fg); font-size: 13px; cursor: pointer; text-align: left; font-family: inherit;
  }
  .theme-option:hover { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); color: var(--panel-accent); }
  .theme-option.active { color: var(--panel-accent); font-weight: 500; }
  .theme-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .theme-check { width: 14px; height: 14px; margin-left: auto; color: var(--panel-accent); }

  /* ── Page layout ── */
  .page-wrap { padding-top: 64px; }
  .page-layout {
    display: flex; gap: 40px; max-width: 1120px; margin: 0 auto; padding: 32px 24px;
    align-items: flex-start;
  }

  /* ── Main content panel ── */
  .main-panel { flex: 2; min-width: 0; }

  /* ── Action sidebar ── */
  .action-sidebar {
    flex: 1; max-width: 240px; min-width: 180px;
    margin-right: 0; position: sticky; top: 88px;
  }
  .sidebar-label {
    font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--panel-muted); margin: 0 0 12px 4px; font-weight: 500;
  }
  .sidebar-btn {
    display: flex; align-items: center; gap: 12px;
    width: 100%;
    padding: 11px 14px; border: 1px solid transparent; border-radius: 12px;
    background: transparent; color: var(--page-fg); cursor: pointer;
    font-size: 14px; font-family: inherit; text-decoration: none;
    transition: background 0.15s, color 0.15s; margin-bottom: 4px;
    text-align: left;
  }
  .sidebar-btn:hover { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); color: var(--panel-accent); }
  .sidebar-btn.primary {
    background: var(--panel-accent); border-color: var(--panel-accent); color: #fff;
    font-weight: 500; margin-bottom: 16px;
  }
  .sidebar-btn.primary:hover { opacity: 0.9; }
  .sidebar-btn.current {
    background: color-mix(in srgb, var(--panel-accent) 8%, transparent); color: var(--panel-accent);
    font-weight: 500; cursor: default; pointer-events: none;
  }
  .sidebar-btn svg { width: 16px; height: 16px; fill: currentColor; flex-shrink: 0; }
  .sidebar-divider { border: none; border-top: 1px solid var(--panel-border); margin: 14px 0; }

  /* ── New session modal ── */
  .modal-backdrop {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.3);
    z-index: 500; align-items: center; justify-content: center;
  }
  .modal-backdrop.open { display: flex; }
  .modal-panel {
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 20px; padding: 32px; width: 100%; max-width: 440px;
    margin: 0 16px;
  }
  .modal-panel h2 { font-size: 20px; font-weight: 600; margin: 0 0 24px; color: var(--page-fg); }
  .modal-field { margin-bottom: 20px; position: relative; }
  .modal-field label { display: block; font-size: 13px; font-weight: 500; color: var(--page-fg); margin-bottom: 8px; }
  .modal-field input {
    width: 100%; padding: 13px 15px; background: var(--page-bg);
    border: 1px solid var(--panel-border); border-radius: 14px;
    color: var(--page-fg); font-size: 15px; font-family: inherit;
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
    padding: 9px 14px; font-size: 13px; color: var(--page-fg); cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .modal-dropdown-item:hover, .modal-dropdown-item.active {
    background: color-mix(in srgb, var(--panel-accent) 8%, transparent); color: var(--panel-accent);
  }
  .modal-error { font-size: 13px; color: #b91c1c; margin-bottom: 12px; display: none; }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
  .modal-btn {
    padding: 11px 20px; border-radius: 12px; font-size: 14px; font-family: inherit;
    cursor: pointer; border: 1px solid var(--panel-border); background: var(--panel-bg);
    color: var(--page-fg); transition: opacity 0.15s;
  }
  .modal-btn:hover { opacity: 0.85; }
  .modal-btn.confirm {
    background: var(--panel-accent); border-color: var(--panel-accent);
    color: #fff; font-weight: 500;
  }
  .modal-btn.confirm:hover { opacity: 0.9; }

  /* ── Mobile ── */
  @media (max-width: 767px) {
    .page-layout { flex-direction: column; padding: 20px 16px; gap: 0; }
    .action-sidebar { max-width: 100%; min-width: 0; width: 100%; margin-right: 0; position: static; order: -1; }
    .fixed-header { padding: 0 16px; }
    .header-btn span,
    .theme-switcher-btn span { display: none; }
  }

  ${extraCSS}`;
}

function themeSwitcherOptionsHTML(activeTemplate: string): string {
	return THEME_OPTIONS.map((t) => {
		const active = t.id === activeTemplate ? ' active' : '';
		const check = t.id === activeTemplate
			? '<svg class="theme-check" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
			: '<svg class="theme-check" viewBox="0 0 24 24"></svg>';
		return `<button type="button" class="theme-option${active}" data-theme="${t.id}">
	      <span class="theme-dot" style="background:${t.dot}"></span>
	      <span>${t.name}</span>
	      ${check}
	    </button>`;
	}).join('\n');
}

/** Standalone theme-switcher button + popover HTML. */
export function themeSwitcherButtonHTML(activeTemplate: string): string {
	return `<div class="theme-switcher" id="theme-switcher">
  <button type="button" class="theme-switcher-btn" id="theme-switcher-btn" title="Switch theme">
    <svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
    <span>Theme</span>
  </button>
  <div class="theme-switcher-popover">
    ${themeSwitcherOptionsHTML(activeTemplate)}
  </div>
</div>`;
}

/** Inline IIFE to power the theme switcher. */
export function themeSwitcherScript(): string {
	return `(function() {
  const wrapper = document.getElementById('theme-switcher');
  const btn = document.getElementById('theme-switcher-btn');
  if (!wrapper || !btn) return;
  function closeOnOutside(e) { if (!wrapper.contains(e.target)) wrapper.classList.remove('open'); }
  btn.addEventListener('click', (e) => { e.stopPropagation(); wrapper.classList.toggle('open'); });
  document.addEventListener('click', closeOnOutside);
  wrapper.querySelectorAll('.theme-option').forEach((opt) => {
    opt.addEventListener('click', async () => {
      const template = opt.getAttribute('data-theme');
      if (!template || opt.classList.contains('active')) {
        wrapper.classList.remove('open');
        return;
      }
      try {
        const token = localStorage.getItem('tmux-web-token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch('/api/theme', {
          method: 'POST',
          headers,
          body: JSON.stringify({ template }),
        });
        if (res.ok) location.reload();
      } catch {}
      wrapper.classList.remove('open');
    });
  });
})();`;
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
