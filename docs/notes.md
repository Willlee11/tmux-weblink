---
title: Notes
description: Per-session Markdown scratchpad that auto-saves to disk.
---

# Notes

Every tmux session has a built-in notes drawer. Click the notepad icon in the session header to open a Markdown scratchpad that auto-saves as you type.

## Storage

Notes persist to `~/.tmux-web/db.json` via lowdb (or `~/.dev/.tmux-web/db.json` when running in dev mode). The same file also holds scheduled tasks — see [Scheduler](scheduler.md).

## Scopes

Notes are keyed by scope:

| Scope | Meaning |
| --- | --- |
| `session:<name>` | Notes for a specific tmux session (e.g. `session:staging-debug`) |
| `__global__` | Global notes, available from the landing page |

Re-open a session later and its notes are still there, scoped to that session name.

## Example

While debugging in a `staging-debug` session, jot down the failing request IDs and the commit you bisected to. Re-open the session tomorrow and the notes are still there.

## Full-page editor

You can also open notes in a dedicated page at `/notes/<session>` or `/notes/__global__` for a larger editing surface and export.
