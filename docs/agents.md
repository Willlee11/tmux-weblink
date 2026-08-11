---
title: Federation (Hub + Agents)
description: Join machines behind NAT to a public hub and access all tmux sessions from one browser.
---

# Federation: Hub + Agents

tmux-weblink can federate several machines into one browser view:

```
┌─────────────┐   browser   ┌──────────────────────────┐
│  your phone │ ──────────▶ │  HUB (public IP / domain) │
└─────────────┘             │  tmux-weblink + /agent/ws │
                            └───────────▲────────────────┘
                                        │ outbound WebSocket (NAT-friendly)
                            ┌───────────┴────────────────┐
                            │  AGENT (laptop behind NAT) │
                            │  tmux-weblink agent …      │
                            └────────────────────────────┘
```

- **Hub** — a machine with a public IP (or a reachable domain). It serves the browser UI and accepts agent connections. All hub features stay exactly as before.
- **Agent** — any machine without a public IP. It opens a single **outbound** WebSocket to the hub, so no ports need to be opened in NAT/firewalls. The hub then exposes the agent's tmux sessions, files, notes, scheduler, system monitor and git — **exactly like local sessions** — because the agent runs the same application behind the tunnel.

## Trust model

- One hub password (or token) protects the browser UI. A logged-in user can view and attach **all** connected agents' sessions.
- Each agent authenticates with a **registration token** generated on the hub. There is no per-agent password.
- If you revoke an agent token, the hub disconnects that agent immediately.

## Setting up the hub

1. Run the hub normally and set a password (first visit, or `tmux-web setup`).
2. Create a token for each machine you want to join — from the CLI:

```bash
tmux-web agent-token add --name laptop
```

or from the browser: **Settings → Federation → Create token**.

The token is printed **once** — store it somewhere safe:

```
✓ agent token created
  id:    7f3a91c2be4d
  name:  laptop
  token: oQhF2mT8R3... (32 random bytes, base64url)
```

3. Manage tokens:

```bash
tmux-web agent-token list          # show ids + names
tmux-web agent-token remove <id>   # revoke (disconnects that agent)
```

## Running an agent

**Preferred — same start command everywhere.** Every machine runs the same
`tmux-web` server. On the machine you want to attach to the hub, open
`/settings/federation`, enter the hub URL + token + a name, and press
**Save & Connect**. The agent client runs in-process (no extra process, no
ports opened), reconnects automatically with backoff, and persists across
restarts of the server.

For headless/container setups the standalone mode still works:

```bash
tmux-web agent --hub wss://hub.example.com --token oQhF2mT8R3... --name laptop
```

Environment variables work too: `TMUX_WEB_AGENT_HUB`, `TMUX_WEB_AGENT_TOKEN`, `TMUX_WEB_AGENT_NAME`.

> Use `wss://` when the hub is behind TLS (recommended — the token is sent inside the WebSocket handshake).

### systemd unit (agent)

```ini
[Unit]
Description=tmux-weblink agent
After=network-online.target tmux.service
Wants=network-online.target

[Service]
User=you
ExecStart=/usr/bin/env tmux-web agent --hub wss://hub.example.com --token oQhF2mT8R3... --name laptop
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Behind a firewall / NAT

The agent only makes an **outbound** connection, so:

- No inbound ports are needed on the agent.
- The hub must be reachable from the agent (public IP, or a VPN / Tailscale / Cloudflare Tunnel address).
- If the hub is behind a reverse proxy, make sure WebSocket upgrade paths are forwarded (`/agent/ws`, `/ws/...`).

## Using the browser

- The shell page gets a **machine switcher** (this hub + every online agent).
- The session sidebar groups sessions by machine; remote sessions are marked with the agent name.
- If an agent goes offline its sessions turn grey and attaching shows an "agent offline" message; the agent reconnects automatically with exponential backoff and everything recovers by itself.
- The settings page can be opened per machine, but **plugin install and auth/token management are hub-only**.
- Under the unified trust model, the system monitor / kill-session actions are available on agents too.

## Security caps (hub)

| Setting | Default | Purpose |
| --- | --- | --- |
| `TMUX_WEB_MAX_AGENTS` | 16 | max connected agents |
| `TMUX_WEB_MAX_AGENT_CONNS` | 64 | max concurrent terminal relays per agent |
| `TMUX_WEB_AGENT_OFFLINE_MS` | 45000 | mark agent offline after this silence |
| `TMUX_WEB_AGENT_HEARTBEAT_MS` | 15000 | agent heartbeat interval |
| `TMUX_WEB_TUNNEL_TIMEOUT_MS` | 30000 | per tunnel request timeout |
| `TMUX_WEB_MAX_TUNNEL_BODY` | 20 MB | max tunneled request body |

## Troubleshooting

- **Agent keeps reconnecting** — check `TMUX_WEB_AGENT_HUB` scheme (`ws://` vs `wss://`), the token, and that the hub's `/agent/ws` is reachable from the agent.
- **Token mismatch** — tokens are stored hashed in the hub's security config. Create the token with the same `HOME`/`TMUX_WEB_MODE` as the running hub (dev mode uses `~/.dev/.config/tmux-web/security.json`).
- **Sessions not showing** — the agent reports `tmux list-sessions` every 10 s; make sure tmux is on the agent's PATH and `TMUX` is not set to a foreign server (agents behind a shell inside tmux should unset `TMUX` or use their own `TMUX_TMPDIR`).
- **Relay drops** — check the hub's per-agent relay cap (`TMUX_WEB_MAX_AGENT_CONNS`).

## Architecture notes

- Agents run the **same route table** as the hub (`buildApp`), minus admin routes (password setup, auth tokens, plugin install).
- Browser HTTP requests to `/a/:agentId/...` and terminal WebSockets to `/ws/a/:agentId/:session` are tunneled over the agent's single persistent connection.
- Sessions are keyed as `agentId:sessionName` on the hub, so identical session names on different machines never collide.
- See [architecture.md](architecture.md) for the base design.
