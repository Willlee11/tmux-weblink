import{cssVarsStyle as b}from"../theme.js";import{escapeHtml as m}from"../html.js";import{notesDbScript as g}from"../notes-db.js";import{notesUtilsScript as u}from"../notes-utils.js";import{commandbarCSS as x,commandbarHTML as f,commandbarScript as v,commandbarButtonHTML as y}from"../commandbar.js";function L(t,a,e=!1,r=[]){const o=t==="__global__",i=o?"Global":t,s=o?"__global__":"session:"+t,d="/notes",l=o?"notes-global":"notes-session-"+t.replace(/[:\/\\]/g,"-"),c=JSON.stringify(s),p=JSON.stringify(`${l}.md`),n=m(i);return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Notes - ${n} - tmux-web</title>
<style>
  ${b(a.shell)}
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: var(--font-mono); }
  .container { max-width: 720px; margin: 40px auto; padding: 0 20px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .breadcrumb { font-size: var(--text-sm); color: var(--panel-muted); }
  .breadcrumb a { color: var(--panel-muted); text-decoration: none; }
  .breadcrumb a:hover { color: var(--panel-accent); }
  .breadcrumb span { color: var(--panel-accent); font-weight: 500; }
  .toolbar {
    display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 12px;
    border-bottom: 1px solid var(--panel-border); flex-wrap: wrap;
  }
  .toolbar button {
    font-size: var(--text-xs); color: var(--panel-muted); background: none;
    border: 1px solid var(--panel-border); padding: 8px 14px; border-radius: 8px;
    cursor: pointer; font-family: var(--font-mono); transition: all 0.15s;
    min-height: 44px;
  }
  .toolbar button:hover { border-color: var(--panel-accent); color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .toolbar button:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  .toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
  .toolbar button.flash { color: var(--panel-success); border-color: var(--panel-success); }
  .toolbar .badge {
    font-size: var(--text-xs); color: var(--panel-success); letter-spacing: 0.1em; text-transform: uppercase;
    opacity: 0; transition: opacity 0.15s; margin-left: auto;
  }
  .toolbar .badge.show { opacity: 1; }
  #notes-editor {
    min-height: 400px; padding: 16px; outline: none;
    font-size: var(--text-sm); line-height: 1.7; font-family: var(--font-mono);
    white-space: pre-wrap; word-break: break-word; color: var(--page-fg);
    border: 1px solid transparent; border-radius: 8px;
    transition: border-color 0.15s, background 0.15s;
  }
  #notes-editor:empty::before {
    content: "Double-click to edit notes..."; color: var(--panel-muted); pointer-events: none;
  }
  #notes-editor[contenteditable="true"] {
    border: 1px solid color-mix(in srgb, var(--panel-accent) 30%, transparent);
    background: color-mix(in srgb, var(--page-bg) 70%, transparent);
  }
  #notes-editor a { color: var(--panel-accent); text-decoration: none; }
  #notes-editor a:hover { text-decoration: underline; }
  @media (max-width: 560px) {
    .container { margin: 20px auto; padding: 0 16px; }
    #notes-editor { min-height: 300px; padding: 12px; }
  }
  ${e?x():""}
</style>
</head>
<body>
<div class="container">
  <div class="page-header">
    <div class="breadcrumb">
      <a href="${d}">Notes</a> <span>/</span> <span>${n}</span>
    </div>
    ${e?y("Search"):""}
  </div>
  <div class="toolbar">
    <button id="notes-copy">Copy</button>
    <button id="notes-export">Export .md</button>
    <span class="badge" id="edit-badge">Editing</span>
  </div>
  <div id="notes-editor"></div>
</div>

<script type="module">
const NOTES_SCOPE = ${c};
${g()}
${u()}

const notesEditor = document.getElementById('notes-editor');
const copyBtn = document.getElementById('notes-copy');
const exportBtn = document.getElementById('notes-export');
const editBadge = document.getElementById('edit-badge');

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
  a.download = ${p};
  a.click();
  URL.revokeObjectURL(a.href);
});

renderNote();
</script>
${e?f():""}
<script type="module">
${e?v(r,[]):""}
</script>
</body>
</html>`}export{L as renderNotesPage};
