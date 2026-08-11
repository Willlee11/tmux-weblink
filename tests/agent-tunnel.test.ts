import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerAgentTunnel } from '../src/lib/agent-tunnel.js';
import { injectScopeScript } from '../src/lib/scope-script.js';
import type { AgentChannel } from '../src/lib/agent-relay.js';

function fakeChannel(status = 200, body: string | Buffer, contentType = 'text/html'): AgentChannel {
	return {
		httpRequest: async () =>
			new Response(body, { status, headers: { 'content-type': contentType } }),
	} as unknown as AgentChannel;
}

describe('registerAgentTunnel', () => {
	it('proxies the request path (prefix stripped) and injects the scope script into HTML', async () => {
		const requested: { method: string; path: string }[] = [];
		const channel = {
			httpRequest: async (method: string, path: string) => {
				requested.push({ method, path });
				return new Response('<html><head></head><body>agent page</body></html>', {
					headers: { 'content-type': 'text/html' },
				});
			},
		} as unknown as AgentChannel;

		const app = new Hono();
		registerAgentTunnel(app, { getChannel: (id) => (id === 'a1' ? channel : null) });

		const res = await app.request('/a/a1/settings?x=1');
		expect(res.status).toBe(200);
		expect(requested).toContainEqual({ method: 'GET', path: '/settings?x=1' });

		const html = await res.text();
		expect(html).toContain('window.__TMUX_WEB_SCOPE__');
		expect(html).toContain("prefix: \"/a/a1\"");
	});

	it('rewrites Location headers so redirects stay on-machine', async () => {
		const channel = {
			httpRequest: async () =>
				new Response(null, { status: 303, headers: { location: '/settings?saved=1' } }),
		} as unknown as AgentChannel;

		const app = new Hono();
		registerAgentTunnel(app, { getChannel: () => channel });

		const res = await app.request('/a/a1/settings', { method: 'POST' });
		expect(res.status).toBe(303);
		expect(res.headers.get('location')).toBe('/a/a1/settings?saved=1');
	});

	it('returns 502 when the agent is offline', async () => {
		const app = new Hono();
		registerAgentTunnel(app, { getChannel: () => null });
		const res = await app.request('/a/gone/api/foo');
		expect(res.status).toBe(502);
		const body = await res.json();
		expect(body.error).toContain('agent offline');
	});

	it('does not inject the scope script into non-HTML responses', async () => {
		const app = new Hono();
		registerAgentTunnel(app, { getChannel: () => fakeChannel(200, '{"ok":true}', 'application/json') });
		const res = await app.request('/a/a1/api/x');
		expect(await res.text()).toBe('{"ok":true}');
	});
});

describe('injectScopeScript', () => {
	it('injects once and is idempotent', () => {
		const html = '<html><head></head><body></body></html>';
		const once = injectScopeScript(html, { prefix: '/a/a1', agentId: 'a1' });
		expect(once).toContain('window.__TMUX_WEB_SCOPE__');
		const twice = injectScopeScript(once, { prefix: '/a/a1', agentId: 'a1' });
		expect(twice).toBe(once);
	});

	it('appends when there is no head', () => {
		const html = '<html><body>plain</body></html>';
		const out = injectScopeScript(html, { prefix: '', agentId: null });
		expect(out).toContain('window.__TMUX_WEB_SCOPE__');
	});
});
