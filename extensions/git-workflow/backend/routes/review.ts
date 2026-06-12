import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import {
  currentHead,
  getGitStatus,
  getUnifiedDiff,
  isDirectory,
  listChangedFiles,
  listRepoTree,
  pathExists,
  readTextFile,
  repoRoot,
  restoreTrackedFile,
  saveTextFile,
} from '../git.js';
import { getReviewContext, setReviewContext, type ReviewContext } from '../storage.js';

export const reviewRouter = new Hono();

async function requireReviewContext(session: string): Promise<ReviewContext> {
  const context = await getReviewContext(session);
  if (!context) throw new Error('Review context not initialized');
  return context;
}

function changedFilePayload(repoRootPath: string) {
  const files = listChangedFiles(repoRootPath);
  return {
    files,
    totals: {
      added: files.reduce((sum, file) => sum + file.added, 0),
      removed: files.reduce((sum, file) => sum + file.removed, 0),
      count: files.length,
    },
  };
}

reviewRouter.post('/review/context', async (c) => {
  const body = await c.req.json<{
    session?: string;
    paneId?: string;
    panePath?: string;
    windowIndex?: number;
    repoRoot?: string;
    github?: ReviewContext['github'];
  }>();

  if (!body.session || !body.paneId || !body.panePath || typeof body.windowIndex !== 'number' || !body.repoRoot || !body.github) {
    return c.json({ error: 'session, pane, repoRoot, and github are required' }, 400);
  }

  const root = repoRoot(body.repoRoot);
  if (!root) return c.json({ error: 'Invalid repository root' }, 400);

  const gitStatus = getGitStatus(root);
  const context: ReviewContext = {
    contextId: randomUUID(),
    session: body.session,
    paneId: body.paneId,
    panePath: body.panePath,
    windowIndex: body.windowIndex,
    repoRoot: root,
    branch: gitStatus.branch,
    headSha: gitStatus.headSha,
    github: body.github,
    createdAt: Date.now(),
  };

  await setReviewContext(body.session, context);
  return c.json({
    context,
    ...changedFilePayload(root),
  });
});

reviewRouter.get('/review/context', async (c) => {
  const session = c.req.query('session');
  if (!session) return c.json({ error: 'session is required' }, 400);

  try {
    const context = await requireReviewContext(session);
    return c.json({
      context,
      currentHead: currentHead(context.repoRoot),
      ...changedFilePayload(context.repoRoot),
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 409);
  }
});

reviewRouter.get('/review/changed-files', async (c) => {
  const session = c.req.query('session');
  if (!session) return c.json({ error: 'session is required' }, 400);

  try {
    const context = await requireReviewContext(session);
    return c.json(changedFilePayload(context.repoRoot));
  } catch (error) {
    return c.json({ error: (error as Error).message }, 409);
  }
});

reviewRouter.get('/review/tree', async (c) => {
  const session = c.req.query('session');
  const requestedPath = c.req.query('path') ?? '';
  if (!session) return c.json({ error: 'session is required' }, 400);

  try {
    const context = await requireReviewContext(session);
    if (requestedPath && (!pathExists(context.repoRoot, requestedPath) || !isDirectory(context.repoRoot, requestedPath))) {
      return c.json({ error: 'Directory not found' }, 404);
    }

    const changedFiles = listChangedFiles(context.repoRoot);
    return c.json({
      path: requestedPath,
      entries: listRepoTree(context.repoRoot, requestedPath, changedFiles),
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 409);
  }
});

reviewRouter.get('/review/diff', async (c) => {
  const session = c.req.query('session');
  const requestedPath = c.req.query('path');
  if (!session || !requestedPath) return c.json({ error: 'session and path are required' }, 400);

  try {
    const context = await requireReviewContext(session);
    const file = listChangedFiles(context.repoRoot).find((entry) => entry.path === requestedPath);
    return c.json({
      path: requestedPath,
      status: file?.status ?? null,
      diff: getUnifiedDiff(context.repoRoot, requestedPath, file?.status),
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 409);
  }
});

reviewRouter.get('/review/file', async (c) => {
  const session = c.req.query('session');
  const requestedPath = c.req.query('path');
  if (!session || !requestedPath) return c.json({ error: 'session and path are required' }, 400);

  try {
    const context = await requireReviewContext(session);
    const changedFile = listChangedFiles(context.repoRoot).find((entry) => entry.path === requestedPath);

    if (!pathExists(context.repoRoot, requestedPath)) {
      return c.json({
        path: requestedPath,
        status: changedFile?.status ?? null,
        exists: false,
        editable: false,
        reason: changedFile?.status === 'D' ? 'deleted' : 'missing',
      });
    }

    const file = readTextFile(context.repoRoot, requestedPath);
    return c.json({
      path: requestedPath,
      status: changedFile?.status ?? null,
      exists: true,
      editable: file.editable,
      reason: file.reason ?? null,
      token: file.token,
      size: file.size,
      content: file.content,
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 409);
  }
});

reviewRouter.post('/review/file/save', async (c) => {
  const body = await c.req.json<{
    session?: string;
    path?: string;
    content?: string;
    editToken?: string;
  }>();

  if (!body.session || !body.path || typeof body.content !== 'string' || !body.editToken) {
    return c.json({ error: 'session, path, content, and editToken are required' }, 400);
  }

  try {
    const context = await requireReviewContext(body.session);
    const next = saveTextFile(context.repoRoot, body.path, body.content, body.editToken);
    return c.json({
      ok: true,
      token: next.token,
      size: next.size,
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'File changed on disk') {
      return c.json({ error: message }, 409);
    }
    return c.json({ error: message }, 400);
  }
});

reviewRouter.post('/review/file/restore', async (c) => {
  const body = await c.req.json<{ session?: string; path?: string }>();
  if (!body.session || !body.path) return c.json({ error: 'session and path are required' }, 400);

  try {
    const context = await requireReviewContext(body.session);
    const changedFile = listChangedFiles(context.repoRoot).find((entry) => entry.path === body.path);
    if (!changedFile || changedFile.status !== 'D') {
      return c.json({ error: 'Only deleted tracked files can be restored' }, 400);
    }
    restoreTrackedFile(context.repoRoot, body.path);
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }
});
