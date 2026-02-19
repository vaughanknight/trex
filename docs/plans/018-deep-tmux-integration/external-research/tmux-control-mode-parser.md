# tmux Control Mode Protocol Parser Design

**Source**: Perplexity Deep Research (2026-02-18)
**Query**: Design a Go parser for tmux control mode (-CC) protocol
**Status**: DEFERRED — This is a wishlist item, not needed for Plan 018

## Executive Summary

tmux control mode (`-CC`) provides a structured, machine-readable protocol for programmatic tmux interaction. A Go parser would enable native pane rendering (no tmux UI chrome), real-time state notifications, and deeper integration. However, this is significantly more complex than the CLI-based approach Plan 018 uses.

**This research is preserved for future reference when/if control mode integration moves from wishlist to active plan.**

## Protocol Overview

- **Line-oriented**: All messages delimited by newlines
- **Command responses**: Wrapped in `%begin TIME CMD_NUM FLAGS` / `%end TIME CMD_NUM FLAGS` (or `%error`)
- **Notifications**: Single lines prefixed with `%` (e.g., `%output`, `%sessions-changed`, `%window-add`)
- **Octal escaping**: Binary data in `%output` encoded as `\NNN` octal sequences
- **Sequence numbers**: Commands correlated to responses via incrementing CMD_NUM

## Key Notification Types

| Notification | Purpose |
|-------------|---------|
| `%output PANE_ID data` | Pane terminal output (octal-escaped) |
| `%sessions-changed` | Session created/destroyed |
| `%window-add @window` | Window created |
| `%window-close @window` | Window destroyed |
| `%window-renamed @window name` | Window renamed |
| `%pane-mode-changed %pane` | Pane mode transition |
| `%session-changed $session @window` | Active session changed |

## Go Parser Architecture (Reference Design)

### Core Types
```go
type Message interface { MessageType() string }
type CommandResponse struct { Time int64; CommandNum int32; Success bool; OutputLines []string }
type Notification struct { Type string; Arguments []string }
type PaneOutputNotification struct { PaneID string; OutputBytes []byte }
```

### Parser State Machine
- **stateAwaitingBegin**: Default — route `%` lines to notification handlers, or start block on `%begin`
- **stateAccumulatingBlock**: Buffering output lines until `%end` or `%error`

### Key Components
1. **Line reader**: `bufio.Reader` with timeout-aware reading via goroutines
2. **Escape decoder**: State machine for octal sequence decoding (`\NNN` → byte)
3. **Command tracker**: Maps sequence numbers to pending callbacks with timeouts
4. **Message router**: Type-switches on Message interface, dispatches to handlers
5. **Flow controller**: Pause/resume per-pane output via `refresh-client` flags

### Complexity Estimate
- ~500-800 lines for core parser
- ~200-300 lines for escape decoder
- ~200-300 lines for command tracker
- ~300-500 lines for message router + handlers
- **Total**: ~1,200-1,900 lines of Go

### Why This Is Deferred

For Plan 018's goals (attach to existing tmux sessions), CLI-based `tmux attach -t <name>` inside a PTY is dramatically simpler:
- No protocol parsing needed
- xterm.js renders tmux output directly
- tmux handles all state management
- Zero new data structures

Control mode would only be needed for:
- Native pane rendering without tmux UI chrome
- Real-time session/window change notifications (sub-second latency)
- Programmatic pane management (split, resize, close)
- Output capture without terminal attachment
