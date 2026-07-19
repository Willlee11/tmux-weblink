import type { FitAddon as FitAddonType } from '@xterm/addon-fit';
import type { Terminal as XTerminalType } from '@xterm/xterm';

const GHOSTTY_WEB_URL = 'https://esm.sh/ghostty-web@0.4.0';

const OSC_COLOR_RE = /\x1b\](?:10|11|110|111|104)(?:;[^\x07\x1b]*)?\x1b?(?:\\|\x07)/g;

function stripOscColorSequences(data: string): string {
	return data.replace(OSC_COLOR_RE, '');
}

let xtermCssPromise: Promise<void> | undefined;
function ensureXtermCss(): Promise<void> {
	if (xtermCssPromise) return xtermCssPromise;
	const existing = document.querySelector('link[data-tmux-web-xterm-css]');
	if (existing) return (xtermCssPromise = Promise.resolve());
	xtermCssPromise = new Promise<void>((resolve) => {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = '/assets/xterm.css';
		link.setAttribute('data-tmux-web-xterm-css', '');
		link.addEventListener('load', () => resolve(), { once: true });
		link.addEventListener('error', () => resolve(), { once: true });
		document.head.appendChild(link);
	});
	return xtermCssPromise;
}

export type TerminalBufferConfig = {
	initialLines: number;
	historyChunk: number;
	syncIdleMs: number;
	syncMaxMs: number;
};

export type TerminalTheme = {
	foreground: string;
	background: string;
	cursor: string;
	cursorAccent: string;
	selectionBackground: string;
	selectionForeground: string;
	black: string;
	red: string;
	green: string;
	yellow: string;
	blue: string;
	magenta: string;
	cyan: string;
	white: string;
	brightBlack: string;
	brightRed: string;
	brightGreen: string;
	brightYellow: string;
	brightBlue: string;
	brightMagenta: string;
	brightCyan: string;
	brightWhite: string;
};

export type TerminalInitConfig = {
	terminal: TerminalBufferConfig;
	scrollback: number;
	theme: TerminalTheme;
	renderer?: 'xterm' | 'ghostty';
};

type ServerMessage =
	| { type: 'auth.required'; setupMode: boolean }
	| { type: 'auth.ok'; setupMode: boolean; token?: string }
	| { type: 'auth.failed'; message: string; retryAfterMs?: number; permanentLock?: boolean }
	| { type: 'snapshot'; data: string; lines: number }
	| { type: 'data'; data: string }
	| { type: 'history'; data: string; before: number; lines: number }
	| {
			type: 'window_changed';
			activeIndex: number;
			windows: { index: number; name: string; active: boolean }[];
	  };

export interface TerminalInstance {
	destroy(): void;
	focus(): void;
	sendInput(data: string): void;
}

interface TerminalAdapter {
	readonly cols: number;
	readonly rows: number;
	write(data: string): Promise<void>;
	reset(): void;
	scrollToBottom(): void;
	scrollToLine(line: number): void;
	isNearScrollbackTop(): boolean;
	viewportY(): number;
	baseY(): number;
	fit(): boolean;
	focus(): void;
	pasteText(text: string): void;
	input(data: string): void;
	onData(callback: (data: string) => void): void;
	onResize(callback: (size: { cols: number; rows: number }) => void): void;
	onScroll(callback: () => void): void;
	attachCustomKeyEventHandler(callback: (event: KeyboardEvent) => boolean): void;
	isFocused(): boolean;
}

class XtermAdapter implements TerminalAdapter {
	private readonly terminal: XTerminalType;
	private readonly fitAddon: FitAddonType;
	private readonly container: HTMLElement;

	private constructor(container: HTMLElement, terminal: XTerminalType, fitAddon: FitAddonType) {
		this.container = container;
		this.terminal = terminal;
		this.fitAddon = fitAddon;
		this.terminal.loadAddon(this.fitAddon);
		this.terminal.open(container);
	}

	static async create(container: HTMLElement, scrollback: number, theme: TerminalTheme): Promise<XtermAdapter> {
		const [{ Terminal }, { FitAddon }] = await Promise.all([
			import('@xterm/xterm'),
			import('@xterm/addon-fit'),
			ensureXtermCss(),
		]);
		const terminal = new Terminal({
			fontSize: 14,
			fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
			cursorBlink: true,
			cursorStyle: 'bar',
			scrollback,
			convertEol: false,
			theme,
		});
		return new XtermAdapter(container, terminal, new FitAddon());
	}

	get cols(): number { return this.terminal.cols; }
	get rows(): number { return this.terminal.rows; }
	write(data: string): Promise<void> { return new Promise((resolve) => this.terminal.write(data, resolve)); }
	reset(): void { this.terminal.reset(); }
	scrollToBottom(): void { this.terminal.scrollToBottom(); }
	scrollToLine(line: number): void { this.terminal.scrollToLine(Math.max(0, line)); }
	isNearScrollbackTop(): boolean { return this.terminal.buffer.active.viewportY <= 1; }
	viewportY(): number { return this.terminal.buffer.active.viewportY; }
	baseY(): number { return this.terminal.buffer.active.baseY; }
	fit(): boolean {
		const rect = getTerminalViewportRect(this.container);
		if (rect.width <= 0 || rect.height <= 0) return false;
		this.fitAddon.fit();
		return true;
	}
	focus(): void { this.terminal.focus(); }
	pasteText(text: string): void { this.terminal.paste(text); }
	input(data: string): void { this.terminal.input(data, false); }
	onData(callback: (data: string) => void): void { this.terminal.onData(callback); this.terminal.onBinary(callback); }
	onResize(callback: (size: { cols: number; rows: number }) => void): void { this.terminal.onResize(callback); }
	onScroll(callback: () => void): void { this.terminal.onScroll(callback); }
	attachCustomKeyEventHandler(callback: (event: KeyboardEvent) => boolean): void { this.terminal.attachCustomKeyEventHandler(callback); }
	isFocused(): boolean {
		const active = document.activeElement;
		return !!active && (active === this.container || this.container.contains(active));
	}
}

class GhosttyAdapter implements TerminalAdapter {
	private readonly terminal: any;
	private readonly container: HTMLElement;
	private colsValue = 80;
	private rowsValue = 24;
	private charW = 0;
	private charH = 0;
	private resizeCallbacks: Array<(size: { cols: number; rows: number }) => void> = [];

	constructor(container: HTMLElement, terminal: any) {
		this.container = container;
		this.terminal = terminal;
		this.terminal.open(container);
	}

	static async create(container: HTMLElement, scrollback: number, theme: TerminalTheme): Promise<GhosttyAdapter> {
		const mod = await import(GHOSTTY_WEB_URL);
		await mod.init();
		const terminal = new mod.Terminal({
			fontSize: 14, fontFamily: "'JetBrains Mono', 'SF Mono', 'Menlo', monospace",
			cursorBlink: true, cursorStyle: 'bar', scrollback, convertEol: false, theme,
		});
		return new GhosttyAdapter(container, terminal);
	}

	get cols(): number { return this.colsValue; }
	get rows(): number { return this.rowsValue; }
	write(data: string): Promise<void> { return new Promise((resolve) => this.terminal.write(data, resolve)); }
	reset(): void { this.terminal.reset(); }
	scrollToBottom(): void { this.terminal.scrollToBottom?.(); }
	scrollToLine(line: number): void { this.terminal.scrollToLine?.(Math.max(0, line)); }
	isNearScrollbackTop(): boolean {
		const buf = this.terminal.buffer?.active;
		return buf ? buf.viewportY >= buf.baseY : false;
	}
	viewportY(): number { return this.terminal.buffer?.active?.viewportY ?? 0; }
	baseY(): number { return this.terminal.buffer?.active?.baseY ?? 0; }
	fit(): boolean {
		const rect = getTerminalViewportRect(this.container);
		if (rect.width <= 0 || rect.height <= 0) return false;
		this.updateCellMetrics(!this.charW || !this.charH);
		const cols = Math.floor(rect.width / this.charW);
		const rows = Math.floor(rect.height / this.charH);
		if (cols < 10 || rows < 5) return false;
		if (cols !== this.colsValue || rows !== this.rowsValue) {
			this.colsValue = cols; this.rowsValue = rows;
			this.terminal.resize(cols, rows);
			for (const cb of this.resizeCallbacks) cb({ cols, rows });
		}
		return true;
	}
	focus(): void {
		const el = this.terminal.textarea || this.container.querySelector('textarea') || this.container;
		el?.focus?.();
	}
	pasteText(text: string): void {
		const bracketed = this.terminal.getMode?.(2004) ?? false;
		this.input(bracketed ? '\x1b[200~' + text + '\x1b[201~' : text);
	}
	input(data: string): void { this.terminal.input?.(data, false); }
	onData(callback: (data: string) => void): void { this.terminal.onData((data: string) => callback(data)); }
	onResize(callback: (size: { cols: number; rows: number }) => void): void { this.resizeCallbacks.push(callback); }
	onScroll(callback: () => void): void { this.terminal.onScroll(callback); }
	attachCustomKeyEventHandler(callback: (event: KeyboardEvent) => boolean): void { this.terminal.attachCustomKeyEventHandler(callback); }
	isFocused(): boolean {
		const active = document.activeElement;
		return !!active && (active === this.container || active === this.terminal.textarea || this.container.contains(active));
	}
	private updateCellMetrics(force = false) {
		const canvas = this.container.querySelector('canvas');
		if (canvas instanceof HTMLElement && canvas.offsetWidth > 0 && canvas.offsetHeight > 0 && this.colsValue > 0 && this.rowsValue > 0) {
			const nextW = canvas.offsetWidth / this.colsValue;
			const nextH = canvas.offsetHeight / this.rowsValue;
			if (force || !this.charW || !this.charH) { this.charW = nextW; this.charH = nextH; }
		}
		if (!this.charW || !this.charH) { this.charW = 9; this.charH = 18; }
	}
}

function getTerminalViewportRect(el: HTMLElement): { width: number; height: number } {
	const rect = el.getBoundingClientRect();
	const vv = window.visualViewport;
	if (!vv) return rect;
	return {
		width: Math.min(rect.width, vv.width),
		height: Math.max(0, Math.min(rect.height, vv.height - Math.max(0, rect.top))),
	};
}

export function initTerminal(
	container: HTMLElement,
	sessionName: string,
	cfg: TerminalInitConfig,
): Promise<TerminalInstance> {
	container.innerHTML = '';
	container.classList.add('terminal-pending');

	return (async (): Promise<TerminalInstance> => {
		let term: TerminalAdapter;
		if (cfg.renderer === 'ghostty') {
			try {
				term = await GhosttyAdapter.create(container, cfg.scrollback, cfg.theme);
			} catch {
				console.error('[tmux-web] ghostty-web failed; falling back to xterm.js');
				term = await XtermAdapter.create(container, cfg.scrollback, cfg.theme);
			}
		} else {
			term = await XtermAdapter.create(container, cfg.scrollback, cfg.theme);
		}

		let ws: WebSocket | undefined;
		let fitRaf = 0;
		let fitTimer: ReturnType<typeof setTimeout> | undefined;
		let touchGesture: { startX: number; startY: number; lastX: number; lastY: number; scrolling: boolean } | null = null;
		let suppressTouchClickUntil = 0;
		let phase: 'connecting' | 'live' = 'connecting';
		let serverHistoryLoaded = 0;
		let historyLoading = false;
		let historyParts: string[] = [];
		let liveSuffix = '';
		let destroyed = false;
		let reconnectDelay = 1000;

		// IME composition state (voice input handling)
		let _composing = false;
		let _inputBuf = '';
		let _inputTimer: ReturnType<typeof setTimeout> | undefined;

		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = proto + '//' + location.host + '/ws/' + encodeURIComponent(sessionName);
		const uploadUrl = '/api/session/' + encodeURIComponent(sessionName) + '/upload';
		const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);

		function fullLoadedText(): string {
			return historyParts.join('') + liveSuffix;
		}

		async function rewriteTerminal(preserveScroll: boolean, addedLines = 0) {
			const viewportY = preserveScroll ? term.viewportY() : 0;
			const baseY = preserveScroll ? term.baseY() : 0;
			const text = stripOscColorSequences(fullLoadedText());
			term.reset();
			if (!text) {
				if (!preserveScroll) term.scrollToBottom();
				return;
			}
			await term.write(text);
			if (preserveScroll) term.scrollToLine(baseY + viewportY + addedLines);
			else term.scrollToBottom();
		}

		function sendJSON(obj: unknown) {
			if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
		}

		function handleServerMessage(raw: string) {
			let msg: ServerMessage;
			try {
				msg = JSON.parse(raw) as ServerMessage;
			} catch {
				if (phase === 'live') {
					liveSuffix += raw;
					void term.write(stripOscColorSequences(raw));
				}
				return;
			}

			if (msg.type === 'auth.required') {
				const token = localStorage.getItem('tmux-web-token');
				if (token) sendJSON({ type: 'auth.token', token });
				else location.href = '/login?returnTo=' + encodeURIComponent(location.pathname + location.search);
				return;
			}

			if (msg.type === 'auth.ok') {
				if (msg.token) localStorage.setItem('tmux-web-token', msg.token);
				reconnectDelay = 1000;
				fitTerminal();
				sendJSON({ type: 'resize', cols: term.cols, rows: term.rows });
				scheduleFit();
				return;
			}

			if (msg.type === 'auth.failed') {
				if (msg.permanentLock || (msg.retryAfterMs && msg.retryAfterMs > 60_000)) {
					localStorage.removeItem('tmux-web-token');
					location.href = '/login?error=' + encodeURIComponent(msg.message);
					return;
				}
				return;
			}

			if (msg.type === 'snapshot' && typeof msg.data === 'string') {
				const data = stripOscColorSequences(msg.data);
				historyParts = [data];
				liveSuffix = '';
				serverHistoryLoaded = typeof msg.lines === 'number' ? msg.lines : cfg.terminal.initialLines;
				phase = 'live';
				term.reset();
				void term.write(data).then(() => term.scrollToBottom());
				return;
			}

			if (msg.type === 'window_changed' && typeof msg.activeIndex === 'number') {
				const url = new URL(location.href);
				if (url.searchParams.get('window') !== String(msg.activeIndex)) {
					url.searchParams.set('window', String(msg.activeIndex));
					history.replaceState(history.state, '', url);
				}
				window.dispatchEvent(new CustomEvent('tmux:windows', { detail: msg.windows }));
				return;
			}

			if (msg.type === 'history' && typeof msg.data === 'string') {
				historyLoading = false;
				if (msg.lines > 0 && msg.data) {
					historyParts.unshift(msg.data);
					serverHistoryLoaded += msg.lines;
					void rewriteTerminal(true, msg.lines);
				}
				return;
			}

			if (msg.type === 'data' && typeof msg.data === 'string') {
				const data = stripOscColorSequences(msg.data);
				if (phase === 'connecting') {
					phase = 'live';
					liveSuffix = data;
					void term.write(data);
					return;
				}
				if (phase === 'live') {
					liveSuffix += data;
					void term.write(data);
				}
			}
		}

		function connect() {
			let url = wsUrl;
			const token = localStorage.getItem('tmux-web-token');
			if (token) url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
			ws = new WebSocket(url);
			ws.onopen = () => {
				phase = 'connecting';
				serverHistoryLoaded = 0; historyLoading = false;
				historyParts = []; liveSuffix = '';
				term.reset();
				reconnectDelay = 1000;
			};
			ws.onmessage = (event) => {
				if (typeof event.data === 'string') handleServerMessage(event.data);
			};
			ws.onclose = () => {
				if (destroyed) return;
				phase = 'connecting';
				setTimeout(() => {
					reconnectDelay = Math.min(reconnectDelay * 2, 10000);
					if (!destroyed) connect();
				}, reconnectDelay);
			};
			ws.onerror = () => ws?.close();
		}

		function sendTerminalInput(data: string) {
			sendJSON({ type: 'input', data });
		}

		function flushInputBuf() {
			if (_inputBuf) {
				sendTerminalInput(_inputBuf);
				_inputBuf = '';
			}
		}

		function fitTerminal(): boolean { return term.fit(); }
		function revealTerminal() { container.classList.remove('terminal-pending'); }

		function scheduleFit() {
			if (fitRaf) cancelAnimationFrame(fitRaf);
			if (fitTimer) clearTimeout(fitTimer);
			fitTerminal();
			fitRaf = requestAnimationFrame(() => {
				fitRaf = 0;
				if (fitTerminal()) revealTerminal();
			});
			fitTimer = setTimeout(() => {
				if (fitTerminal()) revealTerminal();
			}, 120);
		}

		function scheduleKeyboardFit() {
			scheduleFit();
			setTimeout(scheduleFit, 50);
			setTimeout(scheduleFit, 150);
			setTimeout(scheduleFit, 300);
		}

		function isImageMime(type: string | undefined): boolean {
			return typeof type === 'string' && type.startsWith('image/');
		}

		function getFirstFileFromDataTransfer(dt: DataTransfer | null): File | null {
			if (!dt?.files?.length) return null;
			return dt.files[0] ?? null;
		}

		function getImageFileFromClipboardData(cd: DataTransfer | null): File | null {
			if (!cd?.items) return null;
			for (let i = 0; i < cd.items.length; i++) {
				const item = cd.items[i];
				if (item?.kind === 'file' && isImageMime(item.type)) return item.getAsFile();
			}
			return null;
		}

		async function uploadImageBlob(blob: Blob): Promise<string> {
			const fd = new FormData();
			const filename = blob instanceof File && blob.name ? blob.name : 'upload';
			fd.append('file', blob, filename);
			const token = localStorage.getItem('tmux-web-token');
			const headers: Record<string, string> = {};
			if (token) headers['Authorization'] = 'Bearer ' + token;
			const res = await fetch(uploadUrl, { method: 'POST', body: fd, headers });
			if (!res.ok) {
				let err = 'upload failed';
				try { const j = await res.json() as { error?: string }; if (j.error) err = j.error; } catch {}
				throw new Error(err);
			}
			const j = await res.json() as { path?: string };
			if (!j.path) throw new Error('no path in response');
			return j.path;
		}

		async function ingestImageBlob(blob: Blob) {
			try {
				const filePath = await uploadImageBlob(blob);
				sendTerminalInput(filePath);
			} catch {}
		}

		// ── IME composition handling (voice input) ──
		// Capture phase: intercept before xterm.js processes them, so we can
		// track composition state and suppress duplicate onData events.
		container.addEventListener('compositionstart', () => {
			_composing = true;
		}, true);

		container.addEventListener('compositionend', (e: CompositionEvent) => {
			_composing = false;
			clearTimeout(_inputTimer);
			_inputTimer = undefined;
			_inputBuf = '';
			// Send the final composed text once — this is the only send needed.
			if (e.data) {
				sendTerminalInput(e.data);
			}
		}, true);

		// ── Event handlers ──
		term.onData((data) => {
			// Part A: during IME composition, discard onData — compositionend will send the final text.
			if (_composing) return;

			// Part B: incremental pattern detection (voice input that bypasses composition events).
			// When the new data starts with the previously buffered data and is longer,
			// it's the same voice input being extended (e.g., "但" → "但是你" → "但是你看").
			// This pattern is characteristic of IME voice input that directly writes to the textarea
			// without going through standard composition events.
			if (_inputBuf && data.startsWith(_inputBuf) && data.length > _inputBuf.length) {
				_inputBuf = data;
				clearTimeout(_inputTimer);
				_inputTimer = setTimeout(() => {
					flushInputBuf();
					_inputTimer = undefined;
				}, 40);
				return;
			}

			// If we had a pending buffer that wasn't a voice increment, flush it.
			if (_inputBuf) {
				clearTimeout(_inputTimer);
				_inputTimer = undefined;
				flushInputBuf();
			}

			// Short initial debounce: if this is the first onData, wait briefly before
			// sending — the next event might reveal it as a voice input prefix.
			// Without this, the first voice input chunk leaks through immediately.
			clearTimeout(_inputTimer);
			_inputBuf = data;
			_inputTimer = setTimeout(() => {
				flushInputBuf();
				_inputTimer = undefined;
			}, 15);
		});

		term.onResize(({ cols, rows }) => sendJSON({ type: 'resize', cols, rows }));
		term.onScroll(() => {
			if (phase !== 'live' || historyLoading || !term.isNearScrollbackTop()) return;
			historyLoading = true;
			sendJSON({ type: 'load_history', before: serverHistoryLoaded });
		});

		term.attachCustomKeyEventHandler((event) => {
			if (event.type !== 'keydown') return true;
			if ((event.ctrlKey || event.metaKey) && event.code === 'KeyV') {
				event.preventDefault();
				void (async () => {
					try {
						if (navigator.clipboard?.read) {
							const items = await navigator.clipboard.read();
							for (const item of items) {
								for (const type of item.types) {
									if (isImageMime(type)) {
										const blob = await item.getType(type);
										await ingestImageBlob(blob);
										return;
									}
								}
							}
						}
					} catch {}
					try {
						const text = await navigator.clipboard?.readText();
						if (text) term.pasteText(normalizePasteText(text));
					} catch {}
				})();
				return false;
			}
			return true;
		});

		let lastPasteAt = 0;
		function normalizePasteText(text: string): string {
			return text.split('\r\n').join('\n').split('\n').join('\r');
		}

		async function handlePasteEvent(event: ClipboardEvent) {
			const imageFile = getImageFileFromClipboardData(event.clipboardData);
			if (imageFile) {
				event.preventDefault(); event.stopPropagation();
				const now = Date.now();
				if (now - lastPasteAt < 50) return;
				lastPasteAt = now;
				await ingestImageBlob(imageFile);
				return;
			}
			const text = event.clipboardData?.getData('text/plain');
			if (!text) return;
			event.preventDefault(); event.stopPropagation();
			const now = Date.now();
			if (now - lastPasteAt < 50) return;
			lastPasteAt = now;
			term.pasteText(normalizePasteText(text));
		}

		let terminalDragDepth = 0;

		function handleDragEnter(event: DragEvent) {
			event.preventDefault();
			terminalDragDepth++;
			if (getFirstFileFromDataTransfer(event.dataTransfer)) container.classList.add('terminal-drag-over');
		}
		function handleDragOver(event: DragEvent) {
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		}
		function handleDragLeave(event: DragEvent) {
			event.preventDefault();
			terminalDragDepth--;
			if (terminalDragDepth <= 0) { terminalDragDepth = 0; container.classList.remove('terminal-drag-over'); }
		}
		async function handleDrop(event: DragEvent) {
			event.preventDefault();
			terminalDragDepth = 0;
			container.classList.remove('terminal-drag-over');
			const file = getFirstFileFromDataTransfer(event.dataTransfer);
			if (file) await ingestImageBlob(file);
		}

		function handleSafariEscape(event: KeyboardEvent) {
			if (!isSafari || event.key !== 'Escape') return;
			if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
			if (!term.isFocused()) return;
			event.preventDefault(); event.stopPropagation();
			sendTerminalInput('\x1b');
		}

		container.addEventListener('paste', handlePasteEvent);
		container.addEventListener('dragenter', handleDragEnter);
		container.addEventListener('dragover', handleDragOver);
		container.addEventListener('dragleave', handleDragLeave);
		container.addEventListener('drop', handleDrop);
		document.addEventListener('keydown', handleSafariEscape, true);

		// Touch scrolling
		function handleTouchStart(event: TouchEvent) {
			if (event.touches.length !== 1) { touchGesture = null; return; }
			const touch = event.touches[0];
			if (!touch) return;
			touchGesture = { startX: touch.clientX, startY: touch.clientY, lastX: touch.clientX, lastY: touch.clientY, scrolling: false };
			event.stopPropagation();
		}
		function handleTouchMove(event: TouchEvent) {
			if (!touchGesture || event.touches.length !== 1) return;
			const touch = event.touches[0];
			if (!touch) return;
			const totalDy = touch.clientY - touchGesture.startY;
			const totalDx = touch.clientX - touchGesture.startX;
			if (!touchGesture.scrolling) {
				if (Math.abs(totalDy) < 8 || Math.abs(totalDy) < Math.abs(totalDx)) return;
				touchGesture.scrolling = true;
				suppressTouchClickUntil = Date.now() + 500;
			}
			event.preventDefault(); event.stopPropagation();
			dispatchTerminalWheel(-(touch.clientY - touchGesture.lastY), touch.clientX, touch.clientY);
			touchGesture.lastX = touch.clientX; touchGesture.lastY = touch.clientY;
		}
		function handleTouchEnd(event: TouchEvent) {
			if (!touchGesture) return;
			const wasScrolling = touchGesture.scrolling;
			touchGesture = null;
			event.stopPropagation();
			if (!wasScrolling) term.focus();
			else { suppressTouchClickUntil = Date.now() + 500; event.preventDefault(); }
		}
		function handleTouchCancel(event: TouchEvent) {
			touchGesture = null;
			event.stopPropagation();
		}
		function handlePointerUp(event: PointerEvent) {
			if (event.pointerType === 'touch' && Date.now() < suppressTouchClickUntil) {
				event.preventDefault(); event.stopPropagation();
			}
		}

		function dispatchTerminalWheel(deltaY: number, clientX: number, clientY: number) {
			const target: Element = container.querySelector('.xterm-screen') ?? container;
			target.dispatchEvent(new WheelEvent('wheel', {
				deltaY, deltaMode: WheelEvent.DOM_DELTA_PIXEL, clientX, clientY,
				bubbles: true, cancelable: true,
			}));
		}

		container.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
		container.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
		container.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
		container.addEventListener('touchcancel', handleTouchCancel, { passive: true, capture: true });
		container.addEventListener('pointerup', handlePointerUp, true);

		function handleResize() { scheduleFit(); }
		window.addEventListener('resize', handleResize);
		window.visualViewport?.addEventListener('resize', scheduleFit);
		window.visualViewport?.addEventListener('scroll', scheduleFit);
		const resizeObserver = new ResizeObserver(() => scheduleFit());
		resizeObserver.observe(container);
		document.fonts?.ready.then(() => {
			scheduleFit();
			setTimeout(scheduleFit, 50);
			setTimeout(scheduleFit, 200);
		});
		container.addEventListener('focusin', scheduleKeyboardFit, true);

		// Start
		requestAnimationFrame(() => {
			if (fitTerminal()) revealTerminal();
			connect();
			scheduleFit();
		});

		return {
			destroy() {
				destroyed = true;
				clearTimeout(_inputTimer);
				_inputTimer = undefined;
				if (ws) {
					try { ws.close(1000, 'session switch'); } catch {}
					ws = undefined;
				}
				container.innerHTML = '';
				container.classList.remove('terminal-pending');

				window.removeEventListener('resize', handleResize);
				resizeObserver.disconnect();
				document.removeEventListener('keydown', handleSafariEscape, true);
			},
			focus() {
				term.focus();
			},
			sendInput(data: string) {
				sendTerminalInput(data);
			},
		};
	})();
}
