const o=864e5,u=31536e6,m=36e5,l="Use: 1h, 5m, 30s, 1m30s, 70h, 30d",a="Maximum delay is 1 year (e.g. 365d, 8760h)",s="delay must be between 1ms and 1 year";function i(t){const r=(t||"").trim().toLowerCase();if(!r)return null;const e=r.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);if(!e||!e[1]&&!e[2]&&!e[3]&&!e[4])return null;const n=(parseInt(e[1]||"0",10)*86400+parseInt(e[2]||"0",10)*3600+parseInt(e[3]||"0",10)*60+parseInt(e[4]||"0",10))*1e3;return n>0?n:null}function c(t){return Number.isFinite(t)&&t>=1&&t<=31536e6}function p(t){if(!t||typeof t!="object")return null;const r=t.delayMs;return typeof r!="number"||!Number.isFinite(r)?null:r<1||r>31536e6?s:null}function M(){return`
function parseDelay(str) {
  str = (str || '').trim().toLowerCase();
  if (!str) return null;
  const m = str.match(/^(?:(\\d+)d)?(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return null;
  const ms = ((parseInt(m[1] || '0', 10) * 86400) + (parseInt(m[2] || '0', 10) * 3600) + (parseInt(m[3] || '0', 10) * 60) + parseInt(m[4] || '0', 10)) * 1000;
  return ms > 0 ? ms : null;
}`.trim()}export{m as ARM_SCAN_INTERVAL_MS,l as DELAY_INVALID_MESSAGE,a as DELAY_MAX_MESSAGE,s as DELAY_RANGE_MESSAGE,u as MAX_SCHEDULE_MS,o as MAX_TIMER_MS,p as getScheduleDelayError,c as isValidDelayMs,i as parseDelayMs,M as scheduleDelayParseScript};
