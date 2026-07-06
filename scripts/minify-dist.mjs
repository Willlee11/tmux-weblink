#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';

const distDir = path.join(process.cwd(), 'dist');

async function* walkJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJs(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      yield fullPath;
    }
  }
}

let count = 0;
for await (const filePath of walkJs(distDir)) {
  const source = await readFile(filePath, 'utf8');
  const result = await esbuild.transform(source, {
    minify: true,
    sourcemap: false,
    platform: 'node',
    format: 'esm',
  });
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) console.warn(warning);
  }
  await writeFile(filePath, result.code);
  count++;
}

console.log(`[minify-dist] minified ${count} files`);
