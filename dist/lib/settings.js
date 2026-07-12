import{readFile as i,writeFile as e,mkdir as n}from"node:fs/promises";import a from"node:path";import{getSettingsPath as o}from"./state-paths.js";const t=o();async function u(){try{return JSON.parse(await i(t,"utf-8"))}catch{return{}}}async function f(r){await n(a.dirname(t),{recursive:!0}),await e(t,JSON.stringify(r,null,2)+`
`)}export{u as readSettings,f as writeSettings};
