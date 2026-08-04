import { describe, expect, it } from 'vitest';
import { Terminal } from '@xterm/xterm';

function writeAll(t: Terminal, data: string): Promise<void> {
	return new Promise((resolve) => t.write(data, resolve));
}

/**
 * Copy mode reads text straight from the terminal's active buffer via
 * getLine(viewportY + row).translateToString(true). This guards the core
 * assumption: that extraction works on the alternate screen too, where
 * TUI apps (vim/htop/less) render their fullscreen UI.
 */
describe('copy-mode buffer extraction', () => {
	it('reads visible rows from the alternate screen buffer', async () => {
		const t = new Terminal({ cols: 40, rows: 10 });
		await writeAll(t, 'normal-line-1\r\nnormal-line-2\r\n');
		await writeAll(t, '\x1b[?1049h\x1b[2J\x1b[H');
		await writeAll(t, 'top of alt screen\r\nsecond alt line\r\nthird alt line');

		expect(t.buffer.active.type).toBe('alternate');
		// Alt screens have no scrollback, so visible rows map 1:1 to buffer rows.
		expect(t.buffer.active.viewportY).toBe(0);

		const getRowsText = (startRow: number, endRow: number): string => {
			const buf = t.buffer.active;
			const [a, b] = startRow <= endRow ? [startRow, endRow] : [endRow, startRow];
			const base = buf.viewportY;
			const out: string[] = [];
			for (let row = a; row <= b; row++) {
				const line = buf.getLine(base + row);
				out.push(line ? line.translateToString(true) : '');
			}
			return out.join('\n');
		};

		expect(getRowsText(0, 1)).toBe('top of alt screen\nsecond alt line');
		expect(getRowsText(2, 0)).toBe('top of alt screen\nsecond alt line\nthird alt line'); // reversed range still works
		expect(getRowsText(0, 0)).toBe('top of alt screen');
	});
});
