import { Hono } from 'hono';
import { parseWorkflowUrl } from './workflows.js';

export const dispatchRouter = new Hono();

const GH_BASE = 'https://api.github.com';

function ghHeaders() {
  return {
    Authorization:          `Bearer ${process.env.GITHUB_PAT}`,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent':           'tmux-web-github-actions-ext/0.1',
  };
}

// ─── POST /dispatch ──────────────────────────────────────────────────────────
// Trigger a workflow_dispatch event.
// Body: { url: string, ref: string }
dispatchRouter.post('/dispatch', async (c) => {
  const { url, ref } = await c.req.json<{ url?: string; ref?: string }>();

  if (!url || !ref) return c.json({ error: '`url` and `ref` are required' }, 400);

  const parsed = parseWorkflowUrl(url);
  if (!parsed) return c.json({ error: 'Invalid GitHub Actions workflow URL' }, 400);
  const { repo, workflow } = parsed;

  const ghRes = await fetch(
    `${GH_BASE}/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: 'POST',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    },
  );

  if (ghRes.status === 204) return c.json({ ok: true });

  const body = await ghRes.json().catch(() => ({}));
  return c.json(body, ghRes.status as any);
});
