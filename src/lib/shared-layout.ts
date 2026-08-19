import { escapeHtml } from './html.js';
import { icon, iconPath } from './icons.js';

export type ActivePage = 'home' | 'notes' | 'history' | 'quickCommands' | 'files';

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
export function reducedMotion(extra = ''): string {
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
      ${active ? icon('check', 'class="theme-check" aria-hidden="true"') : ''}
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
        body: JSON.stringify({ template: theme }),
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
  .fixed-header .brand a { color: inherit; text-decoration: none; }
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
    background: var(--panel-accent); border-color: var(--panel-accent); color: var(--panel-accent-on);
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
    color: var(--panel-accent-on); font-weight: 500;
  }
  .modal-btn.confirm:hover { opacity: 0.9; }

  /* ── Mobile ── */
  @media (max-width: 560px) {
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
	title?: string;
	themeTemplate?: string;
}): string {
	const { title = 'TMUX Sessions', themeTemplate = 'vscode' } = opts;
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
  <div class="brand"><a href="/" aria-label="Go to home">tmux<span>-weblink</span></a></div>
  <div class="header-actions">
    <button class="header-btn" id="notes-toggle" title="Global notes" aria-label="Global notes">
      ${icon('notes')}
      <span>Notes</span>
    </button>
    ${themeSwitcherButtonHTML(themeTemplate)}
    <a class="header-btn" href="/settings" title="Settings">
      ${icon('settings')}
      <span>Settings</span>
    </a>
  </div>
</header>
<script>${themeSwitcherScript()}</script>`;
}

/** Sidebar HTML with the current page indicated. */
export function sharedSidebar(opts: {
	activePage: ActivePage;
	refreshHref: string;
}): string {
	const { activePage, refreshHref } = opts;

	function btn(page: ActivePage | null, href: string, iconPathString: string, label: string, extra = '') {
		const isCurrent = page !== null && page === activePage;
		const cls = isCurrent ? 'sidebar-btn current' : 'sidebar-btn';
		return `<a href="${href}" class="${cls}"${extra}>
        <svg viewBox="0 0 24 24" fill="currentColor">${iconPathString}</svg>
        ${label}
      </a>`;
	}

	const sessionsIcon = iconPath('sessions');
	const notesIcon = iconPath('notes');
	const historyIcon = iconPath('history');
	const quickCommandsIcon = iconPath('quick-commands');
	const filesIcon = iconPath('file');
	const refreshIcon = iconPath('refresh');

	return `<aside class="action-sidebar">
      <p class="sidebar-label">Actions</p>
      <button class="sidebar-btn primary" id="new-session-btn">
        ${icon('add')}
        New Session
      </button>
      <hr class="sidebar-divider">
      ${btn('home', '/', sessionsIcon, 'Sessions')}
      ${btn('notes', '/notes', notesIcon, 'All Notes')}
      ${btn('files', '/files', filesIcon, 'Files')}
      ${btn('history', '/history', historyIcon, 'History')}
      ${btn('quickCommands', '/quick-commands', quickCommandsIcon, 'Quick Commands')}
      <hr class="sidebar-divider">
      <a href="${refreshHref}" class="sidebar-btn">
        ${icon('refresh')}
        Refresh
      </a>
    </aside>`;
}

/** New session modal HTML (hidden by default). */
export function newSessionModalCSS(): string {
	return `  /* ── New session modal ── */
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
  .ns-dir-wrap { position: relative; }
  .ns-dir-wrap input { padding-right: 46px; }
  .ns-dir-browse {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    width: 34px; height: 34px; border: none; border-radius: 9px;
    background: transparent; color: var(--panel-muted); font-size: 14px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .ns-dir-browse:hover {
    background: color-mix(in srgb, var(--panel-accent) 10%, transparent); color: var(--panel-accent);
  }
  .ns-dir-tree {
    display: none; position: absolute; left: 0; right: 0; top: 100%;
    margin-top: 4px; max-height: 260px; overflow-y: auto; z-index: 10;
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    padding: 6px 0;
  }
  .ns-dir-tree.open { display: block; }
  .ns-tree-row {
    display: flex; align-items: center; min-height: 36px;
    padding: 4px 10px 4px 0; font-size: var(--text-sm); color: var(--page-fg);
    cursor: pointer; white-space: nowrap; user-select: none;
  }
  .ns-tree-row:hover, .ns-tree-row.active { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .ns-tree-row.current > .ns-tree-label { color: var(--panel-accent); font-weight: 600; }
  .ns-tree-arrow {
    width: 20px; height: 20px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
    color: var(--panel-muted); font-size: 10px; border-radius: 5px;
  }
  .ns-tree-arrow:hover {
    background: color-mix(in srgb, var(--panel-accent) 14%, transparent); color: var(--panel-accent);
  }
  .ns-tree-arrow.leaf { visibility: hidden; }
  .ns-tree-icon { flex-shrink: 0; margin: 0 6px 0 2px; font-size: 13px; }
  .ns-tree-label { overflow: hidden; text-overflow: ellipsis; }
  .ns-tree-empty { color: var(--panel-muted); font-size: var(--text-sm); padding: 8px 12px; }
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
    color: var(--panel-accent-on); font-weight: 500;
  }
  .modal-btn.confirm:hover { opacity: 0.9; }
`;
}

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
      <div class="ns-dir-wrap">
        <input type="text" id="ns-dir" placeholder="~" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ns-dir-list" />
        <button type="button" class="ns-dir-browse" id="ns-dir-browse" title="Browse directories" aria-label="Browse directories">&#128193;</button>
      </div>
      <div class="modal-dropdown" id="ns-dir-list" role="listbox"></div>
      <div class="ns-dir-tree" id="ns-dir-tree" role="tree" aria-label="Directory tree"></div>
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
export function newSessionModalScript(onCreatedExpr?: string): string {
	return `(function() {
  const modal = document.getElementById('new-session-modal');
  const openBtn = document.getElementById('new-session-btn');
  const cancelBtn = document.getElementById('ns-cancel');
  const submitBtn = document.getElementById('ns-submit');
  const nameInput = document.getElementById('ns-name');
  const dirInput = document.getElementById('ns-dir');
  const dirList = document.getElementById('ns-dir-list');
  const errorEl = document.getElementById('ns-error');
  const onCreated = '${onCreatedExpr ?? ''}';

  // The new session is created on the machine of the currently selected
  // session (window.__tmuxWebScopeAgent is set by the shell client; agent
  // page spaces also set it via the injected scope). Falls back to this
  // machine when nothing is selected.
  function selectedAgentId() {
    var a = window.__tmuxWebScopeAgent;
    return (typeof a === 'string' && a) ? a : '';
  }

  function selectedBase() {
    var id = selectedAgentId();
    return id ? '/a/' + encodeURIComponent(id) : '';
  }

  function openModal() {
    modal.classList.add('open');
    nameInput.value = '';
    dirInput.value = '';
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    closeDropdown();
    openTreeForSession().then(() => setTimeout(() => nameInput.focus(), 50));
  }

  function closeModal() { modal.classList.remove('open'); closeDropdown(); closeTree(); }

  if (openBtn) openBtn.addEventListener('click', openModal);
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
    closeTree();
    const val = dirInput.value.trim();
    if (!val) { closeDropdown(); return; }
    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(selectedBase() + '/api/fs/list?path=' + encodeURIComponent(val));
        const data = await res.json();
        renderDropdown(data.dirs || []);
      } catch { closeDropdown(); }
    }, 200);
  });

  dirInput.addEventListener('blur', () => { setTimeout(closeDropdown, 120); });

  // ── Directory tree (expandable, lazy-loads each level) ──
  const treePanel = document.getElementById('ns-dir-tree');
  const browseBtn = document.getElementById('ns-dir-browse');
  let treeCache = {};          // path -> dirs[] (full paths)
  let treeRoot = '/';
  let treeExpanded = new Set(); // paths currently expanded
  let treeSelected = '';        // path currently selected (highlighted)
  let treeUserSelected = '';    // path the user actively clicked (closes on second click)
  let treeRows = [];            // visible rows [{path, el}] for keyboard nav
  let treeActiveIdx = -1;
  let treeOpen = false;

  function treeEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function treeBase(p) {
    if (p === '/' || p === '~') return p;
    const parts = p.split('/').filter(Boolean);
    return parts[parts.length - 1] || '/';
  }
  async function treeLoadDirs(path) {
    if (treeCache[path]) return treeCache[path];
    try {
      const res = await fetch(selectedBase() + '/api/fs/list?path=' + encodeURIComponent(path));
      const data = await res.json();
      const dirs = (data.dirs || []).filter(d => d !== path).sort((a, b) => a.localeCompare(b));
      treeCache[path] = dirs;
      return dirs;
    } catch { treeCache[path] = []; return []; }
  }

  function treeRowEl(path, depth) {
    const row = document.createElement('div');
    row.className = 'ns-tree-row' + (treeSelected === path ? ' current' : '');
    row.dataset.path = path;
    row.style.paddingLeft = (12 + depth * 18) + 'px';
    const arrow = document.createElement('span');
    arrow.className = 'ns-tree-arrow' + (treeExpanded.has(path) ? '' : ' leaf');
    arrow.textContent = treeExpanded.has(path) ? '\u25BE' : '\u25B8';
    const icon = document.createElement('span');
    icon.className = 'ns-tree-icon';
    icon.textContent = '\uD83D\uDCC1';
    const label = document.createElement('span');
    label.className = 'ns-tree-label';
    label.textContent = treeBase(path);
    label.title = path;
    row.append(arrow, icon, label);
    // Arrow toggles expansion (lazy-loads that level).
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      void treeToggle(path, depth);
    });
    // Clicking the row selects the directory and expands it so the user can
    // keep browsing without the tree closing on them. Clicking the already
    // selected row confirms and closes.
    row.addEventListener('click', async () => {
      dirInput.value = path;
      if (treeUserSelected === path) {
        closeTree();
        dirInput.focus();
        return;
      }
      treeUserSelected = path;
      treeSelected = path;
      if (!treeExpanded.has(path)) {
        treeExpanded.add(path);
        await treeRender();
      } else {
        treeRefreshActive();
      }
    });
    return row;
  }

  async function treeToggle(path, depth) {
    if (treeExpanded.has(path)) treeExpanded.delete(path);
    else treeExpanded.add(path);
    await treeRender();
    if (treeExpanded.has(path)) {
      // After expanding, reveal any newly visible selected row.
      const el = document.querySelector('.ns-tree-row.current');
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }

  async function treeRender() {
    treePanel.innerHTML = '';
    treeRows = [];
    const rootRow = treeRowEl(treeRoot, 0);
    treePanel.appendChild(rootRow);
    treeRows.push({ path: treeRoot, el: rootRow });
    if (treeExpanded.has(treeRoot)) {
      await treeRenderChildren(treeRoot, 0, rootRow);
    }
    treeRefreshActive();
    if (!treeRows.length) treePanel.innerHTML = '<div class="ns-tree-empty">No directories</div>';
  }

  async function treeRenderChildren(path, depth, parentRow) {
    if (!treeExpanded.has(path)) return;
    const dirs = await treeLoadDirs(path);
    const frag = document.createDocumentFragment();
    for (const d of dirs) {
      const row = treeRowEl(d, depth + 1);
      frag.appendChild(row);
      treeRows.push({ path: d, el: row });
    }
    parentRow.after(frag);
    for (const d of dirs) {
      if (treeExpanded.has(d)) {
        const row = treePanel.querySelector('.ns-tree-row[data-path="' + CSS.escape(d) + '"]');
        if (row) await treeRenderChildren(d, depth + 1, row);
      }
    }
  }

  // Expand the tree down to the given path (each level lazy-loads and expands).
  async function treeExpandTo(path) {
    treeExpanded.clear();
    treeExpanded.add(treeRoot);
    let cur = treeRoot;
    let acc = '';
    const segs = String(path).split('/').filter(Boolean);
    for (const seg of segs) {
      acc = acc ? acc + '/' + seg : '/' + seg;
      if (cur === '~') cur = acc;
      else if (cur === '/') cur = '/' + seg;
      else cur = cur + '/' + seg;
      await treeLoadDirs(cur);
      treeExpanded.add(cur);
    }
    treeSelected = cur;
    await treeRender();
    const el = treePanel.querySelector('.ns-tree-row.current');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function treeRefreshActive() {
    treeActiveIdx = Math.max(-1, Math.min(treeActiveIdx, treeRows.length - 1));
    treeRows.forEach((r, i) => r.el.classList.toggle('active', i === treeActiveIdx));
    if (treeActiveIdx >= 0 && treeRows[treeActiveIdx]) treeRows[treeActiveIdx].el.scrollIntoView({ block: 'nearest' });
  }

  function closeTree() {
    treePanel.classList.remove('open');
    treePanel.innerHTML = '';
    treeOpen = false;
    treeExpanded = new Set();
    treeSelected = '';
    treeUserSelected = '';
    treeRows = [];
    treeActiveIdx = -1;
  }

  // Resolve the path the tree should open at: the current session's working
  // directory if one is open, otherwise the home directory (both served by
  // /api/fs/session-path — it returns HOME when no session is given).
  async function treeOpenTarget() {
    const session = (typeof window.__tmuxWebCurrentSession === 'string' && window.__tmuxWebCurrentSession)
      ? window.__tmuxWebCurrentSession : '';
    try {
      const url = session
        ? selectedBase() + '/api/fs/session-path?session=' + encodeURIComponent(session)
        : selectedBase() + '/api/fs/session-path';
      const res = await fetch(url);
      const data = await res.json();
      if (data && typeof data.path === 'string' && data.path) {
        if (session) dirInput.value = data.path;
        return data.path.startsWith('/') ? data.path : '/' + data.path;
      }
    } catch {}
    return '/'
  }

  async function openTree() {
    closeDropdown();
    treeRoot = '/';
    treePanel.classList.add('open');
    treeOpen = true;
    const target = await treeOpenTarget();
    await treeExpandTo(target);
  }

  // On modal open, expand the tree directly to the currently selected
  // session's working directory (window.__tmuxWebCurrentSession is set by
  // the shell client; falls back to the home directory otherwise).
  async function openTreeForSession() {
    treeRoot = '/';
    treePanel.classList.add('open');
    treeOpen = true;
    const target = await treeOpenTarget();
    await treeExpandTo(target);
  }

  if (browseBtn) browseBtn.addEventListener('click', () => {
    if (treeOpen) { closeTree(); return; }
    void openTree();
  });

  async function submit() {
    const name = nameInput.value.trim();
    const dir = dirInput.value.trim();
    if (!name) { showError('Session name is required.'); nameInput.focus(); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';
    errorEl.style.display = 'none';
    try {
      const base = selectedBase();
      const res = await fetch(base + '/api/sessions/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dir: dir || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Failed to create session.'); return; }
      closeModal();
      const agentId = selectedAgentId() || null;
      if (onCreated && typeof window[onCreated] === 'function') { window[onCreated](name, agentId); return; }
      window.location.href = base + '/s/' + encodeURIComponent(name);
    } catch { showError('Network error. Please try again.'); }
    finally { submitBtn.disabled = false; submitBtn.textContent = 'Create'; }
  }

  function showError(msg) { errorEl.textContent = msg; errorEl.style.display = 'block'; }

  submitBtn.addEventListener('click', submit);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') dirInput.focus(); });
  dirInput.addEventListener('keydown', (e) => {
    if (treeOpen && treeRows.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); treeActiveIdx = Math.min(treeActiveIdx + 1, treeRows.length - 1); treeRefreshActive(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); treeActiveIdx = Math.max(treeActiveIdx - 1, 0); treeRefreshActive(); return; }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const row = treeRows[Math.max(treeActiveIdx, 0)];
        if (row && !treeExpanded.has(row.path)) void treeToggle(row.path, row.el.style.paddingLeft ? Math.round((parseInt(row.el.style.paddingLeft) - 12) / 18) : 0);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const row = treeRows[Math.max(treeActiveIdx, 0)];
        if (row && treeExpanded.has(row.path)) void treeToggle(row.path, 0);
        return;
      }
      if (e.key === 'Enter' && treeActiveIdx >= 0) {
        e.preventDefault();
        dirInput.value = treeRows[treeActiveIdx].path;
        closeTree();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeTree(); return; }
    }
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
  window.__openNewSessionModal = openModal;
})();`;
}
