import{cssVarsStyle as b}from"../theme.js";import{getThemeTemplates as h,THEME_TEMPLATE_IDS as x}from"../themes/index.js";function n(a){return a.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function g(a,e){return`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>${n(a)} - tmux-web</title>
<style>
  ${b(e.shell)}
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: var(--font-sans); }
  .container { max-width: 680px; margin: 80px auto; padding: 0 24px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
  h1 { font-size: var(--text-xl); font-weight: 600; letter-spacing: -0.02em; color: var(--page-fg); }
  .back-link {
    font-size: var(--text-sm); color: var(--panel-muted); text-decoration: none;
    border: 1px solid var(--panel-border); padding: 8px 16px; border-radius: 10px; transition: all 0.15s;
  }
  .back-link:hover { border-color: var(--panel-accent); color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .restart-note {
    font-size: var(--text-sm); line-height: 1.6; color: var(--panel-muted);
    border: 1px dashed var(--panel-border); border-radius: 12px;
    padding: 12px 16px; margin-bottom: 24px;
  }
  .restart-note strong { color: var(--panel-accent); }
  .saved-flash {
    font-size: var(--text-sm); color: var(--panel-success);
    border: 1px solid var(--panel-success); border-radius: 12px;
    padding: 12px 16px; margin-bottom: 16px;
  }
  .error-flash {
    font-size: var(--text-sm); color: var(--page-fg); white-space: pre-wrap; word-break: break-word;
    border: 1px solid #e06c75; border-radius: 12px;
    padding: 12px 16px; margin-bottom: 16px; background: color-mix(in srgb, #e06c75 8%, var(--panel-bg));
  }
  .section { border: 1px solid var(--panel-border); border-radius: 16px; background: var(--panel-bg); padding: 20px; margin-bottom: 16px; }
  .section h2 { font-size: var(--text-sm); font-weight: 600; color: var(--page-fg); margin-bottom: 4px; }
  .section .desc { font-size: var(--text-sm); color: var(--panel-muted); line-height: 1.6; margin-bottom: 16px; }
  label.row { display: flex; align-items: center; gap: 10px; font-size: var(--text-sm); cursor: pointer; padding: 5px 0; }
  label.row input { accent-color: var(--panel-success); }
  .radios { display: flex; flex-direction: column; gap: 6px; }
  .override-note { font-size: var(--text-xs); color: var(--panel-muted); margin-top: 10px; }
  .btn {
    font-size: var(--text-sm); color: var(--page-fg); background: var(--panel-bg);
    border: 1px solid var(--panel-border); padding: 9px 18px; border-radius: 12px;
    cursor: pointer; transition: all 0.15s; font-family: inherit;
  }
  .btn:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .btn.primary { border-color: var(--panel-success); color: var(--panel-success); }
  .btn.danger:hover { border-color: #e06c75; color: #e06c75; }
  .plugin-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; font-size: var(--text-sm); border-top: 1px solid var(--panel-border); }
  .plugin-row:first-of-type { border-top: none; }
  .plugin-row .pkg { word-break: break-all; }
  .plugin-add { display: flex; gap: 10px; margin-top: 14px; }
  .plugin-add input[type=text] {
    flex: 1; font-size: var(--text-sm); font-family: inherit; color: var(--page-fg);
    background: var(--page-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; padding: 9px 12px; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .plugin-add input[type=text]:focus { border-color: var(--panel-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .num-input {
    width: 100px; font-size: var(--text-sm); font-family: inherit; color: var(--page-fg);
    background: var(--page-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; padding: 9px 12px; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .num-input:focus { border-color: var(--panel-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .suggest { font-size: var(--text-sm); color: var(--panel-muted); margin-top: 10px; }
  .suggest button { background: none; border: none; color: var(--panel-accent); cursor: pointer; font: inherit; font-size: var(--text-sm); padding: 0; text-decoration: underline; }
  .theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .theme-card {
    border: 1px solid var(--panel-border); border-radius: 14px; padding: 16px;
    cursor: pointer; transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s; background: var(--panel-bg);
  }
  .theme-card:hover { border-color: var(--panel-accent); transform: translateY(-1px); box-shadow: 0 4px 20px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .theme-card.active { border-color: var(--panel-success); }
  .theme-card .tname { font-size: var(--text-sm); font-weight: 600; color: var(--page-fg); display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .theme-card .tname input { accent-color: var(--panel-success); }
  .swatches { display: flex; gap: 4px; flex-wrap: wrap; }
  .swatch { width: 18px; height: 18px; border-radius: 5px; border: 1px solid rgba(128,128,128,0.18); }
  .form-actions { margin-top: 12px; }
  .config-paths { font-size: var(--text-xs); color: var(--panel-muted); line-height: 1.6; margin-top: 28px; }
  .config-paths code { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); padding: 3px 7px; border-radius: 6px; }
  .btn { min-height: 44px; }
  @media (max-width: 640px) {
    .container { margin: 24px auto; padding: 0 16px; }
    .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
    .theme-grid { grid-template-columns: 1fr; }
    .num-input { width: 100%; }
  }
</style>
</head>`}function f(a,e){let r="";return a&&(r+='<div class="saved-flash">\u2713 Saved. Restart tmux-web to apply.</div>'),e&&(r+=`<div class="error-flash">${n(e)}</div>`),r}function T(a){const{settings:e,renderer:r,rendererOverridden:i,theme:l,plugins:t,saved:d=!1,error:s}=a,c=e.commandbar===!0,o=e.terminalRenderer??"xterm",m=e.defaultView??"default",u=e.scheduleHistoryDays??7,v=t.length?t.map(p=>`<div class="plugin-row">
      <span class="pkg">${n(p)}</span>
      <form method="POST" action="/settings/plugins" onsubmit="return confirm('Remove ${n(p)}?');">
        <input type="hidden" name="action" value="remove" />
        <input type="hidden" name="pkg" value="${n(p)}" />
        <button type="submit" class="btn danger">Remove</button>
      </form>
    </div>`).join(`
`):'<p class="desc" style="margin:0">No plugins enabled.</p>';return`${g("Settings",l)}
<body>
<div class="container">
  <div class="page-header">
    <h1>Settings</h1>
    <a href="/" class="back-link">Back</a>
  </div>

  <div class="restart-note">
    <strong>Note:</strong> these settings are read once at startup. You may need to
    <strong>restart the tmux-web process</strong> after making changes for them to take effect.
  </div>

  ${f(d,s)}

  <form method="POST" action="/settings">
    <div class="section">
      <h2>Command bar</h2>
      <p class="desc">\u2318K session search + quick actions.</p>
      <label class="row"><input type="checkbox" name="commandbar" ${c?"checked":""} /> Enable command bar</label>
    </div>

    <div class="section">
      <h2>Terminal library</h2>
      <p class="desc">Rendering engine for the terminal view.</p>
      <div class="radios">
        <label class="row"><input type="radio" name="terminalRenderer" value="xterm" ${o==="xterm"?"checked":""} /> xterm.js (default)</label>
        <label class="row"><input type="radio" name="terminalRenderer" value="ghostty" ${o==="ghostty"?"checked":""} /> ghostty-web</label>
      </div>
      ${i?`<p class="override-note">\u26A0 A CLI flag or <code>TMUX_WEB_TERMINAL_RENDERER</code> env var is currently forcing <strong>${r}</strong>, overriding this setting for the running process.</p>`:""}
    </div>

    <div class="section">
      <h2>Default home tab</h2>
      <p class="desc">Which tab the home page opens on.</p>
      <div class="radios">
        <label class="row"><input type="radio" name="defaultView" value="default" ${m==="default"?"checked":""} /> Default</label>
        <label class="row"><input type="radio" name="defaultView" value="recent" ${m==="recent"?"checked":""} /> Last Updated</label>
      </div>
    </div>

    <div class="section">
      <h2>Schedule history</h2>
      <p class="desc">Days to keep the <code>/schedule</code> "Recently Triggered" history (fired &amp; missed tasks). 1\u2013365, default 7.</p>
      <label class="row"><input type="number" class="num-input" name="scheduleHistoryDays" min="1" max="365" value="${u}" /> days</label>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn primary">Save settings</button>
    </div>
  </form>

  <div class="section" style="margin-top:16px">
    <h2>Plugins</h2>
    <p class="desc">Installed via npm into the tmux-web data dir. Add/remove runs npm and may take a few seconds.</p>
    ${v}
    <form method="POST" action="/settings/plugins" class="plugin-add">
      <input type="hidden" name="action" value="add" />
      <input type="text" id="pkg-input" name="pkg" placeholder="npm package name" autocomplete="off" />
      <button type="submit" class="btn">Add</button>
    </form>
  </div>

  <div class="section">
    <h2>Theme</h2>
    <p class="desc">Shell chrome + terminal colors.</p>
    <a href="/settings/theme" class="btn" style="display:inline-block;text-decoration:none">Customize theme \u2192</a>
  </div>
</div>
</body>
</html>`}const y={vscode:"VS Code",ghostty:"Ghostty","warm-clay":"Warm Clay","dark-cove":"Dark Cove"},w=["background","foreground","red","green","yellow","blue","magenta","cyan"];function S(a){const{theme:e,saved:r=!1}=a,i=h(),l=x.map(t=>{const d=i[t],s=e.template===t,c=w.map(o=>`<span class="swatch" style="background:${n(d.terminal[o])}" title="${o}"></span>`).join("");return`<label class="theme-card${s?" active":""}">
      <div class="tname">
        <input type="radio" name="template" value="${t}" ${s?"checked":""} style="accent-color:var(--panel-success)" />
        ${n(y[t]??t)}
      </div>
      <div class="swatches">${c}</div>
    </label>`}).join(`
`);return`${g("Theme",e)}
<body>
<div class="container">
  <div class="page-header">
    <h1>Theme</h1>
    <a href="/settings" class="back-link">Back</a>
  </div>

  <div class="restart-note">
    <strong>Note:</strong> the active theme is applied immediately to new page renders.
  </div>

  ${r?'<div class="saved-flash">\u2713 Theme saved.</div>':""}

  <form method="POST" action="/settings/theme">
    <div class="theme-grid">
      ${l}
    </div>
    <div class="form-actions" style="margin-top:16px">
      <button type="submit" class="btn primary">Save theme</button>
    </div>
  </form>
</div>
</body>
</html>`}export{T as renderSettings,S as renderThemeSettings};
