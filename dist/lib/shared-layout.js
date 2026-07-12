import{commandbarButtonHTML as y}from"./commandbar.js";import{escapeHtml as l}from"./html.js";import{icon as a,iconPath as o}from"./icons.js";const d=[{id:"vscode",name:"VS Code",dot:"#007acc"},{id:"ghostty",name:"Ghostty",dot:"#ff5f00"},{id:"warm-clay",name:"Warm Clay",dot:"#b86b52"},{id:"dark-cove",name:"Dark Cove",dot:"#7aa2f7"}];function i(e="var(--panel-accent)"){return`box-shadow: 0 0 0 2px ${e}; outline: none;`}function k(e=""){return`
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
    ${e}
  }`}function I(e="vscode"){const r=d.find(t=>t.id===e)??d[0],s=d.map(t=>{const n=t.id===e;return`<button type="button" class="theme-option${n?" active":""}" data-theme="${t.id}" role="menuitem">
      <span class="theme-dot" style="background:${t.dot}"></span>
      ${l(t.name)}
      ${n?a("check",'class="theme-check" aria-hidden="true"'):""}
    </button>`}).join(`
`);return`<div class="theme-switcher" id="theme-switcher">
    <button type="button" class="theme-switcher-btn" aria-label="Theme" aria-haspopup="true" aria-expanded="false">
      <span class="theme-dot" style="background:${r.dot}"></span>
      <span>${l(r.name)}</span>
    </button>
    <div class="theme-switcher-popover" role="menu">
      ${s}
    </div>
  </div>`}function E(){return`(function() {
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
})();`}function T(e=""){return`
  *, *::before, *::after { box-sizing: border-box; }
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: var(--font-sans); margin: 0; padding: 0; }

  /* \u2500\u2500 Fixed header \u2500\u2500 */
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
  .header-btn:focus-visible, .icon-btn:focus-visible { ${i()} }
  .header-btn svg, .icon-btn svg { width: 18px; height: 18px; fill: currentColor; flex-shrink: 0; }

  /* \u2500\u2500 Theme switcher popover \u2500\u2500 */
  .theme-switcher { position: relative; }
  .theme-switcher-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    min-width: 44px; min-height: 44px; padding: 8px 12px; border-radius: 10px;
    transition: color 0.15s, background 0.15s;
    font-size: var(--text-sm); text-decoration: none; font-family: inherit;
  }
  .theme-switcher-btn:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .theme-switcher-btn:focus-visible { ${i()} }
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
  .theme-option:focus-visible { ${i()} }
  .theme-option.active { color: var(--panel-accent); font-weight: 500; }
  .theme-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .theme-check { width: 16px; height: 16px; margin-left: auto; color: var(--panel-accent); }

  /* \u2500\u2500 Page layout \u2500\u2500 */
  .page-wrap { padding-top: 56px; }
  .page-layout {
    display: flex; gap: 24px; max-width: 1120px; margin: 0 auto; padding: 24px 16px;
    align-items: flex-start;
  }

  /* \u2500\u2500 Main content panel \u2500\u2500 */
  .main-panel { flex: 1; min-width: 0; }

  /* \u2500\u2500 Action sidebar \u2500\u2500 */
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
  .sidebar-btn:focus-visible { ${i()} }
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

  /* \u2500\u2500 New session modal \u2500\u2500 */
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
  .modal-btn:focus-visible { ${i()} }
  .modal-btn.confirm {
    background: var(--panel-accent); border-color: var(--panel-accent);
    color: var(--panel-accent-on); font-weight: 500;
  }
  .modal-btn.confirm:hover { opacity: 0.9; }

  /* \u2500\u2500 Mobile \u2500\u2500 */
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

  ${k()}
  ${e}`}function z(e){const{commandbarEnabled:r,title:s="TMUX Sessions",themeTemplate:t="vscode"}=e;return`<script>
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
    ${r?y("Search"):""}
    <button class="header-btn" id="notes-toggle" title="Global notes" aria-label="Global notes">
      ${a("notes")}
      <span>Notes</span>
    </button>
    ${I(t)}
    <a class="header-btn" href="/settings" title="Settings">
      ${a("settings")}
      <span>Settings</span>
    </a>
  </div>
</header>
<script>${E()}</script>`}function D(e){const{activePage:r,agentsEnabled:s,refreshHref:t}=e;function n(c,x,g,v,w=""){return`<a href="${x}" class="${c!==null&&c===r?"sidebar-btn current":"sidebar-btn"}"${w}>
        <svg viewBox="0 0 24 24" fill="currentColor">${g}</svg>
        ${v}
      </a>`}const p=o("sessions"),m=o("notes"),u=o("schedule"),h=o("agents"),b=o("history"),f=o("quick-commands"),L=o("refresh");return`<aside class="action-sidebar">
      <p class="sidebar-label">Actions</p>
      <button class="sidebar-btn primary" id="new-session-btn">
        ${a("add")}
        New Session
      </button>
      <hr class="sidebar-divider">
      ${n("home","/",p,"Sessions")}
      ${n("notes","/notes",m,"All Notes")}
      ${n("schedule","/schedule",u,"Scheduled")}
      ${n("history","/history",b,"History")}
      ${n("quickCommands","/quick-commands",f,"Quick Commands")}
      ${s?n("agents","/agents",h,"All Agents"):""}
      <hr class="sidebar-divider">
      <a href="${t}" class="sidebar-btn">
        ${a("refresh")}
        Refresh
      </a>
    </aside>`}function M(){return`<div class="modal-backdrop" id="new-session-modal" role="dialog" aria-modal="true" aria-label="Create new tmux session">
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
</div>`}function j(){return`(function() {
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
    submitBtn.textContent = 'Creating\u2026';
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
})();`}export{M as newSessionModalHTML,j as newSessionModalScript,z as sharedHeader,T as sharedLayoutCSS,D as sharedSidebar,I as themeSwitcherButtonHTML,E as themeSwitcherScript};
