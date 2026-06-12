import { describe, expect, it } from 'vitest';
import {
  buildHandoffBranchName,
  buildWorktreePath,
  classifyKind,
  generateWorktreeId,
  listChangedFiles,
  parseCheckedOutBranches,
  parseStatusPorcelain,
  resolveRepoPath,
} from '../extensions/git-workflow/backend/git.js';
import { cacheKey } from '../extensions/git-workflow/backend/storage.js';
import { isPaneReady, paneNotReadyReason } from '../extensions/git-workflow/backend/pane-ready.js';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

describe('cacheKey', () => {
  it('combines session, paneId, and path', () => {
    expect(cacheKey('dev', '%1', '/home/user/proj')).toBe('dev|%1|/home/user/proj');
  });
});

describe('classifyKind', () => {
  it('detects worktree paths under ~/.worktrees', () => {
    const wt = path.join(os.homedir(), '.worktrees', 'org', 'repo', 'abc12345');
    expect(classifyKind(wt)).toBe('worktree');
  });

  it('detects local paths outside ~/.worktrees', () => {
    expect(classifyKind('/Users/dev/myproject')).toBe('local');
  });
});

describe('buildWorktreePath', () => {
  it('builds path under ~/.worktrees/org/repo/id', () => {
    const p = buildWorktreePath('acme', 'widget', 'x7k2m9ab');
    expect(p).toBe(path.join(os.homedir(), '.worktrees', 'acme', 'widget', 'x7k2m9ab'));
  });
});

describe('generateWorktreeId', () => {
  it('returns 8 lowercase alphanumeric characters', () => {
    const id = generateWorktreeId();
    expect(id).toMatch(/^[a-z0-9]{8}$/);
  });
});

describe('parseCheckedOutBranches', () => {
  it('extracts branches checked out across worktrees', () => {
    const out = [
      'worktree /repo',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /repo-wt',
      'HEAD def456',
      'branch refs/heads/feature/handoff',
      '',
      'worktree /detached',
      'HEAD 789abc',
      'detached',
    ].join('\n');

    expect(parseCheckedOutBranches(out)).toEqual(new Set(['main', 'feature/handoff']));
  });
});

describe('buildHandoffBranchName', () => {
  it('creates a namespaced branch from the source branch and worktree id', () => {
    expect(buildHandoffBranchName('feature/current', 'a1b2c3d4'))
      .toBe('tmux-web/feature/current/a1b2c3d4');
  });
});

describe('parseStatusPorcelain', () => {
  it('parses untracked, modified, deleted, and renamed entries', () => {
    const raw = [
      '?? new.txt',
      'M  edited.ts',
      ' D gone.ts',
      'R  renamed.ts',
      'old-name.ts',
      '',
    ].join('\0');

    expect(parseStatusPorcelain(raw)).toEqual([
      { path: 'new.txt', status: '??' },
      { path: 'edited.ts', status: 'M' },
      { path: 'gone.ts', status: 'D' },
      { path: 'renamed.ts', oldPath: 'old-name.ts', status: 'R' },
    ]);
  });
});

describe('resolveRepoPath', () => {
  it('normalizes paths inside the repository root', () => {
    expect(resolveRepoPath('/tmp/repo', 'src/app.ts')).toEqual({
      absolutePath: path.resolve('/tmp/repo/src/app.ts'),
      relativePath: 'src/app.ts',
    });
  });

  it('rejects paths outside the repository root', () => {
    expect(() => resolveRepoPath('/tmp/repo', '../escape.txt')).toThrow('Path escapes repository root');
  });
});

describe('listChangedFiles', () => {
  it('returns real line counts for tracked edits and untracked files', () => {
    const repoDir = mkdtempSync(path.join(os.tmpdir(), 'tmux-web-git-'));
    try {
      execFileSync('git', ['init'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.name', 'tmux-web'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.email', 'tmux-web@example.com'], { cwd: repoDir });

      writeFileSync(path.join(repoDir, 'tracked.txt'), 'one\ntwo\n', 'utf-8');
      execFileSync('git', ['add', 'tracked.txt'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

      writeFileSync(path.join(repoDir, 'tracked.txt'), 'one\ntwo\nthree\n', 'utf-8');
      writeFileSync(path.join(repoDir, 'new.txt'), 'alpha\nbeta\n', 'utf-8');

      expect(listChangedFiles(repoDir)).toEqual([
        { path: 'new.txt', status: '??', oldPath: null, added: 2, removed: 0 },
        { path: 'tracked.txt', status: 'M', oldPath: null, added: 1, removed: 0 },
      ]);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('expands untracked directories into file entries', () => {
    const repoDir = mkdtempSync(path.join(os.tmpdir(), 'tmux-web-git-'));
    try {
      execFileSync('git', ['init'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.name', 'tmux-web'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.email', 'tmux-web@example.com'], { cwd: repoDir });

      writeFileSync(path.join(repoDir, 'tracked.txt'), 'base\n', 'utf-8');
      execFileSync('git', ['add', 'tracked.txt'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoDir });

      mkdirSync(path.join(repoDir, 'drafts'));
      writeFileSync(path.join(repoDir, 'drafts', 'one.txt'), 'first\n', 'utf-8');
      writeFileSync(path.join(repoDir, 'drafts', 'two.txt'), 'second\nthird\n', 'utf-8');

      expect(listChangedFiles(repoDir)).toEqual([
        { path: 'drafts/one.txt', status: '??', oldPath: null, added: 1, removed: 0 },
        { path: 'drafts/two.txt', status: '??', oldPath: null, added: 2, removed: 0 },
      ]);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('isPaneReady', () => {
  it('returns false on alternate screen', () => {
    expect(isPaneReady({ alternateOn: true, paneCommand: 'zsh' })).toBe(false);
  });

  it('returns true for idle shell', () => {
    expect(isPaneReady({ alternateOn: false, paneCommand: 'zsh' })).toBe(true);
  });

  it('returns false when agent interrupt hint is visible', () => {
    expect(isPaneReady({
      alternateOn: false,
      paneCommand: 'zsh',
      paneScreen: 'working...\nesc to interrupt',
    })).toBe(false);
  });

  it('returns reason when not ready', () => {
    expect(paneNotReadyReason({ alternateOn: true, paneCommand: 'vim' }))
      .toContain('alternate screen');
  });
});
