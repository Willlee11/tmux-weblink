/**
 * @file Structured Security Audit Logging
 * @description Logs auth and system events in structured JSON. Never logs passwords or tokens.
 */
const WARN_EVENTS = new Set([
    'auth_failed',
    'token_auth_failed',
    'token_expired',
    'auth_timeout',
    'http_unauthorized',
]);
const ERROR_EVENTS = new Set(['rate_limited', 'permanent_lock']);
function getLevel(event) {
    if (ERROR_EVENTS.has(event))
        return 'error';
    if (WARN_EVENTS.has(event))
        return 'warn';
    return 'info';
}
export function audit(event, fields = {}) {
    const level = getLevel(event);
    const entry = {
        level,
        component: event.startsWith('tmux') || event.startsWith('schedule') || event.startsWith('note') ? 'app' : 'auth',
        event,
        timestamp: new Date().toISOString(),
    };
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null)
            continue;
        entry[key] = value;
    }
    const output = JSON.stringify(entry);
    if (level === 'error')
        console.error(output);
    else if (level === 'warn')
        console.warn(output);
    else
        console.log(output);
}
