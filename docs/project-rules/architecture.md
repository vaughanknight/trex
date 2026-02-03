# trex Architecture

**Version**: 1.0.0-draft
**Status**: DRAFT - Pending constitution completion
**Last Updated**: 2026-02-04

---

<!-- USER CONTENT START -->
<!-- This section preserves user customizations across architecture updates -->
<!-- USER CONTENT END -->

## High-Level Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (Next.js/React)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Project List │  │ Session Grid │  │ Terminal Viewer  │  │
│  │   (Sidebar)  │  │   (Preview)  │  │   (xterm.js)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │ REST APIs                      │ WebSocket (terminal I/O)
         ▼                                ▼
┌─────────────────────────────────────────────────────────────┐
│                    trex Backend (Go)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  HTTP/REST   │  │  WebSocket   │  │   Persistence    │  │
│  │   Server     │  │    Server    │  │  (bookmarks/cfg) │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                 │                                  │
│         └─────────────────┴─────────────────────────────────┤
│                    tmax Library (imported)                   │
│              ┌──────────────────────────────────┐            │
│              │  tmux Session Management Logic   │            │
│              │  - Discovery, Attach, Detach     │            │
│              │  - Idle Detection, Status        │            │
│              └──────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  tmux (system)  │
                    │   - Sessions    │
                    │   - Windows     │
                    │   - Panes       │
                    └─────────────────┘
```

### Component Responsibilities

**Browser Frontend (Next.js/React)**:
- Visual project organization (sidebar, bookmarks)
- Session grid with status and previews
- Terminal emulation (xterm.js) with <50ms latency
- Keyboard shortcuts and pro UX
- Theme and customization UI

**trex Backend (Go)**:
- REST API server (session commands, config management)
- WebSocket server (real-time terminal I/O streaming)
- Data persistence (bookmarks, configs, UI state - TODO design)
- Imports and uses tmax library for all tmux operations

**tmax Library (Go, upstream dependency)**:
- tmux session discovery and management
- Idle session detection
- Session lifecycle operations (create, attach, detach, kill)
- Owned and maintained in tmax repository

**tmux (system process)**:
- Session persistence and isolation
- Survives trex restarts/crashes independently

---

## Communication Protocols

### REST API (Commands)
**TODO**: Define after Q9-Q10 (quality gates, workflows)

Example endpoints (preliminary):
- `GET /api/sessions` - List all tmux sessions
- `POST /api/sessions` - Create new session
- `DELETE /api/sessions/:id` - Kill session
- `GET /api/bookmarks` - Retrieve user bookmarks

### WebSocket (Terminal I/O)
**TODO**: Define protocol after Q7-Q9 (testing, quality)

Requirements:
- Bidirectional: Browser ↔ trex ↔ tmux
- Low latency: <50ms round-trip
- Multiple concurrent connections (one per active terminal)
- Handle reconnection gracefully

---

## Data Flow

### Session Discovery Flow
```
1. Browser requests session list (REST GET /api/sessions)
2. trex backend calls tmax.ListSessions()
3. tmax queries tmux via CLI/API
4. Session metadata returned to browser (status, idle time, active windows)
5. Browser renders session grid with previews
```

### Terminal Attachment Flow
```
1. User clicks session in browser
2. Browser opens WebSocket connection to trex
3. trex uses tmax.AttachSession(sessionID)
4. trex streams tmux output over WebSocket
5. Browser renders in xterm.js
6. User input captured in browser → WebSocket → trex → tmux
```

---

## Deployment Architecture (v1)

**Scope**: Localhost only, single user

```
Developer Machine (localhost)
├── trex binary (Go backend + embedded Next.js build)
│   ├── Listens on http://localhost:3000
│   └── WebSocket on ws://localhost:3000/ws
├── tmux (system process)
└── Browser (Chrome/Firefox/Safari)
    └── Connects to localhost:3000
```

**Installation**: Single binary distribution (Go binary with embedded Next.js static assets)

---

## Technology Boundaries

### What Lives Where

**tmax Repository** (upstream):
- All tmux integration logic
- Session management library (`pkg/tmux/`)
- CLI tool (`cmd/tmax/`)

**trex Repository** (this project):
- Web UI (Next.js/React frontend)
- HTTP/WebSocket server (Go backend)
- Bookmark/config persistence
- Terminal emulation integration (xterm.js)

**Forbidden in trex**:
- Direct tmux CLI calls (must use tmax library)
- Reimplementation of session logic (DRY with tmax)

---

## Integration Points

### tmax Library Integration
- Import path: `github.com/yourusername/tmax/pkg/tmux`
- Version strategy: Go modules with semantic versioning
- Update workflow: Feature request → tmax implements → trex updates import

### Future Integration Points (TODO)
**TODO**: Define after Q14 (agent integration)
- Claude Code CLI compatibility
- Plugin/extension model
- Other agent frameworks

---

## Outstanding Architecture Questions

The following will be resolved in interview Q7-Q20:

- **Persistence Layer Design** (Q16): Where/how to store bookmarks, configs, history
- **Testing Boundaries** (Q7-Q9): How to test backend ↔ tmax ↔ tmux integration
- **Distribution Strategy** (Q17): Single binary vs separate frontend/backend
- **Observability** (Q18): Logging, metrics, error tracking approach
- **Agent Integration** (Q14): Extension points for AI agents

---

See [Constitution](./constitution.md) for current progress.
