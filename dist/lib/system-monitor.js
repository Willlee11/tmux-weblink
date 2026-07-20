import * as os from "node:os";
import { execFileSync } from "node:child_process";
export function getSystemStatus() {
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
            loadAvg: os.loadavg(),
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
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
/** Format seconds to a human-readable duration string. */
export function formatDuration(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0)
        parts.push(`${d}d`);
    if (h > 0)
        parts.push(`${h}h`);
    if (m > 0)
        parts.push(`${m}m`);
    if (parts.length === 0)
        parts.push(`${Math.floor(seconds)}s`);
    return parts.join(" ");
}
const TOP_COUNT = 10;
export function getTopProcesses() {
    try {
        const out = execFileSync("ps", [
            "aux", "--sort=-%mem",
        ], { encoding: "utf-8", timeout: 3000 });
        const lines = out.trim().split("\n");
        // Parse fixed-width ps aux output: columns are fixed-width up to COMMAND
        const results = [];
        for (let i = 1; i < lines.length && results.length < TOP_COUNT; i++) {
            // ps aux columns: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
            // COMMAND is the rest after the 10th whitespace-delimited field
            const line = lines[i];
            const m = line.match(/^(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/);
            if (!m)
                continue;
            const rssKb = parseInt(m[6], 10);
            results.push({
                pid: parseInt(m[2], 10),
                user: m[1],
                cpu: m[3],
                mem: m[4],
                rss: isNaN(rssKb) ? 0 : rssKb * 1024,
                command: m[7],
            });
        }
        return results;
    }
    catch {
        return [];
    }
}
export function killProcess(pid) {
    try {
        execFileSync("kill", [String(pid)], { timeout: 3000 });
        return { ok: true };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : "kill failed";
        return { ok: false, error: msg };
    }
}
