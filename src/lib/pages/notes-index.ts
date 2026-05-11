import { cssVarsStyle } from '../theme.js';
import { notesDbScript } from '../notes-db.js';

export function renderNotesIndex(): string {
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Notes — tmux-web</title>
<style>
  ${cssVarsStyle()}
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace; }
  .container { max-width: 640px; margin: 60px auto; padding: 0 20px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
  h1 { font-size: 18px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--panel-accent); }
  .back-link {
    font-size: 12px; color: var(--panel-muted); text-decoration: none;
    border: 1px solid var(--panel-border); padding: 6px 14px; border-radius: 6px; transition: all 0.15s;
  }
  .back-link:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .note-card {
    display: block; padding: 14px 16px; border: 1px solid var(--panel-border); border-radius: 8px;
    margin-bottom: 10px; text-decoration: none; color: var(--page-fg);
    background: var(--panel-bg); transition: border-color 0.15s; cursor: pointer;
  }
  .note-card:hover { border-color: var(--panel-success); }
  .note-card .label {
    font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--panel-accent); margin-bottom: 6px;
  }
  .note-card .label.global { color: var(--panel-success); }
  .note-card .preview {
    font-size: 12px; color: var(--panel-muted); line-height: 1.5;
    white-space: pre-wrap; word-break: break-word;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .note-card .meta {
    font-size: 11px; color: var(--panel-muted); margin-top: 8px;
    display: flex; justify-content: space-between;
  }
  .empty { font-size: 13px; color: var(--panel-muted); line-height: 1.6; margin-top: 20px; }
  #loading { font-size: 13px; color: var(--panel-muted); }
</style>
</head>
<body>
<div class="container">
  <div class="page-header">
    <h1>All notes</h1>
    <a href="/" class="back-link">Back</a>
  </div>
  <div id="notes-list"><p id="loading">Loading...</p></div>
</div>

<script type="module">
${notesDbScript()}

async function listAllNotes() {
  const db = await openNotesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE], 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function render() {
  const list = document.getElementById('notes-list');
  try {
    const notes = await listAllNotes();
    if (!notes.length) {
      list.innerHTML = '<p class="empty">No notes yet.</p>';
      return;
    }
    notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    list.innerHTML = notes.map((n) => {
      const isGlobal = n.id === '__global__';
      const label = isGlobal ? 'Global' : n.id.replace(/^session:/, '');
      const href = isGlobal ? '/notes/__global__' : '/notes/' + encodeURIComponent(n.id.replace(/^session:/, ''));
      const preview = (n.content || '').slice(0, 200).trim() || '—';
      const date = formatDate(n.updatedAt);
      return \`<a class="note-card" href="\${href}">
        <div class="label \${isGlobal ? 'global' : ''}">\${label}</div>
        <div class="preview">\${preview.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <div class="meta"><span>\${date}</span></div>
      </a>\`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<p class="empty">Failed to load notes.</p>';
  }
}

render();
</script>
</body>
</html>`;
}
