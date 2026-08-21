---
title: Documentation
description: Guides for tmux-weblink features and architecture.
---

# Documentation

| Guide | Description |
| --- | --- |
| [Notes](notes.md) | Per-session Markdown scratchpad |
| [Files](files.md) | Browse, edit, and manage local files |
| [Machines / Agents](agents.md) | Join NAT'd machines to a public hub |
| [Architecture](architecture.md) | How the server, terminal, and sidebar connect |

## Running as a systemd service

```ini
# /etc/systemd/system/tmux-weblink.service
[Unit]
Description=tmux-weblink
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/tmux-weblink
Restart=on-failure
RestartSec=5
# ⚠️ Keep this. tmux-weblink spawns `tmux attach` clients via node-pty, and
# the tmux server itself is forked from those clients — so it ends up in this
# service's cgroup. systemd's default KillMode=control-group would kill the
# tmux server (and every tmux session on it) when you `systemctl restart`.
# KillMode=process only signals the main process; attach clients exit when
# their pty closes and the tmux server (and your sessions) survive.
KillMode=process

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tmux-weblink
```

> **Why KillMode=process matters** — on first browser attach, node-pty spawns
> `tmux attach-session`, which forks the tmux server. That server inherits
> this service's cgroup, so with the default `KillMode=control-group` a
> `systemctl restart tmux-weblink` signals **every process in the cgroup,
> including the tmux server**, and all your tmux sessions vanish with it.
> With `KillMode=process` only the main process is signalled; the attach
> clients exit when their pty closes and the detached sessions stay alive.
>
> Verify your setup:
> ```bash
> systemctl show tmux-weblink -p KillMode          # must be "process"
> cat /proc/$(pgrep -f "tmux: server" | head -1)/cgroup   # server's cgroup
> ```
> If the server shows up under `tmux-weblink.service` and KillMode is
> `control-group`, a restart will kill your sessions — fix the unit.
