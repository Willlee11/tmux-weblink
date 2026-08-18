import type { PinnedViewRecord } from './db.js';
import { viewKey } from './pinned-views.js';
import { captureSessionWindowsWithPath, listSessionWindows } from './tmux-windows.js';

export type SidebarSession = {
	name: string;
	windows: number;
	attached: boolean;
	lastAccessedAt?: number;
	/** Working directory of the active window (used to cluster sessions). */
	path?: string;
};

export type SidebarPinnedView = {
	sessionName: string;
	windowIndex?: number;
	windowName?: string;
	pinnedAt: number;
	windows?: number;
	attached?: boolean;
	missing?: boolean;
};

export type SidebarPayload = {
	pinned: SidebarPinnedView[];
	recent: SidebarSession[];
	/** Home directory, so the client can abbreviate session paths as ~/…. */
	home: string;
};

function isSessionPinned(pinnedKeys: Set<string>, sessionName: string): boolean {
	return pinnedKeys.has(viewKey(sessionName));
}

/**
 * Working directory of a session's active window. One cheap tmux query per
 * session; failures (dead session, tmux hiccup) degrade to undefined so the
 * sidebar still renders.
 */
export function sessionWorkingPath(sessionName: string): string | undefined {
	try {
		const windows = captureSessionWindowsWithPath(sessionName);
		const active = windows.find((w) => w.active) ?? windows[0];
		return active?.path;
	} catch {
		return undefined;
	}
}

export function buildSidebarSessions(
	sessions: Array<{ name: string; windows: number; attached: boolean }>,
	accessMap: Map<string, number>,
	pinnedViews: PinnedViewRecord[],
): SidebarPayload {
	const sessionByName = new Map(sessions.map((session) => [session.name, session]));
	const pinnedKeys = new Set(pinnedViews.map((view) => viewKey(view.sessionName, view.windowIndex)));

	const pinned: SidebarPinnedView[] = [...pinnedViews]
		.sort((a, b) => b.pinnedAt - a.pinnedAt)
		.map((view) => {
			const session = sessionByName.get(view.sessionName);
			const row: SidebarPinnedView = {
				sessionName: view.sessionName,
				windowIndex: view.windowIndex,
				pinnedAt: view.pinnedAt,
			};

			if (!session) {
				row.missing = true;
				return row;
			}

			row.windows = session.windows;
			row.attached = session.attached;

			if (view.windowIndex !== undefined) {
				const windows = listSessionWindows(view.sessionName);
				const match = windows.find((window) => window.index === view.windowIndex);
				if (!match) {
					row.missing = true;
				} else {
					row.windowName = match.name;
				}
			}

			return row;
		});

	const recent = sessions
		.map((session) => ({
			...session,
			path: sessionWorkingPath(session.name),
			lastAccessedAt: accessMap.get(session.name),
		}))
		.filter((session) => !isSessionPinned(pinnedKeys, session.name))
		.sort((a, b) => {
			const ar = a.lastAccessedAt ?? 0;
			const br = b.lastAccessedAt ?? 0;
			if (ar !== br) return br - ar;
			return a.name.localeCompare(b.name);
		});

	return { pinned, recent, home: process.env.HOME ?? '/' };
}
