# tmux-web

Access your tmux sessions from the browser. A lightweight web server that lists running tmux sessions and lets you attach to them through a full terminal in your browser.

## Install

```bash
npm install -g tmux-web
```

Or run directly with npx:

```bash
npx tmux-web
```

## Usage

```bash
# Start on default port 3000
tmux-web

# Custom port
PORT=8080 tmux-web
```

Then open `http://localhost:3000` in your browser. You'll see a list of active tmux sessions — click one to attach.

## Prerequisites

- **Node.js** >= 18
- **tmux** installed and available in your PATH

## How it works

- The landing page lists all active tmux sessions
- Clicking a session opens a full terminal view powered by [ghostty-web](https://github.com/nickolay/ghostty-web)
- The browser connects to the server over WebSocket, which spawns `tmux attach-session` via a PTY
- Terminal resize, input, and scrollback all work as expected
- Auto-reconnects if the connection drops

## License

MIT
