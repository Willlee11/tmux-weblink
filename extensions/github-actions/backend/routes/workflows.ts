import { Hono } from 'hono';
import { getWorkflows, addWorkflow, removeWorkflow } from '../storage.js';

export const workflowsRouter = new Hono();

// Parse https://github.com/{owner}/{repo}/actions/workflows/{file}
export function parseWorkflowUrl(url: string): { repo: string; workflow: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/workflows\/([^/?#\s]+)/);
  if (!m) return null;
  return { repo: `${m[1]}/${m[2]}`, workflow: m[3] };
}

// GET /workflows?session=xxx
workflowsRouter.get('/workflows', async (c) => {
  const session = c.req.query('session');
  if (!session) return c.json({ error: '`session` is required' }, 400);
  return c.json(await getWorkflows(session));
});

// POST /workflows  { session, url }
workflowsRouter.post('/workflows', async (c) => {
  const { session, url } = await c.req.json<{ session?: string; url?: string }>();
  if (!session || !url) return c.json({ error: '`session` and `url` are required' }, 400);
  if (!parseWorkflowUrl(url)) return c.json({ error: 'Not a valid GitHub Actions workflow URL' }, 400);
  return c.json({ urls: await addWorkflow(session, url) });
});

// DELETE /workflows?session=xxx&index=0
workflowsRouter.delete('/workflows', async (c) => {
  const session = c.req.query('session');
  const index   = c.req.query('index');
  if (!session || index === undefined) return c.json({ error: '`session` and `index` are required' }, 400);
  return c.json({ urls: await removeWorkflow(session, parseInt(index, 10)) });
});
