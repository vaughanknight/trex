---
id: ADR-0013
title: "Visualisation Plugin Architecture"
status: accepted
date: 2026-02-26
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["plugins", "architecture", "visualisation", "extensibility"]
complexity: CS-4
---

# ADR-0013: Visualisation Plugin Architecture

## Context

Terminal sessions generate rich contextual data (task progress, build status, test results) that's invisible unless the user switches contexts. We need an extensible system to surface this data inline — in the title bar, sidebar, and expandable panels.

## Decision Drivers

- Extensibility: future plugins for Claude, build systems, CI/CD, or any data source
- Isolation: no cross-plugin interference (re-render storms, data leaks)
- Performance: per-session polling without blocking terminal I/O
- Developer experience: adding a new plugin should be straightforward (Go collector + React widgets)
- Process-based activation: plugins activate automatically when their tool is detected

## Decision

**Three-layer plugin architecture**: Backend DataCollector (Go) → WebSocket `plugin_data` → Frontend Zustand store → React widgets.

### Backend

```go
type DataCollector interface {
    ID() string
    ProcessMatch(processes []string) bool
    Collect() (json.RawMessage, error)
    Interval() time.Duration
}
```

- Collectors registered at server startup in `CollectorRegistry` (thread-safe, RWMutex)
- `ProcessDetector` walks child process tree via `ps`/`pgrep` (POSIX, macOS + Linux)
- For tmux sessions: bridges to `tmux list-panes` to find processes inside tmux server
- Polling shares existing 5s ticker in `pollCwd()` goroutine
- Data cached per session+plugin — only sends on change

### Transport

```json
{
  "type": "plugin_data",
  "sessionId": "s1",
  "pluginId": "copilot-todos",
  "pluginData": { ... }
}
```

### Frontend

- `pluginRegistry.ts`: `registerPlugin()` with ID, process match, 3 widget components, store
- `pluginStore.ts`: factory creating isolated Zustand stores per plugin (Map<sessionId, data>)
- `useCentralWebSocket.ts`: routes `plugin_data` to correct plugin store
- Per-plugin + per-surface settings toggles (namespaced under `pluginSettings`)

### Rendering Surfaces

1. **Title bar**: inline widget slot after session name (≤40px per widget)
2. **Sidebar**: per-pane widget slot below sidebar button (≤20px)
3. **Detail panel**: expandable overlay/pinned panel below title bar

### First Plugin: Copilot Todo Tracker

- Backend: reads `todos`/`todo_deps` from Copilot CLI session SQLite DB (`modernc.org/sqlite`, pure Go)
- Finds most recently modified DB in `~/.copilot/session-state/`
- Groups tasks by ID prefix for phase detection
- Title bar: battery-pill phases (green) + per-phase task pills (blue) + count badge
- Sidebar: concentric rings (outer = active phase tasks, inner = phase completion)
- Panel: full task list grouped by phase with status indicators

## Consequences

### Positive
- Extensible: new plugins are Go collector + React components, registered on import
- Isolated: per-plugin Zustand stores prevent cross-plugin re-renders
- Automatic: plugins activate based on process detection, no manual configuration
- Live: data updates every 5s, cached to avoid duplicate sends
- Non-intrusive: plugin widgets are compact and optional (per-surface toggles)

### Negative
- Process detection via `ps`/`pgrep` adds ~5ms overhead per session per poll
- SQLite dependency (`modernc.org/sqlite`) adds to binary size
- Plugin count limited by title bar space (~3-4 widgets before overflow)
- tmux process bridge relies on `tmux list-panes` command availability

### Neutral
- Plugins are compiled in (no dynamic loading)
- Plugin data format is generic JSON (no platform-enforced schema)
- Process matching is substring-based (not regex)

## Implementation Notes

- Pure Go SQLite (`modernc.org/sqlite`) chosen over CGo (`mattn/go-sqlite3`) for Electron cross-compilation compatibility
- Process tree walk depth limited to 10 levels (safety guard)
- Collector errors logged at WARN level, never surfaced to frontend
- Grey/pending pills rendered with visible stroke border for contrast on dark themes

## References

- [Plan 025: Visualisation Plugins](../plans/025-visualisation-plugins/visualisation-plugins-plan.md)
- [Spec](../plans/025-visualisation-plugins/visualisation-plugins-spec.md)
- [Research Dossier](../plans/025-visualisation-plugins/research-dossier.md)
- [Plugin Development Guide](../how/plugin-development.md)
- [ADR-0004: Fakes-Only Testing](./0004-fakes-only-testing-no-mocks.md) — FakeProcessDetector, FakeDataCollector
