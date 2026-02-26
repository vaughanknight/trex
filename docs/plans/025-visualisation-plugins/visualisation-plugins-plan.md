# Visualisation Plugin System — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-26
**Spec**: [./visualisation-plugins-spec.md](./visualisation-plugins-spec.md)
**Research**: [./research-dossier.md](./research-dossier.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Phase 1: Backend Plugin Infrastructure](#phase-1-backend-plugin-infrastructure)
6. [Phase 2: Frontend Plugin Infrastructure](#phase-2-frontend-plugin-infrastructure)
7. [Phase 3: Rendering Surfaces](#phase-3-rendering-surfaces)
8. [Phase 4: Copilot Todo Plugin](#phase-4-copilot-todo-plugin)
9. [Phase 5: Documentation & Polish](#phase-5-documentation--polish)
10. [Cross-Cutting Concerns](#cross-cutting-concerns)
11. [Complexity Tracking](#complexity-tracking)
12. [Progress Tracking](#progress-tracking)
13. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Terminal sessions generate rich contextual data (task progress, build status, test results) that's invisible to the user unless they switch contexts. A developer running Copilot CLI can't see task completion without leaving their terminal.

**Solution**:
- Plugin architecture: backend DataCollector (Go) → WebSocket `plugin_data` → frontend Zustand store → React widgets
- Process detection: backend polls child process names per PTY, activates matching plugins
- Three rendering surfaces: title bar (battery pills), sidebar (activity rings), expandable detail panel
- First plugin: Copilot Todo Tracker reading from session SQLite database

**Expected Outcomes**:
- Extensible plugin system for any data source
- Live task progress visible inline in the terminal workspace
- Per-pane, per-plugin activation with granular settings

**Complexity**: CS-4 (large) — S=2, I=1, D=2, N=1, F=1, T=1

---

## Technical Context

### Current System State
- Backend polls cwd per session (5s interval via `pollCwd` goroutine)
- WebSocket routes messages by type (`session_created`, `tmux_status`, `cwd_update`, etc.)
- Frontend uses isolated Zustand stores per concern (sessions, activity, workspace, tmux, settings)
- PaneTitleBar is 24px flex row with session name + control buttons
- LayoutSidebarItem renders per-item with icon + name + badge
- No plugin/registry pattern exists in codebase

### Constraints
- **ADR-0004**: Fakes only (FakeProcessDetector, FakeDataCollector, FakeSQLiteReader)
- **Title bar space**: 24px height, ~60px available for widgets after session name
- **Settings growth**: 31+ fields already; plugin settings need namespacing strategy
- **Pure Go SQLite**: `modernc.org/sqlite` (no CGo, per C5)

### Gate Validation

**Clarify Gate**: ✅ All 7 questions resolved (C1-C7). 0 open questions.

**Constitution Gate**: ✅ No deviations needed.

**Architecture Gate**: ✅ Plugin system follows existing patterns (store isolation, WebSocket routing, periodic polling).

**ADR Ledger**:

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Active | All phases | Fakes only. Create FakeProcessDetector, FakeDataCollector. |
| ADR-0011 | Active | Phase 2, 3 | Unified workspace items — plugin widgets attach per-pane. |

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Process Detection Infrastructure Missing
**Impact**: Critical
**Sources**: [I1-04, R1-02]
**Problem**: Backend has no child process detection. Session struct tracks PID but not what's running in the PTY.
**Solution**: Add `ProcessDetector` interface alongside `CwdDetector`. Use `ps` command (POSIX, works macOS + Linux) to walk process tree. Poll on same interval as cwd.
**Action Required**: Create `process.go` with detector interface, platform implementation, and fake.
**Affects Phases**: Phase 1

### 🚨 Critical Discovery 02: WebSocket Message Routing Needs plugin_data Type
**Impact**: Critical
**Sources**: [I1-02, R1-07]
**Problem**: No `plugin_data` message type exists. Frontend WebSocket handler routes by hardcoded type strings.
**Solution**: Add `plugin_data` to `ServerMessageType` union. Add `PluginId` and `PluginData` fields to `ServerMessage`. Route in frontend before per-session dispatch.
**Action Required**: Update `messages.go`, `terminal.ts`, `useCentralWebSocket.ts`.
**Affects Phases**: Phase 1, Phase 2

### 🔴 High Discovery 03: Title Bar Space Severely Constrained
**Impact**: High
**Sources**: [R1-03]
**Problem**: PaneTitleBar is 24px with grip + tmux badge + session name + 4 buttons. Plugin widgets compete for ~60px.
**Solution**: Ultra-compact widget design. Battery pills as inline SVG (~40px wide). Count badge as tiny text. Overflow: hide widgets when space insufficient.
**Action Required**: Design compact SVG pill component. Test at various pane widths.
**Affects Phases**: Phase 3, Phase 4

### 🔴 High Discovery 04: No Plugin Registry Pattern Exists
**Impact**: High
**Sources**: [I1-08, R1-06]
**Problem**: No existing plugin/factory pattern. Must design from scratch.
**Solution**: Simple `Map<string, VisualisationPlugin>` registry with `registerPlugin()`. Plugins self-register on import. Settings store has per-plugin toggles.
**Action Required**: Create `pluginRegistry.ts` with registration API.
**Affects Phases**: Phase 2

### 🔴 High Discovery 05: SQLite Dependency Not Yet Installed
**Impact**: High
**Sources**: [R1-01]
**Problem**: `modernc.org/sqlite` not in go.mod. Copilot plugin needs it.
**Solution**: `go get modernc.org/sqlite` in Phase 4. Read-only access with WAL mode.
**Action Required**: Install dependency, create SQLite reader with FakeSQLiteReader for tests.
**Affects Phases**: Phase 4

### 🔴 High Discovery 06: Zustand Store Isolation Per Plugin
**Impact**: High
**Sources**: [I1-03]
**Problem**: Plugin data must not cause re-renders in unrelated components.
**Solution**: Follow activityStore pattern — one Zustand store per plugin with Map-based data keyed by sessionId. Scalar selectors for individual sessions.
**Action Required**: Create store factory pattern in plugin infrastructure.
**Affects Phases**: Phase 2

### 🟡 Medium Discovery 07: Settings Store Growth
**Impact**: Medium
**Sources**: [R1-04]
**Problem**: Settings store has 31+ fields. Each plugin adds 3-4 more.
**Solution**: Namespace plugin settings under a single `pluginSettings` object: `{ 'copilot-todos': { enabled: true, titleBar: true, sidebar: true, panel: true } }`.
**Action Required**: Add `pluginSettings: Record<string, PluginSettingsEntry>` to settings store.
**Affects Phases**: Phase 2

### 🟡 Medium Discovery 08: Detail Panel UI Undefined
**Impact**: Medium
**Sources**: [R1-08]
**Problem**: Expandable detail panel doesn't exist. Needs overlay/pinned modes per C7.
**Solution**: Create `PluginPanel` component with overlay mode (absolute positioned below title bar) and pinned mode (pushes terminal down). Toggle via pin button.
**Action Required**: Design and implement panel component with two modes.
**Affects Phases**: Phase 3

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Hybrid (per spec C2)
- **TDD**: Phase 1 (backend Go: process detection, DataCollector), Phase 2 (frontend: plugin registry, store pattern, WebSocket routing)
- **Lightweight**: Phase 3 (rendering surfaces — manual visual verification), Phase 4 (Copilot plugin widgets), Phase 5 (docs)

### Mock Usage
- **Policy**: Fakes only (ADR-0004)
- **New fakes**: `FakeProcessDetector`, `FakeDataCollector`, `FakeSQLiteReader` (Go backend)

### Test Commands Reference
```bash
# Backend
cd backend && go test ./internal/terminal/... -v
cd backend && go test ./internal/server/... -v

# Frontend
cd frontend && npx vitest run --reporter=verbose
cd frontend && npm run build
```

---

## Phase 1: Backend Plugin Infrastructure

**Objective**: Backend detects child processes per PTY, provides DataCollector interface, sends `plugin_data` via WebSocket.

**Testing**: TDD — Go tests with fakes.

### Tasks

| # | Status | Task | CS | Success Criteria | Notes |
|---|--------|------|----|------------------|-------|
| 1.1 | [ ] | Create `ProcessDetector` interface + `FakeProcessDetector` | 2 | Interface: `DetectProcessTree(pid int) []string`. Fake returns configurable values. Tests pass. | `backend/internal/terminal/process.go` |
| 1.2 | [ ] | Implement process tree detection (macOS/Linux) | 2 | Uses `ps -o comm= -p <pid>` + walks children via `pgrep -P`. Returns process name list. | Platform-agnostic via `ps` |
| 1.3 | [ ] | Create `DataCollector` interface + `FakeDataCollector` | 2 | Interface: `ID()`, `ProcessMatch()`, `Collect()`, `Interval()`. Fake returns configurable JSON. | `backend/internal/terminal/collector.go` |
| 1.4 | [ ] | Create collector registry | 1 | `RegisterCollector()`, `GetCollectors()`. Collectors registered at server startup. | `backend/internal/terminal/collector_registry.go` |
| 1.5 | [ ] | Add `PluginId`, `PluginData` to WebSocket messages | 1 | `ServerMessage` has `PluginId string` and `PluginData json.RawMessage` fields. | `messages.go` + `terminal.ts` |
| 1.6 | [ ] | Extend polling to detect processes + invoke collectors | 3 | `pollCwd` extended: detect process tree, match against registered collectors, invoke `Collect()`, send `plugin_data` message when data changes. | Reuse existing 5s ticker |
| 1.7 | [ ] | Backend tests pass | 1 | `go test ./...` — all pass including new process/collector tests. | |

### Acceptance Criteria
- [ ] ProcessDetector detects child process names for a given PID
- [ ] DataCollector interface defined with ID, ProcessMatch, Collect, Interval
- [ ] Collectors registered at startup, invoked when process matches
- [ ] `plugin_data` WebSocket message sent with pluginId + sessionId + JSON payload
- [ ] All backend tests pass

---

## Phase 2: Frontend Plugin Infrastructure

**Objective**: Frontend plugin registry, Zustand store pattern, WebSocket routing, settings integration.

**Testing**: TDD — Vitest tests for registry and store.

### Tasks

| # | Status | Task | CS | Success Criteria | Notes |
|---|--------|------|----|------------------|-------|
| 2.1 | [ ] | Create plugin registry (`pluginRegistry.ts`) | 2 | `registerPlugin()`, `getPlugin()`, `getEnabledPlugins()`. Type-safe `VisualisationPlugin` interface. | `frontend/src/plugins/pluginRegistry.ts` |
| 2.2 | [ ] | Create plugin store factory | 2 | `createPluginStore(pluginId)` returns isolated Zustand store with `data: Map<sessionId, unknown>`, `updateData`, `clearData`. | `frontend/src/plugins/pluginStore.ts` |
| 2.3 | [ ] | Add `plugin_data` to frontend WebSocket routing | 2 | `useCentralWebSocket.ts` routes `plugin_data` messages to correct plugin store. `ServerMessageType` updated. | |
| 2.4 | [ ] | Add `pluginSettings` to settings store | 2 | `pluginSettings: Record<string, { enabled, titleBar, sidebar, panel }>` with getters/setters. Persisted to localStorage. | Namespaced to avoid settings bloat |
| 2.5 | [ ] | Add `activeProcess` to session metadata | 1 | Session store tracks `activeProcess?: string` per session. Updated from `plugin_data` or separate `process_update` message. | |
| 2.6 | [ ] | Frontend tests pass | 1 | `npx vitest run` — all pass. `npm run build` — clean. | |

### Acceptance Criteria
- [ ] Plugins register via `registerPlugin()` with components + store + settings
- [ ] Plugin stores are isolated Zustand instances (no cross-plugin re-renders)
- [ ] `plugin_data` WebSocket messages route to correct plugin store
- [ ] Plugin settings persisted with per-plugin and per-surface toggles
- [ ] All tests pass, build clean

---

## Phase 3: Rendering Surfaces

**Objective**: Widget slots in title bar, sidebar, and expandable detail panel.

**Testing**: Lightweight — manual visual verification.

### Tasks

| # | Status | Task | CS | Success Criteria | Notes |
|---|--------|------|----|------------------|-------|
| 3.1 | [ ] | Add plugin widget slot to PaneTitleBar | 2 | Enabled plugins render `TitleBarWidget` inline after session name. Compact, ≤40px per widget. | Between name and buttons |
| 3.2 | [ ] | Add plugin widget slot to LayoutSidebarItem | 2 | Per-pane plugin widgets rendered below sidebar button. Stacked for multi-pane layouts. ≤20px height each. | |
| 3.3 | [ ] | Create `PluginPanel` overlay component | 3 | Expandable panel below title bar. Two modes: overlay (absolute, z-30) and pinned (pushes terminal). Pin/unpin button. Dismiss on click outside. | New component |
| 3.4 | [ ] | Wire panel open/close from title bar + sidebar widget clicks | 2 | Clicking plugin widget in title bar or sidebar opens panel with that plugin's `PanelWidget`. | |
| 3.5 | [ ] | Add plugin settings section to SettingsPanel | 2 | "Plugins" section listing registered plugins with per-plugin toggle + per-surface toggles. | |
| 3.6 | [ ] | Build + manual test | 1 | Build clean. Widget slots render placeholder when no plugins active. Panel opens/closes/pins correctly. | |

### Acceptance Criteria
- [ ] Title bar shows plugin widgets inline (AC-05)
- [ ] Sidebar shows per-pane plugin widgets (AC-06)
- [ ] Detail panel opens as overlay, can be pinned (AC-07, C7)
- [ ] Plugin settings section in Settings panel (AC-08)
- [ ] Build clean, manual visual verification passes

---

## Phase 4: Copilot Todo Plugin

**Objective**: First plugin — reads Copilot CLI session SQLite DB, renders task progress.

**Testing**: TDD for backend SQLite reader; Lightweight for frontend widgets.

### Tasks

| # | Status | Task | CS | Success Criteria | Notes |
|---|--------|------|----|------------------|-------|
| 4.1 | [ ] | Install `modernc.org/sqlite` | 1 | `go get modernc.org/sqlite`. Imports work. | Pure Go, no CGo |
| 4.2 | [ ] | Create Copilot SQLite reader + FakeSQLiteReader | 3 | Reads `todos`, `todo_deps` from most recently modified DB in `~/.copilot/session-state/`. Returns phases + tasks JSON. Fake returns configurable data. | `backend/internal/plugins/copilot/` |
| 4.3 | [ ] | Create Copilot DataCollector implementation | 2 | Implements `DataCollector`. ProcessMatch: `["copilot"]`. Interval: 3s. Calls SQLite reader. | |
| 4.4 | [ ] | Register Copilot collector at server startup | 1 | Collector registered in server init. Backend sends `plugin_data` when copilot detected. | |
| 4.5 | [ ] | Create battery-pill TitleBarWidget (SVG) | 3 | Inline SVG pills per phase. Colors: grey (pending), amber (in-progress), green (done), red (blocked). Task count badge. | `frontend/src/plugins/copilot-todos/` |
| 4.6 | [ ] | Create activity ring SidebarWidget (SVG) | 3 | Concentric arcs. Outer = overall %, inner = per-phase. ≤20px diameter. | Apple Watch style |
| 4.7 | [ ] | Create task list PanelWidget | 2 | Tasks grouped by phase. Status colors + checkboxes. Phase headers with completion %. | |
| 4.8 | [ ] | Register Copilot plugin in frontend | 1 | `registerPlugin(copilotTodoPlugin)` called on app init. Widgets render when copilot detected in pane. | |
| 4.9 | [ ] | End-to-end test | 1 | Run Copilot CLI in a pane → pills appear in title bar → rings in sidebar → click opens panel with tasks. | Manual verification |

### Acceptance Criteria
- [ ] Backend reads Copilot session SQLite DB (AC-11)
- [ ] Battery pills in title bar per phase (AC-12)
- [ ] Activity rings in sidebar per pane (AC-13)
- [ ] Task list in detail panel (AC-14)
- [ ] Graceful degradation when DB not found (AC-15)
- [ ] All tests pass, build clean

---

## Phase 5: Documentation & Polish

**Objective**: Plugin development guide, animations, error handling.

**Testing**: Lightweight.

### Tasks

| # | Status | Task | CS | Success Criteria | Notes |
|---|--------|------|----|------------------|-------|
| 5.1 | [ ] | Create `docs/how/plugin-development.md` | 2 | Guide covers: DataCollector (Go), registerPlugin (frontend), widget components, store pattern, settings. | Per Documentation Strategy C4 |
| 5.2 | [ ] | Add pill fill transitions (CSS animations) | 1 | Phase pills animate on status change (color transition). | Subtle, not distracting |
| 5.3 | [ ] | Add ring animation (SVG arc transitions) | 1 | Activity rings animate on data update (arc grows/shrinks). | |
| 5.4 | [ ] | Error handling: DB not found, process exited | 1 | No widget shown when data unavailable. No errors in console. No crashes. | |
| 5.5 | [ ] | Final build + test verification | 1 | All tests pass. Build clean. No TypeScript errors. | |

### Acceptance Criteria
- [ ] Plugin development guide created
- [ ] Animations subtle and performant
- [ ] Graceful degradation verified (AC-15)
- [ ] All tests pass, build clean

---

## Cross-Cutting Concerns

### Security Considerations
- SQLite read-only access (no writes to Copilot DB)
- Process name detection via `ps` (no privilege escalation)
- Plugin data is local-only (no external network calls)

### Observability
- Backend logs process detection at DEBUG level
- Backend logs collector errors at WARN level
- Frontend logs plugin data routing at console.debug

### Documentation
- **Location**: `docs/how/plugin-development.md`
- **Content**: How to create backend collectors, frontend plugins, widget components, settings integration
- **Audience**: Developers adding new plugins to trex

---

## Complexity Tracking

| Component | CS | Label | Breakdown | Justification | Mitigation |
|-----------|-----|-------|-----------|---------------|------------|
| Process detection | 2 | Small | S=1,I=0,D=1,N=0,F=0,T=1 | POSIX ps command, cross-platform | FakeProcessDetector for tests |
| Plugin registry | 2 | Small | S=1,I=0,D=1,N=1,F=0,T=1 | New pattern but simple Map-based | Follow activityStore pattern |
| Copilot SQLite reader | 3 | Medium | S=1,I=1,D=1,N=1,F=1,T=1 | Pure Go SQLite, session DB path discovery | FakeSQLiteReader, graceful fallback |
| Activity ring SVG | 3 | Medium | S=1,I=0,D=1,N=1,F=0,T=1 | SVG arc math for variable phase counts | Manual visual testing |
| Detail panel (overlay+pin) | 3 | Medium | S=1,I=1,D=1,N=1,F=0,T=1 | Two render modes, z-index management | Follow existing overlay patterns |

---

## Progress Tracking

### Phase Completion Checklist
- [ ] Phase 1: Backend Plugin Infrastructure - Not Started
- [ ] Phase 2: Frontend Plugin Infrastructure - Not Started
- [ ] Phase 3: Rendering Surfaces - Not Started
- [ ] Phase 4: Copilot Todo Plugin - Not Started
- [ ] Phase 5: Documentation & Polish - Not Started

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
