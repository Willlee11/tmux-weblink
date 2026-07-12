import{notesDbScript as o}from"./notes-db.js";import{notesUtilsScript as n}from"./notes-utils.js";import{closeOtherDrawersExcept as r,wrapDrawerScript as a}from"./drawer-script.js";import{drawerResizeCSS as s,drawerResizeHandleHTML as i,drawerResizeScript as d}from"./drawer-resize.js";import{escapeHtml as c}from"./html.js";function m(){return`
  #notes-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 999;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  #notes-backdrop.open { opacity: 1; pointer-events: auto; }
  #notes-drawer {
    position: fixed; right: 0; top: 0; height: 100%; width: 360px; z-index: 1000;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform 0.25s ease;
  }
  #notes-drawer.open { transform: translateX(0); }
  ${s()}
  .drawer-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px; border-bottom: 1px solid var(--panel-border);
    font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--panel-accent); font-family: var(--font-mono); flex-shrink: 0;
  }
  .drawer-header button {
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    font-size: var(--text-lg); line-height: 1; min-width: 44px; min-height: 44px; padding: 8px; border-radius: 8px; transition: color 0.15s, background 0.15s;
  }
  .drawer-header button:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .drawer-header button:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  .drawer-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 16px; border-bottom: 1px solid var(--panel-border);
    flex-shrink: 0; gap: 8px;
  }
  .drawer-toolbar .badge {
    font-size: var(--text-xs); color: var(--panel-success); letter-spacing: 0.1em; text-transform: uppercase;
    opacity: 0; transition: opacity 0.15s; font-family: var(--font-mono);
  }
  .drawer-toolbar .badge.show { opacity: 1; }
  .drawer-toolbar .actions { display: flex; gap: 8px; align-items: center; }
  .drawer-toolbar button {
    font-size: var(--text-xs); color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 6px 12px; border-radius: 6px;
    cursor: pointer; font-family: var(--font-mono); transition: all 0.15s;
    min-height: 44px;
  }
  .drawer-toolbar button:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .drawer-toolbar button:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  .drawer-toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
  .drawer-toolbar button.flash { color: var(--panel-success); border-color: var(--panel-success); }
  #notes-editor {
    flex: 1; padding: 16px; outline: none; overflow-y: auto;
    font-size: var(--text-sm); line-height: 1.7; font-family: var(--font-mono);
    white-space: pre-wrap; word-break: break-word; color: var(--page-fg);
    scrollbar-width: thin;
    scrollbar-color: var(--panel-border) transparent;
  }
  #notes-editor::-webkit-scrollbar { width: 4px; }
  #notes-editor::-webkit-scrollbar-track { background: transparent; }
  #notes-editor::-webkit-scrollbar-thumb {
    background: var(--panel-border); border-radius: 2px;
  }
  #notes-editor::-webkit-scrollbar-thumb:hover { background: var(--panel-muted); }
  #notes-editor:empty::before {
    content: "Double-click to add notes..."; color: var(--panel-muted); pointer-events: none;
  }
  #notes-editor[contenteditable="true"] {
    border: 1px solid color-mix(in srgb, var(--panel-accent) 30%, transparent);
    background: color-mix(in srgb, var(--page-bg) 70%, transparent);
    border-radius: 8px; margin: 8px;
  }
  #notes-editor a { color: var(--panel-accent); text-decoration: none; }
  #notes-editor a:hover { text-decoration: underline; }
  @media (max-width: 560px) {
    #notes-drawer { width: min(100vw - 16px, 400px); }
  }`}function g(e){return`
<div id="notes-backdrop"></div>
<div id="notes-drawer" class="resizable-drawer">
  ${i()}
  <div class="drawer-header">
    <span>${c(e)}</span>
    <button id="drawer-close">&times;</button>
  </div>
  <div class="drawer-toolbar">
    <span class="badge" id="edit-badge">Editing</span>
    <div class="actions">
      <button id="notes-copy">Copy</button>
      <button id="notes-export">Export .md</button>
    </div>
  </div>
  <div id="notes-editor"></div>
</div>`}function f(e){const t=JSON.stringify(e);return a("notes",`
const NOTES_SCOPE = ${t};
${o()}
${n()}
${d("notes-drawer","tmux-web:drawer-width:notes",360)}

const notesBackdrop = document.getElementById('notes-backdrop');
const notesDrawer = document.getElementById('notes-drawer');
const notesEditor = document.getElementById('notes-editor');
const notesToggle = document.getElementById('notes-toggle');
const drawerClose = document.getElementById('drawer-close');
const editBadge = document.getElementById('edit-badge');
const copyBtn = document.getElementById('notes-copy');
const exportBtn = document.getElementById('notes-export');

let notePlain = '';
let editing = false;

function setButtonsEnabled(enabled) {
  copyBtn.disabled = !enabled;
  exportBtn.disabled = !enabled;
}

async function renderNote() {
  const rec = await loadNote(NOTES_SCOPE);
  notePlain = rec?.content || '';
  notesEditor.innerHTML = linkifyHTML(escapeHTML(notePlain));
  setButtonsEnabled(!!notePlain);
}

function openDrawer() {
  ${r("notes")}
  notesDrawer.classList.add('open');
  notesBackdrop.classList.add('open');
  renderNote();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') !== 'notes') {
    url.searchParams.set('tab', 'notes');
    history.pushState({ notesOpen: true }, '', url);
  }
}

function closeDrawer() {
  notesDrawer.classList.remove('open');
  notesBackdrop.classList.remove('open');
  if (editing) stopEditing();
  const url = new URL(location.href);
  if (url.searchParams.get('tab') === 'notes') {
    url.searchParams.delete('tab');
    history.pushState({}, '', url);
  }
}

function startEditing() {
  editing = true;
  notesEditor.contentEditable = 'true';
  notesEditor.textContent = notePlain;
  editBadge.classList.add('show');
  notesEditor.focus();
}

async function stopEditing() {
  if (!editing) return;
  editing = false;
  // innerText (not textContent): Enter in contenteditable inserts <br> or blocks;
  // textContent drops those breaks and merges lines.
  notePlain = (notesEditor.innerText ?? '').replace(/\\r\\n/g, '\\n');
  notesEditor.contentEditable = 'false';
  notesEditor.innerHTML = linkifyHTML(escapeHTML(notePlain));
  editBadge.classList.remove('show');
  await saveNote(NOTES_SCOPE, notePlain);
  setButtonsEnabled(!!notePlain);
}

notesToggle.addEventListener('click', () => {
  if (notesDrawer.classList.contains('open')) closeDrawer();
  else openDrawer();
});

drawerClose.addEventListener('click', closeDrawer);
notesBackdrop.addEventListener('click', closeDrawer);

notesEditor.addEventListener('dblclick', (e) => {
  if (!editing) { e.preventDefault(); startEditing(); }
});

notesEditor.addEventListener('blur', () => { if (editing) stopEditing(); });

notesEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && editing) { e.preventDefault(); stopEditing(); }
});

copyBtn.addEventListener('click', async () => {
  if (!notePlain) return;
  try {
    await navigator.clipboard.writeText(notePlain);
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('flash');
    setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('flash'); }, 1500);
  } catch {}
});

exportBtn.addEventListener('click', () => {
  if (!notePlain) return;
  const blob = new Blob([notePlain], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const safeName = NOTES_SCOPE.replace(/[:\\/\\\\]/g, '-');
  a.download = \`notes-\${safeName}.md\`;
  a.click();
  URL.revokeObjectURL(a.href);
});

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  if (params.get('tab') === 'notes') openDrawer();
  else closeDrawer();
});

if (new URLSearchParams(location.search).get('tab') === 'notes') {
  openDrawer();
}`,"closeDrawer")}export{m as notesDrawerCSS,g as notesDrawerHTML,f as notesDrawerScript};
