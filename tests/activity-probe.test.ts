import { describe, it, expect } from 'vitest';
import { ActivityProbe, computeAgentState, DEFAULT_ACTIVITY_IDLE_MS } from '../src/lib/activity-probe.js';

function probeWithTmux(script: Record<string, string>) {
	// script maps a tmux invocation (args joined) to stdout.
	return new ActivityProbe({
		idleMs: 10_000,
		execTmux: async (args: string[]) => {
			const key = args.join(' ');
			const out = script[key];
			if (out === undefined) throw new Error(`unexpected tmux call: ${key}`);
			return out;
		},
	});
}

describe('computeAgentState', () => {
	it('working while output happened within idleMs', () => {
		expect(computeAgentState(1_000, 500, DEFAULT_ACTIVITY_IDLE_MS)).toBe('working');
		expect(computeAgentState(1_000, 1_000, DEFAULT_ACTIVITY_IDLE_MS)).toBe('working');
	});
	it('idle after silence longer than idleMs', () => {
		expect(computeAgentState(20_001, 0, 20_000)).toBe('idle');
		expect(computeAgentState(20_000, 0, 20_000)).toBe('working');
	});
});

describe('ActivityProbe.scan', () => {
	it('first scan establishes a baseline and reports idle', async () => {
		const probe = probeWithTmux({
			'list-panes -a -F #{session_name}\t#{window_index}.#{pane_index}': 'cell\t0.0\nwork\t0.0\n',
			'capture-pane -p -e -t cell:0.0': 'prompt>\n',
			'capture-pane -p -e -t work:0.0': 'work output\n',
		});
		const states = await probe.scan(1_000);
		expect([...states.entries()]).toEqual([['cell', 'idle'], ['work', 'idle']]);
	});

	it('detects working when a pane screen changes between scans', async () => {
		let captured = 'prompt>\n';
		const probe = new ActivityProbe({
			idleMs: 10_000,
			execTmux: async (args: string[]) => {
				const key = args.join(' ');
				if (key === 'list-panes -a -F #{session_name}\t#{window_index}.#{pane_index}') {
					return 'cell\t0.0\n';
				}
				if (key === 'capture-pane -p -e -t cell:0.0') return captured;
				throw new Error('unexpected: ' + key);
			},
		});
		await probe.scan(1_000);
		captured = 'prompt>\nhello world\n'; // agent produced output
		const states = await probe.scan(2_000);
		expect(states.get('cell')).toBe('working');
	});

	it('turns idle after silence longer than idleMs', async () => {
		let captured = 'prompt>\n';
		const probe = new ActivityProbe({
			idleMs: 10_000,
			execTmux: async (args: string[]) => {
				const key = args.join(' ');
				if (key === 'list-panes -a -F #{session_name}\t#{window_index}.#{pane_index}') {
					return 'cell\t0.0\n';
				}
				if (key === 'capture-pane -p -e -t cell:0.0') return captured;
				throw new Error('unexpected: ' + key);
			},
		});
		await probe.scan(1_000);
		captured = 'prompt>\noutput\n';
		await probe.scan(2_000);
		expect((await probe.scan(3_000)).get('cell')).toBe('working');
		// quiet for > idleMs
		const states = await probe.scan(20_001);
		expect(states.get('cell')).toBe('idle');
	});

	it('forgets sessions that disappear', async () => {
		let panes = 'cell\t0.0\n';
		const probe = new ActivityProbe({
			idleMs: 10_000,
			execTmux: async (args: string[]) => {
				const key = args.join(' ');
				if (key.startsWith('list-panes')) return panes;
				if (key.startsWith('capture-pane')) return 'x\n';
				throw new Error('unexpected: ' + key);
			},
		});
		await probe.scan(1_000);
		panes = ''; // session killed
		const states = await probe.scan(2_000);
		expect(states.size).toBe(0);
	});

	it('new session with the same name starts from a fresh idle baseline', async () => {
		let panes = 'cell\t0.0\n';
		let captured = 'old content\n';
		const probe = new ActivityProbe({
			idleMs: 10_000,
			execTmux: async (args: string[]) => {
				const key = args.join(' ');
				if (key.startsWith('list-panes')) return panes;
				if (key.startsWith('capture-pane')) return captured;
				throw new Error('unexpected: ' + key);
			},
		});
		await probe.scan(1_000);
		panes = ''; // killed
		await probe.scan(2_000);
		// recreated with identical screen content
		panes = 'cell\t0.0\n';
		captured = 'old content\n';
		const states = await probe.scan(3_000);
		expect(states.get('cell')).toBe('idle');
	});
});
