/**
 * Server-side "text-mode browser" for tmux-weblink.
 *
 * Fetches a remote page from the server's network and returns a *rewritten*
 * copy that is safe to inject into our own origin:
 *   - `<script>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, meta-refresh
 *     and all `on*` handler attributes are stripped (no untrusted JS runs in
 *     our origin, so proxied pages cannot touch tmux-weblink's own API).
 *   - navigation URLs (`<a href>`, `<form action>`) are rewritten to the
 *     `/api/browse` proxy; subresource URLs (`<img src>`, `<link href>`,
 *     `<source src>`, CSS `url()`, `srcset`) to `/api/browse/asset`.
 *   - forms are rewritten to the submit proxy and carry the original action +
 *     method in hidden fields.
 *
 * Memory safety: response bodies are streamed with a hard byte cap; a single
 * request never holds more than a few MB regardless of the remote page size.
 *
 * SSRF guard: private / loopback / link-local targets are refused by default;
 * set TMUX_WEB_BROWSE_ALLOW_PRIVATE=1 to allow them (for LAN browsing).
 */

import { lookup as dnsLookup } from 'node:dns/promises';

export const BROWSE_MAX_HTML_BYTES = 3 * 1024 * 1024;
export const BROWSE_MAX_ASSET_BYTES = 8 * 1024 * 1024;
export const BROWSE_TIMEOUT_MS = 15_000;

export class BrowseError extends Error {
	status: 400 | 502 | 504;
	constructor(message: string, status: 400 | 502 | 504 = 400) {
		super(message);
		this.status = status;
		this.name = 'BrowseError';
	}
}

// ── Cookie jars (per browser tab) ────────────────────────────────────────────
//
// Simple in-memory jar per tab id. Domain-scoped: when asking for a cookie we
// match exact host or a parent domain stored earlier.

const cookieJars = new Map<string, Map<string, string>>();

export function clearTabCookies(tabId: string): void {
	cookieJars.delete(tabId);
}

function storeCookies(tabId: string, url: string, headers: Headers): void {
	let jar = cookieJars.get(tabId);
	if (!jar) {
		jar = new Map();
		cookieJars.set(tabId, jar);
	}
	const host = new URL(url).hostname.toLowerCase();
	const setCookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
	for (const raw of setCookies) {
		const nameValue = raw.split(';')[0]?.trim();
		if (!nameValue) continue;
		const domainAttr = /;\s*domain=([^;\s]+)/i.exec(raw)?.[1]?.trim().replace(/^\./, '').toLowerCase();
		jar.set(domainAttr ?? host, nameValue);
	}
}

function cookieHeaderFor(tabId: string, url: string): string {
	const jar = cookieJars.get(tabId);
	if (!jar || jar.size === 0) return '';
	const host = new URL(url).hostname.toLowerCase();
	const parts: string[] = [];
	for (const [domain, cookie] of jar) {
		if (host === domain || host.endsWith('.' + domain)) parts.push(cookie);
	}
	return parts.join('; ');
}

// ── SSRF guard ───────────────────────────────────────────────────────────────

function isPrivateIp(ip: string): boolean {
	const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];
		if (a === 0 || a === 10 || a === 127) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a >= 224) return true; // multicast + reserved
		return false;
	}
	const lower = ip.toLowerCase();
	return (
		lower === '::1' ||
		lower === '::' ||
		lower.startsWith('fe80:') ||
		lower.startsWith('fc') ||
		lower.startsWith('fd') ||
		lower.startsWith('fec0:')
	);
}

async function assertPublicTarget(rawUrl: string): Promise<void> {
	const u = new URL(rawUrl);
	if (u.protocol !== 'http:' && u.protocol !== 'https:') {
		throw new BrowseError('only http/https URLs are supported');
	}
	if (process.env.TMUX_WEB_BROWSE_ALLOW_PRIVATE === '1') return;

	const host = u.hostname;
	if (isPrivateIp(host)) throw new BrowseError('private network addresses are blocked');

	// Hostnames: resolve and check every address. Unknown lookup failures are
	// passed through — the fetch itself will surface them.
	try {
		const addrs = await dnsLookup(host, { all: true });
		for (const { address } of addrs) {
			if (isPrivateIp(address)) throw new BrowseError('private network addresses are blocked');
		}
	} catch (err) {
		if (err instanceof BrowseError) throw err;
		// DNS failure: let fetch produce a real error message.
	}
}

// ── Bounded fetch ────────────────────────────────────────────────────────────

interface Fetched {
	res: Response;
	buf: Buffer;
	truncated: boolean;
}

async function fetchBounded(url: string, init: RequestInit, maxBytes: number): Promise<Fetched> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), BROWSE_TIMEOUT_MS);
	try {
		const res = await fetch(url, { ...init, redirect: 'follow', signal: ctrl.signal });
		if (!res.ok) throw new BrowseError(`the site responded with HTTP ${res.status}`, 502);

		if (!res.body) {
			return { res, buf: Buffer.alloc(0), truncated: false };
		}

		const reader = res.body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		let truncated = false;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) {
				truncated = true;
				await reader.cancel();
				break;
			}
			chunks.push(value);
		}
		return { res, buf: Buffer.concat(chunks), truncated };
	} catch (err) {
		if (err instanceof BrowseError) throw err;
		if (err instanceof Error && err.name === 'AbortError') {
			throw new BrowseError('timed out after ' + BROWSE_TIMEOUT_MS + 'ms', 504);
		}
		// undici collapses most network failures to a generic "fetch failed";
		// the real reason lives in err.cause (ECONNRESET, ENOTFOUND, TLS, …).
		let cause: string | undefined;
		const c = (err as { cause?: unknown }).cause;
		if (c) cause = typeof c === 'string' ? c : ((c as { code?: string; message?: string }).code || (c as { message?: string }).message || String(c));
		const message = (err as Error).message || 'request failed';
		throw new BrowseError(cause && message !== cause ? `${message} (${cause})` : message, 502);
	} finally {
		clearTimeout(timer);
	}
}

// ── Charset ──────────────────────────────────────────────────────────────────

function detectCharset(contentType: string | null, buf: Buffer): string {
	const fromHeader = /charset=([\w.-]+)/i.exec(contentType || '');
	if (fromHeader) return fromHeader[1];
	const sniff = buf.subarray(0, 4096).toString('latin1');
	const fromMeta = /<meta[^>]+charset=["']?([\w.-]+)/i.exec(sniff);
	if (fromMeta) return fromMeta[1];
	return 'utf-8';
}

// ── HTML entity decoding ─────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: '\u00a0',
	copy: '\u00a9',
	reg: '\u00ae',
	trade: '\u2122',
	hellip: '\u2026',
	mdash: '\u2014',
	ndash: '\u2013',
	lsquo: '\u2018',
	rsquo: '\u2019',
	ldquo: '\u201c',
	rdquo: '\u201d',
};

function decodeEntities(s: string): string {
	return s
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16) || 0))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10) || 0))
		.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (full, name) => NAMED_ENTITIES[name] ?? full);
}

// ── URL rewriting ────────────────────────────────────────────────────────────

function proxyUrl(absolute: string, tabId: string, kind: 'nav' | 'asset'): string {
	const path = kind === 'nav' ? '/api/browse' : '/api/browse/asset';
	return `${path}?url=${encodeURIComponent(absolute)}&tab=${encodeURIComponent(tabId)}`;
}

function rewriteHref(attr: string, base: string, tabId: string, kind: 'nav' | 'asset'): string {
	const trimmed = attr.trim();
	if (!trimmed) return attr;
	if (trimmed.startsWith('#')) return trimmed;
	// Executable / in-page navigation targets are dropped on the nav path.
	if (/^(javascript|data|vbscript):/i.test(trimmed)) return kind === 'nav' ? '' : attr;
	// Non-http(s) schemes (mailto, tel, sms, blob, …) are left untouched.
	if (/^(mailto|tel|sms|about|blob|file):/i.test(trimmed)) return attr;
	let abs: string;
	try {
		abs = new URL(trimmed, base).href;
	} catch {
		return attr;
	}
	if (!/^https?:/i.test(abs)) return attr;
	// DuckDuckGo search results go through /l/ redirect stubs that only
	// redirect via JS / noscript meta-refresh (both stripped by the proxy).
	// Follow the encoded target directly instead of dead-ending there.
	try {
		const u = new URL(abs);
		if (/(^|\.)duckduckgo\.com$/i.test(u.hostname) && u.pathname === '/l/' && kind === 'nav') {
			const uddg = u.searchParams.get('uddg');
			if (uddg && /^https?:/i.test(uddg)) abs = uddg;
		}
	} catch {}
	return proxyUrl(abs, tabId, kind);
}

function rewriteSrcset(attr: string, base: string, tabId: string): string {
	return attr
		.split(',')
		.map((part) => {
			const m = part.trim().match(/^(\S+)(\s+.+)?$/);
			if (!m) return part;
			const url = rewriteHref(m[1], base, tabId, 'asset');
			return url ? url + (m[2] ?? '') : part;
		})
		.join(', ');
}

function rewriteCssUrls(css: string, base: string, tabId: string): string {
	return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (full, _q, inner) => {
		const decoded = decodeEntities(inner.trim());
		const rewritten = rewriteHref(decoded, base, tabId, 'asset');
		return rewritten ? `url(${rewritten})` : full;
	});
}

// ── Attribute parsing ────────────────────────────────────────────────────────

interface Attr {
	name: string;
	value: string;
	remove?: boolean;
}

function parseAttrs(str: string): Attr[] {
	const re = /([a-zA-Z-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
	const out: Attr[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(str))) {
		out.push({
			name: m[1],
			value: m[3] ?? m[4] ?? m[5] ?? '',
		});
	}
	return out;
}

function escapeAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ── HTML rewriting ───────────────────────────────────────────────────────────

/**
 * Rewrite a full HTML document so it can be injected into our origin.
 * Navigation links point at /api/browse, subresources at /api/browse/asset,
 * and all executable markup is removed.
 */
export function rewriteHtml(html: string, baseUrl: string, tabId: string): { html: string; title: string } {
	const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
	const title = titleMatch
		? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim()
		: '';
	const base = baseUrl;
	const out: string[] = [];
	let last = 0;
	const re = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)(\/?)>/gs;
	let m: RegExpExecArray | null;

	while ((m = re.exec(html))) {
		out.push(html.slice(last, m.index));
		const [full, closeSlash, tagName, attrsStr, selfClose] = m;
		const tag = (tagName as string).toLowerCase();
		last = m.index + full.length;

		if (closeSlash) {
			out.push(full);
			continue;
		}

		if (tag === 'script' || tag === 'style') {
			const contentStart = m.index + full.length;
			const endRe = new RegExp(`</${tag}\\s*>`, 'gi');
			const rest = html.slice(contentStart);
			const endM = endRe.exec(rest);
			const content = endM ? rest.slice(0, endM.index) : rest;
			const closing = endM ? endM[0] : '';
			if (tag === 'style') {
				out.push(full + rewriteCssUrls(content, base, tabId) + closing);
			} else {
				out.push(full + closing); // script body dropped
			}
			last = endM ? contentStart + endM.index + closing.length : html.length;
			re.lastIndex = last;
			continue;
		}

		if (tag === 'iframe' || tag === 'object' || tag === 'embed') {
			// Drop these elements entirely (with their bodies).
			if (!selfClose) {
				const contentStart = m.index + full.length;
				const endRe = new RegExp(`</${tag}\\s*>`, 'gi');
				const rest = html.slice(contentStart);
				const endM = endRe.exec(rest);
				last = endM ? contentStart + endM.index + endM[0].length : html.length;
			}
			re.lastIndex = last;
			continue;
		}

		if (tag === 'base') {
			// Void element — just drop it.
			re.lastIndex = last;
			continue;
		}

		if (tag === 'meta' && /http-equiv=["']?refresh/i.test(attrsStr)) {
			re.lastIndex = last;
			continue;
		}

		out.push(rewriteOpenTag(full, tag, attrsStr as string, base, tabId, m.index, html));
	}

	out.push(html.slice(last));
	return { html: out.join(''), title };
}

function rewriteOpenTag(
	full: string,
	tag: string,
	attrsStr: string,
	base: string,
	tabId: string,
	tagStart: number,
	html: string,
): string {
	const attrs = parseAttrs(attrsStr);
	const extra: string[] = [];

	for (const a of attrs) {
		const name = a.name.toLowerCase();
		const val = a.value;

		if (name === 'href') {
			if (tag === 'a' || tag === 'area') {
				if (/^javascript:/i.test(val.trim())) {
					a.remove = true;
				} else {
					a.value = rewriteHref(val, base, tabId, 'nav');
				}
			} else if (tag === 'link') {
				const rel = (attrs.find((x) => x.name.toLowerCase() === 'rel')?.value || '').toLowerCase();
				if (rel.includes('stylesheet') || rel.includes('icon')) {
					a.value = rewriteHref(val, base, tabId, 'asset');
				} else {
					a.remove = true;
				}
			}
		} else if (name === 'src' && (tag === 'img' || tag === 'source' || tag === 'video' || tag === 'audio' || tag === 'input')) {
			a.value = rewriteHref(val, base, tabId, 'asset');
		} else if (name === 'srcset' && tag === 'img') {
			a.value = rewriteSrcset(val, base, tabId);
		} else if (name === 'poster' && tag === 'video') {
			a.value = rewriteHref(val, base, tabId, 'asset');
		} else if (name === 'style') {
			a.value = rewriteCssUrls(val, base, tabId);
		} else if (name.startsWith('on')) {
			a.remove = true;
		}
	}

	// Forms: point the action at the submit proxy and carry the original
	// target + method in hidden fields for the server to replay.
	if (tag === 'form') {
		let actionAttr = attrs.find((a) => a.name.toLowerCase() === 'action');
		let target = base;
		if (actionAttr && actionAttr.value.trim()) {
			try {
				target = new URL(decodeEntities(actionAttr.value.trim()), base).href;
			} catch {
				target = base;
			}
		}
		const method = (attrs.find((a) => a.name.toLowerCase() === 'method')?.value || 'get').toLowerCase();
		if (actionAttr) actionAttr.value = `/api/browse/submit?tab=${encodeURIComponent(tabId)}`;
		else attrs.push({ name: 'action', value: `/api/browse/submit?tab=${encodeURIComponent(tabId)}` });
		extra.push(`<input type="hidden" name="__browse_action" value="${escapeAttr(target)}">`);
		extra.push(`<input type="hidden" name="__browse_method" value="${escapeAttr(method)}">`);
	}

	let rebuilt = '<' + tag;
	for (const a of attrs) {
		if (a.remove) continue;
		if (a.name === 'href' && tag === 'a' && a.value === '') continue; // javascript: links dropped entirely
		rebuilt += ' ' + a.name + '="' + escapeAttr(a.value) + '"';
	}
	rebuilt += '>';
	if (extra.length) rebuilt += extra.join('');
	return rebuilt;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface BrowsePageResult {
	url: string;
	finalUrl: string;
	title: string;
	html: string;
	contentType: string;
	truncated: boolean;
}

export async function browsePage(rawUrl: string, tabId: string): Promise<BrowsePageResult> {
	await assertPublicTarget(rawUrl);
	const cookieHeader = cookieHeaderFor(tabId, rawUrl);
	const { res, buf, truncated } = await fetchBounded(rawUrl, {
		headers: cookieHeader ? { cookie: cookieHeader } : undefined,
	}, BROWSE_MAX_HTML_BYTES);

	storeCookies(tabId, rawUrl, res.headers);

	const contentType = res.headers.get('content-type') || '';
	const charset = detectCharset(contentType, buf);
	const decoded = new TextDecoder(charset).decode(buf);

	const finalUrl = res.url || rawUrl;

	if (/html/i.test(contentType) || (!/^(text|application)\/(json|xml|xhtml)/i.test(contentType) && /<html[\s>]/i.test(decoded.slice(0, 2000)))) {
		const { html, title } = rewriteHtml(decoded, finalUrl, tabId);
		return { url: rawUrl, finalUrl, title, html, contentType, truncated };
	}

	if (/json/i.test(contentType)) {
		try {
			const pretty = JSON.stringify(JSON.parse(decoded), null, 2);
			return { url: rawUrl, finalUrl, title: new URL(finalUrl).hostname, html: `<pre>${escapeAttr(pretty)}</pre>`, contentType, truncated };
		} catch {
			// fall through to plain text
		}
	}

	const escaped = escapeAttr(decoded);
	return {
		url: rawUrl,
		finalUrl,
		title: new URL(finalUrl).hostname,
		html: `<pre style="white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);font-size:12px;line-height:1.6;padding:16px">${escaped}</pre>`,
		contentType,
		truncated,
	};
}

export interface BrowseAssetResult {
	buf: Buffer;
	contentType: string;
}

export async function browseAsset(rawUrl: string, tabId: string): Promise<BrowseAssetResult> {
	await assertPublicTarget(rawUrl);
	const cookieHeader = cookieHeaderFor(tabId, rawUrl);
	const { res, buf, truncated } = await fetchBounded(rawUrl, {
		headers: cookieHeader ? { cookie: cookieHeader } : undefined,
	}, BROWSE_MAX_ASSET_BYTES);
	storeCookies(tabId, rawUrl, res.headers);
	void truncated;
	return { buf, contentType: res.headers.get('content-type') || 'application/octet-stream' };
}

export async function browseSubmit(
	action: string,
	fields: [string, string][],
	method: string,
	tabId: string,
): Promise<BrowsePageResult> {
	let target = action;
	let init: RequestInit;

	if (method === 'get') {
		const u = new URL(action);
		for (const [k, v] of fields) u.searchParams.append(k, v);
		target = u.href;
		init = {};
	} else {
		const body = new URLSearchParams();
		for (const [k, v] of fields) body.append(k, v);
		init = {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: body.toString(),
		};
	}

	await assertPublicTarget(target);
	const cookieHeader = cookieHeaderFor(tabId, target);
	const { res, buf, truncated } = await fetchBounded(target, {
		...init,
		headers: {
			...(init.headers as Record<string, string> | undefined),
			...(cookieHeader ? { cookie: cookieHeader } : {}),
		},
	}, BROWSE_MAX_HTML_BYTES);

	storeCookies(tabId, target, res.headers);

	const contentType = res.headers.get('content-type') || '';
	const charset = detectCharset(contentType, buf);
	const decoded = new TextDecoder(charset).decode(buf);
	const finalUrl = res.url || target;

	const { html, title } = rewriteHtml(decoded, finalUrl, tabId);
	return { url: target, finalUrl, title, html, contentType, truncated };
}
