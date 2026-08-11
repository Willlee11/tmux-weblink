import type { Hono } from 'hono';
import type { AgentChannel } from './agent-relay.js';
import { injectScopeScript } from './scope-script.js';

// HTTP tunnel: the hub forwards any request under /a/:agentId/* to the agent's
// local app (same route table), streaming the body and response through the
// persistent agent channel. Responses are adapted for the browser:
//   - Location headers get the /a/:agentId prefix (redirects stay on-machine)
//   - HTML gets the scope script injected (fetch/WS/navigation prefixing)

export const MAX_TUNNEL_BODY_BYTES = parseInt(process.env.TMUX_WEB_MAX_TUNNEL_BODY || String(20 * 1024 * 1024), 10);

const FORWARD_HEADERS = ['content-type', 'accept', 'accept-language'];

export interface TunnelDeps {
	getChannel: (agentId: string) => AgentChannel | null;
}

export function registerAgentTunnel(app: Hono, deps: TunnelDeps): void {
	app.get('/a/:agentId', (c) => c.redirect(`/a/${encodeURIComponent(c.req.param('agentId'))}/`, 302));

	app.all('/a/:agentId/*', async (c) => {
		const agentId = c.req.param('agentId');
		const channel = deps.getChannel(agentId);
		if (!channel) {
			return c.json({ error: 'agent offline', agentId }, 502);
		}

		const url = new URL(c.req.url);
		const prefix = '/a/' + agentId;
		let rest = url.pathname;
		if (rest.startsWith(prefix)) rest = rest.slice(prefix.length) || '/';
		const path = rest + url.search;

		const headers: Record<string, string> = {};
		for (const k of FORWARD_HEADERS) {
			const v = c.req.header(k);
			if (v) headers[k] = v;
		}

		let body: ReadableStream<Uint8Array> | null = null;
		if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
			const cl = c.req.header('content-length');
			if (cl && parseInt(cl, 10) > MAX_TUNNEL_BODY_BYTES) {
				return c.json({ error: 'request body too large' }, 413);
			}
			body = c.req.raw.body;
		}

		let resp: Response;
		try {
			resp = await channel.httpRequest(c.req.method, path, headers, body);
		} catch (err) {
			return c.json({ error: 'agent offline: ' + ((err as Error).message ?? String(err)), agentId }, 502);
		}

		// Rewrite redirect locations so the browser stays on this machine.
		const location = resp.headers.get('location');
		if (location && location.startsWith('/') && !location.startsWith('//')) {
			const headers = new Headers(resp.headers);
			headers.set('location', prefix + location);
			resp = new Response(resp.body, { status: resp.status, headers });
		}

		const ct = resp.headers.get('content-type') ?? '';
		if (ct.includes('text/html')) {
			const html = await resp.text();
			return c.html(injectScopeScript(html, { prefix, agentId }));
		}
		return resp;
	});
}
