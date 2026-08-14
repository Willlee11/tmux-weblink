import { cssVarsStyle } from '../theme.js';
import type { TmuxWebTheme } from '../themes/types.js';
import type { AgentClientStatus } from '../agent-client.js';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface FederationPageData {
	config: { hub?: string; token?: string; name?: string; enabled?: boolean };
	status: AgentClientStatus;
	tokens: { id: string; name: string; createdAt: number }[];
	hostname: string;
}

export function renderFederationPage(data: FederationPageData, theme: TmuxWebTheme): string {
	const { config, status, tokens, hostname } = data;
	const stateText =
		status.state === 'connected' ? 'Connected'
		: status.state === 'connecting' ? 'Connecting…'
		: status.state === 'error' ? 'Error'
		: 'Off';

	const tokenRows = tokens.length
		? tokens.map((t) => `<div class="token-row" data-id="${escapeHtml(t.id)}">
      <div class="tok-info">
        <div class="tok-name">${escapeHtml(t.name)}</div>
        <div class="tok-meta">${escapeHtml(t.id)} · created ${escapeHtml(new Date(t.createdAt).toISOString().slice(0, 16).replace('T', ' '))} UTC</div>
      </div>
      <button class="btn danger" data-revoke="${escapeHtml(t.id)}">Revoke</button>
    </div>`).join('\n')
		: '<p class="desc" style="margin:0">No agent tokens yet.</p>';

	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>Machines - tmux-web</title>
<style>
  ${cssVarsStyle(theme.shell)}
  html, body { background: var(--page-bg); color: var(--page-fg); min-height: 100%; font-family: var(--font-sans); }
  .container { max-width: 680px; margin: 80px auto; padding: 0 24px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
  h1 { font-size: var(--text-xl); font-weight: 600; letter-spacing: -0.02em; color: var(--page-fg); }
  .back-link {
    font-size: var(--text-sm); color: var(--panel-muted); text-decoration: none;
    border: 1px solid var(--panel-border); padding: 8px 16px; border-radius: 10px; transition: all 0.15s;
  }
  .back-link:hover { border-color: var(--panel-accent); color: var(--panel-accent); background: color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  .section { border: 1px solid var(--panel-border); border-radius: 16px; background: var(--panel-bg); padding: 20px; margin-bottom: 16px; }
  .section h2 { font-size: var(--text-sm); font-weight: 600; color: var(--page-fg); margin-bottom: 4px; }
  .section .desc { font-size: var(--text-sm); color: var(--panel-muted); line-height: 1.6; margin-bottom: 16px; }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: var(--text-sm); color: var(--panel-muted); margin-bottom: 6px; }
  .field input[type=text], .field input[type=password], .field input[type=url] {
    width: 100%; box-sizing: border-box; font-size: var(--text-sm); font-family: inherit; color: var(--page-fg);
    background: var(--page-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; padding: 10px 12px; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
  }
  .field input:focus { border-color: var(--panel-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--panel-accent) 8%, transparent); }
  label.check { display: flex; align-items: center; gap: 10px; font-size: var(--text-sm); cursor: pointer; padding: 5px 0; }
  label.check input { accent-color: var(--panel-success); }
  .status-line { display: flex; align-items: center; gap: 8px; font-size: var(--text-sm); padding: 12px 14px; border-radius: 12px; border: 1px solid var(--panel-border); margin-bottom: 16px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .dot.off { background: var(--panel-muted); }
  .dot.connecting { background: #e5c07b; animation: pulse 1.2s infinite; }
  .dot.connected { background: var(--panel-success); }
  .dot.error { background: #e06c75; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .status-line .stext { color: var(--page-fg); }
  .status-line .sub { color: var(--panel-muted); margin-left: 6px; }
  .status-line .err { color: #e06c75; margin-left: 6px; }
  .btn {
    font-size: var(--text-sm); color: var(--page-fg); background: var(--panel-bg);
    border: 1px solid var(--panel-border); padding: 9px 18px; border-radius: 12px;
    cursor: pointer; transition: all 0.15s; font-family: inherit; min-height: 44px;
  }
  .btn:hover { border-color: var(--panel-accent); color: var(--panel-accent); }
  .btn.primary { border-color: var(--panel-success); color: var(--panel-success); }
  .btn.danger:hover { border-color: #e06c75; color: #e06c75; }
  .btn-row { display: flex; gap: 10px; align-items: center; margin-top: 6px; }
  .token-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 0; font-size: var(--text-sm); border-top: 1px solid var(--panel-border); }
  .token-row:first-of-type { border-top: none; }
  .tok-info .tok-name { font-weight: 600; color: var(--page-fg); }
  .tok-info .tok-meta { color: var(--panel-muted); font-size: var(--text-xs); margin-top: 2px; }
  .tok-add { display: flex; gap: 10px; margin-top: 14px; }
  .tok-add input[type=text] {
    flex: 1; font-size: var(--text-sm); font-family: inherit; color: var(--page-fg);
    background: var(--page-bg); border: 1px solid var(--panel-border);
    border-radius: 12px; padding: 9px 12px; outline: none;
  }
  .tok-add input[type=text]:focus { border-color: var(--panel-accent); }
  .token-reveal { margin-top: 12px; font-size: var(--text-sm); border: 1px solid var(--panel-success); border-radius: 12px; padding: 12px 14px; }
  .token-reveal .tk { font-family: var(--font-mono); word-break: break-all; color: var(--panel-success); user-select: all; }
  .token-reveal .warn { color: var(--panel-muted); margin-top: 6px; }
  .flash { font-size: var(--text-sm); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; }
  .flash.err { color: var(--page-fg); border: 1px solid #e06c75; background: color-mix(in srgb, #e06c75 8%, var(--panel-bg)); }
  .flash.ok { color: var(--panel-success); border: 1px solid var(--panel-success); }
  .hint { font-size: var(--text-xs); color: var(--panel-muted); line-height: 1.6; }
  .hint code { background: color-mix(in srgb, var(--panel-accent) 8%, transparent); padding: 2px 6px; border-radius: 6px; }
  .saved-flash { font-size: var(--text-sm); color: var(--panel-success); border: 1px solid var(--panel-success); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; }
  @media (max-width: 640px) { .container { margin: 24px auto; padding: 0 16px; } }
</style>
</head>
<body>
<div class="container">
  <div class="page-header">
    <h1>Machines</h1>
    <a href="/settings" class="back-link">Back</a>
  </div>

  <div class="flash err" id="flash" style="display:none"></div>
  <div class="saved-flash" id="saved" style="display:none">✓ Saved.</div>

  <div class="section">
    <h2>Join a hub (run as agent)</h2>
    <p class="desc">This machine keeps serving its own UI and also connects <em>outbound</em> to a hub,
      so the hub's browser can reach its tmux sessions, files, notes and monitor.
      No ports need to be opened. Get a token on the hub with <code>tmux-web agent-token add --name ${escapeHtml(hostname)}</code>.</p>

    <div class="status-line">
      <span class="dot ${status.state === 'connected' ? 'connected' : status.state === 'connecting' ? 'connecting' : status.state === 'error' ? 'error' : 'off'}"></span>
      <span class="stext">${escapeHtml(stateText)}</span>
      ${status.agentId ? `<span class="sub">agentId ${escapeHtml(status.agentId)}</span>` : ''}
      ${status.hub ? `<span class="sub">→ ${escapeHtml(status.hub)}</span>` : ''}
      ${status.lastError ? `<span class="err">${escapeHtml(status.lastError)}</span>` : ''}
    </div>

    <div class="field">
      <label>Hub URL</label>
      <input type="url" id="f-hub" placeholder="wss://hub.example.com" value="${escapeHtml(config.hub ?? '')}" />
    </div>
    <div class="field">
      <label>Registration token (from the hub)</label>
      <input type="password" id="f-token" placeholder="paste agent token" value="${escapeHtml(config.token ?? '')}" />
    </div>
    <div class="field">
      <label>Machine name (shown on the hub)</label>
      <input type="text" id="f-name" placeholder="${escapeHtml(hostname)}" value="${escapeHtml(config.name ?? '')}" />
    </div>
    <label class="check"><input type="checkbox" id="f-enabled" ${config.enabled ? 'checked' : ''} /> Connect on save (and on startup)</label>

    <div class="btn-row">
      <button class="btn primary" id="f-save">Save &amp; Connect</button>
      <button class="btn" id="f-disconnect">Disconnect</button>
    </div>
    <p class="hint" style="margin-top:14px">The agent reconnects automatically with backoff. Config is stored in <code>federation.json</code>.</p>
  </div>

  <div class="section">
    <h2>This machine as a hub</h2>
    <p class="desc">Every machine can also accept agents (star topology). Tokens created here are used by other machines to join.</p>

    ${tokenRows}

    <div class="tok-add">
      <input type="text" id="tok-name" placeholder="machine name (e.g. laptop)" />
      <button class="btn primary" id="tok-create">Create token</button>
    </div>
    <div class="token-reveal" id="token-reveal" style="display:none">
      <div>New token (shown once — store it safely):</div>
      <div class="tk" id="token-value"></div>
      <div class="warn">Run on the remote machine: <code id="token-cmd"></code></div>
    </div>
  </div>
</div>

<script>
(function () {
  const $ = (id) => document.getElementById(id);
  const flash = (msg) => { const f = $('flash'); f.textContent = msg; f.style.display = 'block'; };
  const clearFlash = () => { $('flash').style.display = 'none'; };
  const saved = () => { const s = $('saved'); s.style.display = 'block'; setTimeout(() => { s.style.display = 'none'; }, 2500); };

  $('f-save').addEventListener('click', async () => {
    clearFlash();
    const body = {
      hub: $('f-hub').value.trim(),
      token: $('f-token').value.trim(),
      name: $('f-name').value.trim(),
      enabled: $('f-enabled').checked,
    };
    if (body.enabled && !body.hub) return flash('Hub URL is required.');
    if (body.enabled && !body.token) return flash('Registration token is required.');
    try {
      const res = await fetch('/api/machines', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return flash(data.error || 'Failed to save.');
      saved();
      setTimeout(() => location.reload(), 600);
    } catch { flash('Network error.'); }
  });

  $('f-disconnect').addEventListener('click', async () => {
    clearFlash();
    try {
      const res = await fetch('/api/machines', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hub: $('f-hub').value.trim(), token: $('f-token').value.trim(), name: $('f-name').value.trim(), enabled: false }),
      });
      if (!res.ok) return flash('Failed to disconnect.');
      saved();
      setTimeout(() => location.reload(), 600);
    } catch { flash('Network error.'); }
  });

  $('tok-create').addEventListener('click', async () => {
    clearFlash();
    const name = $('tok-name').value.trim();
    if (!name) return flash('Enter a machine name for the token.');
    try {
      const res = await fetch('/api/agent-tokens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) return flash(data.error || 'Failed to create token.');
      $('token-value').textContent = data.token;
      $('token-cmd').textContent = 'tmux-web agent --hub wss://YOUR_HUB --token ' + data.token + ' --name "' + data.name + '"';
      $('token-reveal').style.display = 'block';
      $('tok-name').value = '';
    } catch { flash('Network error.'); }
  });

  document.querySelectorAll('[data-revoke]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Revoke this token? The agent will be disconnected.')) return;
      const id = btn.getAttribute('data-revoke');
      try {
        const res = await fetch('/api/agent-tokens/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!res.ok) return flash('Failed to revoke.');
        location.reload();
      } catch { flash('Network error.'); }
    });
  });
})();
</script>
</body>
</html>`;
}
