# trex

A web UI for coding with agents via terminal, via tmux, via the browser.

## Overview

trex provides a unified interface for interacting with AI coding agents through multiple access points:
- **Terminal**: Direct command-line interface
- **tmux**: Terminal multiplexer integration for session management
- **Browser**: Web-based UI for visual interaction

## Features

- Multi-modal agent interaction (terminal, tmux, browser)
- Session management and persistence
- Real-time collaboration and monitoring

## Prerequisites

- Go 1.22+
- Node.js 20+
- npm

For Electron desktop builds:
- macOS (primary target for v1)

## Building

### Web Binary

Build a single binary that serves the web UI:

```bash
make build-web
```

This produces `dist/trex`.

### Electron Desktop App

Build the desktop application:

```bash
make build-electron
```

This produces the app in `electron/release/`.

### Development

Run the Go backend:

```bash
make dev-backend
```

Run the frontend dev server (with hot reload):

```bash
make dev-frontend
```

For development, run both in separate terminals. The frontend proxies API requests to the backend.

## Running

### Web Mode

```bash
./dist/trex
```

Open http://localhost:3000 in your browser.

### Desktop Mode

Open `electron/release/trex-*.dmg` and install the app.

## API

### Health Check

```bash
curl http://localhost:3000/api/health
```

Returns:
```json
{"status":"ok","version":"0.1.0"}
```

## License

MIT License - see [LICENSE](LICENSE) for details
