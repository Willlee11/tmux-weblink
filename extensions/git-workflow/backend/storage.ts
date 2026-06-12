import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { PrInfo, PrCheck } from '@tmux-web/ext-gh-workflow';

const DATA_ROOT = process.env.TMUX_WEB_DATA_ROOT
  ?? path.join(os.homedir(), '.tmux-web');

const DATA_DIR  = process.env.EXT_DATA_DIR
  ?? path.join(DATA_ROOT, 'extensions', 'git-workflow');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

export interface BranchChecks {
  branch: string;
  headSha: string;
  url: string;
  checks: PrCheck[];
}

export interface PaneCache {
  session: string;
  paneId: string;
  panePath: string;
  windowIndex: number;
  branch: string;
  headSha: string;
  kind: 'local' | 'worktree';
  mainRepoPath: string | null;
  repoRoot: string;
  github: { nameWithOwner: string; org: string; repo: string };
  changes: { added: number; removed: number };
  dirty: boolean;
  ahead: number;
  behind: number;
  branches: string[];
  paneReady: boolean;
  fetchedAt: number;
  pr?: PrInfo | null;
  branchChecks?: BranchChecks | null;
}

export interface ReviewContext {
  contextId: string;
  session: string;
  paneId: string;
  panePath: string;
  windowIndex: number;
  repoRoot: string;
  branch: string;
  headSha: string;
  github: { nameWithOwner: string; org: string; repo: string };
  createdAt: number;
}

interface Store {
  panes: Record<string, PaneCache>;
  reviewContexts: Record<string, ReviewContext>;
}

export function cacheKey(session: string, paneId: string, panePath: string): string {
  return `${session}|${paneId}|${panePath}`;
}

async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await readFile(DATA_FILE, 'utf-8')) as Partial<Store>;
    return {
      panes: parsed.panes ?? {},
      reviewContexts: parsed.reviewContexts ?? {},
    };
  } catch {
    return { panes: {}, reviewContexts: {} };
  }
}

async function saveStore(store: Store): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

export async function getCachedPane(key: string): Promise<PaneCache | null> {
  const store = await readStore();
  return store.panes[key] ?? null;
}

export async function setCachedPane(key: string, entry: PaneCache): Promise<void> {
  const store = await readStore();
  store.panes[key] = entry;
  await saveStore(store);
}

export async function getReviewContext(session: string): Promise<ReviewContext | null> {
  const store = await readStore();
  return store.reviewContexts[session] ?? null;
}

export async function setReviewContext(session: string, context: ReviewContext): Promise<void> {
  const store = await readStore();
  store.reviewContexts[session] = context;
  await saveStore(store);
}
