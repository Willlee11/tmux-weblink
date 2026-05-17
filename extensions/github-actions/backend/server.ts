import { Hono } from 'hono';
import { serve, createAdaptorServer } from '@hono/node-server';
import { unlinkSync } from 'node:fs';
import { runsRouter } from './routes/runs.js';
import { dispatchRouter } from './routes/dispatch.js';
import { workflowsRouter } from './routes/workflows.js';

const app = new Hono();
app.route('/', workflowsRouter);
app.route('/', runsRouter);
app.route('/', dispatchRouter);

const sockPath = process.env.EXT_SOCKET;

if (sockPath) {
  try { unlinkSync(sockPath); } catch {}
  const server = createAdaptorServer({ fetch: app.fetch });
  server.listen(sockPath, () => console.log(`[github-actions ext] listening on ${sockPath}`));
} else {
  // Fallback for direct `npm start` during local dev
  const port = parseInt(process.env.EXT_PORT ?? '4100', 10);
  serve({ fetch: app.fetch, port }, () => console.log(`[github-actions ext] running on :${port}`));
}
