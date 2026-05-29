import { describe, expect, it } from 'vitest';
import { mobileToolbarCSS, mobileToolbarHTML, mobileToolbarScript } from '../src/lib/mobile-toolbar.js';
import { renderTerminal } from '../src/lib/pages/terminal.js';
import { vscodeTheme } from '../src/lib/themes/index.js';

describe('mobile toolbar', () => {
	it('renders the bar with mic + keyboard buttons and the send modal', () => {
		const html = mobileToolbarHTML();
		expect(html).toContain('id="mic-toggle"');
		expect(html).toContain('id="type-toggle"');
		expect(html).toContain('id="type-input"');
		expect(html).toContain('id="type-send"');
		expect(html).toContain('id="type-send-enter"');
	});

	it('is mobile-only: hidden by default, shown at the 560px breakpoint', () => {
		const css = mobileToolbarCSS();
		expect(css).toContain('#mobile-toolbar { display: none; }');
		expect(css).toContain('@media (max-width: 560px)');
	});

	it('Send ⏎ appends a carriage return and uses feature-detected speech recognition', () => {
		const script = mobileToolbarScript('demo');
		// Enter branch appends \r (escaped in the generated source string).
		expect(script).toContain("text + '\\r'");
		// Sends through the global hook exposed by terminal-client.
		expect(script).toContain('window.tmuxWeb.sendInput');
		// Browser Web Speech API with graceful fallback.
		expect(script).toContain('window.SpeechRecognition || window.webkitSpeechRecognition');
	});

	it('is wired into the rendered terminal page', () => {
		const html = renderTerminal('mysession', [], { theme: vscodeTheme });
		expect(html).toContain('id="mobile-toolbar"');
		expect(html).toContain('id="mic-toggle"');
		expect(html).toContain('id="type-send-enter"');
		expect(html).toContain('@media (max-width: 560px)');
	});
});
