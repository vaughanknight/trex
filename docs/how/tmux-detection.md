---
title: tmux Session Detection
created: 2026-02-10
plan: 014-tmux-session-tracking
---

# tmux Session Detection

This document explains how trex detects tmux session attachments and displays them in the sidebar.

## How Detection Works

trex uses an outside-in approach: the backend polls `tmux list-clients` to discover which PTY devices are attached to tmux sessions, then matches those TTY paths to trex sessions.

### Architecture

```
tmux list-clients -F '#{client_tty}\t#{session_name}'
        |
        v
  RealTmuxDetector.ListClients()
        |
        v
  TmuxMonitor.poll()
    1. Snapshot: session TTY paths from registry
    2. Exec: call tmux (no locks held)
    3. Apply: match TTY paths, detect changes
        |
        v
  onChange callback → Server.handleTmuxChanges()
    Group by WebSocket connection
    Send ONE tmux_status per connection
        |
        v
  WebSocket → Frontend
    useCentralWebSocket handles tmux_status
    → useSessionStore.updateTmuxSessionName()
    → Sidebar updates display name
```

### PTY TTY Path Capture

When trex creates a terminal session, it uses `pty.Open()` (not `pty.Start()`) to get both the primary (ptmx) and secondary (tty) file descriptors. `tty.Name()` returns the device path (e.g., `/dev/ttys010` on macOS, `/dev/pts/3` on Linux). This path is stored on `Session.TtyPath`.

### Polling Lifecycle

1. **Start**: Monitor checks `detector.IsAvailable()`. If tmux is not installed, monitor is disabled (no errors logged).
2. **Poll**: Every interval (default 2s), the monitor snapshots session TTY paths, runs `tmux list-clients`, and compares results to previous state.
3. **Change Detection**: Only changed sessions trigger an `onChange` callback. No-change polls are idempotent.
4. **Backoff**: After 3 consecutive failures, polling backs off to 30s.
5. **Stop**: On server shutdown, the monitor's context is cancelled and goroutine exits cleanly.

## TmuxDetector Interface

```go
type TmuxDetector interface {
    // ListClients returns a map of ttyPath → tmuxSessionName
    // for all active tmux clients.
    ListClients() (map[string]string, error)

    // IsAvailable returns true if tmux is installed and accessible.
    IsAvailable() bool
}
```

### RealTmuxDetector

- Uses `exec.LookPath("tmux")` for availability check
- Runs `tmux list-clients -F '#{client_tty}\t#{session_name}'` with `exec.CommandContext` (5s timeout)
- Parses tab-separated output into `map[string]string`
- Only uses the default tmux socket (no `-S` flag)

### FakeTmuxDetector

Stateful test fake with methods:
- `AddClient(ttyPath, sessionName)` - simulate tmux attachment
- `RemoveClient(ttyPath)` - simulate detachment
- `SetUnavailable()` - simulate tmux not installed
- `SetError(err)` - simulate tmux command failure

## Configuration

### Environment Variable

`TREX_TMUX_POLL_INTERVAL` - polling interval as a Go duration string.

- Default: `2s`
- Minimum: `500ms`
- Maximum: `30s`
- Examples: `1s`, `500ms`, `5s`

### Frontend Settings

The Settings panel includes a "tmux Detection" section with a slider for the polling interval (500ms-30s). Changes send a `tmux_config` WebSocket message to update the backend interval at runtime.

## Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| tmux not installed | Monitor disabled at startup, no errors logged |
| tmux server not running | `list-clients` returns empty output, no errors |
| tmux command timeout | Logged as warning, backed off after 3 failures |
| Session created before monitor starts | Detected on next poll cycle |
| Session deleted during poll | `registry.Get()` returns nil, safely skipped |

## tmax Library Transfer Guide

The `TmuxDetector` interface was designed to enable a future swap from direct tmux CLI calls to the tmax Go library (per ADR-0001). This section maps trex code to future tmax API equivalents.

### Code Mapping

| trex Code | Location | Future tmax Equivalent |
|-----------|----------|----------------------|
| `TmuxDetector` interface | `tmux_detector.go` | tmax would implement this interface directly |
| `RealTmuxDetector.ListClients()` | `tmux_detector.go` | `tmax.ListClients()` or similar API |
| `RealTmuxDetector.IsAvailable()` | `tmux_detector.go` | `tmax.IsAvailable()` |
| `parseTmuxClients()` | `tmux_detector.go` | Not needed - tmax returns structured data |
| `exec.CommandContext` timeout | `tmux_detector.go` | tmax handles its own timeouts |

### Transfer Steps

1. Import tmax as a Go module
2. Create `TmaxDetector` struct implementing `TmuxDetector` interface
3. Replace `NewRealTmuxDetector()` with `NewTmaxDetector()` in `server.go`
4. Remove `RealTmuxDetector` and `parseTmuxClients()` (all in one file)
5. Keep `FakeTmuxDetector` for testing
6. No changes needed to `TmuxMonitor`, `Session`, or frontend code

### Interface Contract

Any implementation of `TmuxDetector` must:
- Return `map[string]string` mapping TTY device paths to tmux session names
- Return empty map (not error) when no clients are connected
- Return `false` from `IsAvailable()` when tmux/tmax is not installed
- Be safe for concurrent calls from the monitor goroutine
- Complete within a reasonable time (current timeout: 5s)
