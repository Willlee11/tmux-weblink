/**
 * Mobile-only bottom toolbar for the terminal page.
 *
 * Mirrors the top `<header>` panel but is shown only on narrow viewports
 * (`@media (max-width: 560px)`). Provides two quick-access tools that feed the
 * active tmux pane via `window.tmuxWeb.sendInput` (exposed by terminal-client.ts):
 *   - Mic: browser Web Speech API speech-to-text; transcript lands in the
 *     type-to-send modal for review/edit before sending.
 *   - Keyboard: opens the same modal to compose text/commands away from the
 *     cramped pane, with Send (insert as-is) and Send ⏎ (append carriage return).
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
    cursor: pointer; border-radius: 6px; transition: color 0.15s, background 0.15s;
  }
  #mobile-toolbar button:hover { color: var(--panel-accent); }
  #mobile-toolbar button svg { width: 22px; height: 22px; fill: currentColor; }
  #mobile-toolbar button.listening {
    color: var(--panel-success);
    animation: tmux-mic-pulse 1.2s ease-in-out infinite;
  }
  @keyframes tmux-mic-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

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
    font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--panel-muted);
  }
  #type-modal #type-close {
    background: none; border: none; color: var(--panel-muted);
    font-size: 20px; line-height: 1; cursor: pointer;
  }
  #type-input {
    width: 100%; min-height: 96px; resize: vertical; box-sizing: border-box;
    background: var(--terminal-bg, rgba(0,0,0,0.28)); color: var(--page-fg);
    border: 1px solid var(--panel-border); border-radius: 6px; padding: 10px;
    font-family: 'JetBrains Mono', monospace; font-size: 15px; line-height: 1.4;
  }
  #type-input:focus { outline: none; border-color: var(--panel-accent); }
  #type-status {
    min-height: 14px; font-size: 11px; color: var(--panel-muted);
    font-family: 'JetBrains Mono', monospace;
  }
  #type-status.error { color: #cc6666; }
  #type-modal .type-modal-footer { display: flex; gap: 8px; }
  #type-modal .type-modal-footer button {
    flex: 1; min-height: 44px; cursor: pointer; border-radius: 6px;
    font-family: 'JetBrains Mono', monospace; font-size: 13px;
    border: 1px solid var(--panel-border); background: none; color: var(--page-fg);
    transition: background 0.15s, color 0.15s;
  }
  #type-modal .type-modal-footer button:hover { background: rgba(125, 211, 252, 0.08); }
  #type-modal .type-modal-footer #type-send-enter {
    border-color: var(--panel-success); color: var(--panel-success);
  }`;
}

export function mobileToolbarHTML(): string {
	return `
<div id="mobile-toolbar">
  <button id="mic-toggle" type="button" title="Voice input" aria-label="Voice input">
    <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
  </button>
  <button id="type-toggle" type="button" title="Type to send" aria-label="Type to send">
    <svg viewBox="0 0 24 24"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg>
  </button>
</div>
<div id="type-backdrop"></div>
<div id="type-modal">
  <div class="type-modal-header">
    <span>Send to pane</span>
    <button id="type-close" type="button" aria-label="Close">&times;</button>
  </div>
  <textarea id="type-input" placeholder="Type a command or tap the mic…" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
  <div id="type-status"></div>
  <div class="type-modal-footer">
    <button id="type-send" type="button">Send</button>
    <button id="type-send-enter" type="button">Send &#9166;</button>
  </div>
</div>`;
}

export function mobileToolbarScript(_sessionName: string): string {
	return `(function() {
  const micBtn = document.getElementById('mic-toggle');
  const typeBtn = document.getElementById('type-toggle');
  const modal = document.getElementById('type-modal');
  const backdrop = document.getElementById('type-backdrop');
  const input = document.getElementById('type-input');
  const status = document.getElementById('type-status');
  const closeBtn = document.getElementById('type-close');
  const sendBtn = document.getElementById('type-send');
  const sendEnterBtn = document.getElementById('type-send-enter');

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
    stopRecognition();
  }

  function send(withEnter) {
    const text = input.value;
    if (text && window.tmuxWeb && window.tmuxWeb.sendInput) {
      window.tmuxWeb.sendInput(withEnter ? text + '\\r' : text);
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

  // ── Speech-to-text (browser Web Speech API) ──────────────────────────────
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;

  if (!SR) {
    // Unsupported browser — hide the mic entirely.
    micBtn.style.display = 'none';
  } else {
    micBtn.addEventListener('click', () => {
      if (listening) { stopRecognition(); return; }
      startRecognition();
    });
  }

  function startRecognition() {
    if (!SR) return;
    recognition = new SR();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    const baseText = input.value ? input.value + ' ' : '';

    recognition.onstart = () => {
      listening = true;
      micBtn.classList.add('listening');
      openModal();
      setStatus('Listening…');
    };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      input.value = baseText + transcript;
    };
    recognition.onerror = (event) => {
      const code = event && event.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setStatus('Microphone permission denied', true);
      } else if (code === 'no-speech') {
        setStatus('No speech detected', true);
      } else {
        setStatus('Voice input error', true);
      }
    };
    recognition.onend = () => {
      listening = false;
      micBtn.classList.remove('listening');
      if (!status.textContent || status.textContent === 'Listening…') {
        setStatus(input.value ? 'Review and send' : '');
      }
      recognition = null;
    };

    try {
      recognition.start();
    } catch (e) {
      setStatus('Voice input unavailable', true);
      listening = false;
      micBtn.classList.remove('listening');
    }
  }

  function stopRecognition() {
    if (recognition) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
    }
  }
})();`;
}
