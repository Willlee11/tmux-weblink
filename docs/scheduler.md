---
title: Scheduler
description: Schedule delayed tmux send-keys tasks that persist across restarts.
---

# Scheduler

Click the clock icon in the session header to schedule a command to be typed into a specific tmux window after a delay.

## How it works

When a task fires, tmux-web runs `tmux send-keys` against `sessionName:windowIndex` — the text is sent literally, then Enter is pressed.

Scheduled tasks persist to `~/.tmux-web/db.json` (or `~/.dev/.tmux-web/db.json` in dev mode), alongside notes — see [Notes](notes.md).

On server restart, surviving tasks are re-armed. Tasks whose fire time already passed are dropped with a log line:

```
[scheduler] dropped missed task <id> (was due <ISO timestamp>)
```

## Limits

| Constraint | Value |
| --- | --- |
| Max text length | 4096 characters |
| Max delay | 24 hours (`86_400_000` ms) |
| Min delay | 1 ms |

## Example

Schedule `terraform apply -auto-approve` to fire in the `deploy` session, window 2, in 30 minutes — close your laptop; the server fires it on time as long as tmux-web stays running.
