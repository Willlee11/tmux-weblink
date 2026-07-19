import{icon as e}from"./icons.js";function n(){return`
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
  }`}function a(){return`
<div id="mobile-toolbar">
  <button id="mic-toggle" type="button" title="Voice input" aria-label="Voice input">
    ${e("microphone")}
  </button>
  <button id="type-toggle" type="button" title="Type to send" aria-label="Type to send">
    ${e("keyboard")}
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
  <textarea id="type-input" placeholder="Type a command or tap the mic\u2026" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
  <div id="type-status"></div>
  <div class="type-modal-footer">
    <button id="type-send" type="button">Send</button>
    <button id="type-send-enter" type="button">Send &#9166;</button>
  </div>
</div>`}function i(t){return`(function() {
  const micBtn = document.getElementById('mic-toggle');
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
    stopRecognition();
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

  // \u2500\u2500 Speech-to-text (browser Web Speech API) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;

  if (!SR) {
    // Unsupported browser \u2014 hide the mic entirely.
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
      setStatus('Listening\u2026');
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
      if (!status.textContent || status.textContent === 'Listening\u2026') {
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
})();`}export{n as mobileToolbarCSS,a as mobileToolbarHTML,i as mobileToolbarScript};
