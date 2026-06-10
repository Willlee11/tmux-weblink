import { cssVarsStyle } from '../theme.js';
import type { WindowHistoryRecord } from '../db.js';
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

/** Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago". */
function relativeTime(ts: number, now: number): string {
	const diff = Math.max(0, now - ts);
	const s = Math.floor(diff / 1000);
	if (s < 45) return 'just now';
	const m = Math.floor(s / 60);
	if (m < 60) return m + 'm ago';
	const h = Math.floor(m / 60);
	if (h < 24) return h + 'h ago';
	const d = Math.floor(h / 24);
	if (d < 30) return d + 'd ago';
	return new Date(ts).toLocaleDateString();
}

export function renderHistoryIndex(
	history: WindowHistoryRecord[],
	theme: TmuxWebTheme,
	commandbarEnabled = false,
	commandbarSessions: CommandbarSession[] = [],
	agentsEnabled = false,
	liveSessionNames: Set<string> = new Set(),
): string {
	const now = Date.now();

	const rows = history.map((h) => {
		const win = escapeHtml(h.windowName || '(unnamed)');
		const session = escapeHtml(h.sessionName);
		const time = escapeHtml(relativeTime(h.visitedAt, now));
		const live = liveSessionNames.has(h.sessionName);
		const inner = `
  <div class="hist-main">
    <span class="hist-window">${win}</span>
    <span class="hist-session">${session}${live ? '' : ' <span class="hist-gone">gone</span>'}</span>
  </div>
  <span class="hist-time">${time}</span>`;
		if (live) {
			const href = '/s/' + encodeURIComponent(h.sessionName) + '?window=' + h.windowIndex;
			return `<a class="hist-row" href="${href}">${inner}</a>`;
		}
		return `<div class="hist-row dead" title="Session no longer exists">${inner}</div>`;
	}).join('\n');

	const toolbar = history.length
		? `<div class="hist-toolbar"><button id="hist-clear" type="button">Clear history</button></div>`
		: '';

	const body = history.length ? rows : '<p class="empty">No history yet. Sessions and windows you visit will show up here.</p>';

	const pageSpecificCSS = `
  .hist-toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
  .hist-toolbar button {
    background: none; border: 1px solid var(--panel-border); border-radius: 6px;
    color: var(--panel-muted); font-family: inherit; font-size: 11px;
    padding: 6px 12px; cursor: pointer; transition: border-color 0.15s, color 0.15s;
  }
  .hist-toolbar button:hover { border-color: #fc8181; color: #fc8181; }
  .hist-row {
    display: flex; align-items: center; gap: 12px; justify-content: space-between;
    padding: 12px 16px; border: 1px solid var(--panel-border); border-radius: 8px;
    margin-bottom: 8px; text-decoration: none; color: var(--page-fg);
    background: var(--panel-bg); transition: border-color 0.15s;
  }
  .hist-row:hover { border-color: var(--panel-accent); }
  .hist-row.dead { opacity: 0.5; cursor: default; }
  .hist-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .hist-window {
    font-size: 14px; font-weight: 600; color: var(--page-fg);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .hist-session { font-size: 11px; color: var(--panel-muted); letter-spacing: 0.03em; }
  .hist-gone {
    color: #fc8181; text-transform: uppercase; font-size: 9px; letter-spacing: 0.08em;
    border: 1px solid currentColor; border-radius: 3px; padding: 0 4px; margin-left: 4px;
  }
  .hist-time { font-size: 11px; color: var(--panel-muted); flex-shrink: 0; }
  .empty { font-size: 13px; color: var(--panel-muted); line-height: 1.6; margin-top: 20px; }
  ${commandbarEnabled ? commandbarCSS() : ''}`;

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>History — tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  ${sharedLayoutCSS(pageSpecificCSS)}
</style>
</head>
<body>

${sharedHeader({ commandbarEnabled, title: 'History' })}

<div class="page-wrap">
  <div class="page-layout">
    ${sharedSidebar({ activePage: 'history', agentsEnabled, refreshHref: '/history' })}
    <main class="main-panel">
      ${toolbar}
      <div id="hist-list">${body}</div>
    </main>
  </div>
</div>

${newSessionModalHTML()}
${commandbarEnabled ? commandbarHTML() : ''}

<script type="module">
const clearBtn = document.getElementById('hist-clear');
if (clearBtn) {
  clearBtn.addEventListener('click', async () => {
    clearBtn.disabled = true;
    try {
      await fetch('/api/history/clear', { method: 'POST' });
      location.reload();
    } catch { clearBtn.disabled = false; }
  });
}
${commandbarEnabled ? commandbarScript(commandbarSessions, []) : ''}
${newSessionModalScript()}
</script>
</body>
</html>`;
}
