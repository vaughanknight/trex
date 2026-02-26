# Phase 4: Copilot Todo Plugin – Tasks & Alignment Brief

**Date**: 2026-02-26

---

## Executive Briefing

Build the first plugin end-to-end: backend reads Copilot CLI session SQLite DB for todo/phase progress, sends via WebSocket; frontend renders battery-pill phases in title bar, activity rings in sidebar, task list in detail panel.

---

## Tasks

| Status | ID | Task | CS | Files | Validation |
|--------|------|------|-----|-------|------------|
| [ ] | T001 | Install modernc.org/sqlite | 1 | go.mod | `go get modernc.org/sqlite` succeeds |
| [ ] | T002 | Create Copilot SQLite reader | 3 | `backend/internal/plugins/copilot/reader.go` | Reads todos, todo_deps from most recently modified DB in ~/.copilot/session-state/. Returns phases + tasks JSON. |
| [ ] | T003 | Create Copilot DataCollector | 2 | `backend/internal/plugins/copilot/collector.go` | Implements DataCollector. ProcessMatch: ["copilot"]. Interval: 3s. |
| [ ] | T004 | Register collector at server startup | 1 | `backend/internal/server/server.go` or `terminal.go` | Copilot collector registered. Backend sends plugin_data when copilot detected. |
| [ ] | T005 | Create battery-pill TitleBarWidget (SVG) | 3 | `frontend/src/plugins/copilot-todos/TitleBarWidget.tsx` | Inline SVG pills per phase. Colors by status. Task count badge. |
| [ ] | T006 | Create activity ring SidebarWidget (SVG) | 3 | `frontend/src/plugins/copilot-todos/SidebarWidget.tsx` | Concentric arcs. Outer=overall, inner=per-phase. ≤20px. |
| [ ] | T007 | Create task list PanelWidget | 2 | `frontend/src/plugins/copilot-todos/PanelWidget.tsx` | Tasks grouped by phase, status colors. |
| [ ] | T008 | Register Copilot plugin in frontend | 1 | `frontend/src/plugins/copilot-todos/index.ts` | registerPlugin() called. Widgets render when copilot detected. |
| [ ] | T009 | End-to-end manual test | 1 | all | Run copilot → pills appear → rings appear → panel opens. |

---
