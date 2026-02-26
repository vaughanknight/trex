# Research Report: Visualisation Plugin System

**Generated**: 2026-02-26T11:36:00Z
**Research Query**: "Visualisation plugins — data collector/provider/presenter architecture for titlebar, sidebar, and extensible widgets"
**Mode**: Pre-Plan
**Location**: docs/plans/025-visualisation-plugins/
**Findings**: 8 codebase findings + 20 Q&A decisions

## Executive Summary

### Vision
Create a plugin architecture for data visualisations that can appear in the title bar, sidebar, and expandable panels. Each plugin has three layers:
1. **Backend Collector** (Go) — gathers raw data from source (SQL, API, filesystem), exposes via WebSocket
2. **Frontend Store** (Zustand) — receives data via WebSocket, provides reactive state
3. **Frontend Presenters** (React) — renders visualisations in title bar, sidebar, and detail panel

### First Plugin: Copilot Todo Tracker
- **Data source**: Most recently modified Copilot CLI session SQLite database (`~/.copilot/session-state/`)
- **Title bar**: Battery-pill phases (empty→amber→green) + task count badge (`4/12`)
- **Sidebar**: Apple Watch-style activity rings (phase completion arcs)
- **Panel**: Full task list grouped by phase with status colors

## Q&A Decisions (20 Questions)

| # | Topic | Decision |
|---|-------|----------|
| Q1 | Plugin scope | Per-pane. Sidebar shows stacked per-pane indicators for multi-pane layouts. |
| Q2 | Activation | Detect by process name (e.g., 'copilot' in process tree) |
| Q3 | Detection location | Backend detects, reports via existing JSON metadata endpoint |
| Q4 | Detection frequency | Periodic polling, configurable interval (like cwd) |
| Q5 | Data fetching | Plugin reads data itself (SQL query, API call, etc.) |
| Q6 | Plugin runtime | Backend collects data → WebSocket → frontend renders |
| Q7 | Data format | Generic JSON blob — each plugin defines its own schema |
| Q8 | Distribution | Compiled in (React components in trex codebase) |
| Q9 | Backend collectors | Go code compiled in, implementing DataCollector interface |
| Q10 | Rendering surfaces | Title bar + sidebar + expandable detail panel |
| Q11 | Rendering strategy | Plugin provides separate components per surface |
| Q12 | Settings granularity | Per-plugin toggle + per-surface toggles |
| Q13 | Update frequency | Polling, configurable interval (default 2-5s) |
| Q14 | WebSocket transport | New `plugin_data` message type with pluginId + sessionId + payload |
| Q15 | Frontend state | Separate Zustand store per plugin (isolated, no cross-plugin re-renders) |
| Q16 | Plugin registration | `registerPlugin()` with metadata + components |
| Q17 | Process matching | Process name match (e.g., 'copilot' in process tree) |
| Q18 | Visual design | Pills for phases, count badge for tasks, activity rings in sidebar |
| Q19 | Data source | Most recently modified Copilot session DB (alpha, good enough) |
| Q20 | Implementation | Infrastructure first, then Copilot plugin on top |

## Architecture Overview

### Plugin Interface

```typescript
// Frontend plugin registration
interface VisualisationPlugin {
  id: string                           // e.g., 'copilot-todos'
  name: string                         // e.g., 'Copilot Todo Tracker'
  processMatch: string[]               // e.g., ['copilot', 'github-copilot']
  
  // React components for each rendering surface
  TitleBarWidget: React.ComponentType<PluginWidgetProps>
  SidebarWidget: React.ComponentType<PluginWidgetProps>
  PanelWidget: React.ComponentType<PluginWidgetProps>
  
  // Zustand store for plugin data
  useStore: () => PluginStore
  
  // Settings schema
  settings: PluginSettings
}

interface PluginWidgetProps {
  sessionId: string
  paneId: string
  data: unknown  // Plugin-defined JSON
}
```

### Backend Collector Interface

```go
type DataCollector interface {
    // Unique identifier matching frontend plugin ID
    ID() string
    // Process names that trigger this collector
    ProcessMatch() []string
    // Collect data for a session (returns JSON)
    Collect(sessionID string, pid int) (json.RawMessage, error)
    // Polling interval
    Interval() time.Duration
}
```

### WebSocket Message

```json
{
  "type": "plugin_data",
  "sessionId": "s1",
  "pluginId": "copilot-todos",
  "data": {
    "phases": [
      { "name": "Phase 1", "total": 8, "done": 5, "inProgress": 1, "blocked": 0 }
    ],
    "tasks": [
      { "id": "t1", "title": "Update types", "status": "done" },
      { "id": "t2", "title": "Fix tests", "status": "in_progress" }
    ],
    "summary": { "total": 24, "done": 12, "inProgress": 3, "blocked": 1 }
  }
}
```

### Visual Design

**Title Bar** (inline, 24px):
```
[session-name] [▰▰▰▱▱] 12/24
```
- Battery-pill segments per phase (grey=pending, amber=in-progress, green=done, red=blocked)
- Task count badge

**Sidebar** (per-pane, 20px):
- Apple Watch activity ring — outer ring = overall %, inner rings = phases
- Stacked vertically for multi-pane layouts

**Panel** (expandable on click):
- Full task list grouped by phase
- Status checkboxes with colors
- Phase headers with completion %

## Existing Patterns to Follow

1. **Zustand store per concern** — like activityStore separate from sessions (avoid re-render storms)
2. **Scalar selectors** — `selectPluginData(sessionId)` returns primitive or uses `useShallow`
3. **WebSocket message routing** — extend `onmessage` handler with `plugin_data` type
4. **Settings integration** — add plugin toggles to settings store, render in SettingsPanel
5. **Periodic polling** — follow cwd detection pattern (goroutine per session, configurable interval)
6. **Process detection** — extend session metadata with `activeProcess` field from backend

## Implementation Phases (Suggested)

### Phase 1: Plugin Infrastructure
- Plugin registration system (frontend)
- DataCollector interface (backend)
- WebSocket `plugin_data` message type
- Plugin data Zustand store pattern
- Process detection in backend (child process name reporting)
- Plugin settings in settings store

### Phase 2: Rendering Surfaces
- Title bar plugin widget slot
- Sidebar plugin widget slot
- Expandable panel overlay
- Per-surface toggle settings

### Phase 3: Copilot Todo Plugin
- Backend: SQLite reader for Copilot session DB
- Backend: DataCollector implementation
- Frontend: Battery-pill title bar widget
- Frontend: Activity ring sidebar widget
- Frontend: Task list panel widget

### Phase 4: Polish
- Animation (pill fill transitions, ring animations)
- Error handling (DB not found, session ended)
- Documentation

## Next Steps

Run `/plan-1b-specify` to formalize into a specification.

---

**Research Complete**: 2026-02-26T12:00:00Z
**Report Location**: docs/plans/025-visualisation-plugins/research-dossier.md

