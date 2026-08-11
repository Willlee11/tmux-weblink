import { createHash, randomBytes } from 'node:crypto';
import { loadSecurityConfig, saveSecurityConfig, type TmuxWebSecurityConfig } from './security-config.js';

// Agent registration tokens. Tokens are long random secrets, shown exactly once
// at creation time; only the sha256 hash is persisted, so a leaked config file
// does not leak live tokens. Revoking a token marks it removed; the hub closes
// any live channel authenticated with it.

export interface AgentTokenRecord {
	id: string;
	name: string;
	tokenHash: string; // sha256 hex of the plaintext token
	createdAt: number;
}

export interface AgentTokenEntry extends TmuxWebSecurityConfig {
	agentTokens?: AgentTokenRecord[];
}

export function hashAgentToken(token: string): string {
	return createHash('sha256').update(token, 'utf-8').digest('hex');
}

export function listAgentTokens(): AgentTokenRecord[] {
	const cfg = loadSecurityConfig() as AgentTokenEntry;
	return cfg.agentTokens ?? [];
}

export function createAgentToken(name: string): { id: string; token: string } {
	const token = randomBytes(32).toString('base64url');
	const record: AgentTokenRecord = {
		id: randomBytes(6).toString('hex'),
		name: name || 'agent',
		tokenHash: hashAgentToken(token),
		createdAt: Date.now(),
	};
	const cfg = loadSecurityConfig() as AgentTokenEntry;
	const tokens = cfg.agentTokens ?? [];
	tokens.push(record);
	const next: AgentTokenEntry = { ...cfg, agentTokens: tokens };
	saveSecurityConfig(next);
	return { id: record.id, token };
}

export function findAgentTokenByPlaintext(token: string): AgentTokenRecord | null {
	const hash = hashAgentToken(token);
	const cfg = loadSecurityConfig() as AgentTokenEntry;
	return (cfg.agentTokens ?? []).find((t) => t.tokenHash === hash) ?? null;
}

export function findAgentTokenById(id: string): AgentTokenRecord | null {
	const cfg = loadSecurityConfig() as AgentTokenEntry;
	return (cfg.agentTokens ?? []).find((t) => t.id === id) ?? null;
}

export function removeAgentToken(id: string): boolean {
	const cfg = loadSecurityConfig() as AgentTokenEntry;
	const tokens = (cfg.agentTokens ?? []).filter((t) => t.id !== id);
	if (tokens.length === (cfg.agentTokens ?? []).length) return false;
	const next: AgentTokenEntry = { ...cfg, agentTokens: tokens };
	saveSecurityConfig(next);
	return true;
}
