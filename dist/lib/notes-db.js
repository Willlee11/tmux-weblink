function n(){return`
async function loadNote(scope) {
  try {
    const res = await fetch('/api/notes/' + encodeURIComponent(scope));
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function saveNote(scope, content) {
  try {
    await fetch('/api/notes/' + encodeURIComponent(scope), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch {}
}`}export{n as notesDbScript};
