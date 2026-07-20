export function notesUtilsScript() {
    return `
function linkifyHTML(text) {
  const urlRe = /https?:\\/\\/[^\\s<>"]+/g;
  return text.replace(urlRe, (url) =>
    \`<a href="\${url}" target="_blank" rel="noopener noreferrer">\${url}</a>\`
  );
}

function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}`;
}
