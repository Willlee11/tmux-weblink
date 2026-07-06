#!/usr/bin/env node
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsDir = join(root, 'dist', 'assets');

await rm(assetsDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });

const result = await esbuild.build({
	entryPoints: [join(root, 'src', 'browser', 'terminal-client.ts')],
	outdir: assetsDir,
	bundle: true,
	platform: 'browser',
	format: 'esm',
	splitting: true,
	minify: true,
	sourcemap: false,
	entryNames: '[name]',
	chunkNames: '[name]-[hash]',
	assetNames: '[name]',
});

if (result.errors.length > 0) {
	for (const error of result.errors) console.error(error);
	process.exit(1);
}

await copyFile(
	join(root, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css'),
	join(assetsDir, 'xterm.css'),
);
