import { defineConfig } from 'vitest/config';

const os = await import('node:os');
const path = await import('node:path');

// Point every test at a throwaway data dir so db/state writes (e.g.
// sessionState tombstone tests) never touch the real ~/.tmux-web state.
const testDataDir = path.join(os.tmpdir(), 'tmux-web-test-data');
process.env.TMUX_WEB_DATA_DIR = testDataDir;

export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts', 'packages/**/tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reportsDirectory: 'coverage',
		},
	},
});
