import{cssVarsStyle as b}from"../theme.js";import{commandbarCSS as x,commandbarHTML as f,commandbarScript as h}from"../commandbar.js";import{notesDrawerCSS as u,notesDrawerHTML as w,notesDrawerScript as S}from"../notes-drawer.js";import{sharedLayoutCSS as $,sharedHeader as y,sharedSidebar as _,newSessionModalHTML as k,newSessionModalScript as D}from"../shared-layout.js";function s(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function T(t){const o=new Date(t);return o.toLocaleDateString()+" "+o.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}function M(t,o,r=!1,i=[]){const n=[...t].sort((e,a)=>(a.updatedAt??0)-(e.updatedAt??0)),l=n.map(e=>{const a=e.scope==="__global__",d=a?"Global":e.scope.replace(/^session:/,""),m=a?"/notes/__global__":"/notes/"+encodeURIComponent(e.scope.replace(/^session:/,"")),v=s((e.content||"").slice(0,200).trim()||"No content"),g=s(T(e.updatedAt));return`<a class="note-card" href="${m}">
  <div class="label ${a?"global":""}">${s(d)}</div>
  <div class="preview">${v}</div>
  <div class="meta"><span>${g}</span></div>
</a>`}).join(`
`),c=n.length?l:'<p class="empty">No notes yet.</p>',p=`
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
  ${u()}`;return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Notes - tmux-web</title>
<style>
  ${b(o.shell)}
  ${$(p)}
</style>
</head>
<body>

${y({commandbarEnabled:r,title:"All Notes",themeTemplate:o.template})}

<div class="page-wrap">
  <div class="page-layout">
    ${_({activePage:"notes",refreshHref:"/notes"})}
    <main class="main-panel">
      <div id="notes-list">${c}</div>
    </main>
  </div>
</div>

${k()}
${r?f():""}
${w("Notes - Global")}

<script type="module">
${S("__global__")}
${r?h(i,[]):""}
${D()}
</script>
</body>
</html>`}export{M as renderNotesIndex};
