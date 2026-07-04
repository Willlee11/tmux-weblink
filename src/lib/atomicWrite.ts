import { writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/** Write data to a temp file next to the target, then atomically rename it.
 *  This prevents readers from seeing a partially-written file.
 */
export function atomicWriteFileSync(filePath: string, data: string | Buffer, mode?: number): void {
	const dir = path.dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
	try {
		writeFileSync(tmpPath, data, mode !== undefined ? { mode } : undefined);
		renameSync(tmpPath, filePath);
	} catch (err) {
		try {
			// Best-effort cleanup of temp file on failure.
			writeFileSync(tmpPath, '');
		} catch {}
		throw err;
	}
}
