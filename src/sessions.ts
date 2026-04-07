import { execFileSync } from "node:child_process";

export interface TmuxSession {
	name: string;
	windows: number;
	attached: boolean;
}

export function listSessions(): TmuxSession[] {
	try {
		const output = execFileSync(
			"tmux",
			["list-sessions", "-F", "#{session_name}\t#{session_windows}\t#{session_attached}"],
			{ encoding: "utf-8", timeout: 3000 },
		);
		return output
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const [name, windows, attached] = line.split("\t");
				return {
					name,
					windows: parseInt(windows, 10),
					attached: attached !== "0",
				};
			});
	} catch {
		return [];
	}
}
