# Research Dossier: tmux Session Tracking

**Generated**: 2026-02-10
**Research Query**: "How can trex detect which tmux session a terminal is attached to, enabling cross-session metadata updates?"
**Mode**: Pre-Plan
**Findings**: 65+ across 7 subagents

---

## Executive Summary

### What We Need
When a user runs `tmux attach -t A` inside a trex terminal session (s1), trex needs to know that s1 is viewing tmux session A. If another trex session (s2) also attaches to tmux A, both sidebar entries should reflect the same metadata. When the user detaches from tmux A and attaches to tmux B, the tracking must update.

### The Core Problem
trex creates PTY sessions that spawn shells. Users run tmux inside those shells. Multiple trex sessions can attach to the same tmux session. But trex has **no mechanism to know which tmux session a PTY is viewing**, because:
1. The PTY is a dumb pipe -- trex forwards raw bytes without inspection
2. tmux runs as a child process of the shell -- trex doesn't track child processes
3. Environment variables set in the PTY don't propagate through `tmux attach` (tmux server has its own environment)

### The Key Insight: PTY TTY Path + `tmux list-clients`
Every trex PTY has a TTY device path (e.g., `/dev/ttys010` on macOS, `/dev/pts/5` on Linux). tmux tracks which TTY device each client is connected to. By running `tmux list-clients -F '#{client_tty} #{session_name}'`, we can match trex's PTY TTY path to the tmux session name. This is the **only reliable outside-in detection mechanism**.

### Quick Stats
- **Components affected**: ~8 backend files, ~4 frontend files
- **New capability**: PTY TTY path capture, tmux polling goroutine, WebSocket metadata push
- **Dependencies**: creack/pty (already present), tmux CLI (user-installed)
- **Prior Learnings**: 15 relevant findings from Plans 002, 003, 008, 013
- **Recommended approach**: Backend polling via `tmux list-clients` (6.5ms per call, negligible at 1s intervals)

---

## How It Currently Works

### Session Creation Flow
1. Frontend sends `{"type":"create"}` via WebSocket
2. Backend `handleCreate()` generates session ID (`s1`, `s2`, ...) via `registry.NextID()`
3. `NewRealPTYWithShell(shell)` spawns shell process via `exec.Command` + `pty.Start(cmd)`
4. Session object created linking PTY to WebSocket connection
5. `session.RunReadPTY()` goroutine streams PTY output to frontend
6. Frontend receives `session_created` response, registers handlers

**Source**: `server/terminal.go:139-181`, `terminal/real_pty.go:28-43`

### What trex Knows About Each Session
```go
type Session struct {
    ID        string        // "s1", "s2"
    Name      string        // "bash-1", "zsh-2"
    ShellType string        // "bash", "zsh"
    Status    SessionStatus // Running, Closing, Closed
    CreatedAt time.Time
    Owner     string        // GitHub user (auth mode)
    pty       PTY           // PRIVATE - Read/Write/Resize/Close only
    conn      Conn          // PRIVATE - WebSocket
    state     atomic.Int32  // State machine
}
```

### What trex Does NOT Know
- What processes are running inside the PTY
- Whether tmux is running inside the shell
- Which tmux session the user is viewing
- When the user detaches/reattaches to different tmux sessions
- The PTY's TTY device path (not captured)

---

## Approach Analysis

### Approach A: `tmux list-clients` Polling (RECOMMENDED)

**Mechanism**: Backend periodically runs `tmux list-clients -F '#{client_tty}\t#{session_name}'`, matches output against known PTY TTY paths.

**Verified on this machine**:
```
$ tmux list-clients -F '#{client_tty} #{session_name}'
/dev/ttys000 tmax-trex
/dev/ttys017 tmax-trex
/dev/ttys008 tmax-trex
```

**Performance**: 6.5ms per call. At 1-second polling, negligible overhead.

**Handles all scenarios**:
- Detect tmux attached: PTY TTY path appears in `list-clients` output
- Detect detach: PTY TTY path disappears from output
- Detect session switch: PTY TTY path appears with different session name
- Multiple trex sessions on same tmux: Multiple PTY paths map to same session name

**Pre-requisite**: Capture PTY TTY device path at creation time.

**How to get TTY path**: Use `pty.Open()` instead of `pty.Start()` to get both primary and secondary file descriptors. Call `tty.Name()` on the secondary to get the device path (e.g., `/dev/ttys010`). Then manually wire `cmd.Stdin/Stdout/Stderr = tty`, call `cmd.Start()`, close secondary in parent.

**Cross-platform**: Works identically on macOS and Linux. `tmux list-clients` is a standard tmux command.

| Criterion | Score |
|-----------|-------|
| Feasibility | 9/10 |
| Cross-platform | 9/10 |
| Reliability | 9/10 |
| Performance | 9/10 |
| Complexity | Low (~50-100 lines Go) |

### Approach B: Process Tree Inspection

**Mechanism**: From `cmd.Process.Pid`, walk child process tree looking for tmux.

**Limitation**: Can detect tmux is running but **cannot determine which session** is attached. Would need to combine with Approach A anyway.

| Criterion | Score |
|-----------|-------|
| Feasibility | 5/10 |
| Standalone? | No -- needs Approach A for session name |

### Approach C: Environment Variables Inside tmux

**Mechanism**: `$TMUX` and `$TMUX_PANE` are set inside tmux sessions.

**Fatal flaw**: These are set inside tmux's child processes, NOT visible from the parent shell on the trex PTY. The trex backend cannot read them.

| Criterion | Score |
|-----------|-------|
| Feasibility | 2/10 |

### Approach D: tmux Hooks (Event-Driven Enhancement)

**Mechanism**: tmux supports hooks: `client-attached`, `client-detached`, `client-session-changed`. Hooks can run shell commands that notify trex via HTTP.

```bash
tmux set-hook -g client-session-changed 'run-shell "curl -s http://localhost:3000/api/tmux/event?tty=#{client_tty}&session=#{session_name}"'
```

**Advantage**: Zero-latency detection (event-driven, no polling delay).

**Challenge**: Requires installing hooks on the tmux server. Either user configures `.tmux.conf` or trex installs hooks dynamically when tmux is detected.

**Best used as**: Enhancement layer on top of Approach A. Polling provides the baseline; hooks provide instant updates when available.

| Criterion | Score |
|-----------|-------|
| Feasibility | 7/10 |
| As standalone | No -- needs fallback to polling |
| As enhancement to A | Excellent |

### Approach E: Polling from Inside PTY

**Fatal flaw**: Commands sent to the PTY are visible to the user. No invisible command channel exists.

| Criterion | Score |
|-----------|-------|
| Feasibility | 1/10 |

### Approach F: Filesystem Signaling

**Mechanism**: Write session metadata to `~/.trex/sessions/`. Not a detection mechanism itself -- requires Approach A or D for the actual detection.

| Criterion | Score |
|-----------|-------|
| Feasibility as standalone | 3/10 |

### Approach G: tmux Control Mode

**Mechanism**: `tmux -C` provides structured text event stream. Powerful but over-engineered for this use case.

| Criterion | Score |
|-----------|-------|
| Feasibility | 6/10 |
| Complexity | High |

---

## Recommended Architecture

### Primary: Approach A (Polling) + Optional Approach D (Hooks)

```
┌─────────────────────────────────────────────────┐
│ trex Backend                                     │
│                                                   │
│  Session Registry                                 │
│  ├─ s1: PTY tty=/dev/ttys010, tmux=sessionA      │
│  ├─ s2: PTY tty=/dev/ttys017, tmux=sessionA      │
│  └─ s3: PTY tty=/dev/ttys008, tmux=sessionB      │
│                                                   │
│  tmux Monitor Goroutine (1s poll)                │
│  ├─ tmux list-clients → parse TTY ↔ session map  │
│  ├─ Match PTY TTY paths to sessions              │
│  ├─ Detect changes → broadcast via WebSocket     │
│  └─ Handle: no tmux, tmux not running, errors    │
│                                                   │
│  Optional: HTTP endpoint for tmux hook events     │
│  └─ POST /api/tmux/event → instant update        │
└─────────────────────────────────────────────────┘
         │ WebSocket broadcast
         ▼
┌─────────────────────────────────────────────────┐
│ Frontend                                         │
│  Session Store                                   │
│  ├─ s1: name="bash-1", tmuxSession="sessionA"   │
│  ├─ s2: name="zsh-2",  tmuxSession="sessionA"   │
│  └─ s3: name="bash-3", tmuxSession="sessionB"   │
│                                                   │
│  Sidebar: Shows tmux session name as badge/label │
│  Query: "Which trex sessions are on tmux A?"     │
│  → Answer: s1, s2                                │
└─────────────────────────────────────────────────┘
```

### Implementation Steps (High-Level)

**Backend**:
1. Capture PTY TTY path at creation (`pty.Open()` + `tty.Name()`)
2. Store TTY path on Session struct (new field: `TtyPath string`)
3. Add tmux monitor goroutine on Server (polls `tmux list-clients`)
4. Parse output, match TTY paths to sessions, detect changes
5. On change: update Session metadata, broadcast via WebSocket
6. Expose `tmuxSessionName` in SessionInfo (REST + WebSocket)

**Frontend**:
7. Add `tmuxSessionName?: string` to Session interface
8. Handle `tmux_status` WebSocket message type
9. Display tmux session name in sidebar (badge or subtitle)
10. Enable query: "show all sessions attached to tmux session X"

### The User's tmux Workflow (Solved)

```
Scenario: User has trex open, creates 3 terminal sessions

1. trex session s1: user runs `tmux attach -t work`
   → Backend polls, detects /dev/ttys010 → tmux "work"
   → Sidebar shows: "bash-1 [work]"

2. trex session s2: user also runs `tmux attach -t work`
   → Backend polls, detects /dev/ttys017 → tmux "work"
   → Sidebar shows: "zsh-2 [work]"
   → BOTH s1 and s2 show same tmux session!

3. User detaches s1 from tmux "work", attaches to tmux "debug"
   → Next poll: /dev/ttys010 → tmux "debug" (changed!)
   → Sidebar s1 updates: "bash-1 [debug]"
   → s2 still shows: "zsh-2 [work]"

4. Script inside tmux "work" calls metadata API:
   → Backend finds all sessions attached to tmux "work": [s2]
   → Updates s2's metadata (title, progress, etc.)
   → If s1 were still on "work", it would also get updated
```

### Solving the Plan 013 Integration

With tmux tracking in place, Plan 013's metadata API gains a powerful new capability:

**Current Plan 013 approach**: Script inside tmux calls `PATCH /api/sessions/$TREX_SESSION_ID`
- Problem: `TREX_SESSION_ID` maps to ONE trex session, but multiple may be viewing the same tmux session

**Enhanced approach with tmux tracking**:
- Script calls `PATCH /api/sessions?tmux_session=work` (new: target by tmux session name)
- Backend finds ALL trex sessions attached to tmux "work"
- Updates metadata on all of them
- OR: Script calls existing `PATCH /api/sessions/:id` and backend auto-propagates to sibling sessions on the same tmux session

This eliminates the need for scripts to know about individual trex session IDs. They can target by tmux session name instead.

---

## Key Technical Details

### Getting the TTY Path (Go Implementation)

```go
// Instead of pty.Start(cmd), use pty.Open() for TTY path access:
ptmx, tty, err := pty.Open()
ttyPath := tty.Name()  // "/dev/ttys010" (macOS) or "/dev/pts/5" (Linux)

cmd := exec.Command(shell)
cmd.Env = append(os.Environ(), "TERM=xterm-256color")
cmd.Stdin = tty
cmd.Stdout = tty
cmd.Stderr = tty
cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setctty: true}

cmd.Start()
tty.Close()  // Close parent's copy; child retains it
```

**Source**: creack/pty library internals confirm `pty.Open()` returns both the primary (ptmx) and secondary (tty) file descriptors. The library already does this internally in `pty.Start()` but discards the TTY path.

### Parsing `tmux list-clients`

```go
func parseTmuxClients(output string) map[string]string {
    // Returns map[ttyPath]tmuxSessionName
    result := make(map[string]string)
    for _, line := range strings.Split(output, "\n") {
        parts := strings.Fields(line)
        if len(parts) >= 2 {
            result[parts[0]] = parts[1]  // "/dev/ttys010" → "work"
        }
    }
    return result
}
```

### Multiple tmux Servers

Users may have multiple tmux servers (different sockets). Scan `/tmp/tmux-<UID>/` for all sockets:
```go
glob, _ := filepath.Glob(fmt.Sprintf("/tmp/tmux-%d/*", os.Getuid()))
for _, socket := range glob {
    output, err := exec.Command("tmux", "-S", socket, "list-clients", "-F", "#{client_tty}\t#{session_name}").Output()
    // merge results
}
```

### Error Handling

| Condition | Behavior |
|-----------|----------|
| tmux not installed | `exec.LookPath("tmux")` fails → disable monitoring |
| No tmux server running | `tmux list-clients` returns exit 1 → treat as "no tmux" |
| Server exists, no clients | Empty output → all sessions have no tmux attachment |
| Permission denied | Log warning, disable monitoring |

---

## Interfaces to Change

| Interface | File | Change |
|-----------|------|--------|
| `RealPTY` struct | `terminal/real_pty.go` | Add `TtyPath string` field |
| `PTY` interface | `terminal/pty.go` | Add `TtyPath() string` method |
| `FakePTY` | `terminal/fake_pty.go` | Add `SimulatedTtyPath string` field |
| `Session` struct | `terminal/session.go` | Add `TmuxSessionName string` field |
| `SessionInfo` struct | `terminal/registry.go` | Add `TmuxSessionName string json:"tmuxSessionName,omitempty"` |
| `ServerMessage` | `terminal/messages.go` | Add `MsgTypeTmuxStatus = "tmux_status"` constant |
| `Server` struct | `server/server.go` | Add tmux monitor goroutine lifecycle |
| Frontend `Session` | `stores/sessions.ts` | Add `tmuxSessionName?: string` |
| Frontend `ServerMessage` | `types/terminal.ts` | Add `'tmux_status'` to type union |

---

## Prior Learnings (Key Findings)

| ID | Finding | Relevance |
|----|---------|-----------|
| PL-01 | OSC escape sequences flow through PTY unchanged | tmux title sequences will also propagate |
| PL-03 | Env vars must be injected at PTY creation time | TREX_SESSION_ID injection is pre-requisite |
| PL-05 | Claude Code cannot access TTY | HTTP API is the only communication channel |
| PL-06 | Session registry is in-memory only | tmux tracking state is also transient |
| PL-07 | FakePTY + FakeWebSocket testing pattern | Use for tmux monitor unit tests |
| PL-14 | Async tests need polling, not goroutine waiting | Relevant for tmux monitor test design |

---

## Architectural Constraint: tmax Library

The architecture mandates tmux operations go through tmax library (`docs/adr/0001`). However, tmax is **not yet available as a Go library** -- it's a CLI tool. For this plan:
- **Option 1**: Use direct `tmux` CLI calls (pragmatic, works now)
- **Option 2**: Wait for tmax library availability (blocking)
- **Recommendation**: Option 1 with a clean interface that can be swapped for tmax later

The tmux monitor should implement a `TmuxDetector` interface:
```go
type TmuxDetector interface {
    ListClients() (map[string]string, error)  // ttyPath → sessionName
    IsAvailable() bool
}
```

This allows future replacement with tmax without changing the monitor goroutine.

---

## External Research Opportunities

### Research Opportunity 1: creack/pty Open() vs Start() on macOS

**Why Needed**: Verify that `pty.Open()` + manual `cmd.Start()` with `Setsid: true, Setctty: true` works correctly on macOS (Darwin). The `SysProcAttr` fields behave differently on macOS vs Linux.

**Impact**: Blocking for implementation -- if `pty.Open()` doesn't work on macOS, need alternative approach for TTY path capture.

### Research Opportunity 2: tmux list-clients on Different tmux Versions

**Why Needed**: Verify `#{client_tty}` format variable is available across tmux 2.x, 3.x versions. Older tmux versions may not support all format variables.

**Impact**: Low risk -- `#{client_tty}` has been available since tmux 1.8.

---

## Next Steps

1. **Validate pty.Open() approach** on macOS (quick test)
2. Create specification for Plan 014 (`/plan-1b-specify`)
3. This plan should be small (CS-2) -- mostly backend with minimal frontend
4. Plan 013 (Session Metadata API) can proceed independently; Plan 014 enhances it
5. After Plan 014, revisit Plan 013's `set_title.sh` to target by tmux session name instead of trex session ID

---

**Research Complete**: 2026-02-10
**Report Location**: `docs/plans/014-tmux-session-tracking/research-dossier.md`
