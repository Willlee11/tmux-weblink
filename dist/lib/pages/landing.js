import{cssVarsStyle as h}from"../theme.js";import{notesDrawerCSS as w,notesDrawerHTML as u,notesDrawerScript as v}from"../notes-drawer.js";import{escapeHtml as $}from"../html.js";import{commandbarCSS as y,commandbarHTML as S,commandbarScript as M}from"../commandbar.js";import{sharedLayoutCSS as k,sharedHeader as T,sharedSidebar as C,newSessionModalHTML as D,newSessionModalScript as H}from"../shared-layout.js";function L(o){const s=Date.now()-o;if(s<0)return"just now";const t=Math.floor(s/1e3),n=Math.floor(t/60),a=Math.floor(n/60),e=Math.floor(a/24),i=Math.floor(e/7),l=Math.floor(e/30),c=Math.floor(e/365),r=new Intl.RelativeTimeFormat("en",{numeric:"auto"});return t<45?"just now":n<60?r.format(-n,"minute"):a<24?r.format(-a,"hour"):e<7?r.format(-e,"day"):i<5?r.format(-i,"week"):l<12?r.format(-l,"month"):r.format(-c,"year")}function z(o,s,t){if(s==="default")return o;const n=[],a=[];for(const e of o)t.has(e.name)?n.push(e):a.push(e);return n.sort((e,i)=>(t.get(i.name)??0)-(t.get(e.name)??0)),[...n,...a]}function E(o,s,t){const n=`${o.windows} window${o.windows!==1?"s":""}`,a=o.attached?" \xB7 attached":"";if(s==="default")return`${n}${a}`;const e=t.get(o.name);return e?`${n}${a} \xB7 ${L(e)}`:`${n}${a}`}function j(o,s){const{view:t,accessMap:n,commandbarEnabled:a=!1,commandbarSessions:e=[],agentsEnabled:i=!1,theme:l}=s,c=z(o,t,n),r=[{label:"Open notes",meta:"Global notes",clickTargetId:"notes-toggle"}];i&&r.push({label:"View All Agents",meta:"Running agents",href:"/agents"});const p=c.map(m=>`<a href="/s/${encodeURIComponent(m.name)}" class="session-row">
      <span class="name">${$(m.name)}</span>
      <span class="meta">${E(m,t,n)}</span>
    </a>`).join(`
`),d=o.length===0?'<p class="empty">No tmux sessions found.<br>Create one with <code>tmux new -s mysession</code><br>or use the <strong>New Session</strong> button.</p>':"",f=t==="recent"?"/?view=recent":"/",g=t==="default"?" active":"",b=t==="recent"?" active":"",x=`
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
  ${a?y():""}
  ${w()}`;return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>tmux-weblink</title>
<style>
  ${h(l.shell)}
  ${k(x)}
</style>
</head>
<body>

${T({commandbarEnabled:a,title:"TMUX Sessions",themeTemplate:l.template})}

<div class="page-wrap">
  <div class="page-layout">
    ${C({activePage:"home",agentsEnabled:i,refreshHref:f})}
    <main class="main-panel">
      <nav class="view-tabs">
        <a href="/" class="tab${g}">Default</a>
        <a href="/?view=recent" class="tab${b}">Last Updated</a>
      </nav>
      ${p}
      ${d}
    </main>
  </div>
</div>

${D()}
${a?S():""}
${u("Notes - Global")}

<script type="module">
${v("__global__")}
${a?M(e,r):""}
${H()}
</script>
</body>
</html>`}export{j as renderLanding};
