import{execFileSync as o}from"node:child_process";function a(){try{return o("tmux",["list-sessions","-F","#{session_name}	#{session_windows}	#{session_attached}"],{encoding:"utf-8",timeout:3e3}).trim().split(`
`).filter(Boolean).map(t=>{const[s,n,e]=t.split("	");return{name:s,windows:parseInt(n,10),attached:e!=="0"}})}catch{return[]}}export{a as listSessions};
