import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/db.js';
import { upsertSessionState, removeSessionState, renameSessionState, computeTombstones, getSessionState } from '../src/lib/session-state.js';

// computeTombstones is pure over getSessionState(); we drive the state
// through the exported mutators so the tests exercise the real write path.
beforeEach(async () => {
	db.data.sessionState = [];
	await db.write();
});

describe('session-state: upsert / remove / rename', () => {
	it('records a local session and refreshes lastSeenAt', async () => {
		await upsertSessionState('cell', { path: '/root' });
		let recs = getSessionState();
		expect(recs).toHaveLength(1);
		expect(recs[0]).toMatchObject({ name: 'cell', path: '/root', agentId: undefined });
		const firstSeen = recs[0].firstSeenAt;

		await upsertSessionState('cell', { path: '/root' });
		recs = getSessionState();
		expect(recs).toHaveLength(1);
		expect(recs[0].lastSeenAt).toBeGreaterThanOrEqual(firstSeen);
	});

	it('keeps local and agent entries of the same name separate', async () => {
		await upsertSessionState('work', { path: '/a' });
		await upsertSessionState('work', { agentId: 'agent-x', path: '/b' });
		const recs = getSessionState();
		expect(recs).toHaveLength(2);
		expect(recs.filter((r) => r.agentId === undefined)).toHaveLength(1);
		expect(recs.filter((r) => r.agentId === 'agent-x')).toHaveLength(1);
	});

	it('remove and rename target the right entry', async () => {
		await upsertSessionState('work', { path: '/a' });
		await upsertSessionState('work', { agentId: 'agent-x', path: '/b' });

		await removeSessionState('work');
		expect(getSessionState().filter((r) => r.agentId === undefined)).toHaveLength(0);
		expect(getSessionState().filter((r) => r.agentId === 'agent-x')).toHaveLength(1);

		await renameSessionState('work', 'renamed', 'agent-x');
		expect(getSessionState().find((r) => r.agentId === 'agent-x')?.name).toBe('renamed');
	});
});

describe('session-state: tombstone computation', () => {
	it('no tombstones when everything recorded is present', async () => {
		await upsertSessionState('cell', { path: '/root' });
		await upsertSessionState('laptop', { agentId: 'agent-x' });
		const tombs = computeTombstones(
			new Set(['cell', 'other']),
			new Map([['agent-x', new Set(['laptop'])]]),
			new Map([['agent-x', true]]),
		);
		expect(tombs).toHaveLength(0);
	});

	it('missing local session becomes a local tombstone with its path', async () => {
		await upsertSessionState('gone', { path: '/root/proj' });
		const tombs = computeTombstones(new Set(['cell']), new Map(), new Map());
		expect(tombs).toHaveLength(1);
		expect(tombs[0]).toMatchObject({ name: 'gone', path: '/root/proj', agentId: undefined, agentOnline: true });
	});

	it('missing agent session becomes an agent tombstone carrying online state', async () => {
		await upsertSessionState('laptop', { agentId: 'agent-x' });
		// Agent connected but no longer reports the session -> tombstone, online.
		let tombs = computeTombstones(
			new Set(),
			new Map([['agent-x', new Set(['still-there'])]]),
			new Map([['agent-x', true]]),
		);
		expect(tombs).toHaveLength(1);
		expect(tombs[0]).toMatchObject({ name: 'laptop', agentId: 'agent-x', agentOnline: true });

		// Agent fully offline -> tombstone marked offline (rebuild disabled client-side).
		tombs = computeTombstones(new Set(), new Map(), new Map([['agent-x', false]]));
		expect(tombs[0].agentOnline).toBe(false);
	});

	it('never records sessions that were not opened/created', () => {
		expect(computeTombstones(new Set(), new Map(), new Map())).toHaveLength(0);
	});

	it('ignores recorded sessions that disappeared long ago (TTL)', async () => {
		await upsertSessionState('ancient', { path: '/x' });
		// Simulate the entry being very old.
		db.data.sessionState[0].lastSeenAt = Date.now() - 1000 * 60 * 60 * 24 * 60; // 60 days
		await db.write();
		const tombs = computeTombstones(new Set(), new Map(), new Map());
		expect(tombs).toHaveLength(0);
	});

	it('sorts tombstones most-recently-lost first', async () => {
		await upsertSessionState('old-gone', { path: '/1' });
		await upsertSessionState('new-gone', { path: '/2' });
		db.data.sessionState.find((r) => r.name === 'old-gone')!.lastSeenAt = Date.now() - 5000;
		await db.write();
		const tombs = computeTombstones(new Set(), new Map(), new Map());
		expect(tombs.map((t) => t.name)).toEqual(['new-gone', 'old-gone']);
	});
});
