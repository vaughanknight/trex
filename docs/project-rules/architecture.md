# trex Architecture

**Version**: 1.0.0
**Status**: RATIFIED
**Last Updated**: 2026-02-04

---

<!-- USER CONTENT START -->
<!-- This section preserves user customizations across architecture updates -->
<!-- USER CONTENT END -->

## High-Level Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js/React)                           │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
│  │  Project List  │  │  Session Grid  │  │    Terminal Viewer         │ │
│  │   (Sidebar)    │  │   (Previews)   │  │    (xterm.js)              │ │
│  │  - Favorites   │  │  - Status      │  │    - <50ms latency         │ │
│  │  - Groups      │  │  - Idle detect │  │    - Multi-session         │ │
│  └────────────────┘  └────────────────┘  └────────────────────────────┘ │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Keyboard Shortcuts (tmux-like: Ctrl-B s, Ctrl-B n, etc.)        │   │
│  │  Command Palette (Cmd-K)                                          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
         │ REST APIs                            │ WebSocket (terminal I/O)
         ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         trex Backend (Go)                                │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
│  │   HTTP/REST    │  │   WebSocket    │  │      Persistence           │ │
│  │    Server      │  │    Server      │  │  - Favorites (JSON)        │ │
│  │  /api/sessions │  │  /ws           │  │  - Groups (JSON)           │ │
│  │  /api/favorites│  │  Bidirectional │  │  - Preferences (JSON)      │ │
│  │  /api/groups   │  │  Terminal I/O  │  │  - History (JSON)          │ │
│  └────────────────┘  └────────────────┘  └────────────────────────────┘ │
│         │                    │                       │                   │
│         └────────────────────┴───────────────────────┘                   │
│                              │                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                  tmax Library (imported via Go modules)            │  │
│  │  ┌────────────────────────────────────────────────────────────┐   │  │
│  │  │  tmux Session Management Logic                              │   │  │
│  │  │  - Discovery (list all sessions)                           │   │  │
│  │  │  - Attach/Detach                                           │   │  │
│  │  │  - Idle Detection                                          │   │  │
│  │  │  - Session Status                                          │   │  │
│  │  │  - Create/Kill                                             │   │  │
│  │  └────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  tmux (system)  │
                    │   - Sessions    │
                    │   - Windows     │
                    │   - Panes       │
                    └─────────────────┘
```

---

## Component Responsibilities

### Browser Frontend (Next.js/React)

**Primary Role**: Rich visual interface for tmux session management

**Components**:
- **Project List Sidebar**: Favorites, groups, quick access
- **Session Grid**: Visual previews with status indicators
- **Terminal Viewer**: xterm.js-based terminal emulation
- **Keyboard Handler**: tmux-like shortcuts in browser context
- **Command Palette**: Quick actions via Cmd-K

**Requirements**:
- <50ms terminal latency (typing must feel native)
- Multiple simultaneous terminal views
- Theme and font customization
- Responsive to browser refresh (restore UI state)

### trex Backend (Go)

**Primary Role**: HTTP/WebSocket server bridging browser to tmux

**Components**:
- **REST API Server**: Session management endpoints
- **WebSocket Server**: Real-time terminal I/O streaming
- **Persistence Layer**: JSON storage for user data
- **Config Manager**: XDG-compliant configuration

**Responsibilities**:
- Import and use tmax library for ALL tmux operations
- Serve Next.js static build
- Manage user preferences, favorites, groups
- Stream terminal output to browser
- Forward browser input to tmux

**Boundary**: Does NOT implement tmux integration directly

### tmax Library (Go, upstream dependency)

**Primary Role**: All tmux interaction logic

**Provided by**: github.com/yourusername/tmax/pkg/*

**Capabilities**:
- Session discovery and listing
- Idle session detection
- Session lifecycle (create, attach, detach, kill)
- Status monitoring

**Relationship**: trex imports tmax as Go module dependency

### tmux (System Process)

**Primary Role**: Session management and persistence

**Independence**: Survives trex crashes/restarts
**Persistence**: May or may not survive reboots (host-dependent)

---

## Data Flow

### Session Discovery Flow

```
1. Browser loads / user refreshes
   │
2. Browser: GET /api/sessions
   │
3. trex backend: calls tmax.ListSessions()
   │
4. tmax: queries tmux via CLI/socket
   │
5. Response: Session metadata (name, status, idle time, windows)
   │
6. Browser: Renders session grid with previews
```

### Terminal Attachment Flow

```
1. User clicks session in browser
   │
2. Browser: Opens WebSocket to ws://localhost:PORT/ws
   │
3. Browser: Sends { type: 'attach', sessionId: 'xyz' }
   │
4. trex backend: calls tmax.AttachSession('xyz')
   │
5. trex backend: Streams tmux output over WebSocket
   │
6. Browser: xterm.js renders terminal output
   │
7. User types in browser
   │
8. Browser: Sends { type: 'input', data: 'keystroke' }
   │
9. trex backend: Forwards to tmux via tmax
   │
10. Loop continues bidirectionally
```

### Persistence Flow

```
1. User marks session as favorite
   │
2. Browser: POST /api/favorites { sessionId: 'xyz' }
   │
3. trex backend: Updates ~/.local/share/trex/favorites.json
   │
4. Response: Success
   │
5. On next startup: trex reads favorites.json, maps to discovered sessions
```

---

## Communication Protocols

### REST API

**Base URL**: `http://localhost:PORT/api`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sessions` | GET | List all tmux sessions |
| `/sessions/:id` | GET | Get session details |
| `/sessions` | POST | Create new session |
| `/sessions/:id` | DELETE | Kill session |
| `/favorites` | GET | List user favorites |
| `/favorites` | POST | Add favorite |
| `/favorites/:id` | DELETE | Remove favorite |
| `/groups` | GET | List user groups |
| `/groups` | POST | Create group |
| `/groups/:id` | PUT | Update group |
| `/groups/:id` | DELETE | Delete group |
| `/preferences` | GET | Get user preferences |
| `/preferences` | PUT | Update preferences |

### WebSocket Protocol

**URL**: `ws://localhost:PORT/ws`

**Client → Server Messages**:
```typescript
interface ClientMessage {
  type: 'attach' | 'detach' | 'input' | 'resize';
  sessionId?: string;      // Required for attach
  data?: string;           // Terminal input (for 'input' type)
  cols?: number;           // Terminal columns (for 'resize' type)
  rows?: number;           // Terminal rows (for 'resize' type)
}
```

**Server → Client Messages**:
```typescript
interface ServerMessage {
  type: 'output' | 'status' | 'error' | 'sessions';
  sessionId?: string;      // Which session this relates to
  data?: string;           // Terminal output (for 'output' type)
  sessions?: Session[];    // Updated session list (for 'sessions' type)
  error?: string;          // Error message (for 'error' type)
}
```

**Performance**: <50ms round-trip for terminal I/O

---

## Data Storage

### XDG-Compliant Paths

| Type | Path | Contents |
|------|------|----------|
| Config | `~/.config/trex/` | `config.json` (settings, keybindings) |
| Data | `~/.local/share/trex/` | `favorites.json`, `groups.json`, `history.json` |
| Cache | `~/.cache/trex/` | Temporary data, session thumbnails |

### Data Schemas

**favorites.json**:
```json
{
  "version": 1,
  "favorites": [
    { "sessionId": "dev-project", "addedAt": "2026-02-04T10:00:00Z" }
  ]
}
```

**groups.json**:
```json
{
  "version": 1,
  "groups": [
    {
      "id": "uuid",
      "name": "Work Projects",
      "sessions": ["project-a", "project-b"],
      "createdAt": "2026-02-04T10:00:00Z"
    }
  ]
}
```

**config.json**:
```json
{
  "version": 1,
  "theme": "dark",
  "font": {
    "family": "JetBrains Mono",
    "size": 14
  },
  "keybindings": {
    "listSessions": "ctrl+b s",
    "nextSession": "ctrl+b n",
    "prevSession": "ctrl+b p"
  }
}
```

---

## Deployment Architecture (v1)

### Localhost Only

```
Developer Machine (localhost)
├── trex binary (Go backend + embedded Next.js build)
│   ├── HTTP server: http://localhost:3000
│   └── WebSocket: ws://localhost:3000/ws
├── tmux (system process, independent)
└── Browser (Chrome/Firefox/Safari)
    └── Connects to localhost:3000
```

### Single Binary Distribution

- Go binary embeds Next.js static export
- No separate frontend/backend deployment
- Single `trex` command to start

### Security (v1)

- Localhost binding only (127.0.0.1)
- No authentication (local trust model)
- No TLS required (local-only)

---

## Technology Boundaries

### What Lives Where

| Component | Location | Responsibility |
|-----------|----------|----------------|
| **tmux integration** | tmax repo | All tmux CLI/socket interaction |
| **Session logic** | tmax repo | Discovery, attach, detach, idle detection |
| **Web UI** | trex repo | React components, styling, UX |
| **HTTP/WS server** | trex repo | API endpoints, WebSocket handling |
| **Persistence** | trex repo | Favorites, groups, preferences |
| **Terminal emulation** | trex repo (xterm.js) | Browser-side rendering |

### Forbidden in trex

- ❌ Direct `exec.Command("tmux", ...)` calls
- ❌ Reimplementing session management logic
- ❌ Duplicating tmax functionality

### Required in trex

- ✅ Import tmax library for ALL tmux operations
- ✅ Feature requests to tmax for new tmux functionality
- ✅ Semantic versioning for tmax dependency

---

## Future Considerations

### Network Access (v2+)

When adding network exposure:
- Authentication required (OAuth, API keys)
- TLS required (HTTPS/WSS)
- Authorization layer (who can access which sessions)
- Audit logging

### Multi-Tenant (v2+)

When adding multi-user support:
- Session isolation per user
- Resource limits
- User management UI

### Agent Detection (Future)

If agent awareness is needed:
- tmax implements detection logic
- trex consumes via tmax library
- No direct implementation in trex

---

## Anti-Patterns

### Architecture Anti-Patterns

**❌ Direct tmux calls**:
```go
// WRONG - Don't do this in trex
cmd := exec.Command("tmux", "list-sessions")
output, _ := cmd.Output()
```

**✅ Use tmax library**:
```go
// CORRECT - Use tmax
sessions, err := tmax.ListSessions()
```

**❌ Bypassing persistence layer**:
```go
// WRONG - Direct file manipulation
os.WriteFile("favorites.json", data, 0644)
```

**✅ Use persistence service**:
```go
// CORRECT - Use service
persistence.AddFavorite(sessionId)
```

**❌ Storing sensitive data**:
```go
// WRONG - Never store terminal history with secrets
history.Store(terminalOutput)
```

**✅ Handle secrets carefully**:
```go
// CORRECT - Be explicit about what's stored
history.StoreSessionMetadata(sessionId, accessTime)
```

---

## Reviewer Checklist

When reviewing trex PRs, verify:

- [ ] No direct tmux CLI calls (use tmax library)
- [ ] No mocks (use fakes)
- [ ] Tests include Test Doc blocks
- [ ] Terminal latency not degraded (<50ms)
- [ ] XDG paths used for storage
- [ ] Localhost binding only (v1)
- [ ] No time estimates (use CS 1-5)
- [ ] Documentation updated

---

See [Constitution](./constitution.md) for guiding principles and [Rules](./rules.md) for enforceable requirements.
