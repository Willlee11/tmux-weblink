import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getDataRoot } from './state-paths.js';
const dbDir = getDataRoot();
mkdirSync(dbDir, { recursive: true });
export const db = new Low(new JSONFile(join(dbDir, 'db.json')), { notes: [], scheduledTasks: [], triggeredTasks: [], sessionAccess: [], pinnedViews: [], watchedPanes: [], windowLabels: [], sessionWindows: [], windowHistory: [], quickCommands: [] });
