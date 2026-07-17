import { initTerminal, type TerminalInitConfig } from './terminal-core.js';

declare global {
	interface Window {
		__TMUX_WEB_TERMINAL__?: TerminalInitConfig & { sessionName: string };
		tmuxWeb?: { sendInput(data: string): void; focusTerminal(): void };
	}
}

const pageConfig = window.__TMUX_WEB_TERMINAL__;
if (!pageConfig) throw new Error('missing tmux-web terminal config');

const terminalContainer = document.getElementById('terminal-container');
if (!terminalContainer) throw new Error('missing terminal container');

const { sessionName, ...config } = pageConfig;

void initTerminal(terminalContainer, sessionName, config).then((inst) => {
	window.tmuxWeb = {
		sendInput: (data: string) => inst.sendInput(data),
		focusTerminal: () => inst.focus(),
	};
});
