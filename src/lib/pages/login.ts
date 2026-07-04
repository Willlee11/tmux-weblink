import { cssVarsStyle } from '../theme.js';
import type { TmuxWebTheme } from '../themes/types.js';

export function renderLoginPage(opts: { setupMode: boolean; error?: string; theme: TmuxWebTheme }): string {
	const { setupMode, error, theme } = opts;
	const title = setupMode ? 'Set Password' : 'Sign In';
	const button = setupMode ? 'Set Password' : 'Sign In';
	const hint = setupMode
		? 'Choose a strong password to secure this server. Remote setup is only allowed if explicitly enabled.'
		: 'Enter your password to continue.';
	const errorBlock = error
		? `<div class="login-error">${escapeHtml(error)}</div>`
		: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>${title} · tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    background: var(--page-bg);
    color: var(--page-fg);
    min-height: 100%;
    font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .login-card {
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    border-radius: 12px;
    padding: 32px;
    width: min(420px, calc(100vw - 32px));
    box-shadow: 0 24px 80px rgba(0,0,0,0.35);
  }
  .login-card h1 {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--panel-accent);
    margin: 0 0 8px;
  }
  .login-card p {
    font-size: 12px;
    color: var(--panel-muted);
    margin: 0 0 24px;
    line-height: 1.6;
  }
  .login-field { margin-bottom: 18px; }
  .login-field label {
    display: block;
    font-size: 11px;
    color: var(--panel-muted);
    margin-bottom: 6px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .login-field input {
    width: 100%;
    padding: 10px 12px;
    background: var(--page-bg);
    border: 1px solid var(--panel-border);
    border-radius: 6px;
    color: var(--page-fg);
    font: inherit;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }
  .login-field input:focus { border-color: var(--panel-accent); }
  .login-btn {
    width: 100%;
    padding: 11px;
    border: 1px solid var(--panel-accent);
    border-radius: 6px;
    background: var(--panel-accent);
    color: var(--page-bg);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .login-btn:hover { opacity: 0.9; }
  .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .login-error {
    background: rgba(252, 129, 129, 0.12);
    border: 1px solid rgba(252, 129, 129, 0.35);
    color: #fc8181;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 12px;
    margin-bottom: 16px;
  }
  .login-links {
    margin-top: 18px;
    display: flex;
    justify-content: center;
    gap: 16px;
  }
  .login-links a {
    font-size: 11px;
    color: var(--panel-muted);
    text-decoration: none;
  }
  .login-links a:hover { color: var(--panel-accent); }
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-left: 8px;
    vertical-align: middle;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="login-card">
    <h1>${title}</h1>
    <p>${escapeHtml(hint)}</p>
    ${errorBlock}
    <form id="login-form">
      <div class="login-field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" autocomplete="current-password" required autofocus minlength="8" />
      </div>
      <button type="submit" class="login-btn" id="submit-btn">${button}</button>
    </form>
    <div class="login-links">
      <a href="/">Sessions</a>
    </div>
  </div>
  <script>
    (function() {
      const form = document.getElementById('login-form');
      const password = document.getElementById('password');
      const submit = document.getElementById('submit-btn');
      const error = document.querySelector('.login-error');
      const setupMode = ${JSON.stringify(setupMode)};

      function setError(msg) {
        if (!msg) return;
        const div = document.createElement('div');
        div.className = 'login-error';
        div.textContent = msg;
        if (error) error.replaceWith(div);
        else form.parentNode.insertBefore(div, form);
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        submit.disabled = true;
        submit.innerHTML = ${JSON.stringify(button)} + '<span class="spinner"></span>';
        try {
          const res = await fetch('/api/auth/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password.value }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data.error || 'Authentication failed');
            submit.disabled = false;
            submit.textContent = ${JSON.stringify(button)};
            return;
          }
          if (data.token) {
            localStorage.setItem('tmux-web-token', data.token);
          }
          const returnTo = new URL(location.href).searchParams.get('returnTo') || '/';
          location.href = returnTo;
        } catch (err) {
          setError('Network error. Please try again.');
          submit.disabled = false;
          submit.textContent = ${JSON.stringify(button)};
        }
      });
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
