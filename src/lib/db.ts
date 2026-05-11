import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface NoteRecord {
	scope: string;     // "__global__" | "session:name"
	content: string;
	updatedAt: number; // ms timestamp
}

export interface StoredTask {
	id: string;
	sessionName: string;
	windowIndex: number;
	text: string;
	fireAt: number;    // ms timestamp
	createdAt: number;
}

interface DbSchema {
	notes: NoteRecord[];
	scheduledTasks: StoredTask[];
}

const dbDir = join(homedir(), '.tmux-web');
mkdirSync(dbDir, { recursive: true });

export const db = new Low<DbSchema>(
	new JSONFile<DbSchema>(join(dbDir, 'db.json')),
	{ notes: [], scheduledTasks: [] },
);
