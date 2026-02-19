# Research Dossier: Deep tmux Integration

**Generated**: 2026-02-18
**Research Query**: Deep tmux integration — list, attach, drag, reconnect tmux sessions in trex
**Mode**: Pre-Plan (research dossier for upcoming spec)
**Location**: `docs/plans/018-deep-tmux-integration/research-dossier.md`
**Findings**: 65+ from 2 research agents + manual codebase review

---

## Executive Summary

### What This Feature Does
Adds a dedicated "tmux sessions" section to the trex sidebar that lists all tmux sessions on the server. Users can click or drag tmux sessions into panes to create new trex terminals that `tmux attach` to those sessions. On page reload, the URL encodes tmux session name + window index, enabling automatic reconnection.

### Business Purpose
Users (especially developers running Claude Code) frequently create tmux sessions and want to manage them from trex's web UI. Currently, users must manually type `tmux attach -t <name>` every time they create a new trex session. This feature makes tmux a first-class citizen in trex's workspace model.

### Key Technical Insights
1. **Plan 014 already built the foundation**: `TmuxDetector`, `TmuxMonitor`, `FakeTmuxDetector`, session `TtyPath` tracking — all in place
2. **Simple approach wins**: `tmux attach -t <name>` inside a normal PTY is dramatically simpler than control mode (`-CC`) and covers the user's workflow
3. **URL encoding needs tmux session name + window index**: Stored in workspace codec alongside shell type
4. **`gotmux` Go library** exists for type-safe tmux interaction but CLI polling is sufficient initially
5. **Critical edge case**: Must strip `TMUX` env var when spawning PTY shells to avoid nested tmux refusal

---

## Q&A Session (20 Questions)

### Session Discovery & Listing

| # | Question | Answer |
|---|----------|--------|
| Q1 | What tmux info in sidebar? | **Separate "tmux sessions" section** listing ALL tmux sessions on the machine. Clicking = "new session" + `tmux attach`. Quick-access menu for a frequent action. |
| Q2 | Show windows/panes in sidebar? | **Session names only**. Click to attach to active window. |
| Q3 | Discovery mechanism? | **Poll `tmux list-sessions`** — same pattern as existing TmuxMonitor. |

### Session Connection & Lifecycle

| # | Question | Answer |
|---|----------|--------|
| Q4 | Click action? | **`tmux attach -t <name>`** for now. Future: `tmux new-session -A` for create-from-project (wishlist). |
| Q5 | Multi-attach? | **Allow it** — tmux handles multi-client natively. Show indicator. |
| Q6 | Close behavior? | **tmux survives** — closing trex pane detaches from tmux, session stays alive. |

### Layout Integration & Drag-and-Drop

| # | Question | Answer |
|---|----------|--------|
| Q7 | Drag behavior? | **New trex terminal + `tmux attach`** — same as clicking, but into target pane. |
| Q8 | Auto-mirror tmux layout? | **Not now, wishlist** — users manually drag sessions into panes. |
| Q9 | Same tmux in multiple panes? | **Each pane gets its own `tmux attach` client** — tmux handles it. |

### URL Persistence & Reconnection

| # | Question | Answer |
|---|----------|--------|
| Q10 | Auto-reconnect on reload? | **Yes** — URL encodes tmux session name. On reload, auto-attach. Show error if session gone. |
| Q11 | URL encoding depth? | **Session name + window index** — both encoded for exact restoration. |

### Resize & Multi-Client

| # | Question | Answer |
|---|----------|--------|
| Q12 | Resize strategy? | **Use tmux `latest` mode** — tmux sizes to most recently active client. |

### Visual Differentiation

| # | Question | Answer |
|---|----------|--------|
| Q13 | Visual differentiation? | **Icon + title indicator** — different icon in sidebar + tmux session name in pane title bar. |
| Q14 | Session death indicator? | **Show overlay** — similar to existing "Session Ended" overlay. |

### Settings & Configuration

| # | Question | Answer |
|---|----------|--------|
| Q15 | Feature toggle? | **Settings toggle** — allow user to disable tmux features via settings. |
| Q16 | Multi-server support? | **Configurable sockets** — allow specifying additional tmux sockets (`-L`/`-S`) in settings. |

### Scope & Phasing

| # | Question | Answer |
|---|----------|--------|
| Q17 | Priority? | **Attach existing** — discovering and attaching to existing tmux sessions first. |
| Q18 | CRUD scope? | **Attach only** — no create/delete/rename from trex in this plan. |
| Q19 | Relation to Plan 014? | **Build on Plan 014** — extend existing TmuxDetector/TmuxMonitor infrastructure. |

### Edge Cases

| # | Question | Answer |
|---|----------|--------|
| Q20 | No tmux installed? | **Hide tmux features** — graceful degradation, no sidebar section, no errors. |

---

## How trex Sessions Currently Work

### Session Birth (11 Steps)
1. Frontend queues callback, sends `{type: "create"}` over WebSocket
2. Backend generates sessionId ("s1", "s2") from atomic counter (`registry.NextID()`)
3. Backend creates PTY pair WITHOUT starting shell (`NewUnstartedPTY()`)
4. Backend queues pending shell start
5. Backend sends `session_created` response
6. Frontend dequeues callback, adds session to store + workspace
7. Terminal component mounts with per-terminal ResizeObserver
8. ResizeObserver sends initial resize with actual dimensions
9. Backend detects pending state, starts shell at correct dimensions
10. Shell writes first prompt at correct size
11. Frontend receives output, renders in xterm.js

### Key Architecture
- **WebSocket**: Single connection, multiplexed by `sessionId`
- **PTY**: `creack/pty` library, deferred shell start pattern
- **Session**: `Session` struct in `backend/internal/terminal/session.go`
- **Registry**: Thread-safe `SessionRegistry` with `map[string]*Session`
- **Workspace**: Zustand store with `WorkspaceItem[]` (standalone sessions + layout trees)
- **URL**: Base64url JSON encoding workspace schema with `?w=<base64>`

### Extension Points for tmux
1. **`handleCreate(msg)`** in `terminal.go`: Can be extended to accept tmux session target
2. **`RealPTY.StartShell()`**: Can accept `tmux attach -t <name>` instead of `$SHELL`
3. **`Session` struct**: Already has `TmuxSessionName`, `TtyPath` fields
4. **`SessionRegistry.ListByTmuxSession()`**: Already exists
5. **Message protocol**: Extensible with new types (`tmux_sessions_list`, etc.)
6. **URL codec**: Can encode tmux session info alongside shell type

---

## How tmux Works (Programmatic Integration)

### Architecture
tmux uses a **client-server model**:
- **Server**: Long-lived process managing all sessions, communicates over Unix domain socket
- **Clients**: Short-lived processes connecting to server
- **Socket**: Default at `/tmp/tmux-$UID/default`, configurable with `-L`/`-S`

### Session Discovery
```bash
# List all sessions with metadata
tmux list-sessions -F '#{session_id}|#{session_name}|#{session_windows}|#{session_attached}|#{session_created}'

# Output example:
# $0|work|3|1|1708200000
# $1|debug|1|0|1708201000
```

### Key Format Variables

| Category | Variables |
|----------|----------|
| Session | `session_id`, `session_name`, `session_windows`, `session_attached`, `session_created`, `session_path` |
| Window | `window_id`, `window_name`, `window_index`, `window_width`, `window_height`, `window_panes`, `window_active` |
| Client | `client_name`, `client_tty`, `client_width`, `client_height`, `client_session`, `client_control_mode` |

### Attaching from a Go-Spawned PTY
- Works correctly — PTY provides a valid `/dev/pts/N` device
- tmux creates a client process that renders to the PTY
- xterm.js displays tmux output normally (standard escape sequences)
- **Must strip `TMUX` env var** to avoid nested tmux refusal

### `tmux new-session -A -s <name>` (Create-or-Attach)
- Session exists → attaches (like `attach-session`)
- Session doesn't exist → creates and attaches
- Idempotent — standard pattern for tools like `ttyd`

### Resize with Multiple Clients

| `window-size` | Behavior |
|---------------|----------|
| `smallest` (default) | Sizes to smallest client — larger clients see `~` fill |
| `largest` | Sizes to largest client — smaller clients see portion |
| `latest` | Sizes to most recently active client (recommended for trex) |
| `manual` | Fixed size, changed only via `resize-window` |

### Control Mode (`tmux -CC`) — Future Reference
Not needed for this plan, but documented for future deep integration:
- Text-based protocol on stdin/stdout
- `%output %<pane_id> <data>` notifications for real-time pane output
- `%sessions-changed`, `%window-add`, etc. for state change events
- No existing Go library implements this protocol

### Go Libraries

| Library | Approach | Features |
|---------|----------|----------|
| **gotmux** | CLI exec | Sessions, windows, panes, clients, server info |
| **go-tmux** | CLI exec | Simpler API, basic management |
| **gomux** | CLI exec | Minimal — create sessions, send keys |

All are CLI-based (not control mode). For this plan, direct CLI calls are sufficient (already have the pattern in `TmuxDetector`).

---

## Existing Plan 014 Infrastructure (Already Built)

### Files
| File | Purpose |
|------|---------|
| `backend/internal/terminal/tmux_detector.go` | `TmuxDetector` interface + `RealTmuxDetector` (CLI calls) + `FakeTmuxDetector` (test double) |
| `backend/internal/terminal/tmux_monitor.go` | `TmuxMonitor` — polling loop that detects tmux attachment changes |
| `backend/internal/terminal/tmux_detector_test.go` | Unit tests for detector |
| `backend/internal/terminal/tmux_monitor_test.go` | Unit tests for monitor |
| `backend/internal/terminal/tmux_detector_integration_test.go` | Integration tests (requires running tmux) |

### Key Interfaces
```go
type TmuxDetector interface {
    ListClients() (map[string]string, error)  // ttyPath → tmuxSessionName
    IsAvailable() bool
}
```

### What Plan 014 Does vs What Plan 018 Needs

| Capability | Plan 014 (Built) | Plan 018 (Needed) |
|-----------|-------------------|-------------------|
| Detect tmux installed | ✅ `IsAvailable()` | Reuse |
| List tmux clients | ✅ `ListClients()` | Reuse |
| Poll for changes | ✅ `TmuxMonitor` loop | Extend for session listing |
| Match sessions by TTY | ✅ `ListByTmuxSession()` | Reuse |
| List tmux sessions | ❌ | **NEW** — `ListSessions()` |
| Create session with tmux target | ❌ | **NEW** — `handleCreate` with tmux param |
| Frontend tmux session list | ❌ | **NEW** — sidebar section |
| URL encode tmux info | ❌ | **NEW** — workspace codec extension |
| Tmux-specific overlay | ❌ | **NEW** — session death detection |

---

## Modification Considerations

### ✅ Safe to Modify
1. **`TmuxDetector` interface** — add `ListSessions()` method
2. **`handleCreate` in `terminal.go`** — extend `ClientMessage` with tmux session target
3. **Sidebar component** — add tmux sessions section (new component)
4. **Workspace codec** — add tmux session info to URL encoding
5. **Settings store** — add tmux toggle and socket config

### ⚠️ Modify with Caution
1. **`RealPTY.StartShell()`** — changing shell command to `tmux attach` is safe but must handle tmux not found / session not found errors
2. **`ServerMessage` / `ClientMessage`** — new message types must not conflict with existing ones
3. **`TMUX` env var stripping** — must only strip when creating sessions that will tmux attach, not for regular sessions

### 🚫 Danger Zones
1. **Do NOT modify control mode or internal tmux protocol** — use CLI only
2. **Do NOT change existing session creation flow** — extend it with an optional tmux parameter
3. **Do NOT break URL backward compatibility** — new tmux encoding must be additive

---

## Critical Discoveries

### 🚨 Must Strip `TMUX` Environment Variable
When trex is itself running inside tmux (common for dev workflows), spawned PTY shells inherit `TMUX` env var. Running `tmux attach` inside a shell with `TMUX` set causes: `sessions should be nested with care, unset $TMUX to force`. **Fix**: Strip `TMUX` and `TMUX_PANE` from env when spawning sessions intended for tmux attach.

### 🚨 Session Names Can Contain Special Characters
tmux session names can contain dots, hyphens, underscores. The URL codec must handle these safely in base64url encoding. Session names cannot contain colons or periods at start (tmux restriction), but other chars are valid.

### 🚨 tmux Sessions Are Server-Side Persistent
Unlike trex sessions (ephemeral, in-memory), tmux sessions persist across trex restarts. The sidebar must handle the case where tmux sessions exist but no trex terminals are attached to them.

### 🚨 Multiple Clients Cause Resize Conflicts
When two trex panes attach to the same tmux session, both become tmux clients. The `window-size=latest` setting mitigates this, but users may see momentary resize artifacts when switching between panes.

---

## Wishlist Items (Deferred)

1. **Create tmux session from trex** — "New tmux session" button with project directory picker
2. **Auto-mirror tmux layout** — right-click tmux session → "Open all windows as layout"
3. **`tmux new-session -A -s <name>`** — create-or-attach pattern for robust reconnection
4. **Control mode integration** — native pane rendering without tmux UI chrome
5. **Zellij/screen support** — extend multiplexer abstraction beyond tmux
6. **tmux session groups** — shared sessions between users

---

## External Research Opportunities

### 1. gotmux Library Deep Dive
**Why Needed**: Evaluate if gotmux should replace raw CLI calls in TmuxDetector
**Ready-to-use prompt**:
```
/deepresearch "Evaluate the gotmux Go library (github.com/GianlucaP106/gotmux) for production use in a web terminal application. Compare its API completeness, error handling, and maintenance status against raw CLI exec calls. Assess: thread safety, performance overhead of exec per call, socket path support, and handling of edge cases like tmux server not running."
```

### 2. tmux Control Mode Protocol Parser
**Why Needed**: Future deep integration would need a Go parser for control mode
**Ready-to-use prompt**:
```
/deepresearch "Design a Go parser for tmux control mode (-CC) protocol. The protocol is line-based with %begin/%end/%error blocks for command responses and %output/%sessions-changed/etc. notifications. Consider: octal escape decoding for output data, command correlation via sequence numbers, flow control via pause/continue, and error recovery. Reference tmux source code and the tmux wiki Control-Mode page."
```

---

## Next Steps

1. Run `/plan-1b-specify` to create the feature specification
2. Consider running `/deepresearch` for gotmux evaluation (optional)
3. Proceed through planning workflow: specify → clarify → architect → implement

---

**Research Complete**: 2026-02-18
**Report Location**: `docs/plans/018-deep-tmux-integration/research-dossier.md`
