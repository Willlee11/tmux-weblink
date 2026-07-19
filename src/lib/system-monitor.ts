import * as os from "node:os";

export interface SystemStatus {
	memory: {
		total: number;
		free: number;
		used: number;
		percent: number;
	};
	cpu: {
		loadAvg: [number, number, number];
		cores: number;
	};
	uptime: {
		system: number;
		process: number;
	};
	process: {
		rss: number;
		heapTotal: number;
		heapUsed: number;
	};
	hostname: string;
	platform: string;
}

export function getSystemStatus(): SystemStatus {
	const total = os.totalmem();
	const free = os.freemem();
	const used = total - free;

	return {
		memory: {
			total,
			free,
			used,
			percent: total > 0 ? Math.round((used / total) * 100) : 0,
		},
		cpu: {
			loadAvg: os.loadavg() as [number, number, number],
			cores: os.cpus().length,
		},
		uptime: {
			system: os.uptime(),
			process: process.uptime(),
		},
		process: {
			rss: process.memoryUsage().rss,
			heapTotal: process.memoryUsage().heapTotal,
			heapUsed: process.memoryUsage().heapUsed,
		},
		hostname: os.hostname(),
		platform: `${os.platform()} ${os.release()}`,
	};
}

/** Format bytes to a human-readable string. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Format seconds to a human-readable duration string. */
export function formatDuration(seconds: number): string {
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const parts: string[] = [];
	if (d > 0) parts.push(`${d}d`);
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (parts.length === 0) parts.push(`${Math.floor(seconds)}s`);
	return parts.join(" ");
}
