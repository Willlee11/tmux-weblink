import { cssVarsStyle } from '../theme.js';
import { escapeHtml } from '../html.js';
import { commandbarCSS, commandbarHTML, commandbarScript, } from '../commandbar.js';
import { sharedLayoutCSS, sharedHeader, sharedSidebar, newSessionModalHTML, newSessionModalScript, } from '../shared-layout.js';
export function renderFilesIndex(theme, commandbarEnabled = false, commandbarSessions = [], roots) {
    const configured = roots.length > 0;
    const rootList = roots.map((r) => `<li>${escapeHtml(r)}</li>`).join('\n');
    const pageSpecificCSS = `
  .files-empty { font-size: var(--text-sm); color: var(--panel-muted); line-height: 1.7; margin-top: 12px; }
  .files-empty code { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); padding: 3px 7px; border-radius: 6px; font-size: var(--text-xs); }
  .files-roots { list-style: none; padding: 0; margin: 0; }
  .files-roots li {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 18px; border: 1px solid var(--panel-border); border-radius: 12px;
    margin-bottom: 8px; background: var(--panel-bg);
    font-size: var(--text-sm); font-family: var(--font-mono); color: var(--page-fg);
    word-break: break-all; cursor: pointer;
    transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s;
    text-decoration: none;
  }
  .files-roots li:hover { border-color: var(--panel-accent); transform: translateY(-1px); box-shadow: 0 4px 20px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .files-roots li svg { width: 20px; height: 20px; flex-shrink: 0; color: var(--panel-accent); }
  .files-info { font-size: var(--text-sm); color: var(--panel-muted); margin-bottom: 16px; line-height: 1.6; }
  ${commandbarEnabled ? commandbarCSS() : ''}`;
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Files - tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  ${sharedLayoutCSS(pageSpecificCSS)}
</style>
</head>
<body>

${sharedHeader({ commandbarEnabled, title: 'Files', themeTemplate: theme.template })}

<div class="page-wrap">
  <div class="page-layout">
    ${sharedSidebar({ activePage: 'files', refreshHref: '/files' })}
    <main class="main-panel">

      ${configured ? `
      <p class="files-info">Browse and edit files from the configured directories below.</p>
      <div class="files-roots">
        ${rootList}
      </div>
      <div id="file-browser" style="display:none">
        <div id="fb-path" style="font-size:var(--text-sm);font-family:var(--font-mono);color:var(--panel-muted);margin-bottom:12px;word-break:break-all"></div>
        <div id="fb-tree" style="margin-bottom:16px;font-size:var(--text-sm);font-family:var(--font-mono)"></div>
        <div id="fb-editor" style="display:none">
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
            <button id="fb-save" class="modal-btn confirm" style="display:none">Save</button>
            <button id="fb-delete" class="modal-btn" style="color:#b91c1c">Delete</button>
            <button id="fb-back" class="modal-btn">Back</button>
            <span id="fb-status" style="font-size:var(--text-xs);color:var(--panel-muted);margin-left:auto;align-self:center"></span>
          </div>
          <textarea id="fb-content" style="width:100%;min-height:400px;padding:14px;background:var(--page-bg);border:1px solid var(--panel-border);border-radius:12px;color:var(--page-fg);font-size:var(--text-sm);font-family:var(--font-mono);resize:vertical;outline:none" spellcheck="false"></textarea>
        </div>
        <div id="fb-new" style="margin-top:12px;display:flex;gap:8px">
          <input id="fb-new-name" type="text" placeholder="filename.txt" style="flex:1;padding:10px 14px;background:var(--page-bg);border:1px solid var(--panel-border);border-radius:10px;color:var(--page-fg);font-size:var(--text-sm);font-family:var(--font-mono);outline:none" spellcheck="false" />
          <button id="fb-new-btn" class="modal-btn confirm">New File</button>
        </div>
      </div>
      ` : `
      <p class="files-empty">File access is not configured. Set the <code>TMUX_WEB_FS_ROOTS</code> environment variable to enable file browsing.</p>
      `}

    </main>
  </div>
</div>

${newSessionModalHTML()}
${commandbarEnabled ? commandbarHTML() : ''}

<script type="module">
${configured ? `const ROOTS = ${JSON.stringify(roots)};

const tree = document.getElementById('fb-tree');
const editor = document.getElementById('fb-editor');
const pathEl = document.getElementById('fb-path');
const contentEl = document.getElementById('fb-content');
const saveBtn = document.getElementById('fb-save');
const deleteBtn = document.getElementById('fb-delete');
const backBtn = document.getElementById('fb-back');
const statusEl = document.getElementById('fb-status');
const browser = document.getElementById('file-browser');
const newName = document.getElementById('fb-new-name');
const newBtn = document.getElementById('fb-new-btn');

let currentPath = '';
let currentModified = false;
let currentOriginal = '';

function setStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.style.color = ok ? 'var(--panel-muted)' : '#b91c1c';
}

function addTreeItem(parent, name, fullPath, isDir) {
  const el = document.createElement('div');
  el.style.cssText = 'padding:6px 10px;cursor:pointer;border-radius:8px;display:flex;align-items:center;gap:8px;transition:background 0.1s';
  el.style.cssText += ';color:var(--page-fg)';
  el.textContent = isDir ? '📁 ' + name : name;
  el.title = fullPath;
  el.addEventListener('mouseenter', () => { el.style.background = 'color-mix(in srgb, var(--panel-accent) 8%, transparent)'; });
  el.addEventListener('mouseleave', () => { el.style.background = 'transparent'; });
  if (isDir) {
    el.addEventListener('click', () => loadDir(fullPath));
  } else {
    el.addEventListener('click', () => loadFile(fullPath));
  }
  tree.appendChild(el);
}

async function loadDir(dirPath) {
  tree.innerHTML = '<div style="color:var(--panel-muted);padding:6px 10px;font-size:var(--text-xs)">Loading...</div>';
  currentPath = dirPath;
  pathEl.textContent = dirPath;
  browser.style.display = 'block';
  editor.style.display = 'none';
  saveBtn.style.display = 'none';
  setStatus('');
  newName.value = '';
  try {
    const res = await fetch('/api/fs/list?path=' + encodeURIComponent(dirPath));
    const data = await res.json();
    tree.innerHTML = '';
    // Parent directory link (unless at root)
    for (const root of ROOTS) {
      if (dirPath !== root && dirPath.startsWith(root)) {
        addTreeItem(tree, '..', dirPath.substring(0, dirPath.lastIndexOf('/')), true);
        break;
      }
    }
    if (data.dirs) {
      for (const d of data.dirs) {
        const name = d.split('/').pop() || d.split('\\\\').pop();
        addTreeItem(tree, name, d, true);
      }
    }
    if (data.files) {
      for (const f of data.files) {
        const name = f.split('/').pop() || f.split('\\\\').pop();
        addTreeItem(tree, name, f, false);
      }
    }
  } catch (err) {
    tree.innerHTML = '<div style="color:#b91c1c;padding:6px 10px;font-size:var(--text-xs)">Failed to load directory</div>';
  }
}

async function loadFile(filePath) {
  currentPath = filePath;
  pathEl.textContent = filePath;
  setStatus('Loading...');
  try {
    const res = await fetch('/api/file?path=' + encodeURIComponent(filePath));
    if (!res.ok) {
      const data = await res.json();
      setStatus(data.error || 'Failed to load file', false);
      return;
    }
    const data = await res.json();
    contentEl.value = data.content;
    currentOriginal = data.content;
    currentModified = false;
    editor.style.display = 'block';
    saveBtn.style.display = '';
    saveBtn.textContent = 'Save';
    setStatus(data.size + ' bytes');
  } catch {
    setStatus('Failed to load file', false);
  }
}

contentEl.addEventListener('input', () => {
  currentModified = contentEl.value !== currentOriginal;
});

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  try {
    const res = await fetch('/api/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentPath, content: contentEl.value }),
    });
    if (!res.ok) {
      const data = await res.json();
      setStatus(data.error || 'Save failed', false);
      return;
    }
    currentOriginal = contentEl.value;
    currentModified = false;
    setStatus('Saved', true);
  } catch {
    setStatus('Save failed', false);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
});

deleteBtn.addEventListener('click', async () => {
  if (!confirm('Delete ' + currentPath + '?')) return;
  try {
    const res = await fetch('/api/file/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentPath }),
    });
    if (!res.ok) {
      const data = await res.json();
      setStatus(data.error || 'Delete failed', false);
      return;
    }
    editor.style.display = 'none';
    saveBtn.style.display = 'none';
    // Reload parent dir
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/'));
    loadDir(parent);
  } catch {
    setStatus('Delete failed', false);
  }
});

backBtn.addEventListener('click', () => {
  editor.style.display = 'none';
  saveBtn.style.display = 'none';
  setStatus('');
});

newBtn.addEventListener('click', async () => {
  const name = newName.value.trim();
  if (!name) return;
  const dirPath = currentPath;
  const fullPath = dirPath + '/' + name;
  try {
    const res = await fetch('/api/file/touch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath }),
    });
    if (!res.ok) {
      const data = await res.json();
      setStatus(data.error || 'Create failed', false);
      return;
    }
    newName.value = '';
    loadDir(dirPath);
  } catch {
    setStatus('Create failed', false);
  }
});

// Click on root paths to browse them
document.querySelectorAll('.files-roots li').forEach(el => {
  el.addEventListener('click', () => loadDir(el.textContent));
});
` : ''}
${commandbarEnabled ? commandbarScript(commandbarSessions, []) : ''}
${newSessionModalScript()}
</script>
</body>
</html>`;
}
