import { db, type SessionStateRecord } from './db.js';

/**
 * Session tombstone support.
 *
 * `sessionState` records every session the user has opened or created at
 * least once (local and agent sessions). When a recorded session is no
 * longer present in the live tmux world (crash, manual `tmux kill-session`,
 * reboot), the sidebar renders it as a grey strikethrough tombstone instead
 * of silently dropping it — with rebuild / rename / dismiss actions.
 *
 * Sessions that were never opened/created by the user are never recorded,
 * so throwaway tmux sessions never produce tombstones.
 */

/** Days a tombstone is kept after its session was last seen before it is dropped. */
const TTL_DAYS = Number(process.env.TMUX_WEB_TOMBSTONE_TTL_DAYS || '30');

export type Tombstone = {
	name: string;
	path?: string;
	/** undefined = local session; otherwise the agent machine's agentId. */
	agentId?: string;
	agentOnline?: boolean;
	lastSeenAt: number;
};

export function getSessionState(): SessionStateRecord[] {
	db.data.sessionState ??= [];
	return db.data.sessionState;
}

/** Record (or refresh) that the user has used a session. */
export async function upsertSessionState(
	name: string,
	opts: { agentId?: string; path?: string } = {},
): Promise<void> {
	const now = Date.now();
	db.data.sessionState ??= [];
	const list = db.data.sessionState;
	const idx = list.findIndex((r) => r.name === name && (r.agentId ?? null) === (opts.agentId ?? null));
	if (idx >= 0) {
		list[idx].lastSeenAt = now;
		if (opts.path) list[idx].path = opts.path;
	} else {
		list.push({
			name,
			agentId: opts.agentId,
			path: opts.path,
			firstSeenAt: now,
			lastSeenAt: now,
		});
	}
	await db.write();
}

/** Forget a recorded session (frontend delete / dismiss / rename). */
export async function removeSessionState(name: string, agentId?: string): Promise<void> {
	db.data.sessionState ??= [];
	const list = db.data.sessionState;
	const idx = list.findIndex((r) => r.name === name && (r.agentId ?? null) === (agentId ?? null));
	if (idx < 0) return;
	list.splice(idx, 1);
	await db.write();
}

/** Rename a recorded session entry (used when a tombstone is renamed). */
export async function renameSessionState(oldName: string, newName: string, agentId?: string): Promise<void> {
	db.data.sessionState ??= [];
	const list = db.data.sessionState;
	const idx = list.findIndex((r) => r.name === oldName && (r.agentId ?? null) === (agentId ?? null));
	if (idx < 0) return;
	list[idx].name = newName;
	await db.write();
}

/**
 * Sessions recorded in state but missing from the live tmux world.
 *
 * @param actualLocal names of live local sessions
 * @param actualAgent agentId -> live session names (from agent reports)
 * @param onlineAgents agentId -> whether that agent is currently connected
 */
export function computeTombstones(
	actualLocal: Set<string>,
	actualAgent: Map<string, Set<string>>,
	onlineAgents: Map<string, boolean>,
): Tombstone[] {
	const now = Date.now();
	const ttlMs = TTL_DAYS * 24 * 60 * 60 * 1000;
	const out: Tombstone[] = [];

	for (const rec of getSessionState()) {
		// Too long gone: stop showing it (state entry stays until user action).
		if (now - rec.lastSeenAt > ttlMs) continue;

		let present = false;
		if (rec.agentId === undefined) {
			present = actualLocal.has(rec.name);
		} else {
			present = actualAgent.get(rec.agentId)?.has(rec.name) ?? false;
		}
		if (present) continue;

		out.push({
			name: rec.name,
			path: rec.path,
			agentId: rec.agentId,
			agentOnline: rec.agentId === undefined ? true : (onlineAgents.get(rec.agentId) ?? false),
			lastSeenAt: rec.lastSeenAt,
		});
	}

	// Deterministic order: missing most recently first.
	out.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
	return out;
}
