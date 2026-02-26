# Plugin Development Guide

> **Last updated**: 2026-02-26 | **Plan**: [025-visualisation-plugins](../plans/025-visualisation-plugins/)

## Overview

trex has a plugin system for adding data visualisations to the terminal workspace. Plugins collect data from external sources, transport it via WebSocket, and render it in three surfaces: title bar, sidebar, and detail panel.

## Architecture

```
Backend Collector (Go)     →  WebSocket plugin_data  →  Frontend Store (Zustand)  →  React Widgets
──────────────────────         ─────────────────────     ──────────────────────       ─────────────
Polls data source              { type: "plugin_data",   Per-plugin isolated store    TitleBarWidget
Returns JSON                     pluginId, sessionId,   Map<sessionId, data>         SidebarWidget
Runs on same machine             data: {...} }          Scalar selectors              PanelWidget
```

## Creating a Plugin

### 1. Backend Collector (Go)

Create a new package under `backend/internal/plugins/<name>/`:

```go
// collector.go
package myplugin

import (
    "encoding/json"
    "time"
    "github.com/vaughanknight/trex/internal/terminal"
)

type Collector struct{}

var _ terminal.DataCollector = (*Collector)(nil)

func (c *Collector) ID() string { return "my-plugin" }

func (c *Collector) ProcessMatch(processes []string) bool {
    for _, p := range processes {
        if p == "my-tool" { return true }
    }
    return false
}

func (c *Collector) Collect() (json.RawMessage, error) {
    // Read your data source (SQL, file, API)
    data := map[string]int{"count": 42}
    return json.Marshal(data)
}

func (c *Collector) Interval() time.Duration { return 3 * time.Second }
```

Register in `backend/internal/server/server.go`:
```go
s.collectors.Register(myplugin.NewCollector())
```

### 2. Frontend Store

Create `frontend/src/plugins/<name>/store.ts`:

```typescript
import { createPluginStore } from '../../plugins/pluginStore'
export const myPluginStore = createPluginStore()
```

### 3. Frontend Widgets

Create components for each rendering surface:

```typescript
// TitleBarWidget.tsx — compact, ≤40px wide
// SidebarWidget.tsx — compact, ≤20px high
// PanelWidget.tsx — full detail view
```

Each receives `{ sessionId, paneId }` props. Read data from your store:

```typescript
import { selectPluginData } from '../../plugins/pluginStore'
import { myPluginStore } from './store'

export function TitleBarWidget({ sessionId }: PluginWidgetProps) {
  const data = myPluginStore(selectPluginData(sessionId))
  if (!data) return null
  return <div>...</div>
}
```

### 4. Register Plugin

Create `frontend/src/plugins/<name>/index.ts`:

```typescript
import { registerPlugin } from '../../plugins/pluginRegistry'
import { TitleBarWidget } from './TitleBarWidget'
import { SidebarWidget } from './SidebarWidget'
import { PanelWidget } from './PanelWidget'
import { myPluginStore } from './store'

registerPlugin({
  id: 'my-plugin',
  name: 'My Plugin',
  processMatch: ['my-tool'],
  TitleBarWidget,
  SidebarWidget,
  PanelWidget,
  useStore: myPluginStore,
})
```

Import in `frontend/src/main.tsx`:
```typescript
import './plugins/<name>/index.ts'
```

## Data Flow

1. Backend detects `my-tool` in process tree (via `pgrep`/`ps`)
2. Backend invokes `Collect()` on matching collector
3. Backend sends `plugin_data` WebSocket message
4. Frontend routes to plugin's Zustand store via `pluginRegistry`
5. Widget components re-render with new data

## Settings

Each plugin gets per-plugin and per-surface toggles in Settings → Plugins:
- **Enabled** — master toggle for the plugin
- **Title Bar** — show/hide in title bar
- **Sidebar** — show/hide in sidebar
- **Panel** — show/hide detail panel

## Existing Plugins

| Plugin | ID | Process Match | Data Source |
|--------|----|---------------|-------------|
| Copilot Todo Tracker | `copilot-todos` | `copilot`, `github-copilot` | Session SQLite DB (`~/.copilot/session-state/`) |

## Key Files

| File | Purpose |
|------|---------|
| `backend/internal/terminal/collector.go` | `DataCollector` interface |
| `backend/internal/terminal/collector_registry.go` | Thread-safe collector registration |
| `backend/internal/terminal/process.go` | Process tree detection |
| `frontend/src/plugins/pluginRegistry.ts` | Frontend plugin registration |
| `frontend/src/plugins/pluginStore.ts` | Zustand store factory |
| `frontend/src/components/PluginPanel.tsx` | Expandable detail panel |
