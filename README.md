# tmux-weblink

**English** | [中文](README.zh-CN.md)

Access your tmux sessions from the browser. A lightweight web server that lists running tmux sessions and lets you attach through a full terminal in your browser — with built-in notes, a file browser, and a touch-friendly UI for both mobile and desktop.

## Features

- **Full terminal**: xterm.js rendering, 256 colors, copy/paste, paste images straight into CLI tools
- **Touch optimized**: inertial scrollback, tap-to-page left half, drag-select auto-copy, virtual-key toolbar
- **PWA**: "Add to Home Screen" on phones, "Install" in desktop browsers → standalone window app
- **Sidebar grouping**: sessions auto-clustered by working directory (folder-name headers, collapsible)
- **New Session directory-tree picker**: expand down to any directory, including hidden ones
- **Notes**: per-session Markdown scratchpad with auto-save
- **Files**: browse/edit local files and view git status
- **Machines federation**: join NAT'd machines to a public hub (no open ports needed), multi-machine terminal matrix
- **Security**: scrypt-hashed password auth, login rate limiting, audit log

---

# Usage Guide (step by step)

## 1. Install and start

```bash
npm install -g tmux-weblink

# Start (default port 21000)
tmux-weblink
```

Open **http://localhost:21000** in your browser.

## 2. First run: set a password and log in

The first visit shows a **"Set your password"** page (min 8 characters). The password is stored as a scrypt hash on the machine; from then on you just type it to log in.

> Alternative: run `tmux-weblink setup` from the command line to initialize.

## 3. Layout tour

- **Sidebar (Sessions mode, default)**:
  - **`+ New Session`** button on top — create a new tmux session
  - Session list **grouped by working directory** (folder-name headers, click to collapse). Sessions from the same project stack together.
  - Each session has a colored dot: **green = idle, amber = working** (automatic activity probing, no config)
  - Sessions killed inside tmux move to a greyed-out **"失效会话 / dead sessions"** group (see §8)
- **Three mode buttons at the bottom**: `Sessions` / `Files` / `Settings`
- **Main area**: placeholder until you open a session, then the full terminal

## 4. Opening a session & day-to-day operations

### Open a session

**Click any session** in the sidebar to attach (a real `tmux attach`, not an emulation). The sidebar collapses to give the terminal the full width.

- To switch sessions, click the **tmux-weblink** logo in the top-left to re-open the sidebar, then click another session
- Attachments are real: windows/panes you open and what other terminals (e.g. a native tmux client) see stay fully in sync

### Copy & paste

| Action | How |
| --- | --- |
| Copy terminal text | **Drag-select** and release — auto-copies (desktop & mobile); or hold `Shift` while dragging |
| Paste into terminal | With the terminal focused, just press `Ctrl+V` (`Cmd+V` on Mac) — the page handles it: text is typed in, images are uploaded (grant clipboard permission the first time) |
| Paste an **image** (≥2.2.24) | Copy an image (screenshot / clipboard image), press `Ctrl+V` in the terminal → the image uploads to `~/.tmux-web/uploads/` and its **file path is typed into the terminal**. The terminal is text-only, so pasting an image = pasting its path — then `cat` or `vim` it |

> In an agent session (Machines), pasted images land on the **agent's machine**, so the path is valid there.

### Touch screens (phones / tablets)

The terminal is split in two zones — the **left 40% is a paging zone** (split top/bottom by where your finger lands):

- **Left 40%** (split top/bottom by where your finger lands):
  - tap/swipe **top half** = page up (PgUp, vim-friendly)
  - tap/swipe **bottom half** = page down (PgDn)
  - A translucent ↑/↓ hint appears; no soft keyboard pops up — tap the terminal body when you want to type
- **Right 60%**: drag up/down to **scroll terminal history** with inertia, like a normal mobile page

### Virtual-key toolbar (mobile)

Tap the input bar at the bottom for a toolbar with `ESC` / `Tab` / `Shift+Tab` / arrow keys — the keys soft keyboards lack.

### Switch tmux windows from the header

Multi-window sessions show a **window drawer** at the terminal header (a mobile-friendly tab picker). Tap to switch tmux windows — no need to remember `Ctrl+B n` keybindings.

### Quick Commands

Open **`/quick-commands`**: save frequent commands as cards (title + command + optional target session) and run them with one click. Great for "restart the service" or "run the tests".

## 5. Creating a session (New Session)

Click **`+ New Session`** in the sidebar:

1. **Session name**: e.g. `myproject`
2. **Start directory** — either:
   - type a path and pick from the live **autocomplete** (typing `~/.cl` suggests `~/.claude`), or
   - click the folder button (📁) to open a **directory tree**; expand down to your target — it auto-expands to the current session's directory, and **hidden directories (`.claude`, `.config`, …) are visible** (≥2.2.25, sorted after regular ones)
3. Click **Create** — the session starts and you're attached

> Leave the directory empty to start in `$HOME` and `cd` later — the tree is a convenience, not a requirement.

## 6. Notes & Files

### Notes (per-session scratchpad)

Click the **notepad icon** in the session header to open that session's Markdown pad; it **auto-saves as you type** into `~/.tmux-web/db.json`. Re-open the session later and the note is still there. For a bigger surface / export use `/notes/<session>` or the global note at `/notes/__global__`.

### Files (browse/edit + git)

Switch to **Files** mode at the bottom:

- **Default** (no config): with a session open, Files browses that session's **working directory**
- **Configured** (`TMUX_WEB_FS_ROOTS=/path1:/path2`): shows multiple root entries
- Click folders to descend, click a file to open it in the editor, **Save** to write; `..` goes up
- Git repos show the **branch name** and per-file change markers; git diffs are viewable from the header/sidebar
- New file: type a name in the bottom field and hit **New File**

Security: paths must resolve inside a configured root (single file ≤1 MiB by default); traversal like `../../../etc/passwd` is rejected.

## 7. Machines (bring NAT'd machines in)

One **hub** (publicly reachable) + any number of machines stuck behind NAT. Every machine runs the same package and the same command — only the role differs:

1. **On the hub**: open `http://<hub>:21000/settings/machines`, create an agent token and copy it (one-shot; it disappears once you leave the page)
2. **On the remote machine** (e.g. your home/office LAN box): start the server, then open *its own* `http://localhost:21000/settings/machines`, paste hub URL + token, hit **Save & Connect**
3. **Back on the hub's browser page**: a group named after the machine appears in the sidebar — click into its sessions exactly like local ones. Input, touch, and image paste all travel through an encrypted tunnel

Notes:

- The agent client runs **in-process** next to the normal server; the remote machine opens no ports
- **When the hub is upgraded, upgrade the remote agents too** (agent-side logic evolves with releases)
- Hard-refresh the browser after front-end changes (see §9)

## 8. Sessions killed in tmux (dead sessions / tombstones)

When you `kill-session` a session in tmux, the list doesn't throw it away — it moves to the greyed-out **dead sessions** group, keeping its place and path.

Click it to open an action panel:

- **Rebuild (same name & path)** — relaunch the session in its original working directory (the common case)
- **Rename (record only)** — change the record, not tmux
- **Delete the dead record** — forget it entirely

## 9. Installing as an app

- **iOS**: Safari share → **Add to Home Screen** (fullscreen standalone)
- **Android / Chrome**: menu → **Add to Home Screen** / **Install app**
- **Desktop browsers** (Linux/Windows/macOS): click the **Install** icon in the Chrome/Edge/Chromium address bar for a standalone window
- Note: plain-HTTP LAN IPs won't show the install prompt (browsers require a secure context); `localhost` or HTTPS both work

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Page doesn't show new features after an upgrade | **Hard-refresh**: `Ctrl+Shift+R` (Mac `Cmd+Shift+R`). Front-end JS is served at page load; already-open pages don't update themselves |
| Agent sessions still behave old after hub upgrade | Upgrade the **remote agent** package to the new version too |
| Pasting an image does nothing | Need ≥2.2.24; make sure `Ctrl+V` in the terminal and grant clipboard permission once |
| Hidden dirs like `.claude` missing in the tree | Need ≥2.2.25 (hidden entries sort at the end of listings) |
| Port taken | `PORT=8080 tmux-weblink` |
| Forgot your password | Re-run `tmux-weblink setup` on the machine |
| Running under systemd | The unit **must** set `KillMode=process` (the default control-group mode would kill the tmux server on restart — see [docs/index.md](docs/index.md)) |
| Server won't run natively on Windows | Run the server inside **WSL2**; the Windows browser works fine as a client (point it at WSL2 or a remote hub) |

---

# Command reference

```bash
# Interactive setup (set password, etc.)
tmux-weblink setup

# Start on default port 21000
tmux-weblink

# Custom port
PORT=8080 tmux-weblink

# Optional: tail-first buffer loading (see docs/architecture.md)
TMUX_WEB_INITIAL_LINES=1000 TMUX_WEB_HISTORY_CHUNK=500 tmux-weblink

# Machines: join this machine to a hub (no ports opened)
tmux-weblink agent --hub wss://hub.example.com --token <agent-token> --name laptop
```

> **Every machine runs the same command.** To join a hub without the CLI, start the
> server and open its own `http://localhost:21000/settings/machines`, paste the hub
> URL + token, and press **Save & Connect**. The hub's `/settings/machines` page
> creates/revokes tokens.

# Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `21000` | HTTP port |
| `TMUX_WEB_MODE` | `production` | `development` uses a dev data directory |
| `TMUX_WEB_INITIAL_LINES` | — | Read the last N lines first when opening a session |
| `TMUX_WEB_HISTORY_CHUNK` | — | History chunk size for batched loading |
| `TMUX_WEB_AGENT_HUB` / `TMUX_WEB_AGENT_TOKEN` / `TMUX_WEB_AGENT_NAME` | — | Agent connection parameters |
| `TMUX_WEB_FS_ROOTS` | — | File-browsing roots (colon-separated). Unset = Files browses the open session's working directory |
| `TMUX_WEB_MAX_IMAGE_UPLOAD_BYTES` | 10 MiB | Image-paste upload size cap |

# More documentation

- [Documentation hub](docs/index.md) (incl. systemd service setup)
- [Notes](docs/notes.md)
- [Files API / security](docs/files.md)
- [Machines / Agents](docs/agents.md)
- [Architecture](docs/architecture.md)

# Prerequisites

- **Node.js** >= 22
- **tmux** installed and in your PATH
- Writable `~/.tmux-web/` and `~/.config/tmux-web/` (dev-mode paths: see [docs](docs/index.md))

# Windows notes

- The server doesn't run natively well on Windows (node-pty lacks a linux-x64-style prebuild there; requires source compilation — **WSL2** is recommended)
- The browser client (PWA / web) works fine on Windows, against WSL2 locally or a remote hub

# Credits

Built on ideas and code from:

- [tmux-web](https://github.com/ashutoshpw/tmux-web) by [@ashutoshpw](https://github.com/ashutoshpw)
- [persalink](https://github.com/brobata/persalink) by [@brobata](https://github.com/brobata)

A continuation and re-packaging of those experiments, focused on a single-user, browser-first tmux companion that's easy to install and run.

# License

MIT
