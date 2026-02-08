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

## Authentication (Optional)

trex supports GitHub OAuth for secure remote access. When disabled (default), trex runs locally without authentication.

### Quick Start

1. Set environment variables:

```bash
export TREX_AUTH_ENABLED=true
export TREX_GITHUB_CLIENT_ID=your_client_id
export TREX_GITHUB_CLIENT_SECRET=your_client_secret
export TREX_GITHUB_CALLBACK_URL=http://localhost:3000/auth/callback
export TREX_JWT_SECRET=$(openssl rand -hex 32)
```

2. Create an allowlist at `~/.config/trex/allowed_users.json`:

```json
{
  "version": 1,
  "users": ["your-github-username"]
}
```

3. Start trex — it will bind to `0.0.0.0:3000` when auth is enabled.

For detailed setup instructions, see [docs/how/oauth-setup.md](docs/how/oauth-setup.md).

To disable authentication, unset `TREX_AUTH_ENABLED` or set it to `false` and restart.

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
