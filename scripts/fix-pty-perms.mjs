import { createRequire } from "node:module";
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

try {
	const require = createRequire(import.meta.url);
	const ptyDir = dirname(require.resolve("node-pty/package.json"));
	const prebuilds = join(ptyDir, "prebuilds");
	if (!existsSync(prebuilds)) process.exit(0);
	for (const arch of readdirSync(prebuilds)) {
		const helper = join(prebuilds, arch, "spawn-helper");
		if (existsSync(helper)) chmodSync(helper, 0o755);
	}
} catch {
	// best-effort; never block install
}
