// Agent ↔ Hub channel protocol. One persistent WebSocket per agent.
//
// Framing:
//   - Text frames  = JSON control messages ({type, ...})
//   - Binary frames = bulk payload: [kind:1][id:4 BE][payload]
//       kind 0x01 = terminal data for a relay conn (agent → hub)
//       kind 0x02 = HTTP body chunk for a tunneled request id (either way)
//
// Bulk terminal output flows agent→hub→browser as raw bytes to avoid the JSON
// escaping/base64 overhead; everything else (input, resize, control) is JSON.

export const BIN_KIND_TERM = 0x01;
export const BIN_KIND_HTTP_BODY = 0x02;

export type AgentSessionInfo = { name: string; windows: number; attached: boolean; path?: string };

// ── Agent → Hub ──────────────────────────────────────────────────────────

export type AgentToHub =
	| { type: 'hello'; token: string; name: string; version: string }
	| { type: 'sessions'; sessions: AgentSessionInfo[] }
	| { type: 'http_resp'; id: number; status: number; headers: Record<string, string>; hasBody: boolean }
	| { type: 'http_body_end'; id: number }
	| { type: 'attach_ok'; connId: number; session: string }
	| { type: 'attach_err'; connId: number; session: string; message: string }
	| { type: 'ws_to_hub'; connId: number; msg: Record<string, unknown> }
	| { type: 'ws_close'; connId: number; code: number; reason: string }
	| { type: 'activity'; activities: { session: string; state: 'working' | 'idle' }[] }
	| { type: 'rebuild_session_result'; session: string; ok: boolean; message?: string }
	| { type: 'ping'; ts: number };

// ── Hub → Agent ──────────────────────────────────────────────────────────

export type HubToAgent =
	| { type: 'hello_ok'; agentId: string }
	| { type: 'hello_err'; reason: string }
	| { type: 'sessions_req' }
	| { type: 'http_req'; id: number; method: string; path: string; headers: Record<string, string>; hasBody: boolean }
	| { type: 'http_body_end'; id: number }
	| { type: 'attach'; connId: number; session: string; cols?: number; rows?: number }
	| { type: 'ws_to_agent'; connId: number; msg: Record<string, unknown> }
	| { type: 'rebuild_session'; session: string; dir?: string }
	| { type: 'detach'; connId: number }
	| { type: 'pong'; ts: number };

// Encode a binary frame. `id` is a 32-bit unsigned int (connId or http reqId).
export function encodeBinaryFrame(kind: number, id: number, payload: string | Uint8Array | Buffer): Buffer {
	const buf = typeof payload === 'string' ? Buffer.from(payload, 'utf-8') : Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
	const out = Buffer.allocUnsafe(5 + buf.length);
	out[0] = kind;
	out.writeUInt32BE(id >>> 0, 1);
	buf.copy(out, 5);
	return out;
}

export interface BinaryFrame {
	kind: number;
	id: number;
	payload: Buffer;
}

/** Parse a binary frame; returns null if the buffer is too short. */
export function decodeBinaryFrame(buf: Buffer): BinaryFrame | null {
	if (buf.length < 5) return null;
	return {
		kind: buf[0],
		id: buf.readUInt32BE(1),
		payload: buf.subarray(5),
	};
}

export function isAgentToHubMessage(obj: unknown): obj is AgentToHub {
	if (typeof obj !== 'object' || obj === null) return false;
	const t = (obj as { type?: unknown }).type;
	return typeof t === 'string' && AGENT_TO_HUB_TYPES.has(t);
}

export function isHubToAgentMessage(obj: unknown): obj is HubToAgent {
	if (typeof obj !== 'object' || obj === null) return false;
	const t = (obj as { type?: unknown }).type;
	return typeof t === 'string' && HUB_TO_AGENT_TYPES.has(t);
}

const AGENT_TO_HUB_TYPES = new Set([
	'hello', 'sessions', 'http_resp', 'http_body_end', 'attach_ok', 'attach_err',
	'ws_to_hub', 'ws_close', 'activity', 'rebuild_session_result', 'ping',
]);

const HUB_TO_AGENT_TYPES = new Set([
	'hello_ok', 'hello_err', 'sessions_req', 'http_req', 'http_body_end',
	'attach', 'ws_to_agent', 'rebuild_session', 'detach', 'pong',
]);
