import express from 'express';
import { unlinkSync } from 'node:fs';
import { runsRouter } from './routes/runs.js';
import { dispatchRouter } from './routes/dispatch.js';
import { workflowsRouter } from './routes/workflows.js';

const app = express();
app.use(express.json());
app.use(workflowsRouter);
app.use(runsRouter);
app.use(dispatchRouter);

const sockPath = process.env.EXT_SOCKET;

if (sockPath) {
  try { unlinkSync(sockPath); } catch {}
  app.listen(sockPath, () => console.log(`[github-actions ext] listening on ${sockPath}`));
} else {
  // Fallback for direct `npm start` during local dev
  const port = parseInt(process.env.EXT_PORT ?? '4100', 10);
  app.listen(port, () => console.log(`[github-actions ext] running on :${port}`));
}
