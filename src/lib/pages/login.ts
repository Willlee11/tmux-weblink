import { cssVarsStyle } from '../theme.js';
import type { TmuxWebTheme } from '../themes/types.js';

export function renderLoginPage(opts: { setupMode: boolean; error?: string; theme: TmuxWebTheme }): string {
	const { setupMode, error, theme } = opts;
	const title = setupMode ? 'Set your password' : 'Welcome back';
	const button = setupMode ? 'Set Password' : 'Sign in';
	const hint = setupMode
		? 'Choose a strong password to secure this server.'
		: 'Enter your password to continue to your sessions.';
	const errorBlock = error
		? `<div class="login-error">${escapeHtml(error)}</div>`
		: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>${setupMode ? 'Set Password' : 'Sign In'} · tmux-weblink</title>
<style>
  ${cssVarsStyle(theme.shell)}
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    background: var(--page-bg);
    color: var(--page-fg);
    min-height: 100%;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .login-card {
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    border-radius: 24px;
    padding: 48px;
    width: min(420px, calc(100vw - 32px));
    box-shadow: 0 4px 28px rgba(0,0,0,0.04);
  }
  .login-eyebrow {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--panel-accent);
    margin: 0 0 14px;
  }
  .login-card h1 {
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.03em;
    margin: 0 0 12px;
  }
  .login-card p {
    font-size: 15px;
    color: var(--panel-muted);
    margin: 0 0 32px;
    line-height: 1.6;
  }
  .login-field { margin-bottom: 24px; }
  .login-field label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--page-fg);
    margin-bottom: 8px;
  }
  .login-field input {
    width: 100%;
    padding: 14px 16px;
    background: var(--page-bg);
    border: 1px solid var(--panel-border);
    border-radius: 14px;
    color: var(--page-fg);
    font: inherit;
    font-size: 15px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .login-field input:focus {
    border-color: var(--panel-accent);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--panel-accent) 12%, transparent);
  }
  .login-btn {
    width: 100%;
    padding: 15px;
    border: none;
    border-radius: 14px;
    background: var(--panel-accent);
    color: #fff;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
  }
  .login-btn:hover { opacity: 0.9; }
  .login-btn:active { transform: scale(0.995); }
  .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .login-error {
    background: color-mix(in srgb, var(--panel-accent) 8%, #f87171);
    border: 1px solid color-mix(in srgb, var(--panel-accent) 20%, #f87171);
    color: #b91c1c;
    padding: 12px 14px;
    border-radius: 12px;
    font-size: 13px;
    margin-bottom: 22px;
  }
  .login-footer {
    margin-top: 28px;
    text-align: center;
    font-size: 13px;
    color: var(--panel-muted);
  }
  .login-footer a { color: var(--panel-accent); font-weight: 500; }
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-left: 8px;
    vertical-align: middle;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 480px) {
    .login-card { padding: 36px 24px; border-radius: 20px; }
    .login-card h1 { font-size: 26px; }
  }
</style>
</head>
<body>
  <div class="login-card">
    <div class="login-eyebrow">tmux-weblink</div>
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
    <div class="login-footer">
      ${setupMode
				? `<a href="/login">Back to sign in</a>`
				: `First time? <a href="/login?setup=1">Set password</a>`}
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
