import{cssVarsStyle as u}from"../theme.js";import{commandbarCSS as v,commandbarHTML as w,commandbarScript as b}from"../commandbar.js";import{sharedLayoutCSS as y,sharedHeader as S,sharedSidebar as $,newSessionModalHTML as M,newSessionModalScript as H}from"../shared-layout.js";function l(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function k(t,s){const e=Math.max(0,s-t),i=Math.floor(e/1e3);if(i<45)return"just now";const o=Math.floor(i/60);if(o<60)return o+"m ago";const r=Math.floor(o/60);if(r<24)return r+"h ago";const a=Math.floor(r/24);return a<30?a+"d ago":new Date(t).toLocaleDateString()}function L(t,s,e=!1,i=[],o=new Set){const r=Date.now(),a=t.map(n=>{const f=l(n.windowName||"(unnamed)"),x=l(n.sessionName),g=l(k(n.visitedAt,r)),c=o.has(n.sessionName),d=`
  <div class="hist-main">
    <span class="hist-window">${f}</span>
    <span class="hist-session">${x}${c?"":' <span class="hist-gone">gone</span>'}</span>
  </div>
  <span class="hist-time">${g}</span>`;return c?`<a class="hist-row" href="/">${d}</a>`:`<div class="hist-row dead" title="Session no longer exists">${d}</div>`}).join(`
`),p=t.length?'<div class="hist-toolbar"><button id="hist-clear" type="button">Clear history</button></div>':"",h=t.length?a:'<p class="empty">No history yet. Sessions and windows you visit will show up here.</p>',m=`
  .hist-toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
  .hist-toolbar button {
    background: none; border: 1px solid var(--panel-border); border-radius: 6px;
    color: var(--panel-muted); font-family: inherit; font-size: var(--text-xs);
    padding: 8px 14px; cursor: pointer; transition: border-color 0.15s, color 0.15s, background 0.15s;
    min-height: 44px;
  }
  .hist-toolbar button:hover { border-color: #fc8181; color: #fc8181; background: color-mix(in srgb, #fc8181 8%, transparent); }
  .hist-toolbar button:focus-visible { box-shadow: 0 0 0 2px #fc8181; outline: none; }
  .hist-row {
    display: flex; align-items: center; gap: 12px; justify-content: space-between;
    padding: 14px 16px; border: 1px solid var(--panel-border); border-radius: 10px;
    margin-bottom: 8px; text-decoration: none; color: var(--page-fg);
    background: var(--panel-bg); transition: border-color 0.15s, transform 0.1s;
  }
  .hist-row:hover { border-color: var(--panel-accent); transform: translateY(-1px); }
  .hist-row.dead { opacity: 0.5; cursor: default; }
  .hist-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .hist-window {
    font-size: var(--text-sm); font-weight: 600; color: var(--page-fg);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .hist-session { font-size: var(--text-xs); color: var(--panel-muted); letter-spacing: 0.03em; }
  .hist-gone {
    color: #fc8181; text-transform: uppercase; font-size: var(--text-xs); letter-spacing: 0.08em;
    border: 1px solid currentColor; border-radius: 3px; padding: 0 4px; margin-left: 4px;
  }
  .hist-time { font-size: var(--text-xs); color: var(--panel-muted); flex-shrink: 0; }
  .empty { font-size: var(--text-sm); color: var(--panel-muted); line-height: 1.6; margin-top: 20px; }
  @media (max-width: 560px) {
    .hist-row { flex-direction: column; align-items: flex-start; gap: 8px; }
    .hist-time { align-self: flex-end; }
  }
  ${e?v():""}`;return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>History - tmux-web</title>
<style>
  ${u(s.shell)}
  ${y(m)}
</style>
</head>
<body>

${S({commandbarEnabled:e,title:"History",themeTemplate:s.template})}

<div class="page-wrap">
  <div class="page-layout">
    ${$({activePage:"history",refreshHref:"/history"})}
    <main class="main-panel">
      ${p}
      <div id="hist-list">${h}</div>
    </main>
  </div>
</div>

${M()}
${e?w():""}

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
${e?b(i,[]):""}
${H()}
</script>
</body>
</html>`}export{L as renderHistoryIndex};
