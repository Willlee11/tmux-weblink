export const MAX_TIMER_MS = 24 * 60 * 60 * 1000;
export const MAX_SCHEDULE_MS = 365 * 24 * 60 * 60 * 1000;
export const ARM_SCAN_INTERVAL_MS = 60 * 60 * 1000;
export const DELAY_INVALID_MESSAGE = 'Use: 1h, 5m, 30s, 1m30s, 70h, 30d';
export const DELAY_MAX_MESSAGE = 'Maximum delay is 1 year (e.g. 365d, 8760h)';
export const DELAY_RANGE_MESSAGE = 'delay must be between 1ms and 1 year';
export function parseDelayMs(str) {
    const trimmed = (str || '').trim().toLowerCase();
    if (!trimmed)
        return null;
    const m = trimmed.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!m || (!m[1] && !m[2] && !m[3] && !m[4]))
        return null;
    const ms = ((parseInt(m[1] || '0', 10) * 86_400) +
        (parseInt(m[2] || '0', 10) * 3_600) +
        (parseInt(m[3] || '0', 10) * 60) +
        parseInt(m[4] || '0', 10)) * 1000;
    return ms > 0 ? ms : null;
}
export function isValidDelayMs(ms) {
    return Number.isFinite(ms) && ms >= 1 && ms <= MAX_SCHEDULE_MS;
}
export function getScheduleDelayError(body) {
    if (!body || typeof body !== 'object')
        return null;
    const delayMs = body.delayMs;
    if (typeof delayMs !== 'number' || !Number.isFinite(delayMs))
        return null;
    if (delayMs < 1 || delayMs > MAX_SCHEDULE_MS)
        return DELAY_RANGE_MESSAGE;
    return null;
}
export function scheduleDelayParseScript() {
    return `
function parseDelay(str) {
  str = (str || '').trim().toLowerCase();
  if (!str) return null;
  const m = str.match(/^(?:(\\d+)d)?(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return null;
  const ms = ((parseInt(m[1] || '0', 10) * 86400) + (parseInt(m[2] || '0', 10) * 3600) + (parseInt(m[3] || '0', 10) * 60) + parseInt(m[4] || '0', 10)) * 1000;
  return ms > 0 ? ms : null;
}`.trim();
}
