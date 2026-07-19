import{cssVarsStyle as f}from"../theme.js";import{commandbarCSS as x,commandbarHTML as h,commandbarScript as u}from"../commandbar.js";import{notesDrawerCSS as w,notesDrawerHTML as S,notesDrawerScript as $}from"../notes-drawer.js";import{sharedLayoutCSS as y,sharedHeader as _,sharedSidebar as k,newSessionModalHTML as D,newSessionModalScript as T}from"../shared-layout.js";function s(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function C(t){const a=new Date(t);return a.toLocaleDateString()+" "+a.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}function z(t,a,r=!1,l=[],i=!1){const n=[...t].sort((e,o)=>(o.updatedAt??0)-(e.updatedAt??0)),c=n.map(e=>{const o=e.scope==="__global__",m=o?"Global":e.scope.replace(/^session:/,""),v=o?"/notes/__global__":"/notes/"+encodeURIComponent(e.scope.replace(/^session:/,"")),g=s((e.content||"").slice(0,200).trim()||"No content"),b=s(C(e.updatedAt));return`<a class="note-card" href="${v}">
  <div class="label ${o?"global":""}">${s(m)}</div>
  <div class="preview">${g}</div>
  <div class="meta"><span>${b}</span></div>
</a>`}).join(`
`),p=n.length?c:'<p class="empty">No notes yet.</p>',d=`
  .note-card {
    display: block; padding: 16px 18px; border: 1px solid var(--panel-border); border-radius: 12px;
    margin-bottom: 10px; text-decoration: none; color: var(--page-fg);
    background: var(--panel-bg); transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s; cursor: pointer;
  }
  .note-card:hover { border-color: var(--panel-accent); transform: translateY(-1px); box-shadow: 0 4px 20px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .note-card .label {
    font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--panel-accent); margin-bottom: 6px;
  }
  .note-card .label.global { color: var(--panel-success); }
  .note-card .preview {
    font-size: var(--text-sm); color: var(--panel-muted); line-height: 1.5;
    white-space: pre-wrap; word-break: break-word;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .note-card .meta {
    font-size: var(--text-xs); color: var(--panel-muted); margin-top: 10px;
    display: flex; justify-content: space-between;
  }
  .empty { font-size: var(--text-sm); color: var(--panel-muted); line-height: 1.6; margin-top: 20px; }
  ${r?x():""}
  ${w()}`;return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Notes - tmux-web</title>
<style>
  ${f(a.shell)}
  ${y(d)}
</style>
</head>
<body>

${_({commandbarEnabled:r,title:"All Notes",themeTemplate:a.template})}

<div class="page-wrap">
  <div class="page-layout">
    ${k({activePage:"notes",agentsEnabled:i,refreshHref:"/notes"})}
    <main class="main-panel">
      <div id="notes-list">${p}</div>
    </main>
  </div>
</div>

${D()}
${r?h():""}
${S("Notes - Global")}

<script type="module">
${$("__global__")}
${r?u(l,[]):""}
${T()}
</script>
</body>
</html>`}export{z as renderNotesIndex};
