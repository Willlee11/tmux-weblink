export function notesDbScript(): string {
	return `
const DB_NAME = 'tmux-web-notes';
const DB_STORE = 'notes';
const DB_VERSION = 1;

let dbPromise = null;
function openNotesDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
}

async function loadNote(scope) {
  const db = await openNotesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE], 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req = store.get(scope);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveNote(scope, content) {
  const db = await openNotesDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DB_STORE], 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.put({ id: scope, content, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}`;
}
