import{existsSync as d}from"node:fs";import b from"node:path";import{createRequire as w}from"node:module";import{getDataRoot as x,getSettingsPath as y,getThemePath as l}from"./state-paths.js";import{readSettings as c,writeSettings as v}from"./settings.js";import{readActiveTheme as T,setActiveThemeTemplate as E}from"./theme-store.js";import{isThemeTemplateId as S,THEME_TEMPLATE_IDS as $}from"./themes/index.js";import{cmdAdd as R,cmdRemove as A,getPluginDir as k}from"./plugins.js";import{getEnvFilePath as m}from"./load-env.js";import{SETUP_FEATURES as p}from"./setup-features.js";import{promptYesNo as D,promptChoice as I,requireTty as P}from"./setup-prompts.js";const _=x(),U=k(),f=y(),L=w(import.meta.url),{version:M}=L("../../package.json");function N(s){const t={};for(const e of s)switch(e){case"--yes":case"-y":t.yes=!0;break;case"--commandbar":t.commandbar=!0;break;case"--no-commandbar":t.commandbar=!1;break;case"--agents":t.agents=!0;break;case"--no-agents":t.agents=!1;break}return t}function j(s){switch(s){case"agents":return"agents";default:return"commandbar"}}async function X(s){const t=s[0]==="setup"?s.slice(1):s,e=N(t),n=e.yes||e.commandbar!==void 0||e.agents!==void 0;n||P();const u=await c();console.log(`tmux-weblink setup
`),console.log(`Configure optional features.
`);const g=new Map;for(const o of p){const i=j(o.id);let r;if(e.yes)r=!0;else if(e[i]!==void 0)r=e[i];else{const h=o.isEnabled(u);r=await D(`${o.label} (${o.description})`,h)}g.set(o.id,r)}let a;if(!n){const o=u.terminalRenderer==="ghostty"?"ghostty":"xterm";a=await I("Terminal renderer (xterm.js is the default; ghostty-web is experimental)",["xterm","ghostty"],o)}for(const o of p)g.get(o.id)?await o.enable():await o.disable();if(a){const o=await c();await v({...o,terminalRenderer:a}),console.log(`\u2713 terminal renderer set to ${a}`)}console.log(`
Done. Settings: ${f}`),d(m())&&console.log(`Env file:    ${m()}`),console.log("Restart tmux-web to apply UI changes.")}async function z(s){const[t,e]=s;switch(t){case"list":{console.log("Available themes:");for(const n of $)console.log(`  ${n}`);return}case"set":{e||(console.error("usage: tmux-web theme set <vscode|ghostty>"),process.exit(1)),S(e)||(console.error(`unknown theme: ${e}`),console.error("Run: tmux-web theme list"),process.exit(1)),await E(e),console.log(`\u2713 theme set to ${e}`),console.log(`  ${l()}`),console.log("Restart tmux-web to apply.");return}case"show":{const n=await T();console.log(`Active theme: ${n.template}`),console.log(`Config file:  ${l()}`);return}default:console.error("usage: tmux-web theme <list|set|show>"),process.exit(1)}}async function J(){const t=(await c()).plugins??[];if(t.length===0){console.log(`No plugins enabled. Add one with:
  tmux-web add <package>`);return}console.log("Enabled plugins:");for(const e of t){const n=d(b.join(U,"node_modules",e));console.log(`  ${n?"\u2713":"\u2717"} ${e}${n?"":"  (not installed \u2014 run: tmux-web add "+e+")"}`)}}function Q(){console.log(M)}function Z(){const s=_,t=m();console.log(`tmux-web \u2014 terminal-in-the-browser for tmux

Usage:
  tmux-web                       Start the server (PORT env var, default 3000)
  tmux-web --ghostty             Start with ghostty-web instead of xterm.js
  tmux-web --xterm               Start with xterm.js explicitly
  tmux-web -V, --version         Print version and exit
  tmux-web -h, --help            Show this help
  tmux-web setup                 Interactive feature setup
  tmux-web setup --yes           Enable all features without prompts
  tmux-web add <package>         Install a plugin and enable it
  tmux-web remove <package>      Uninstall a plugin and disable it
  tmux-web list                  Show enabled plugins
  tmux-web theme list            List available themes
  tmux-web theme set <name>      Set active theme (vscode, ghostty)
  tmux-web theme show            Show active theme

Files:
  ${f}   settings (plugins, commandbar)
  ${l()}   active theme (shell + terminal colors)
  ${t}       secrets (loaded automatically)
  ${s}/  plugin installs + runtime state

Most of these are also editable from the browser at /settings and /settings/theme.

Env:
  TMUX_WEB_TERMINAL_RENDERER=xterm|ghostty   (also persistable via /settings)
`)}export{R as cmdAdd,J as cmdList,A as cmdRemove,X as cmdSetup,z as cmdTheme,Z as printUsage,Q as printVersion};
