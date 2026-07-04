import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfigRoot, getDataRoot } from './state-paths.js';
import { atomicWriteFileSync } from './atomicWrite.js';
import type { PasswordHash } from './auth.js';

export interface SecurityConfig {
	tokenTtlDays: number | null;
	allowedOrigins: string[];
	maxConnectionsPerIp: number;
	trustProxy: boolean;
	maxTotalSessions: number;
	allowRemoteSetup: boolean;
	authTimeoutMs: number;
}

export interface TmuxWebSecurityConfig {
	passwordHash: PasswordHash | null;
	security: SecurityConfig;
	_version: number;
}

const SECURITY_FILE = path.join(getConfigRoot(), 'tmux-web', 'security.json');
const DATA_DIR = getDataRoot();

const DEFAULT_SECURITY: SecurityConfig = {
	tokenTtlDays: 365,
	allowedOrigins: [],
	maxConnectionsPerIp: 10,
	trustProxy: false,
	maxTotalSessions: 50,
	allowRemoteSetup: false,
	authTimeoutMs: 30_000,
};

const DEFAULT_CONFIG: TmuxWebSecurityConfig = {
	passwordHash: null,
	security: { ...DEFAULT_SECURITY },
	_version: 1,
};

function ensureConfigDir(): void {
	const dir = path.dirname(SECURITY_FILE);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	}
}

export function loadSecurityConfig(): TmuxWebSecurityConfig {
	ensureConfigDir();
	let raw: string;
	try {
		raw = fs.readFileSync(SECURITY_FILE, 'utf-8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			saveSecurityConfig(DEFAULT_CONFIG);
			return { ...DEFAULT_CONFIG, security: { ...DEFAULT_SECURITY } };
		}
		throw new Error(`Failed to read security config at ${SECURITY_FILE}: ${(err as Error).message}`);
	}

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const aside = `${SECURITY_FILE}.corrupt-${Date.now()}`;
		try { fs.renameSync(SECURITY_FILE, aside); } catch {}
		throw new Error(`security.json was corrupt (saved aside as ${aside}): ${(err as Error).message}`);
	}

	return {
		...DEFAULT_CONFIG,
		...parsed,
		security: { ...DEFAULT_SECURITY, ...((parsed.security as Record<string, unknown>) || {}) },
	} as TmuxWebSecurityConfig;
}

export function saveSecurityConfig(config: TmuxWebSecurityConfig): void {
	ensureConfigDir();
	atomicWriteFileSync(SECURITY_FILE, JSON.stringify(config, null, 2) + '\n', 0o600);
}

export { DEFAULT_SECURITY };
