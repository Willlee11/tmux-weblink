import { describe, expect, it, vi } from 'vitest';
import { AgentRegistry } from '../src/lib/agent-registry.js';
import { WebSocket } from 'ws';

function fakeWs(): WebSocket {
	// A minimal stand-in; the registry only stores and inspects readyState.
	return { readyState: 1 } as unknown as WebSocket;
}

describe('AgentRegistry', () => {
	it('registers, lists and unregisters agents', () => {
		const reg = new AgentRegistry({ maxAgents: 2 });
		const ws = fakeWs();
		const rec = reg.register('a1', 'laptop', ws, 'hash1');
		expect(rec).not.toBeNull();
		expect(reg.get('a1')?.name).toBe('laptop');
		expect(reg.get('a1')?.online).toBe(true);

		reg.unregister('a1');
		expect(reg.get('a1')).toBeNull();
		expect(reg.size).toBe(0);
	});

	it('rejects registration beyond capacity', () => {
		const reg = new AgentRegistry({ maxAgents: 1 });
		reg.register('a1', 'one', fakeWs(), 'h1');
		const rec = reg.register('a2', 'two', fakeWs(), 'h2');
		expect(rec).toBeNull();
		expect(reg.size).toBe(1);
	});

	it('re-register replaces the socket and keeps identity', () => {
		const reg = new AgentRegistry();
		const ws1 = fakeWs();
		reg.register('a1', 'old-name', ws1, 'h1');
		const ws2 = fakeWs();
		const rec = reg.register('a1', 'new-name', ws2, 'h1');
		expect(rec?.ws).toBe(ws2);
		expect(rec?.name).toBe('new-name');
		expect(reg.size).toBe(1);
	});

	it('tracks sessions and relay conns', () => {
		const reg = new AgentRegistry();
		reg.register('a1', 'laptop', fakeWs(), 'h1');
		reg.setSessions('a1', [
			{ name: 'work', windows: 2, attached: false },
			{ name: 'play', windows: 1, attached: true },
		]);
		const rec = reg.get('a1')!;
		expect(rec.sessionsCount).toBe(2);
		expect(rec.sessions.map((s) => s.name)).toEqual(['work', 'play']);

		reg.bumpRelayConns('a1', 1);
		reg.bumpRelayConns('a1', 1);
		reg.bumpRelayConns('a1', -1);
		expect(reg.get('a1')?.relayConns).toBe(1);
	});

	it('marks agents offline after pruning and fires onChange', () => {
		const onChange = vi.fn();
		const reg = new AgentRegistry({ onChange });
		reg.register('a1', 'laptop', fakeWs(), 'h1');
		expect(onChange).toHaveBeenCalled();

		// Simulate silence: backdate lastSeen.
		const rec = reg.peek('a1')!;
		rec.lastSeen = Date.now() - 100_000;

		const stale = reg.pruneOffline(45_000);
		expect(stale).toEqual(['a1']);
		expect(reg.get('a1')).toBeNull(); // offline agents are not returned by get()
		expect(reg.list()[0].online).toBe(false);
	});

	it('list() only reports online agents from get() but keeps offline in list()', () => {
		const reg = new AgentRegistry();
		reg.register('a1', 'laptop', fakeWs(), 'h1');
		const rec = reg.peek('a1')!;
		rec.lastSeen = Date.now() - 100_000;
		reg.pruneOffline(45_000);
		expect(reg.get('a1')).toBeNull();
		expect(reg.list()).toHaveLength(1); // retained until unregistered
		expect(reg.list()[0].online).toBe(false);
	});
});
