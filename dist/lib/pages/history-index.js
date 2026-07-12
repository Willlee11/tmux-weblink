import{cssVarsStyle as v}from"../theme.js";import{commandbarCSS as w,commandbarHTML as b,commandbarScript as y}from"../commandbar.js";import{sharedLayoutCSS as S,sharedHeader as $,sharedSidebar as M,newSessionModalHTML as H,newSessionModalScript as k}from"../shared-layout.js";function l(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function C(e,i){const t=Math.max(0,i-e),n=Math.floor(t/1e3);if(n<45)return"just now";const s=Math.floor(n/60);if(s<60)return s+"m ago";const r=Math.floor(s/60);if(r<24)return r+"h ago";const a=Math.floor(r/24);return a<30?a+"d ago":new Date(e).toLocaleDateString()}function N(e,i,t=!1,n=[],s=!1,r=new Set){const a=Date.now(),p=e.map(o=>{const x=l(o.windowName||"(unnamed)"),g=l(o.sessionName),u=l(C(o.visitedAt,a)),c=r.has(o.sessionName),d=`
  <div class="hist-main">
    <span class="hist-window">${x}</span>
    <span class="hist-session">${g}${c?"":' <span class="hist-gone">gone</span>'}</span>
  </div>
  <span class="hist-time">${u}</span>`;return c?`<a class="hist-row" href="${"/s/"+encodeURIComponent(o.sessionName)+"?window="+o.windowIndex}">${d}</a>`:`<div class="hist-row dead" title="Session no longer exists">${d}</div>`}).join(`
`),m=e.length?'<div class="hist-toolbar"><button id="hist-clear" type="button">Clear history</button></div>':"",h=e.length?p:'<p class="empty">No history yet. Sessions and windows you visit will show up here.</p>',f=`
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
  ${t?w():""}`;return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>History - tmux-web</title>
<style>
  ${v(i.shell)}
  ${S(f)}
</style>
</head>
<body>

${$({commandbarEnabled:t,title:"History",themeTemplate:i.template})}

<div class="page-wrap">
  <div class="page-layout">
    ${M({activePage:"history",agentsEnabled:s,refreshHref:"/history"})}
    <main class="main-panel">
      ${m}
      <div id="hist-list">${h}</div>
    </main>
  </div>
</div>

${H()}
${t?b():""}

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
${t?y(n,[]):""}
${k()}
</script>
</body>
</html>`}export{N as renderHistoryIndex};
