import { icon } from './icons.js';

/**
 * Mobile-only bottom toolbar for the terminal page.
 *
 * Mirrors the top `<header>` panel but is shown only on narrow viewports
 * (`@media (max-width: 560px)`). Includes an inline native textarea for input
 * (IME/voice-input safe) and a keyboard button that opens a modal with
 * Ctrl/Esc/Tab modifiers for advanced key combos.
 */

export function mobileToolbarCSS(): string {
	return `
  #mobile-toolbar { display: none; }
  @media (max-width: 560px) {
    #mobile-toolbar {
      display: flex; justify-content: space-around; align-items: center;
      flex-shrink: 0; gap: 8px;
      padding: 6px 12px;
      padding-bottom: calc(6px + env(safe-area-inset-bottom));
      background: var(--panel-bg);
      border-top: 1px solid var(--panel-border);
    }
  }
  #mobile-toolbar button {
    display: flex; align-items: center; justify-content: center;
    flex: 1; min-height: 44px;
    background: none; border: none; color: var(--panel-muted);
    cursor: pointer; border-radius: 8px; transition: color 0.15s, background 0.15s;
  }
  #mobile-toolbar button:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  #mobile-toolbar button:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  #mobile-toolbar button svg { width: 22px; height: 22px; fill: currentColor; }

  #mobile-toolbar .tb-input {
    flex: 1; display: flex; align-items: stretch; gap: 6px; min-width: 0;
  }
  #mobile-toolbar .tb-input textarea {
    flex: 1; resize: none; box-sizing: border-box;
    min-height: 38px; max-height: 96px;
    background: var(--terminal-bg, rgba(0,0,0,0.28));
    color: var(--page-fg);
    border: 1px solid var(--panel-border);
    border-radius: 8px; padding: 6px 10px;
    font-family: var(--font-mono); font-size: var(--text-base); line-height: 1.4;
    outline: none;
  }
  #mobile-toolbar .tb-input textarea:focus {
    border-color: var(--panel-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--panel-accent) 12%, transparent);
  }
  #mobile-toolbar .tb-input textarea::placeholder { color: var(--panel-muted); opacity: 0.6; }
  #mobile-toolbar .tb-input button {
    flex: 0 0 auto; min-width: 44px;
    border: 1px solid var(--panel-success); color: var(--panel-success);
  }
  #mobile-toolbar .tb-input button:hover {
    background: color-mix(in srgb, var(--panel-success) 12%, transparent);
  }
  #mobile-toolbar #tb-kb-btn { flex: 0 0 auto; min-width: 44px; }

  #type-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1001;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
  }
  #type-backdrop.open { opacity: 1; pointer-events: auto; }
  /* Anchored near the top so the on-screen keyboard never covers the textarea. */
  #type-modal {
    position: fixed; left: 50%; top: 12px; transform: translate(-50%, -130%);
    width: min(100vw - 24px, 560px); z-index: 1002;
    background: var(--panel-bg); border: 1px solid var(--panel-border);
    border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    display: flex; flex-direction: column; gap: 10px; padding: 14px;
    transition: transform 0.25s ease;
  }
  #type-modal.open { transform: translate(-50%, 0); }
  #type-modal .type-modal-header {
    display: flex; justify-content: space-between; align-items: center;
    font-family: var(--font-mono); font-size: var(--text-xs); color: var(--panel-muted);
  }
  #type-modal #type-close {
    display: flex; align-items: center; justify-content: center;
    background: none; border: none; color: var(--panel-muted);
    font-size: var(--text-xl); line-height: 1; cursor: pointer;
    min-width: 44px; min-height: 44px; padding: 8px; border-radius: 8px;
    transition: color 0.15s, background 0.15s;
  }
  #type-modal #type-close:hover { color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  #type-modal #type-close:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  #type-input {
    width: 100%; min-height: 96px; resize: vertical; box-sizing: border-box;
    background: var(--terminal-bg, rgba(0,0,0,0.28)); color: var(--page-fg);
    border: 1px solid var(--panel-border); border-radius: 6px; padding: 10px;
    font-family: var(--font-mono); font-size: var(--text-base); line-height: 1.4;
  }
  #type-input:focus { outline: none; border-color: var(--panel-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  #type-status {
    min-height: 14px; font-size: var(--text-xs); color: var(--panel-muted);
    font-family: var(--font-mono);
  }
  #type-status.error { color: #cc6666; }
  #type-modal .type-modal-footer { display: flex; gap: 8px; }
  #type-modal .type-modal-footer button {
    flex: 1; min-height: 44px; cursor: pointer; border-radius: 6px;
    font-family: var(--font-mono); font-size: var(--text-sm);
    border: 1px solid var(--panel-border); background: none; color: var(--page-fg);
    transition: background 0.15s, color 0.15s;
  }
  #type-modal .type-modal-footer button:hover { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  #type-modal .type-modal-footer button:focus-visible { box-shadow: 0 0 0 2px var(--panel-accent); outline: none; }
  .type-modal-modifiers {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    padding: 3px;
    background: var(--terminal-bg, rgba(0,0,0,0.28));
    border: 1px solid var(--panel-border);
    border-radius: 7px;
  }
  .type-modal-modifiers label {
    position: relative;
    min-width: 0;
    cursor: pointer;
  }
  .type-modal-modifiers input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .type-modal-modifier-label {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--panel-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: 1;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .type-modal-modifiers label:hover .type-modal-modifier-label {
    color: var(--panel-accent);
    background: color-mix(in srgb, var(--panel-accent) 8%, transparent);
  }
  .type-modal-modifiers input:focus-visible + .type-modal-modifier-label {
    outline: 1px solid var(--panel-accent);
    outline-offset: 1px;
  }
  .type-modal-modifiers label:has(input:checked) .type-modal-modifier-label {
    border-color: var(--panel-accent);
    background: color-mix(in srgb, var(--panel-accent) 10%, transparent);
    color: var(--panel-accent);
  }
  .type-modal-modifiers label:has(input[value="Ctrl"]:checked) .type-modal-modifier-label {
    border-color: var(--panel-success);
    background: color-mix(in srgb, var(--panel-success) 10%, transparent);
    color: var(--panel-success);
  }
  #type-modal .type-modal-footer #type-send-enter {
    border-color: var(--panel-success); color: var(--panel-success);
  }

  `;
}

export function mobileToolbarHTML(): string {
	return `
<div id="mobile-toolbar">
  <div class="tb-input">
    <textarea id="tb-input" placeholder="Type or voice input…" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" rows="1"></textarea>
    <button id="tb-send" type="button" title="Send (Enter)">&#9166;</button>
  </div>
  <button id="type-toggle" type="button" title="Advanced keys" aria-label="Advanced keys">
    ${icon('keyboard')}
  </button>
</div>
<div id="type-backdrop"></div>
<div id="type-modal">
  <div class="type-modal-header">
    <span>Send to pane</span>
    <button id="type-close" type="button" aria-label="Close">&times;</button>
  </div>
  <div class="type-modal-modifiers" role="group" aria-label="Special key">
    <label><input type="radio" name="type-modifier" value="None" checked /><span class="type-modal-modifier-label">None</span></label>
    <label><input type="radio" name="type-modifier" value="Esc" /><span class="type-modal-modifier-label">Esc</span></label>
    <label><input type="radio" name="type-modifier" value="Tab" /><span class="type-modal-modifier-label">Tab</span></label>
    <label><input type="radio" name="type-modifier" value="Ctrl" /><span class="type-modal-modifier-label">Ctrl</span></label>
  </div>
  <textarea id="type-input" placeholder="Type a command…" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
  <div id="type-status"></div>
  <div class="type-modal-footer">
    <button id="type-send" type="button">Send</button>
    <button id="type-send-enter" type="button">Send &#9166;</button>
  </div>
</div>`;
}


export function mobileToolbarScript(_sessionName: string): string {
	return `(function() {
  const typeBtn = document.getElementById('type-toggle');
  const modal = document.getElementById('type-modal');
  const backdrop = document.getElementById('type-backdrop');
  const input = document.getElementById('type-input');
  const status = document.getElementById('type-status');
  const closeBtn = document.getElementById('type-close');
  const sendBtn = document.getElementById('type-send');
  const sendEnterBtn = document.getElementById('type-send-enter');
  const keyInputs = Array.from(document.querySelectorAll('input[name="type-modifier"]'));

  function setStatus(msg, isError) {
    status.textContent = msg || '';
    status.classList.toggle('error', !!isError);
  }

  function openModal() {
    // Close any open header drawers so panels don't stack.
    for (const drawer of Object.values(window.tmuxWebDrawers || {})) {
      if (drawer && drawer.close) drawer.close();
    }
    modal.classList.add('open');
    backdrop.classList.add('open');
    setTimeout(() => input.focus(), 50);
  }

  function closeModal() {
    modal.classList.remove('open');
    backdrop.classList.remove('open');
  }

  function getActiveModifier() {
    const active = keyInputs.find((candidate) => candidate.checked);
    return active ? active.value : 'None';
  }

  function toControlChar(value) {
    const code = value.charCodeAt(0);
    return String.fromCharCode(code & 0x1f);
  }

  function buildPayload(text, withEnter) {
    const modifier = getActiveModifier();
    let payload = text;

    if (modifier === 'Esc') {
      payload = '\\u001b' + text;
    } else if (modifier === 'Tab') {
      payload = '\\t' + text;
    } else if (modifier === 'Ctrl') {
      if (!text) {
        setStatus('Ctrl needs a key', true);
        return null;
      }
      payload = toControlChar(text[0]) + text.slice(1);
    }

    return withEnter ? payload + '\\r' : payload;
  }

  function send(withEnter) {
    const text = input.value;
    if (window.tmuxWeb && window.tmuxWeb.sendInput) {
      const payload = buildPayload(text, withEnter);
      if (payload === null) return;
      const hasText = !!text;
      const modifier = getActiveModifier();
      if (hasText || modifier !== 'None') {
        window.tmuxWeb.sendInput(payload);
      }
    }
    input.value = '';
    setStatus('');
    closeModal();
    if (window.tmuxWeb && window.tmuxWeb.focusTerminal) window.tmuxWeb.focusTerminal();
  }

  typeBtn.addEventListener('click', () => {
    if (modal.classList.contains('open')) closeModal();
    else { setStatus(''); openModal(); }
  });
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  sendBtn.addEventListener('click', () => send(false));
  sendEnterBtn.addEventListener('click', () => send(true));

  // ── Inline toolbar input ──────────────────────────────────────────
  const tbInput = document.getElementById('tb-input');
  const tbSend = document.getElementById('tb-send');

  if (tbInput && tbSend) {
    function sendTb() {
      const text = tbInput.value;
      if (text && window.tmuxWeb && window.tmuxWeb.sendInput) {
        window.tmuxWeb.sendInput(text + '\r');
      }
      tbInput.value = '';
      tbInput.rows = 1;
      if (window.tmuxWeb && window.tmuxWeb.focusTerminal) window.tmuxWeb.focusTerminal();
    }

    tbInput.addEventListener('input', () => {
      tbInput.rows = 1;
      const lines = tbInput.value.split('\n').length;
      tbInput.rows = Math.min(lines, 4);
    });

    tbInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTb();
      }
    });

    tbSend.addEventListener('click', sendTb);
  }
})();`;
}
