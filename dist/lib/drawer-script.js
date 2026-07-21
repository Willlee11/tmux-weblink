/** Wrap inline drawer JS so multiple drawers can share one module script without name collisions. */
export function wrapDrawerScript(drawerId, body, closeFnName) {
    return `(function() {
${body}
  window.tmuxWebDrawers = window.tmuxWebDrawers || {};
  window.tmuxWebDrawers[${JSON.stringify(drawerId)}] = { close: ${closeFnName} };
})();`;
}
/** Close every other drawer before opening this one. */
export function closeOtherDrawersExcept(keep) {
    return `
  for (const [id, drawer] of Object.entries(window.tmuxWebDrawers || {})) {
    if (id !== ${JSON.stringify(keep)} && drawer?.close) drawer.close();
  }`;
}
