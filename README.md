# tmux-weblink

Access your tmux sessions from the browser. A lightweight web server that lists running tmux sessions and lets you attach through a full terminal in your browser — with built-in notes, a scheduler, and sidebar extensions.

## Install

```bash
npm install -g tmux-weblink
```

Or run directly with npx:

```bash
npx tmux-weblink
```

## Usage

```bash
# Interactive setup (command bar, agents page)
tmux-weblink setup

# Start on default port 21000
tmux-weblink

# Custom port
PORT=8080 tmux-weblink

# Use the default xterm.js renderer
tmux-weblink

# Optional: use ghostty-web for terminal rendering
tmux-weblink --ghostty

# Equivalent environment override
TMUX_WEB_TERMINAL_RENDERER=ghostty tmux-weblink

# Optional: tail-first buffer loading (see docs/architecture.md)
TMUX_WEB_INITIAL_LINES=1000 TMUX_WEB_HISTORY_CHUNK=500 tmux-weblink
```

Then open `http://localhost:21000` in your browser. You'll see a list of active tmux sessions — click one to attach.

## Documentation

- [Documentation hub](docs/index.md)
- [Notes](docs/notes.md) — per-session Markdown scratchpad
- [Scheduler](docs/scheduler.md) — delayed `send-keys` tasks
- **Windows drawer** — switch tmux windows from the terminal header (mobile-friendly tab picker)
- [Extensions](docs/extensions.md) — install, configure, and build sidebar plugins
- [Architecture](docs/architecture.md) — how the server, terminal, and extensions connect

## Prerequisites

- **Node.js** >= 22
- **tmux** installed and available in your PATH
- Writable `~/.tmux-web/` and `~/.config/tmux-web/` (see [docs](docs/index.md) for dev-mode paths)

## Credits

This project is built on top of ideas and code from:

- [tmux-web](https://github.com/ashutoshpw/tmux-web) by [@ashutoshpw](https://github.com/ashutoshpw)
- [persalink](https://github.com/brobata/persalink) by [@brobata](https://github.com/brobata)

It is a continuation and re-packaging of those experiments, focused on making a single-person, browser-first tmux companion that is easy to install and run.

## License

MIT
