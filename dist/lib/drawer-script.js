function w(r,e,t){return`(function() {
${e}
  window.tmuxWebDrawers = window.tmuxWebDrawers || {};
  window.tmuxWebDrawers[${JSON.stringify(r)}] = { close: ${t} };
})();`}function i(r){return`
  for (const [id, drawer] of Object.entries(window.tmuxWebDrawers || {})) {
    if (id !== ${JSON.stringify(r)} && drawer?.close) drawer.close();
  }`}export{i as closeOtherDrawersExcept,w as wrapDrawerScript};
