import { initTerminal, type TerminalInitConfig, type TerminalInstance } from './terminal-core.js';

declare global {
	interface Window {
		__TMUX_WEB_SHELL__?: TerminalInitConfig & { fsRoots: string[]; commandbarEnabled: boolean };
	}
}

// ── Config ──

const shellCfg = window.__TMUX_WEB_SHELL__!;

// ── State ──

let currentTerminal: TerminalInstance | null = null;
let currentSession: string | null = null;
let currentMode: 'sessions' | 'files' | 'browser' = 'sessions';
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
document.getElementById('mode-browser')!.addEventListener('click', () => { expandSidebar(); setMode('browser'); });

function setMode(mode: 'sessions' | 'files' | 'browser') {
	currentMode = mode;
	document.querySelectorAll('.mode-btn').forEach((btn) => btn.classList.remove('active'));
	const btn = document.getElementById(mode === 'sessions' ? 'mode-sessions' : mode === 'files' ? 'mode-files' : 'mode-browser');
	if (btn) btn.classList.add('active');

	if (mode === 'sessions') {
		exitBrowserMode();
		renderSessionList();
	} else if (mode === 'files') {
		exitBrowserMode();
		renderFileRoots();
	} else {
		enterBrowserMode();
		renderTabs();
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
			el.setAttribute('data-session', s.name);
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
		exitBrowserMode();

		// Hide file editor, show terminal
		fileEditor.style.display = 'none';
		mainPlaceholder.style.display = 'none';
		terminalContainer.style.display = '';
		terminalContainer.classList.add('terminal-pending');
		collapseSidebar();

		// Destroy old terminal
		if (currentTerminal) {
			stopHeaderGitPolling();
			currentTerminal.destroy();
			currentTerminal = null;
		}
		currentSession = name;

		// Update sidebar active indicator
		for (const el of sidebarContent.querySelectorAll('.session-item')) {
			el.classList.toggle('active', el.getAttribute('data-session') === name);
		}

		try {
			currentTerminal = await initTerminal(terminalContainer, name, {
				terminal: shellCfg.terminal,
				scrollback: shellCfg.scrollback,
				theme: shellCfg.theme,
				renderer: shellCfg.renderer,
			});
			startHeaderGitPolling();
		} catch (err) {
			console.error('[shell] terminal init failed:', err);
			const msg = (err && typeof err === 'object' && 'message' in err) ? (err as any).message : String(err);
			terminalContainer.textContent = 'Failed to open terminal for ' + name + ': ' + msg;
			terminalContainer.classList.remove('terminal-pending');
		}
	}

// ── Files mode ──

let fsRoots: string[] = [];
let gitStatusCache: {
	repoRoot: string | null;
	branch: string | null;
	files: { path: string; status: string; staged: string; unstaged: string; additions: number; deletions: number }[];
	linesAdded: number;
	linesRemoved: number;
} | null = null;
let gitLoading = false;

function getGitFileStatus(filePath: string): string | null {
	if (!gitStatusCache || !gitStatusCache.files.length) return null;
	// git status paths are relative to repo root; our filePath is absolute.
	// Try matching by relative path from repo root.
	const repoRoot = gitStatusCache.repoRoot;
	if (!repoRoot) return null;
	if (!filePath.startsWith(repoRoot)) return null;
	const relative = filePath.slice(repoRoot.length + 1); // +1 for trailing /
	for (const f of gitStatusCache.files) {
		if (f.path === relative) return f.status;
	}
	return null;
}

async function loadGitStatus(dirPath: string) {
	gitLoading = true;
	try {
		const res = await fetch('/api/git/status?path=' + encodeURIComponent(dirPath));
		if (res.ok) {
			gitStatusCache = await res.json();
		} else {
			gitStatusCache = null;
		}
	} catch {
		gitStatusCache = null;
	} finally {
		gitLoading = false;
	}
}

function renderGitBranch() {
	if (!gitStatusCache || !gitStatusCache.branch) return '';
	const { branch, linesAdded, linesRemoved } = gitStatusCache;
	let html = `<div class="sidebar-git"><div class="git-branch-badge">
		<svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.63 1.22a.75.75 0 00-1.06 0L5.99 5.8 4.12 3.93a.75.75 0 10-1.06 1.06L4.93 6.87A3.5 3.5 0 003 10.09v3.16a.75.75 0 001 0v-3.16a2.5 2.5 0 012.5-2.5h.27l-1.06 1.06a.75.75 0 001.06 1.06l2.37-2.38a.75.75 0 000-1.06L7.59 5.27l4.04-4.05a.75.75 0 000-1.06L11.63 1.22zM3.25 13.94a.75.75 0 01-.75-.75v-.69a.75.75 0 011.5 0v.69c0 .414-.336.75-.75.75z"/></svg>
		${escHtml(branch)}</div>`;
	if (linesAdded > 0 || linesRemoved > 0) {
		html += `<div class="git-diff-stats">+<span class="add">${linesAdded}</span> <span class="del">-${linesRemoved}</span></div>`;
	}
	return html + '</div>';
}

// Click sidebar git → open git popover
sidebarContent.addEventListener('click', (e) => {
	const el = (e.target as HTMLElement).closest('.sidebar-git');
	if (el && headerGitRepoRoot && gitStatusCache) {
		e.stopPropagation();
		showGitPopover();
	}
});

// ── Header git status ──

const headerGitEl = document.getElementById('header-git')!;
const gitDiffView = document.getElementById('git-diff-view')!;
const gdPath = document.getElementById('gd-path')!;
const gdStatus = document.getElementById('gd-status')!;
const gdContent = document.getElementById('gd-content')!;
const gdBack = document.getElementById('gd-back')!;
let headerGitRepoRoot: string | null = null;

function updateHeaderGit(status: typeof gitStatusCache) {
	if (!status || !status.branch) {
		headerGitEl.style.display = 'none';
		headerGitRepoRoot = null;
		return;
	}
	headerGitRepoRoot = status.repoRoot;
	const { branch, linesAdded, linesRemoved } = status;
	let html = `<span class="branch">${escHtml(branch)}</span>`;
	if (linesAdded > 0 || linesRemoved > 0) {
		html += `<span class="sep">·</span>+<span class="diff-add">${linesAdded}</span> <span class="diff-del">-${linesRemoved}</span>`;
	}
	headerGitEl.innerHTML = html;
	headerGitEl.style.display = 'block';
}

headerGitEl.addEventListener('click', (e) => {
	if (headerGitRepoRoot && gitStatusCache) {
		e.stopPropagation();
		showGitPopover();
	}
});

// ── Git diff popover ──

const gitPopover = document.getElementById('git-popover')!;
const gitBackdrop = document.getElementById('git-popover-backdrop')!;

function positionGitPopover() {
	const headerRect = headerGitEl.getBoundingClientRect();
	gitPopover.style.top = (headerRect.bottom + 4) + 'px';
	gitPopover.style.left = Math.max(8, Math.min(headerRect.left, window.innerWidth - 400)) + 'px';
}

function addBrowseListener() {
	const browseRepoRoot = headerGitRepoRoot;
	const btn = document.getElementById('git-popover-browse');
	if (!btn) return;
	btn.addEventListener('click', () => {
		closeGitPopover();
		if (browseRepoRoot) {
			currentMode = 'files';
			document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
			const fb = document.getElementById('mode-files');
			if (fb) fb.classList.add('active');
			loadFileDir(browseRepoRoot);
		}
	});
}

let gitFileListHtml = '';

function showGitPopover() {
	if (!gitStatusCache) return;
	const files = gitStatusCache.files || [];
	if (!files.length) {
		gitPopover.innerHTML = `<div class="git-popover-header">No changes — clean working tree</div>
		<div class="git-popover-footer"><button id="git-popover-browse">Browse repository →</button></div>`;
	} else {
		let html = `<div class="git-popover-header">${files.length} file${files.length > 1 ? 's' : ''} changed</div>`;
		for (let i = 0; i < files.length; i++) {
			const f = files[i];
			const add = f.additions || 0;
			const del = f.deletions || 0;
			let statusBadge = '';
			switch (f.status) {
				case 'M': statusBadge = '<span class="git-file-status M">M</span>'; break;
				case 'A': statusBadge = '<span class="git-file-status A">A</span>'; break;
				case 'D': statusBadge = '<span class="git-file-status D">D</span>'; break;
				case '?': statusBadge = '<span class="git-file-status ?">?</span>'; break;
				case 'R': statusBadge = '<span class="git-file-status R">R</span>'; break;
			}
			html += `<div class="git-popover-item" data-idx="${i}">
			${statusBadge}<span class="file-path">${escHtml(f.path)}</span>
			<span class="file-add">${add > 0 ? '+' + add : ''}</span>
			<span class="file-del">${del > 0 ? '-' + del : ''}</span>
		</div>`;
		}
		html += `<div class="git-popover-footer"><button id="git-popover-browse">Browse repository →</button></div>`;
		gitFileListHtml = html;
		gitPopover.innerHTML = html;

		// Attach click handlers to each file row
		gitPopover.querySelectorAll('.git-popover-item').forEach((el) => {
			const idx = parseInt((el as HTMLElement).dataset.idx || '0', 10);
			const file = files[idx];
			if (!file || file.status === 'D') return; // deleted files can't show diff
			el.classList.add('clickable');
			(el as HTMLElement).style.cursor = 'pointer';
			el.addEventListener('click', () => showGitDiff(file.path));
		});
	}
	positionGitPopover();
	gitPopover.classList.add('open');
	gitBackdrop.classList.add('open');
	addBrowseListener();
}

function isWideScreen(): boolean {
	return window.innerWidth >= 1024;
}

function buildDiffHtml(diff: string, stagedDiff: string): { html: string; lineCount: number } {
	const combined = diff + (stagedDiff && diff ? '\n' : '') + stagedDiff;
	const lines = combined.split('\n');
	let html = '';
	let oldLine = 0, newLine = 0;
	for (const rawLine of lines) {
		const line = rawLine;
		if (line.startsWith('@@')) {
			const m = line.match(/@@\s+-(\d+)[^+]*\+(\d+)/);
			if (m) { oldLine = parseInt(m[1], 10) - 1; newLine = parseInt(m[2], 10) - 1; }
			html += `<div class="diff-line hunk"><span class="ln-body">${escHtml(line)}</span></div>`;
			continue;
		}
		if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('new file') || line.startsWith('deleted file')) {
			if (line.startsWith('diff --git')) {
				html += `<div class="diff-line header"><span class="ln-body">${escHtml(line)}</span></div>`;
			}
			continue;
		}
		if (line.startsWith('+')) {
			newLine++;
			html += `<div class="diff-line add"><span class="ln-no">${newLine}</span><span class="ln-body">${escHtml(line)}</span></div>`;
		} else if (line.startsWith('-')) {
			oldLine++;
			html += `<div class="diff-line del"><span class="ln-no">${oldLine}</span><span class="ln-body">${escHtml(line)}</span></div>`;
		} else if (line.startsWith('\\')) {
			html += `<div class="diff-line"><span class="ln-body">${escHtml(line)}</span></div>`;
		} else {
			if (!line && !oldLine && !newLine) continue;
			oldLine++;
			newLine++;
			html += `<div class="diff-line"><span class="ln-no">${oldLine}</span><span class="ln-no" style="margin-right:12px">${newLine}</span><span class="ln-body">${escHtml(line)}</span></div>`;
		}
	}
	return { html, lineCount: lines.length };
}

let prevSessionForDiff: string | null = null;

async function showGitDiff(filePath: string) {
	const repoRoot = headerGitRepoRoot;
	if (!repoRoot) return;
	closeGitPopover();
	exitBrowserMode();

	if (isWideScreen()) {
		// Show in main area
		terminalContainer.style.display = 'none';
		if (currentTerminal) {
			stopHeaderGitPolling();
			currentTerminal.destroy();
			currentTerminal = null;
			prevSessionForDiff = currentSession;
			currentSession = null;
		}
		updateHeaderGit(null);
		fileEditor.style.display = 'none';
		mainPlaceholder.style.display = 'none';
		gitDiffView.style.display = 'flex';
		gdPath.textContent = filePath;
		gdStatus.textContent = 'Loading…';
		gdContent.innerHTML = '';
		try {
			const res = await fetch('/api/git/diff?path=' + encodeURIComponent(repoRoot) + '&file=' + encodeURIComponent(filePath));
			if (!res.ok) throw new Error(await res.text());
			const data = await res.json();
			renderDiffInMain(filePath, data.diff, data.stagedDiff);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			gdStatus.textContent = 'Error';
			gdContent.innerHTML = `<div class="diff-empty" style="padding:24px;text-align:center;color:var(--panel-muted)">Error: ${escHtml(msg)}</div>`;
		}
	} else {
		// Narrow screen: show in popover
		gitPopover.innerHTML = `<div class="git-diff-view"><div class="diff-header">
			<button class="diff-back">← Back</button>
			<span class="diff-filename">${escHtml(filePath)}</span>
			<span class="diff-loading">Loading…</span>
		</div></div>`;
		positionGitPopover();
		gitPopover.classList.add('open');
		gitBackdrop.classList.add('open');
		try {
			const res = await fetch('/api/git/diff?path=' + encodeURIComponent(repoRoot) + '&file=' + encodeURIComponent(filePath));
			if (!res.ok) throw new Error(await res.text());
			const data = await res.json();
			renderDiffInPopover(filePath, data.diff, data.stagedDiff);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			gitPopover.innerHTML = `<div class="git-diff-view"><div class="diff-header">
				<button class="diff-back">← Back</button>
				<span class="diff-filename">${escHtml(filePath)}</span>
			</div><div class="diff-empty">Error loading diff: ${escHtml(msg)}</div></div>`;
		}
	}
}

function renderDiffInPopover(filePath: string, diff: string, stagedDiff: string) {
	if (!diff && !stagedDiff) {
		gitPopover.innerHTML = `<div class="git-diff-view"><div class="diff-header">
			<button class="diff-back">← Back</button>
			<span class="diff-filename">${escHtml(filePath)}</span>
		</div><div class="diff-empty">No diff content available</div></div>`;
		return;
	}
	const { html: diffLines, lineCount } = buildDiffHtml(diff, stagedDiff);
	gitPopover.innerHTML = `<div class="git-diff-view"><div class="diff-header">
		<button class="diff-back">← Back</button>
		<span class="diff-filename">${escHtml(filePath)}</span>
		<span class="diff-filesize">${lineCount} lines</span>
	</div><div class="diff-content">${diffLines}</div></div>`;

	gitPopover.querySelector('.diff-back')?.addEventListener('click', () => {
		gitPopover.innerHTML = gitFileListHtml;
		positionGitPopover();
		if (gitStatusCache) {
			gitPopover.querySelectorAll('.git-popover-item').forEach((el) => {
				const idx = parseInt((el as HTMLElement).dataset.idx || '0', 10);
				const file = gitStatusCache!.files[idx];
				if (!file || file.status === 'D') return;
				(el as HTMLElement).style.cursor = 'pointer';
				el.addEventListener('click', () => showGitDiff(file.path));
			});
		}
		addBrowseListener();
	});
}

function renderDiffInMain(filePath: string, diff: string, stagedDiff: string) {
	if (!diff && !stagedDiff) {
		gdStatus.textContent = 'No diff';
		gdContent.innerHTML = '<div class="diff-empty" style="padding:24px;text-align:center;color:var(--panel-muted)">No diff content available</div>';
		return;
	}
	const { html: diffLines, lineCount } = buildDiffHtml(diff, stagedDiff);
	gdPath.textContent = filePath;
	gdStatus.textContent = lineCount + ' lines';
	gdContent.innerHTML = diffLines;
}

function closeGitDiffView() {
	gitDiffView.style.display = 'none';
	if (prevSessionForDiff) {
		terminalContainer.style.display = '';
		terminalContainer.classList.add('terminal-pending');
		openSession(prevSessionForDiff);
		prevSessionForDiff = null;
	} else if (currentSession) {
		terminalContainer.style.display = '';
		terminalContainer.classList.add('terminal-pending');
		startHeaderGitPolling();
	} else {
		mainPlaceholder.style.display = 'flex';
	}
}

gdBack.addEventListener('click', closeGitDiffView);

function closeGitPopover() {
	gitPopover.classList.remove('open');
	gitBackdrop.classList.remove('open');
}

gitBackdrop.addEventListener('click', closeGitPopover);

document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		closeGitPopover();
		closeProcessPanel();
	}
});

async function refreshHeaderGitForSession(session: string) {
	try {
		const res = await fetch('/api/fs/session-path?session=' + encodeURIComponent(session));
		const data = await res.json();
		if (data.path) {
			const gitRes = await fetch('/api/git/status?path=' + encodeURIComponent(data.path));
			if (gitRes.ok) {
				const status = await gitRes.json();
				gitStatusCache = status;
				updateHeaderGit(status);
				return;
			}
		}
	} catch {}
	gitStatusCache = null;
	updateHeaderGit(null);
}

let headerGitTimer: ReturnType<typeof setInterval> | null = null;
function startHeaderGitPolling() {
	stopHeaderGitPolling();
	if (currentSession) {
		refreshHeaderGitForSession(currentSession);
		headerGitTimer = setInterval(() => {
			if (currentSession) refreshHeaderGitForSession(currentSession);
		}, 30000);
	}
}
function stopHeaderGitPolling() {
	if (headerGitTimer) {
		clearInterval(headerGitTimer);
		headerGitTimer = null;
	}
}

function renderFileRoots() {
	fsRoots = shellCfg.fsRoots || [];
	if (fsRoots.length === 0) {
		if (currentSession) {
			loadFileDirForSession(currentSession);
			return;
		}
		sidebarContent.innerHTML = '<div class="file-tree-info">Open a session first, then switch to Files to browse its directory.</div>';
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

async function loadFileDirForSession(session: string) {
	sidebarContent.innerHTML = '<div class="file-tree-empty">Loading...</div>';
	try {
		const res = await fetch('/api/fs/session-path?session=' + encodeURIComponent(session));
		const data = await res.json();
		if (data.path) {
			loadFileDir(data.path);
		} else {
			sidebarContent.innerHTML = '<div class="file-tree-info">Could not determine session directory.</div>';
		}
	} catch {
		sidebarContent.innerHTML = '<div class="file-tree-error">Failed to get session directory</div>';
	}
}

async function loadFileDir(dirPath: string) {
	currentFileDir = dirPath;
	sidebarContent.innerHTML = '<div class="file-tree-empty">Loading...</div>';

	// Load git status in parallel
	const gitPromise = loadGitStatus(dirPath);

	try {
		const res = await fetch('/api/fs/list?path=' + encodeURIComponent(dirPath));
		const data = await res.json();
		await gitPromise; // ensure git status is loaded
		sidebarContent.innerHTML = '';

		// Update header git and sidebar git
		updateHeaderGit(gitStatusCache);
		sidebarContent.innerHTML += renderGitBranch();

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
			const gitStatus = getGitFileStatus(f);
			let gitClass = '';
			let gitBadge = '';
			if (gitStatus) {
				switch (gitStatus) {
					case 'M': gitClass = 'git-mod'; gitBadge = '<span class="git-file-status M">M</span>'; break;
					case 'A': gitClass = 'git-add'; gitBadge = '<span class="git-file-status A">A</span>'; break;
					case 'D': gitClass = 'git-del'; gitBadge = '<span class="git-file-status D">D</span>'; break;
					case '?': gitClass = 'git-untracked'; gitBadge = '<span class="git-file-status ?">?</span>'; break;
					case 'R': gitClass = 'git-mod'; gitBadge = '<span class="git-file-status R">R</span>'; break;
				}
			}
			const el = document.createElement('div');
			el.className = 'file-tree-item file' + (gitClass ? ' ' + gitClass : '');
			el.innerHTML = `<span class="file-icon">📄</span> ${gitBadge}${escHtml(name)}`;
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
	exitBrowserMode();

	// Hide terminal, show file editor
	terminalContainer.style.display = 'none';
	if (currentTerminal) {
		stopHeaderGitPolling();
		currentTerminal.destroy();
		currentTerminal = null;
		currentSession = null;
	}
	updateHeaderGit(null);
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

// ── Browser mode (server-side page proxy) ──

type BrowserTab = {
	id: string;
	title: string;
	url: string | null;
	history: string[];
	historyIdx: number;
	error: string | null;
	seq: number;
};

const browserView = document.getElementById('browser-view')!;
const brBack = document.getElementById('br-back') as HTMLButtonElement;
const brFwd = document.getElementById('br-fwd') as HTMLButtonElement;
const brReload = document.getElementById('br-reload') as HTMLButtonElement;
const brAddress = document.getElementById('br-address') as HTMLInputElement;
const brNew = document.getElementById('br-new') as HTMLButtonElement;
const browserContent = document.getElementById('browser-content')!;
const mobileKeysEl = document.getElementById('mobile-keys')!;

let browserTabs: BrowserTab[] = [];
let activeTabId: string | null = null;
let tabSeq = 0;
let browserModeActive = false;
let prevMainForBrowser: 'terminal' | 'files' | 'none' = 'none';
let prevSessionForBrowser: string | null = null;

const SEARCH_URL = 'https://html.duckduckgo.com/html/?q=';

function activeTab(): BrowserTab | null {
	if (!activeTabId) return null;
	return browserTabs.find((t) => t.id === activeTabId) ?? null;
}

function globeSvg(size: number): string {
	return `<svg viewBox="0 0 24 24" fill="currentColor" width="${size}" height="${size}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;
}

function normalizeInput(input: string): string {
	let s = input.trim();
	if (/^https?:\/\//i.test(s)) return s;
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s; // explicit scheme (mailto:, etc.)
	if (!/\s/.test(s) && /\./.test(s)) return 'https://' + s; // looks like a domain
	if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(s)) return 'http://' + s;
	return SEARCH_URL + encodeURIComponent(s); // single word or query → search
}

function newBrowserTab(): string {
	tabSeq++;
	const id = 't' + tabSeq;
	browserTabs.push({ id, title: 'New Tab', url: null, history: [], historyIdx: -1, error: null, seq: 0 });
	activeTabId = id;
	renderTabs();
	showStartPage();
	return id;
}

function renderTabs() {
	if (currentMode !== 'browser') return;
	let html = '<div class="sidebar-section-label">Tabs</div>';
	for (const tab of browserTabs) {
		const active = tab.id === activeTabId ? ' active' : '';
		html += `<div class="tab-item${active}" data-tab="${tab.id}">
			<span class="tab-fav">${globeSvg(16)}</span>
			<span class="tab-title">${escHtml(tab.title)}</span>
			<button class="tab-close" data-close="${tab.id}" title="Close tab" aria-label="Close tab">&times;</button>
		</div>`;
	}
	html += `<button class="tab-new" id="tab-new-btn"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> New Tab</button>`;
	sidebarContent.innerHTML = html;

	sidebarContent.querySelectorAll('.tab-item').forEach((el) => {
		el.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).closest('.tab-close')) return;
			activateTab((el as HTMLElement).dataset.tab!);
		});
	});
	sidebarContent.querySelectorAll('.tab-close').forEach((el) => {
		el.addEventListener('click', (e) => {
			e.stopPropagation();
			closeTab((el as HTMLElement).dataset.close!);
		});
	});
	const newBtn = document.getElementById('tab-new-btn');
	if (newBtn) newBtn.addEventListener('click', () => { newBrowserTab(); brAddress.focus(); });
}

function activateTab(id: string) {
	activeTabId = id;
	renderTabs();
	const tab = activeTab();
	if (tab) {
		brAddress.value = tab.url || '';
		updateNavButtons();
		if (tab.error) {
			showErrorPage(tab.error);
		} else if (tab.url) {
			navigate(tab.id, tab.url, false);
		} else {
			showStartPage();
		}
	}
}

function closeTab(id: string) {
	const idx = browserTabs.findIndex((t) => t.id === id);
	if (idx === -1) return;
	browserTabs.splice(idx, 1);
	if (browserTabs.length === 0) {
		activeTabId = null;
		renderTabs();
		showStartPage();
		return;
	}
	if (activeTabId === id) {
		activeTabId = browserTabs[Math.max(0, idx - 1)].id;
		activateTab(activeTabId);
	} else {
		renderTabs();
	}
}

function updateNavButtons() {
	const tab = activeTab();
	brBack.disabled = !tab || tab.historyIdx <= 0;
	brFwd.disabled = !tab || tab.historyIdx >= tab.history.length - 1;
}

function showStartPage() {
	browserContent.innerHTML = `<div class="browser-state">
		<div class="big">${globeSvg(44)}</div>
		<div>Type a URL or search terms in the address bar above.</div>
		<div class="hint">Ctrl/Cmd-click any link to open it in a new tab.</div>
	</div>`;
	updateNavButtons();
}

function showErrorPage(msg: string) {
	browserContent.innerHTML = `<div class="browser-state">
		<div class="big" style="color:#ef4444">${globeSvg(44)}</div>
		<div>Could not load page</div>
		<div class="hint" style="color:#ef4444">${escHtml(msg)}</div>
	</div>`;
}

function showLoading() {
	browserContent.innerHTML = `<div class="browser-state">
		<div class="big">${globeSvg(44)}</div>
		<div>Loading…</div>
	</div>`;
}

async function navigate(tabId: string, rawUrl: string, pushHistory: boolean) {
	const tab = browserTabs.find((t) => t.id === tabId);
	if (!tab) return;
	const url = normalizeInput(rawUrl);
	if (!url) return;
	const mySeq = ++tab.seq;

	if (pushHistory) {
		tab.history = tab.history.slice(0, tab.historyIdx + 1);
		tab.history.push(url);
		tab.historyIdx = tab.history.length - 1;
	}
	tab.url = url;
	tab.error = null;
	if (activeTabId === tabId) {
		brAddress.value = url;
		updateNavButtons();
		showLoading();
	}

	try {
		const res = await fetch('/api/browse?url=' + encodeURIComponent(url) + '&tab=' + encodeURIComponent(tabId));
		const data = await res.json();
		if (tab.seq !== mySeq) return; // stale response
		if (!res.ok || data.error) {
			const errMsg = data.error || ('HTTP ' + res.status);
			tab.error = errMsg;
			if (activeTabId === tabId) showErrorPage(errMsg);
			renderTabs();
			return;
		}
		const finalUrl: string = data.finalUrl || url;
		tab.url = finalUrl;
		tab.title = data.title || tab.title;
		tab.history[tab.historyIdx] = finalUrl;
		if (activeTabId === tabId) {
			brAddress.value = finalUrl;
			updateNavButtons();
			renderPage(data);
		}
		renderTabs();
	} catch (err) {
		if (tab.seq !== mySeq) return;
		tab.error = 'Network error: ' + (err instanceof Error ? err.message : String(err));
		if (activeTabId === tabId) showErrorPage(tab.error);
		renderTabs();
	}
}

function goBack() {
	const tab = activeTab();
	if (!tab || tab.historyIdx <= 0) return;
	tab.historyIdx--;
	navigate(tab.id, tab.history[tab.historyIdx], false);
}

function goForward() {
	const tab = activeTab();
	if (!tab || tab.historyIdx >= tab.history.length - 1) return;
	tab.historyIdx++;
	navigate(tab.id, tab.history[tab.historyIdx], false);
}

function renderPage(data: any) {
	let html = '';
	if (data.truncated) {
		html += '<div class="browser-bar"><span class="err">Response truncated — page may be incomplete.</span></div>';
	}
	html += data.html || '';
	browserContent.innerHTML = html;
	attachContentHandlers();
	browserContent.scrollTop = 0;
}

function attachContentHandlers() {
	browserContent.querySelectorAll('a[href]').forEach((a) => {
		a.addEventListener('click', (e) => {
			const href = a.getAttribute('href') || '';
			if (href.startsWith('/api/browse?')) {
				e.preventDefault();
				const me = e as MouseEvent;
				let target: string | null = null;
				try {
					target = new URL(href, location.origin).searchParams.get('url');
				} catch {
					return;
				}
				if (!target) return;
				if (me.ctrlKey || me.metaKey || me.shiftKey) {
					const id = newBrowserTab();
					navigate(id, target, true);
				} else {
					navigate(activeTabId!, target, true);
				}
			} else if (/^(about|blob|file):/i.test(href)) {
				e.preventDefault();
			}
			// mailto/tel/sms and #frag links behave natively
		});
	});
	browserContent.querySelectorAll('form').forEach((f) => {
		f.addEventListener('submit', (e) => {
			e.preventDefault();
			const action = f.getAttribute('action') || '';
			if (!action.startsWith('/api/browse/submit?')) return;
			let tabId: string | null = null;
			try {
				tabId = new URL(action, location.origin).searchParams.get('tab') || activeTabId;
			} catch {
				tabId = activeTabId;
			}
			if (!tabId) return;
			const fd = new FormData(f);
			const params = new URLSearchParams();
			fd.forEach((v, k) => params.append(k, String(v)));
			submitForm(tabId, params);
		});
	});
}

async function submitForm(tabId: string, params: URLSearchParams) {
	const tab = browserTabs.find((t) => t.id === tabId);
	if (!tab) return;
	const mySeq = ++tab.seq;
	const action = params.get('__browse_action') || '';
	params.delete('__browse_action');
	params.delete('__browse_method');
	if (activeTabId === tabId) showLoading();
	try {
		const res = await fetch('/api/browse/submit?tab=' + encodeURIComponent(tabId), {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params.toString(),
		});
		const data = await res.json();
		if (tab.seq !== mySeq) return;
		if (!res.ok || data.error) {
			const errMsg = data.error || ('HTTP ' + res.status);
			tab.error = errMsg;
			if (activeTabId === tabId) showErrorPage(errMsg);
			return;
		}
		const finalUrl: string = data.finalUrl || action || tab.url || '';
		tab.url = finalUrl;
		tab.title = data.title || tab.title;
		tab.history = tab.history.slice(0, tab.historyIdx + 1);
		tab.history.push(finalUrl);
		tab.historyIdx = tab.history.length - 1;
		tab.error = null;
		if (activeTabId === tabId) {
			brAddress.value = finalUrl;
			updateNavButtons();
			renderPage(data);
		}
		renderTabs();
	} catch (err) {
		if (tab.seq !== mySeq) return;
		tab.error = 'Network error: ' + (err instanceof Error ? err.message : String(err));
		if (activeTabId === tabId) showErrorPage(tab.error);
	}
}

function enterBrowserMode() {
	if (browserModeActive) return;
	browserModeActive = true;
	if (fileEditor.style.display !== 'none') {
		prevMainForBrowser = 'files';
		if (currentTerminal) { stopHeaderGitPolling(); currentTerminal.destroy(); currentTerminal = null; }
	} else if (currentTerminal || terminalContainer.style.display !== 'none') {
		prevMainForBrowser = 'terminal';
		prevSessionForBrowser = currentSession;
		if (currentTerminal) {
			stopHeaderGitPolling();
			currentTerminal.destroy();
			currentTerminal = null;
		}
		currentSession = null;
	} else {
		prevMainForBrowser = 'none';
	}
	terminalContainer.style.display = 'none';
	fileEditor.style.display = 'none';
	gitDiffView.style.display = 'none';
	mainPlaceholder.style.display = 'none';
	updateHeaderGit(null);
	mobileKeysEl.style.display = 'none';
	browserView.style.display = 'flex';

	if (!activeTabId) {
		newBrowserTab();
	} else {
		renderTabs();
		const tab = activeTab();
		if (tab) {
			brAddress.value = tab.url || '';
			updateNavButtons();
			if (tab.url) navigate(tab.id, tab.url, false);
			else showStartPage();
		}
	}
	expandSidebar();
}

function exitBrowserMode() {
	if (!browserModeActive) return;
	browserModeActive = false;
	browserView.style.display = 'none';
	mobileKeysEl.style.display = '';
	if (prevMainForBrowser === 'files') {
		fileEditor.style.display = 'flex';
	} else if (prevMainForBrowser === 'terminal' && prevSessionForBrowser) {
		const s = prevSessionForBrowser;
		prevSessionForBrowser = null;
		openSession(s);
	} else if (currentSession) {
		terminalContainer.style.display = '';
		terminalContainer.classList.add('terminal-pending');
		startHeaderGitPolling();
	} else {
		mainPlaceholder.style.display = 'flex';
	}
	prevMainForBrowser = 'none';
}

brBack.addEventListener('click', goBack);
brFwd.addEventListener('click', goForward);
brReload.addEventListener('click', () => {
	const tab = activeTab();
	if (tab && tab.url) navigate(tab.id, tab.url, false);
});
brNew.addEventListener('click', () => { newBrowserTab(); brAddress.focus(); brAddress.select(); });
brAddress.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();
		const id = activeTabId || newBrowserTab();
		navigate(id, brAddress.value, true);
		brAddress.blur();
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
	enter: '\r',
	exit: 'exit\r',
	yes: 'yes\r',
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

// ── Mobile keyboard input ──

const mkInput = document.getElementById('mk-input') as HTMLTextAreaElement | null;
const mkSend = document.getElementById('mk-send') as HTMLButtonElement | null;

function sendMkText() {
	if (!mkInput || !currentTerminal) return;
	const text = mkInput.value;
	if (!text) return;
	currentTerminal.sendInput(text + '\r');
	mkInput.value = '';
	mkInput.rows = 1;
	currentTerminal.focus();
}

if (mkInput) {
	mkInput.addEventListener('input', () => {
		mkInput.rows = 1;
		const lines = mkInput.value.split('\n').length;
		mkInput.rows = Math.min(lines, 4);
	});

	mkInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMkText();
		}
	});
}

if (mkSend) {
	mkSend.addEventListener('click', sendMkText);
}

// ── iOS keyboard: prevent page push-up ──

if (window.visualViewport) {
	const appLayout = document.querySelector('.app-layout') as HTMLElement | null;
	const clampLayout = () => {
		// Keep layout inside visual viewport height
		if (appLayout) appLayout.style.height = window.visualViewport!.height + 'px';
		// iOS auto-scrolls the page when keyboard opens, pushing content up.
		// Scroll back to top immediately to counteract this.
		window.scrollTo(0, 0);
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
	};
	window.visualViewport.addEventListener('resize', clampLayout);
	window.addEventListener('orientationchange', () => setTimeout(clampLayout, 100));

	// Also reset scroll on any touch that might trigger keyboard
	document.addEventListener('touchstart', () => {
		if (window.scrollY > 0 || document.documentElement.scrollTop > 0) {
			window.scrollTo(0, 0);
		}
	}, { passive: true });
}

// ── Process panel (RAM click → top memory consumers) ──

const processPanel = document.getElementById('process-panel')!;
const procList = document.getElementById('proc-list')!;
const procClose = document.getElementById('proc-close')!;
const procBackdrop = document.getElementById('proc-backdrop')!;
const ramEl = document.getElementById('header-ram')!;

function loadProcesses() {
	procList.innerHTML = '<div class="proc-empty">Loading…</div>';
	fetch('/api/system/processes').then(r => r.json()).then((procs: any[]) => {
		if (!Array.isArray(procs) || !procs.length) {
			procList.innerHTML = '<div class="proc-empty">No processes</div>';
			return;
		}
		let html = '';
		for (const p of procs) {
			const rss = p.rss;
			const rssStr = rss < 1048576 ? (rss / 1024).toFixed(0) + 'K' : (rss / 1048576).toFixed(1) + 'M';
			html += '<div class="proc-row" data-pid="' + p.pid + '">'
				+ '<span class="proc-mem">' + p.mem + '%</span>'
				+ '<span class="proc-rss">' + rssStr + '</span>'
				+ '<span class="proc-cmd" title="' + escHtml(p.command) + '">' + escHtml(p.command) + '</span>'
				+ '<button class="proc-kill" title="Kill PID ' + p.pid + '">&times;</button>'
				+ '</div>';
		}
		procList.innerHTML = html;
		// Wire kill buttons
		for (const row of procList.querySelectorAll('.proc-row')) {
			const btn = row.querySelector('.proc-kill');
			if (!btn) continue;
			btn.addEventListener('click', (e) => {
				const r = (e.target as HTMLElement).closest('.proc-row') as HTMLElement;
				if (!r || !confirm('Kill PID ' + r.dataset.pid + '?')) return;
				fetch('/api/system/kill', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ pid: parseInt(r.dataset.pid!, 10) }),
				}).then(res => res.json()).then(data => {
					if (data.ok) { r.style.opacity = '0.3'; }
					else { alert('Failed: ' + (data.error || 'unknown')); }
				}).catch(() => alert('Network error'));
			});
		}
	}).catch(() => {
		procList.innerHTML = '<div class="proc-empty">Failed to load</div>';
	});
}

function openProcessPanel() {
	processPanel.classList.add('open');
	procBackdrop.classList.add('open');
	loadProcesses();
}

function closeProcessPanel() {
	processPanel.classList.remove('open');
	procBackdrop.classList.remove('open');
}

ramEl.addEventListener('click', (e) => {
	e.stopPropagation();
	if (processPanel.classList.contains('open')) {
		closeProcessPanel();
	} else {
		openProcessPanel();
	}
});

procClose.addEventListener('click', closeProcessPanel);
procBackdrop.addEventListener('click', closeProcessPanel);

// ── Init ──

(window as any).__openSession = openSession;
(window as any).__refreshSidebar = renderSessionList;
renderSessionList();
collapseSidebar();
