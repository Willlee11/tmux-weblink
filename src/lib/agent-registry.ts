import type { WebSocket } from 'ws';
import type { AgentSessionInfo } from './agent-channel.js';

// Hub-side registry of connected agents. Pure data + lifecycle; the actual
// channel I/O lives in agent-relay.ts.

export interface HubAgentInfo {
	agentId: string;
	name: string;
	online: boolean;
	sessionsCount: number;
	lastSeen: number;
}

export interface HubAgentRecord extends HubAgentInfo {
	ws: WebSocket;
	tokenHash: string;
	sessions: AgentSessionInfo[];
	relayConns: number;
}

export interface AgentRegistryOptions {
	maxAgents?: number;
	onChange?: () => void;
}

export class AgentRegistry {
	private agents = new Map<string, HubAgentRecord>();
	private maxAgents: number;
	private onChange?: () => void;

	constructor(opts: AgentRegistryOptions = {}) {
		this.maxAgents = opts.maxAgents ?? parseInt(process.env.TMUX_WEB_MAX_AGENTS || '16', 10);
		this.onChange = opts.onChange;
	}

	get size(): number {
		return this.agents.size;
	}

	/** Register (or re-register after reconnect) an agent. Returns null if at capacity. */
	register(agentId: string, name: string, ws: WebSocket, tokenHash: string): HubAgentRecord | null {
		if (this.agents.has(agentId)) {
			// Reconnect: replace the socket, keep identity.
			const existing = this.agents.get(agentId)!;
			existing.ws = ws;
			existing.name = name;
			existing.online = true;
			existing.lastSeen = Date.now();
			this.onChange?.();
			return existing;
		}
		if (this.agents.size >= this.maxAgents) return null;
		const record: HubAgentRecord = {
			agentId,
			name,
			online: true,
			sessionsCount: 0,
			lastSeen: Date.now(),
			ws,
			tokenHash,
			sessions: [],
			relayConns: 0,
		};
		this.agents.set(agentId, record);
		this.onChange?.();
		return record;
	}

	unregister(agentId: string): void {
		if (this.agents.delete(agentId)) this.onChange?.();
	}

	touch(agentId: string): void {
		const a = this.agents.get(agentId);
		if (a) a.lastSeen = Date.now();
	}

	setSessions(agentId: string, sessions: AgentSessionInfo[]): void {
		const a = this.agents.get(agentId);
		if (!a) return;
		a.sessions = sessions;
		a.sessionsCount = sessions.length;
		this.onChange?.();
	}

	get(agentId: string): HubAgentRecord | null {
		const a = this.agents.get(agentId);
		if (!a) return null;
		if (!a.online) return null;
		return a;
	}

	/** Get the record regardless of online state (for cleanup). */
	peek(agentId: string): HubAgentRecord | null {
		return this.agents.get(agentId) ?? null;
	}

	setOnline(agentId: string, online: boolean): void {
		const a = this.agents.get(agentId);
		if (!a || a.online === online) return;
		a.online = online;
		this.onChange?.();
	}

	bumpRelayConns(agentId: string, delta: number): void {
		const a = this.agents.get(agentId);
		if (a) a.relayConns = Math.max(0, a.relayConns + delta);
	}

	/** List agents for the switcher / sidebar. */
	list(): HubAgentInfo[] {
		const out: HubAgentInfo[] = [];
		for (const a of this.agents.values()) {
			out.push({
				agentId: a.agentId,
				name: a.name,
				online: a.online,
				sessionsCount: a.sessionsCount,
				lastSeen: a.lastSeen,
			});
		}
		return out;
	}

	/** Mark agents offline after `timeoutMs` without traffic. */
	pruneOffline(timeoutMs: number): string[] {
		const now = Date.now();
		const stale: string[] = [];
		for (const a of this.agents.values()) {
			if (a.online && now - a.lastSeen > timeoutMs) {
				a.online = false;
				stale.push(a.agentId);
			}
		}
		if (stale.length) this.onChange?.();
		return stale;
	}
}
