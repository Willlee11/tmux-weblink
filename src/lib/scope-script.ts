// Shared client-side "scope" script. Injected into every authenticated page:
//   - hub pages:    prefix = ''            (no-op interception)
//   - agent pages:  prefix = '/a/<agentId>' (rewrites API/WS/navigation to the
//     machine's tunneled URL space)
//
// The hub shell page renders a native machine switcher; every other page gets a
// small floating switcher chip from this script (skipped when the native one is
// present). Static assets (/assets/...) intentionally resolve against the hub
// origin (same build), so only /api, /ws and navigation need prefixing.

export interface ScopeScriptOpts {
	prefix: string;
	agentId: string | null;
}

export function scopeScriptHtml(opts: ScopeScriptOpts): string {
	const prefix = opts.prefix;
	const agentId = opts.agentId ?? '';
	return `<script>
window.__TMUX_WEB_SCOPE__ = { prefix: ${JSON.stringify(prefix)}, agentId: ${JSON.stringify(agentId)} };
(function(){
  var prefix = window.__TMUX_WEB_SCOPE__.prefix || '';
  if (!prefix) return;
  var origFetch = window.fetch;
  function isRel(p){ return typeof p === 'string' && p.charAt(0) === '/' && p.charAt(1) !== '/'; }
  function pref(p){ return prefix + p; }
  window.fetch = function(input, init){
    if (typeof input === 'string' && isRel(input) && input.indexOf(prefix) !== 0) {
      return origFetch(pref(input), init);
    }
    if (input && typeof input === 'object' && typeof input.url === 'string' && isRel(input.url)) {
      var req = new Request(input);
      return origFetch(new Request(pref(req.url), req), init);
    }
    return origFetch(input, init);
  };
  // Rewrite root-relative links (covers plain clicks, new-tab, middle-click).
  document.addEventListener('mouseover', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (isRel(href) && href.indexOf(prefix) !== 0) a.setAttribute('href', pref(href));
  }, true);
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (isRel(href) && href.indexOf(prefix) !== 0) a.setAttribute('href', pref(href));
  }, true);
  // Rewrite form actions before submission.
  document.addEventListener('submit', function(e){
    var f = e.target;
    if (!f || f.tagName !== 'FORM') return;
    var action = f.getAttribute('action');
    if (action && isRel(action) && action.indexOf(prefix) !== 0) f.setAttribute('action', pref(action));
  }, true);
})();
</script>
<script>
(function(){
  if (document.getElementById('tw-scope-native')) return; // shell has a native switcher
  if (document.getElementById('tw-scope-chip')) return;
  var prefix = window.__TMUX_WEB_SCOPE__ ? window.__TMUX_WEB_SCOPE__.prefix : '';
  var agentId = window.__TMUX_WEB_SCOPE__ ? window.__TMUX_WEB_SCOPE__.agentId : null;
  var style = 'position:fixed;bottom:12px;right:12px;z-index:9990;display:flex;align-items:center;gap:6px;';
  style += 'background:rgba(20,20,24,0.92);color:#e6e6e6;border:1px solid rgba(255,255,255,0.12);border-radius:20px;';
  style += 'padding:6px 12px;font-size:12px;font-family:system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);';
  var chip = document.createElement('div');
  chip.id = 'tw-scope-chip';
  chip.style.cssText = style;
  chip.innerHTML = '<span>Machine</span><select id="tw-scope-select" style="background:#2a2a31;color:#e6e6e6;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:3px 8px;font-size:12px;max-width:180px"></select>';
  document.body.appendChild(chip);
  var sel = document.getElementById('tw-scope-select');
  sel.innerHTML = '<option value="">Loading…</option>';
  var origFetch = window.fetch;
  origFetch(location.origin + '/api/agents').then(function(r){ return r.json(); }).then(function(agents){
    var opts = '<option value="/" ' + (agentId ? '' : 'selected') + '>本机</option>';
    (agents || []).forEach(function(a){
      if (!a.online) return;
      var isCur = a.agentId === agentId;
      opts += '<option value="/a/' + encodeURIComponent(a.agentId) + '/" ' + (isCur ? 'selected' : '') + '>' + (isCur ? '• ' : '') + a.name + '</option>';
    });
    sel.innerHTML = opts;
  }).catch(function(){ sel.innerHTML = '<option value="">offline</option>'; });
  sel.addEventListener('change', function(){
    if (sel.value) window.location.href = sel.value;
  });
})();
</script>`;
}

/** Inject the scope script into an HTML document (before </head>). */
export function injectScopeScript(html: string, opts: ScopeScriptOpts): string {
	if (html.includes('window.__TMUX_WEB_SCOPE__')) return html;
	const snippet = scopeScriptHtml(opts);
	const idx = html.indexOf('</head>');
	if (idx === -1) return html + snippet;
	return html.slice(0, idx) + snippet + html.slice(idx);
}
