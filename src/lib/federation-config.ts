/**
 * Federation configuration: how this machine joins a hub as an agent.
 *
 * A machine running a normal `tmux-web` server can opt into "agent mode" by
 * saving a hub URL + registration token here. The server then runs the agent
 * client in-process (outbound WebSocket to the hub) while still serving its
 * own local UI — so every machine uses the same start command.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getFederationPath } from './state-paths.js';

export interface FederationConfig {
	/** Hub URL the agent client connects to (e.g. wss://hub.example.com). */
	hub?: string;
	/** Registration token from the hub (`tmux-web agent-token add`). */
	token?: string;
	/** Display name shown in the hub's machine switcher. Defaults to hostname. */
	name?: string;
	/** Whether the agent client should be running. */
	enabled?: boolean;
}

const CONFIG_PATH = getFederationPath();

export async function readFederationConfig(): Promise<FederationConfig> {
	try {
		const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as unknown;
		if (raw && typeof raw === 'object') return raw as FederationConfig;
	} catch {
		// missing or invalid — default off
	}
	return {};
}

export async function writeFederationConfig(cfg: FederationConfig): Promise<void> {
	await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
	await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}
