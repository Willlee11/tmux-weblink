import { initTerminal } from './terminal-core.js';
const pageConfig = window.__TMUX_WEB_TERMINAL__;
if (!pageConfig)
    throw new Error('missing tmux-web terminal config');
const terminalContainer = document.getElementById('terminal-container');
if (!terminalContainer)
    throw new Error('missing terminal container');
const { sessionName, ...config } = pageConfig;
void initTerminal(terminalContainer, sessionName, config).then((inst) => {
    window.tmuxWeb = {
        sendInput: (data) => inst.sendInput(data),
        focusTerminal: () => inst.focus(),
    };
});
