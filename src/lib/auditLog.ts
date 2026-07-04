/**
 * @file Structured Security Audit Logging
 * @description Logs auth and system events in structured JSON. Never logs passwords or tokens.
 */

export type AuditEvent =
	| 'auth_success'
	| 'auth_failed'
	| 'token_auth_success'
	| 'token_auth_failed'
	| 'token_expired'
	| 'token_created'
	| 'token_revoked'
	| 'password_set'
	| 'password_changed'
	| 'rate_limited'
	| 'ws_connected'
	| 'ws_disconnected'
	| 'auth_timeout'
	| 'tmux_session_created'
	| 'tmux_session_attached'
	| 'tmux_session_detached'
	| 'tmux_session_killed'
	| 'tmux_session_renamed'
	| 'session_window_selected'
	| 'session_window_renamed'
	| 'session_window_created'
	| 'schedule_created'
	| 'schedule_deleted'
	| 'schedule_rescheduled'
	| 'note_updated'
	| 'settings_changed'
	| 'plugin_installed'
	| 'plugin_uninstalled'
	| 'permanent_lock'
	| 'setup_rejected_remote'
	| 'ws_rejected_origin'
	| 'ws_rejected_per_ip_cap'
	| 'http_unauthorized';

interface AuditFields {
	ip?: string;
	clientId?: string;
	tokenName?: string;
	tokenId?: string;
	sessionId?: string;
	windowIndex?: number;
	method?: string;
	message?: string;
	reason?: string;
	origin?: string;
	liveFromIp?: number;
	failures?: number;
	permanentLock?: boolean;
	retryAfterMs?: number;
	count?: number;
	plugin?: string;
	name?: string;
	token?: string;
}

const WARN_EVENTS: Set<AuditEvent> = new Set([
	'auth_failed',
	'token_auth_failed',
	'token_expired',
	'auth_timeout',
	'http_unauthorized',
]);
const ERROR_EVENTS: Set<AuditEvent> = new Set(['rate_limited', 'permanent_lock']);

function getLevel(event: AuditEvent): string {
	if (ERROR_EVENTS.has(event)) return 'error';
	if (WARN_EVENTS.has(event)) return 'warn';
	return 'info';
}

export function audit(event: AuditEvent, fields: AuditFields = {}): void {
	const level = getLevel(event);
	const entry: Record<string, unknown> = {
		level,
		component: event.startsWith('tmux') || event.startsWith('schedule') || event.startsWith('note') ? 'app' : 'auth',
		event,
		timestamp: new Date().toISOString(),
	};
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null) continue;
		entry[key] = value;
	}
	const output = JSON.stringify(entry);
	if (level === 'error') console.error(output);
	else if (level === 'warn') console.warn(output);
	else console.log(output);
}
