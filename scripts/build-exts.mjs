#!/usr/bin/env node
// Build every extension under extensions/.
//   - `--force`: always rebuild (used by `npm run build`)
//   - default:   only build if `dist/` is missing (used by `predev`)
import { readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const force   = process.argv.includes('--force');
const extsDir = path.join(process.cwd(), 'extensions');

if (!existsSync(extsDir)) process.exit(0);

for (const name of readdirSync(extsDir)) {
  const dir = path.join(extsDir, name);
  if (!statSync(dir).isDirectory()) continue;
  if (!existsSync(path.join(dir, 'package.json'))) continue;

  const tag     = `[ext:${name}]`;
  const hasDist = existsSync(path.join(dir, 'dist'));

  if (hasDist && !force) {
    console.log(`${tag} dist present — skipping (use \`npm run build:exts\` to rebuild)`);
    continue;
  }

  if (!existsSync(path.join(dir, 'node_modules'))) {
    console.log(`${tag} installing deps…`);
    execFileSync('npm', ['install'], { cwd: dir, stdio: 'inherit' });
  }

  console.log(`${tag} building…`);
  execFileSync('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' });
}
