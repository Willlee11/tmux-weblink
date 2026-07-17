import { initTerminal, type TerminalInitConfig, type TerminalInstance } from './terminal-core.js';

declare global {
	interface Window {
		__TMUX_WEB_SHELL__?: TerminalInitConfig & { fsRoots: string[]; agentsEnabled: boolean; commandbarEnabled: boolean };
	}
}

// ── Config ──

const shellCfg = window.__TMUX_WEB_SHELL__!;

// ── State ──

let currentTerminal: TerminalInstance | null = null;
let currentSession: string | null = null;
let currentMode: 'sessions' | 'files' = 'sessions';
let currentFileDir = '';
let currentFilePath = '';
let currentFileContent = '';
let currentFileOriginal = '';

// ── DOM refs ──

const sidebarContent = document.getElementById('sidebar-content')!;
const mainPlaceholder = document.getElementById('main-placeholder')!;
const terminalContainer = document.getElementById('terminal-container')!;
const fileEditor = document.getElementById('file-editor')!;
const fePath = document.getElementById('fe-path')!;
const feStatus = document.getElementById('fe-status')!;
const feContent = document.getElementById('fe-content') as HTMLTextAreaElement;
const feSave = document.getElementById('fe-save')!;
const feDelete = document.getElementById('fe-delete')!;
const feBack = document.getElementById('fe-back')!;
const feNewName = document.getElementById('fe-new-name') as HTMLInputElement;
const feNewBtn = document.getElementById('fe-new-btn')!;
const settingsBackdrop = document.getElementById('settings-backdrop')!;
const settingsPopover = document.getElementById('settings-popover')!;

// ── Mode switching ──

const sidebar = document.querySelector('.sidebar')!;

function isNarrow(): boolean {
	return window.matchMedia('(max-width: 640px)').matches;
}

function collapseSidebar() {
	if (isNarrow()) sidebar.classList.add('collapsed');
}
function expandSidebar() {
	sidebar.classList.remove('collapsed');
}

document.getElementById('mode-sessions')!.addEventListener('click', () => { expandSidebar(); setMode('sessions'); });
document.getElementById('mode-files')!.addEventListener('click', () => { expandSidebar(); setMode('files'); });

function setMode(mode: 'sessions' | 'files') {
	currentMode = mode;
	document.querySelectorAll('.mode-btn').forEach((btn) => btn.classList.remove('active'));
	const btn = document.getElementById(mode === 'sessions' ? 'mode-sessions' : 'mode-files');
	if (btn) btn.classList.add('active');

	if (mode === 'sessions') {
		renderSessionList();
	} else {
		renderFileRoots();
	}
}

// ── Sessions mode ──

async function renderSessionList() {
	sidebarContent.innerHTML = '<div class="sidebar-section-label">Sessions</div><button class="new-session-sidebar-btn" id="ns-btn">+ New Session</button>';

	try {
		const res = await fetch('/api/sidebar/sessions');
		const data = await res.json();
		const sessions = data.recent || [];

		for (const s of sessions) {
			const el = document.createElement('div');
			el.className = 'session-item' + (s.name === currentSession ? ' active' : '');
			el.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="${s.attached ? 'M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H5V6h14v12z' : 'M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z'}"></svg>
			<span>${escHtml(s.name)}</span>
			<button class="session-edit-btn" data-session="${escHtml(s.name)}" title="Edit session"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
`;
			el.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).closest('.session-edit-btn')) return;
				openSession(s.name);
			});
			sidebarContent.appendChild(el);
				// Wire up edit button
				const editBtn = el.querySelector('.session-edit-btn');
				if (editBtn) editBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					showSessionPopover(s.name, editBtn as HTMLElement);
				});
		}
	} catch {
		sidebarContent.innerHTML += '<div class="file-tree-empty">Failed to load sessions</div>';
	}

	// Wire up new session button
	const nsBtn = document.getElementById('ns-btn');
	if (nsBtn) nsBtn.addEventListener('click', () => document.getElementById('new-session-modal')?.classList.add('open'));
}

function escHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

	async function openSession(name: string) {
		if (currentSession === name && currentTerminal) return; // already open

		// Hide file editor, show terminal
		fileEditor.style.display = 'none';
		mainPlaceholder.style.display = 'none';
		terminalContainer.style.display = '';
		terminalContainer.classList.add('terminal-pending');
		collapseSidebar();

		// Destroy old terminal
		if (currentTerminal) {
			currentTerminal.destroy();
			currentTerminal = null;
		}
		currentSession = name;

		// Start new terminal
		try {
			currentTerminal = await initTerminal(terminalContainer, name, {
				terminal: shellCfg.terminal,
				scrollback: shellCfg.scrollback,
				theme: shellCfg.theme,
				renderer: shellCfg.renderer,
			});
		} catch (err) {
			console.error('[shell] terminal init failed:', err);
			const msg = (err && typeof err === 'object' && 'message' in err) ? (err as any).message : String(err);
			terminalContainer.textContent = 'Failed to open terminal for ' + name + ': ' + msg;
			terminalContainer.classList.remove('terminal-pending');
		}
	}

// ── Files mode ──

let fsRoots: string[] = [];

function renderFileRoots() {
	fsRoots = shellCfg.fsRoots || [];
	if (fsRoots.length === 0) {
		sidebarContent.innerHTML = '<div class="file-tree-info">Set <code>TMUX_WEB_FS_ROOTS</code> to browse files.</div>';
		return;
	}
	sidebarContent.innerHTML = '';
	for (const root of fsRoots) {
		const el = document.createElement('div');
		el.className = 'file-tree-item';
		el.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" class="file-icon"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg> ${escHtml(root)}`;
		el.addEventListener('click', () => loadFileDir(root));
		sidebarContent.appendChild(el);
	}
}

async function loadFileDir(dirPath: string) {
	currentFileDir = dirPath;
	sidebarContent.innerHTML = '<div class="file-tree-empty">Loading...</div>';

	try {
		const res = await fetch('/api/fs/list?path=' + encodeURIComponent(dirPath));
		const data = await res.json();
		sidebarContent.innerHTML = '';

		// Parent dir link
		const parent = getParentDir(dirPath);
		if (parent) {
			const isRoot = fsRoots.some((r) => dirPath === r);
			if (!isRoot) {
				const el = document.createElement('div');
				el.className = 'file-tree-item';
				el.innerHTML = '..';
				el.addEventListener('click', () => loadFileDir(parent));
				sidebarContent.appendChild(el);
			}
		}

		// Dirs
		if (data.dirs) {
			for (const d of data.dirs) {
				const name = d.split('/').pop() || d.split('\\').pop();
				const el = document.createElement('div');
				el.className = 'file-tree-item';
				el.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" class="file-icon"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg> ${escHtml(name)}`;
				el.addEventListener('click', () => loadFileDir(d));
				sidebarContent.appendChild(el);
			}
		} else {
			sidebarContent.innerHTML = '';
		}

		// Files
		const files = data.files || [];
		for (const f of files) {
			const name = f.split('/').pop() || f.split('\\').pop();
			const el = document.createElement('div');
			el.className = 'file-tree-item file';
			el.innerHTML = `<span class="file-icon">📄</span> ${escHtml(name)}`;
			el.addEventListener('click', () => openFileEditor(f));
			sidebarContent.appendChild(el);
		}
	} catch {
		sidebarContent.innerHTML = '<div class="file-tree-error">Failed to load directory</div>';
	}
}

function getParentDir(p: string): string | null {
	const idx = p.lastIndexOf('/');
	if (idx <= 0) return null;
	return p.substring(0, idx);
}

async function openFileEditor(filePath: string) {
	currentFilePath = filePath;

	// Hide terminal, show file editor
	terminalContainer.style.display = 'none';
	if (currentTerminal) {
		currentTerminal.destroy();
		currentTerminal = null;
		currentSession = null;
	}
	collapseSidebar();
	mainPlaceholder.style.display = 'none';
	fileEditor.style.display = 'flex';

	fePath.textContent = filePath;
	feStatus.textContent = 'Loading...';
	feSave.style.display = 'none';

	try {
		const res = await fetch('/api/file?path=' + encodeURIComponent(filePath));
		if (!res.ok) {
			const err = await res.json();
			feStatus.textContent = err.error || 'Failed to load';
			feContent.value = '';
			return;
		}
		const data = await res.json();
		feContent.value = data.content;
		currentFileContent = data.content;
		currentFileOriginal = data.content;
		feStatus.textContent = data.size + ' bytes';
		feSave.style.display = '';
	} catch {
		feStatus.textContent = 'Failed to load';
		feContent.value = '';
	}
}

// ── File editor events ──

feContent.addEventListener('input', () => {
	currentFileContent = feContent.value;
});

feSave.addEventListener('click', async () => {
	feSave.textContent = 'Saving...';
	(feSave as HTMLButtonElement).disabled = true;
	try {
		const res = await fetch('/api/file', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: currentFilePath, content: currentFileContent }),
		});
		if (!res.ok) {
			const err = await res.json();
			feStatus.textContent = err.error || 'Save failed';
			return;
		}
		currentFileOriginal = currentFileContent;
		feStatus.textContent = 'Saved';
	} catch {
		feStatus.textContent = 'Save failed';
	} finally {
		(feSave as HTMLButtonElement).disabled = false;
		feSave.textContent = 'Save';
	}
});

feDelete.addEventListener('click', async () => {
	if (!confirm('Delete ' + currentFilePath + '?')) return;
	try {
		const res = await fetch('/api/file/delete', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: currentFilePath }),
		});
		if (!res.ok) {
			const err = await res.json();
			feStatus.textContent = err.error || 'Delete failed';
			return;
		}
		fileEditor.style.display = 'none';
		mainPlaceholder.style.display = 'flex';
		if (currentFileDir) loadFileDir(currentFileDir);
	} catch {
		feStatus.textContent = 'Delete failed';
	}
});

feBack.addEventListener('click', () => {
	fileEditor.style.display = 'none';
	mainPlaceholder.style.display = 'flex';
	if (currentFileDir) loadFileDir(currentFileDir);
});

feNewBtn.addEventListener('click', async () => {
	const name = feNewName.value.trim();
	if (!name) return;
	const fullPath = currentFileDir + '/' + name;
	try {
		const res = await fetch('/api/file/touch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: fullPath }),
		});
		if (!res.ok) {
			const err = await res.json();
			feStatus.textContent = err.error || 'Create failed';
			return;
		}
		feNewName.value = '';
		if (currentFileDir) loadFileDir(currentFileDir);
	} catch {
		feStatus.textContent = 'Create failed';
	}
});

// ── Settings popover ──

document.getElementById('mode-settings')!.addEventListener('click', () => {
	const open = settingsPopover.classList.toggle('open');
	settingsBackdrop.classList.toggle('open', open);
});
settingsBackdrop.addEventListener('click', () => {
	settingsPopover.classList.remove('open');
	settingsBackdrop.classList.remove('open');
});

// ── Session edit popover ──

let spSessionName = '';

const spBackdrop = document.createElement('div');
spBackdrop.className = 'session-popover-backdrop';
document.body.appendChild(spBackdrop);

const spPopover = document.createElement('div');
spPopover.id = 'session-popover';
spPopover.className = 'session-popover';
spPopover.style.display = 'none';
spPopover.innerHTML = `<div class="sp-field">
  <label>Rename session</label>
  <input type="text" id="sp-name" />
</div>
<div class="sp-actions">
  <button class="btn primary" id="sp-save">Save</button>
  <button class="btn" id="sp-cancel">Cancel</button>
</div>
<hr class="sp-divider" />
<button class="btn danger" id="sp-delete">Delete session</button>`;
document.body.appendChild(spPopover);

function positionPopover(anchorEl: HTMLElement) {
	const rect = anchorEl.getBoundingClientRect();
	spPopover.style.top = (rect.bottom + 4) + 'px';
	spPopover.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + 'px';
}

function showSessionPopover(name: string, anchorEl: HTMLElement) {
	spSessionName = name;
	const input = document.getElementById('sp-name') as HTMLInputElement;
	input.value = name;
	spBackdrop.classList.add('open');
	spPopover.style.display = 'block';
	positionPopover(anchorEl);
	setTimeout(() => input.focus(), 50);
}

function closeSessionPopover() {
	spBackdrop.classList.remove('open');
	spPopover.style.display = 'none';
}

spBackdrop.addEventListener('click', closeSessionPopover);

document.getElementById('sp-save')!.addEventListener('click', async () => {
	const newName = (document.getElementById('sp-name') as HTMLInputElement).value.trim();
	if (!newName || newName === spSessionName) { closeSessionPopover(); return; }
	try {
		const res = await fetch('/api/sessions/rename', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ oldName: spSessionName, newName }),
		});
		if (!res.ok) return;
		closeSessionPopover();
		renderSessionList();
		if (currentSession === spSessionName) openSession(newName);
	} catch {}
});

document.getElementById('sp-delete')!.addEventListener('click', async () => {
	if (!confirm('Delete session "' + spSessionName + '"?')) return;
	try {
		const res = await fetch('/api/sessions/kill', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: spSessionName }),
		});
		if (!res.ok) return;
		closeSessionPopover();
		if (currentSession === spSessionName) {
			if (currentTerminal) { currentTerminal.destroy(); currentTerminal = null; }
			currentSession = null;
			terminalContainer.style.display = 'none';
			mainPlaceholder.style.display = 'flex';
		}
		renderSessionList();
	} catch {}
});

document.getElementById('sp-cancel')!.addEventListener('click', closeSessionPopover);

// ── Mobile key toolbar ──

const keyMap: Record<string, string> = {
	esc: '\x1b',
	tab: '\t',
	's-tab': '\x1b[Z',
	up: '\x1b[A',
	down: '\x1b[B',
	left: '\x1b[D',
	right: '\x1b[C',
	space: ' ',
	'ctrl-c': '\x03',
	'ctrl-d': '\x04',
	enter: '\r',
	exit: 'exit\r',
};

document.getElementById('mobile-keys')!.addEventListener('click', (e) => {
	const btn = (e.target as HTMLElement).closest('button[data-key]');
	if (!btn || !currentTerminal) return;
	const seq = keyMap[(btn as HTMLElement).dataset.key!];
	if (seq) {
		currentTerminal.sendInput(seq);
		currentTerminal.focus();
	}
});

// ── Init ──

(window as any).__openSession = openSession;
(window as any).__refreshSidebar = renderSessionList;
renderSessionList();
