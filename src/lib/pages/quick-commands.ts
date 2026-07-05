import { cssVarsStyle } from '../theme.js';
import type { QuickCommandRecord } from '../db.js';
import type { TmuxWebTheme } from '../themes/types.js';
import { commandbarCSS, commandbarHTML, commandbarScript } from '../commandbar.js';
import type { CommandbarSession } from '../commandbar.js';
import {
	sharedLayoutCSS,
	sharedHeader,
	sharedSidebar,
	newSessionModalHTML,
	newSessionModalScript,
} from '../shared-layout.js';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCommandCard(command: QuickCommandRecord): string {
	return `<article class="quick-item" data-id="${escapeHtml(command.id)}">
  <div class="quick-card-head">
    <div>
      <div class="quick-title">${escapeHtml(command.title)}</div>
      <div class="quick-meta">${escapeHtml(command.description || 'No description')}</div>
    </div>
    <div class="quick-icon-actions">
      <button class="quick-icon-btn quick-edit" type="button" title="Edit command" aria-label="Edit ${escapeHtml(command.title)}">
        <svg viewBox="0 0 24 24"><path d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25zM19.71 7.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.05 1.05 2.75 2.75 1.05-1.05z"/></svg>
      </button>
      <button class="quick-icon-btn quick-delete" type="button" title="Delete command" aria-label="Delete ${escapeHtml(command.title)}">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z"/></svg>
      </button>
    </div>
  </div>
  <pre class="quick-command-preview"><code>${escapeHtml(command.command)}</code></pre>
</article>`;
}

export function renderQuickCommandsPage(
	commands: QuickCommandRecord[],
	theme: TmuxWebTheme,
	commandbarEnabled = false,
	commandbarSessions: CommandbarSession[] = [],
	agentsEnabled = false,
): string {
	const commandsJson = JSON.stringify(commands).replace(/</g, '\\u003c');
	const body = commands.length
		? commands.map(renderCommandCard).join('\n')
		: '<p class="empty">No quick commands yet. Add one below, then use it from the terminal commandbar.</p>';

	const pageSpecificCSS = `
  .intro {
    margin: 0 0 18px; color: var(--panel-muted); font-size: var(--text-sm); line-height: 1.6;
  }
  .quick-section-title {
    color: var(--panel-accent); font-size: var(--text-xs); letter-spacing: 0.08em;
    margin: 24px 0 10px; text-transform: uppercase;
  }
  .quick-card {
    display: flex; flex-direction: column; gap: 12px;
    padding: 16px; border: 1px solid var(--panel-border); border-radius: 12px;
    margin-bottom: 12px; background: var(--panel-bg);
  }
  .quick-item {
    display: flex; flex-direction: column; gap: 12px;
    padding: 14px 16px; border: 1px solid var(--panel-border); border-radius: 12px;
    margin-bottom: 10px; background: var(--panel-bg);
    transition: border-color 0.15s, transform 0.1s;
  }
  .quick-item:hover {
    border-color: var(--panel-accent); transform: translateY(-1px);
  }
  .quick-card-head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  }
  .quick-title {
    color: var(--page-fg); font-size: var(--text-base); font-weight: 600; margin-bottom: 4px;
  }
  .quick-meta {
    color: var(--panel-muted); font-size: var(--text-xs); line-height: 1.5;
  }
  .quick-command-preview {
    margin: 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--panel-accent) 15%, transparent);
    border-radius: 8px; background: color-mix(in srgb, var(--page-bg) 60%, transparent);
    color: var(--panel-accent); font-size: var(--text-xs); line-height: 1.5;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .quick-icon-actions {
    display: flex; gap: 6px; flex-shrink: 0;
  }
  .quick-icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; border: 1px solid var(--panel-border); border-radius: 8px;
    background: none; color: var(--panel-muted); cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .quick-icon-btn svg {
    width: 16px; height: 16px; fill: currentColor;
  }
  .quick-icon-btn:hover {
    border-color: var(--panel-accent); color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent);
  }
  .quick-icon-btn:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  .quick-delete:hover {
    border-color: #fc8181; color: #fc8181; background: color-mix(in srgb, #fc8181 8%, transparent);
  }
  .quick-form label {
    display: flex; flex-direction: column; gap: 6px;
  }
  .quick-form label span {
    color: var(--panel-muted); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase;
  }
  .quick-form input,
  .quick-form textarea {
    width: 100%; border: 1px solid var(--panel-border); border-radius: 8px;
    background: var(--page-bg); color: var(--page-fg); font: inherit; font-size: var(--text-sm);
    padding: 10px 12px; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .quick-form textarea {
    min-height: 90px; resize: vertical; line-height: 1.5;
  }
  .quick-form input:focus,
  .quick-form textarea:focus {
    border-color: var(--panel-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--panel-accent) 8%, transparent);
  }
  .quick-actions {
    display: flex; justify-content: flex-end; gap: 8px;
  }
  .quick-save,
  .quick-cancel {
    border: 1px solid var(--panel-border); border-radius: 8px;
    background: none; color: var(--page-fg); font: inherit; font-size: var(--text-sm);
    padding: 10px 16px; cursor: pointer; transition: border-color 0.15s, color 0.15s, background 0.15s;
    min-height: 44px;
  }
  .quick-save {
    border-color: var(--panel-success); color: var(--panel-success);
  }
  .quick-save:hover {
    background: color-mix(in srgb, var(--panel-success) 12%, transparent);
  }
  .quick-save:focus-visible { box-shadow: 0 0 0 2px var(--panel-success); outline: none; }
  .quick-cancel:hover {
    border-color: var(--panel-accent); color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent);
  }
  .quick-cancel:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  .quick-drawer-backdrop {
    position: fixed; inset: 0; z-index: 600; background: rgba(0, 0, 0, 0.48);
    opacity: 0; pointer-events: none; transition: opacity 0.18s ease;
  }
  .quick-drawer-backdrop.open { opacity: 1; pointer-events: auto; }
  .quick-drawer {
    position: fixed; top: 0; right: 0; z-index: 601; height: 100vh;
    width: min(460px, calc(100vw - 24px)); padding: 24px;
    background: var(--panel-bg); border-left: 1px solid var(--panel-border);
    box-shadow: -18px 0 60px rgba(0, 0, 0, 0.45);
    transform: translateX(100%); transition: transform 0.2s ease;
  }
  .quick-drawer.open { transform: translateX(0); }
  .quick-drawer-header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    margin-bottom: 18px;
  }
  .quick-drawer-header h2 {
    margin: 0 0 6px; color: var(--panel-accent); font-size: var(--text-sm);
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .quick-drawer-header p {
    margin: 0; color: var(--panel-muted); font-size: var(--text-xs); line-height: 1.5;
  }
  .quick-drawer-close {
    display: flex; align-items: center; justify-content: center;
    background: none; border: none; color: var(--panel-muted); cursor: pointer;
    font-size: var(--text-xl); line-height: 1; min-width: 44px; min-height: 44px; padding: 8px; border-radius: 8px;
    transition: color 0.15s, background 0.15s;
  }
  .quick-drawer-close:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .quick-drawer-close:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  #quick-edit-form {
    display: flex; flex-direction: column; gap: 12px;
  }
  .quick-error {
    display: none; margin: 0 0 12px; color: #fc8181; font-size: var(--text-xs);
  }
  .quick-error.open { display: block; }
  .empty { font-size: var(--text-sm); color: var(--panel-muted); line-height: 1.6; margin: 0 0 16px; }
  @media (max-width: 560px) {
    .quick-card-head { flex-wrap: wrap; }
    .quick-icon-actions { width: 100%; justify-content: flex-end; }
  }
  ${commandbarEnabled ? commandbarCSS() : ''}`;

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Quick Commands - tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  ${sharedLayoutCSS(pageSpecificCSS)}
</style>
</head>
<body>

${sharedHeader({ commandbarEnabled, title: 'Quick Commands', themeTemplate: theme.template })}

<div class="page-wrap">
  <div class="page-layout">
    ${sharedSidebar({ activePage: 'quickCommands', agentsEnabled, refreshHref: '/quick-commands' })}
    <main class="main-panel">
      <p class="intro">Configure reusable snippets that can be pasted into the active tmux pane from the terminal commandbar.</p>
      <p class="quick-error" id="quick-error"></p>

      <h2 class="quick-section-title">Add Command</h2>
      <form class="quick-card quick-form" id="quick-create">
        <label>
          <span>Title</span>
          <input name="title" type="text" placeholder="Run tests" autocomplete="off" />
        </label>
        <label>
          <span>Command</span>
          <textarea name="command" placeholder="bun run test" spellcheck="false"></textarea>
        </label>
        <label>
          <span>Description</span>
          <input name="description" type="text" placeholder="Optional context shown in the commandbar" autocomplete="off" />
        </label>
        <div class="quick-actions">
          <button class="quick-save" type="submit">Add Command</button>
        </div>
      </form>

      <h2 class="quick-section-title">Configured</h2>
      <div id="quick-list">${body}</div>
    </main>
  </div>
</div>

${newSessionModalHTML()}
<div class="quick-drawer-backdrop" id="quick-edit-backdrop"></div>
<aside class="quick-drawer" id="quick-edit-drawer" aria-hidden="true" aria-label="Edit quick command">
  <div class="quick-drawer-header">
    <div>
      <h2>Edit Command</h2>
      <p>Changes apply to the commandbar immediately after save.</p>
    </div>
    <button class="quick-drawer-close" id="quick-edit-close" type="button" aria-label="Close edit drawer">&times;</button>
  </div>
  <form class="quick-form" id="quick-edit-form">
    <input name="id" type="hidden" />
    <label>
      <span>Title</span>
      <input name="title" type="text" autocomplete="off" />
    </label>
    <label>
      <span>Command</span>
      <textarea name="command" spellcheck="false"></textarea>
    </label>
    <label>
      <span>Description</span>
      <input name="description" type="text" autocomplete="off" />
    </label>
    <div class="quick-actions">
      <button class="quick-cancel" id="quick-edit-cancel" type="button">Cancel</button>
      <button class="quick-save" type="submit">Save</button>
    </div>
  </form>
</aside>
${commandbarEnabled ? commandbarHTML() : ''}

<script type="module">
const commands = ${commandsJson};
const errorEl = document.getElementById('quick-error');
const editBackdrop = document.getElementById('quick-edit-backdrop');
const editDrawer = document.getElementById('quick-edit-drawer');
const editForm = document.getElementById('quick-edit-form');

function showError(message) {
  errorEl.textContent = message || '';
  errorEl.classList.toggle('open', !!message);
}

function openEditDrawer(command) {
  showError('');
  editForm.elements.id.value = command.id;
  editForm.elements.title.value = command.title || '';
  editForm.elements.command.value = command.command || '';
  editForm.elements.description.value = command.description || '';
  editDrawer.classList.add('open');
  editBackdrop.classList.add('open');
  editDrawer.setAttribute('aria-hidden', 'false');
  setTimeout(() => editForm.elements.title.focus(), 50);
}

function closeEditDrawer() {
  editDrawer.classList.remove('open');
  editBackdrop.classList.remove('open');
  editDrawer.setAttribute('aria-hidden', 'true');
}

function payloadFromForm(form) {
  const data = new FormData(form);
  return {
    title: String(data.get('title') || ''),
    command: String(data.get('command') || ''),
    description: String(data.get('description') || ''),
  };
}

async function sendJson(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = 'request failed';
    try {
      const json = await res.json();
      if (json && json.error) message = json.error;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

document.getElementById('quick-create').addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await sendJson('/api/quick-commands', 'POST', payloadFromForm(form));
    location.reload();
  } catch (err) {
    showError(err instanceof Error ? err.message : 'failed to add command');
    button.disabled = false;
  }
});

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  const id = String(editForm.elements.id.value || '');
  if (!id) return;
  const button = editForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await sendJson('/api/quick-commands/' + encodeURIComponent(id), 'PATCH', payloadFromForm(editForm));
    location.reload();
  } catch (err) {
    showError(err instanceof Error ? err.message : 'failed to save command');
    button.disabled = false;
  }
});

document.getElementById('quick-list').addEventListener('click', async (event) => {
  const editButton = event.target.closest('.quick-edit');
  if (editButton) {
    const card = editButton.closest('.quick-item');
    const command = commands.find((entry) => entry.id === card?.dataset.id);
    if (command) openEditDrawer(command);
    return;
  }

  const button = event.target.closest('.quick-delete');
  if (!button) return;
  const card = button.closest('.quick-item');
  if (!card || !card.dataset.id) return;
  showError('');
  button.disabled = true;
  try {
    const res = await fetch('/api/quick-commands/' + encodeURIComponent(card.dataset.id), { method: 'DELETE' });
    if (!res.ok) throw new Error('failed to delete command');
    location.reload();
  } catch (err) {
    showError(err instanceof Error ? err.message : 'failed to delete command');
    button.disabled = false;
  }
});

document.getElementById('quick-edit-close').addEventListener('click', closeEditDrawer);
document.getElementById('quick-edit-cancel').addEventListener('click', closeEditDrawer);
editBackdrop.addEventListener('click', closeEditDrawer);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && editDrawer.classList.contains('open')) closeEditDrawer();
});

${commandbarEnabled ? commandbarScript(commandbarSessions, []) : ''}
${newSessionModalScript()}
</script>
</body>
</html>`;
}
