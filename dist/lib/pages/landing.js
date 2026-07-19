import{cssVarsStyle as w}from"../theme.js";import{notesDrawerCSS as b,notesDrawerHTML as v,notesDrawerScript as x}from"../notes-drawer.js";import{escapeHtml as $}from"../html.js";import{commandbarCSS as y,commandbarHTML as S,commandbarScript as M}from"../commandbar.js";import{sharedLayoutCSS as k,sharedHeader as T,sharedSidebar as C,newSessionModalHTML as A,newSessionModalScript as D}from"../shared-layout.js";function H(o){const s=Date.now()-o;if(s<0)return"just now";const a=Math.floor(s/1e3),n=Math.floor(a/60),t=Math.floor(n/60),e=Math.floor(t/24),i=Math.floor(e/7),c=Math.floor(e/30),l=Math.floor(e/365),r=new Intl.RelativeTimeFormat("en",{numeric:"auto"});return a<45?"just now":n<60?r.format(-n,"minute"):t<24?r.format(-t,"hour"):e<7?r.format(-e,"day"):i<5?r.format(-i,"week"):c<12?r.format(-c,"month"):r.format(-l,"year")}function L(o,s,a){if(s==="default")return o;const n=[],t=[];for(const e of o)a.has(e.name)?n.push(e):t.push(e);return n.sort((e,i)=>(a.get(i.name)??0)-(a.get(e.name)??0)),[...n,...t]}function z(o,s,a){const n=`${o.windows} window${o.windows!==1?"s":""}`,t=o.attached?" \xB7 attached":"";if(s==="default")return`${n}${t}`;const e=a.get(o.name);return e?`${n}${t} \xB7 ${H(e)}`:`${n}${t}`}function F(o,s){const{view:a,accessMap:n,commandbarEnabled:t=!1,commandbarSessions:e=[],agentsEnabled:i=!1,theme:c}=s,l=L(o,a,n),r=[{label:"Open notes",meta:"Global notes",clickTargetId:"notes-toggle"}];i&&r.push({label:"View All Agents",meta:"Running agents",href:"/agents"});const p=l.map(m=>`<a href="/s/${encodeURIComponent(m.name)}" class="session-row">
      <span class="name">${$(m.name)}</span>
      <span class="meta">${z(m,a,n)}</span>
    </a>`).join(`
`),d=o.length===0?'<p class="empty">No tmux sessions found.<br>Create one with <code>tmux new -s mysession</code><br>or use the <strong>New Session</strong> button.</p>':"",f=a==="recent"?"/?view=recent":"/",g=a==="default"?" active":"",u=a==="recent"?" active":"",h=`
  .session-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 18px 22px; border: 1px solid var(--panel-border); border-radius: 16px;
    margin-bottom: 12px; text-decoration: none; color: var(--page-fg);
    background: var(--panel-bg); transition: transform 0.1s, box-shadow 0.15s, border-color 0.15s;
  }
  .session-row:hover {
    border-color: var(--panel-accent);
    box-shadow: 0 4px 20px color-mix(in srgb, var(--panel-accent) 8%, transparent);
    transform: translateY(-1px);
  }
  .session-row .name { font-size: var(--text-base); font-weight: 500; color: var(--page-fg); }
  .session-row .meta { font-size: var(--text-sm); color: var(--panel-muted); text-align: right; margin-top: 4px; }
  .empty { font-size: var(--text-sm); color: var(--panel-muted); line-height: 1.7; margin-top: 12px; }
  .empty code { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); padding: 3px 7px; border-radius: 6px; font-size: var(--text-xs) }
  .empty strong { color: var(--panel-accent); font-weight: 500; }
  .view-tabs {
    display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;
  }
  .view-tabs .tab {
    display: inline-flex; align-items: center;
    font-size: var(--text-sm); color: var(--panel-muted); text-decoration: none;
    min-height: 44px; padding: 8px 16px; border-radius: 999px;
    transition: color 0.15s, background 0.15s;
  }
  .view-tabs .tab:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .view-tabs .tab.active { color: var(--panel-accent-on); background: var(--panel-accent); }
  @media (max-width: 560px) {
    .session-row { flex-direction: column; align-items: flex-start; gap: 6px; padding: 16px 18px; }
    .session-row .meta { text-align: left; margin-top: 0; }
  }
  ${t?y():""}
  ${b()}`;return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>tmux-weblink</title>
<style>
  ${w(c.shell)}
  ${k(h)}
</style>
</head>
<body>

${T({commandbarEnabled:t,title:"TMUX Sessions",themeTemplate:c.template})}

<div class="page-wrap">
  <div class="page-layout">
    ${C({activePage:"home",agentsEnabled:i,refreshHref:f})}
    <main class="main-panel">
      <nav class="view-tabs">
        <a href="/" class="tab${g}">Default</a>
        <a href="/?view=recent" class="tab${u}">Last Updated</a>
      </nav>
      ${p}
      ${d}
    </main>
  </div>
</div>

${A()}
${t?S():""}
${v("Notes - Global")}

<script type="module">
${x("__global__")}
${t?M(e,r):""}
${D()}
</script>
</body>
</html>`}export{F as renderLanding};
