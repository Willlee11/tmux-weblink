// Shared client-side "scope" script. Injected into every authenticated page:
//   - hub pages:    prefix = ''            (no-op interception)
//   - agent pages:  prefix = '/a/<agentId>' (rewrites API/WS/navigation to the
//     machine's tunneled URL space)
//
// Machine switching lives in the shell page's sidebar (machine group headers
// navigate to each machine's page space); non-shell pages keep working inside
// the current machine's space. Static assets (/assets/...) intentionally
// resolve against the hub origin (same build), so only /api, /ws and
// navigation need prefixing.

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
