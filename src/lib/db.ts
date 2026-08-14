import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getDataRoot } from './state-paths.js';

export interface NoteRecord {
	scope: string;     // "__global__" | "session:name"
	content: string;
	updatedAt: number; // ms timestamp
}



export interface SessionAccessRecord {
	name: string;
	lastAccessedAt: number; // ms timestamp
}

export interface PinnedViewRecord {
	sessionName: string;
	windowIndex?: number; // omitted = session-level pin
	pinnedAt: number;
}

export interface WatchedPaneRecord {
	paneId: string;        // stable tmux pane id, e.g. "%5"
	sessionName: string;
	windowIndex: number;
	paneIndex: number;
	watchedAt: number;     // ms timestamp
}

export interface WindowLabelRecord {
	sessionName: string;
	windowIndex: number;
	label: string;         // custom label stored in tmux-web only (not real tmux)
	updatedAt: number;     // ms timestamp
}

export interface StoredWindowEntry {
	index: number;
	name: string;          // real tmux window name at capture time
	worktree: boolean;     // window's active pane sits in a git worktree
}

export interface SessionWindowsRecord {
	sessionName: string;
	windows: StoredWindowEntry[];
	updatedAt: number;     // ms timestamp; captured when the session is focused
}

export interface WindowHistoryRecord {
	sessionName: string;
	windowIndex: number;
	windowName: string;    // real tmux window name at visit time (human-readable)
	visitedAt: number;     // ms timestamp
}

export interface QuickCommandRecord {
	id: string;
	title: string;
	command: string;
	description?: string;
	createdAt: number;
	updatedAt: number;
}

export interface DbSchema {
	notes: NoteRecord[];
	sessionAccess: SessionAccessRecord[];
	pinnedViews: PinnedViewRecord[];
	watchedPanes: WatchedPaneRecord[];
	windowLabels: WindowLabelRecord[];
	sessionWindows: SessionWindowsRecord[];
	windowHistory: WindowHistoryRecord[];
	quickCommands: QuickCommandRecord[];
}

const dbDir = getDataRoot();
mkdirSync(dbDir, { recursive: true });

export const db = new Low<DbSchema>(
	new JSONFile<DbSchema>(join(dbDir, 'db.json')),
	{ notes: [], sessionAccess: [], pinnedViews: [], watchedPanes: [], windowLabels: [], sessionWindows: [], windowHistory: [], quickCommands: [] },
);
