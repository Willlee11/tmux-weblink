import { describe, it, expect, beforeEach } from "vitest";

describe("fs-access", () => {
	const ORIG_TMUX_WEB_FS_ROOTS = process.env.TMUX_WEB_FS_ROOTS;
	const ORIG_HOME = process.env.HOME;

	beforeEach(() => {
		process.env.TMUX_WEB_FS_ROOTS = ORIG_TMUX_WEB_FS_ROOTS;
		process.env.HOME = ORIG_HOME;
	});

	it("resolveFsRoots returns empty when env not set", async () => {
		delete process.env.TMUX_WEB_FS_ROOTS;
		const { resolveFsRoots } = await import("../src/lib/fs-access.js");
		expect(resolveFsRoots()).toEqual([]);
	});

	it("resolveFsRoots returns empty when env is empty", async () => {
		process.env.TMUX_WEB_FS_ROOTS = "";
		const { resolveFsRoots } = await import("../src/lib/fs-access.js");
		expect(resolveFsRoots()).toEqual([]);
	});

	it("resolveFsRoots parses colon-separated paths", async () => {
		process.env.TMUX_WEB_FS_ROOTS = "/tmp:/var/log";
		const { resolveFsRoots } = await import("../src/lib/fs-access.js");
		const roots = resolveFsRoots();
		expect(roots).toContain("/tmp");
		expect(roots).toContain("/var/log");
	});

	it("resolveFsRoots expands tilde", async () => {
		process.env.HOME = "/home/test";
		process.env.TMUX_WEB_FS_ROOTS = "~/projects:/tmp";
		const { resolveFsRoots } = await import("../src/lib/fs-access.js");
		const roots = resolveFsRoots();
		expect(roots).toContain("/home/test/projects");
		expect(roots).toContain("/tmp");
	});

	it("resolveFsPath rejects paths outside roots", async () => {
		process.env.TMUX_WEB_FS_ROOTS = "/tmp/fs-root";
		const { resolveFsPath } = await import("../src/lib/fs-access.js");
		expect(() => resolveFsPath("/etc/passwd")).toThrow("PATH_NOT_ALLOWED");
	});

	it("resolveFsPath rejects path traversal", async () => {
		process.env.TMUX_WEB_FS_ROOTS = "/tmp/fs-root";
		const { resolveFsPath } = await import("../src/lib/fs-access.js");
		// Normalize strips the ".." — so this should end up as /tmp/etc/passwd which is outside /tmp/fs-root
		expect(() => resolveFsPath("/tmp/fs-root/../../../etc/passwd")).toThrow("PATH_NOT_ALLOWED");
	});

	it("resolveFsPath allows paths inside root", async () => {
		process.env.TMUX_WEB_FS_ROOTS = "/tmp/fs-root";
		const { resolveFsPath } = await import("../src/lib/fs-access.js");
		const result = resolveFsPath("/tmp/fs-root/some/file.txt");
		expect(result).toBe("/tmp/fs-root/some/file.txt");
	});

	it("resolveFsPath allows exact root path", async () => {
		process.env.TMUX_WEB_FS_ROOTS = "/tmp/fs-root";
		const { resolveFsPath } = await import("../src/lib/fs-access.js");
		const result = resolveFsPath("/tmp/fs-root");
		expect(result).toBe("/tmp/fs-root");
	});

	it("resolveFsPath normalizes the path", async () => {
		process.env.TMUX_WEB_FS_ROOTS = "/tmp/fs-root";
		const { resolveFsPath } = await import("../src/lib/fs-access.js");
		const result = resolveFsPath("/tmp/fs-root/./a//b/../c");
		expect(result).toBe("/tmp/fs-root/a/c");
	});

	it("resolveFsPath expands tilde", async () => {
		process.env.HOME = "/home/test";
		process.env.TMUX_WEB_FS_ROOTS = "/home/test";
		const { resolveFsPath } = await import("../src/lib/fs-access.js");
		const result = resolveFsPath("~/projects");
		expect(result).toBe("/home/test/projects");
	});

	it("resolveFsPath throws when not configured", async () => {
		delete process.env.TMUX_WEB_FS_ROOTS;
		const { resolveFsPath } = await import("../src/lib/fs-access.js");
		expect(() => resolveFsPath("/any/path")).toThrow("FS_ROOTS_NOT_CONFIGURED");
	});

	it("MAX_FILE_BYTES is 1 MiB", async () => {
		const { MAX_FILE_BYTES } = await import("../src/lib/fs-access.js");
		expect(MAX_FILE_BYTES).toBe(1_048_576);
	});
});
