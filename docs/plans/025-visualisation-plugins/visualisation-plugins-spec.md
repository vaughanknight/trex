# Visualisation Plugin System

**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md` and the 20-question interactive Q&A session.

## Research Context

- **Components affected**: Backend terminal handler (process detection, collector polling, WebSocket messages), frontend plugin registry, PaneTitleBar, LayoutSidebarItem, new panel overlay, settings store, WebSocket handler
- **Critical dependencies**: Backend child process detection (`ps` or `/proc`), SQLite access from Go for Copilot plugin, Zustand store isolation pattern, existing WebSocket message routing
- **Modification risks**: PaneTitleBar and LayoutSidebarItem need widget slots; WebSocket message type expansion; settings store growth
- **Link**: See `research-dossier.md` for full analysis including 20 Q&A decisions and architecture overview

## Summary

Create a plugin architecture that brings live data visualisations into the terminal workspace. Plugins collect data from external sources (databases, APIs, files), transport it via WebSocket, and render it across three surfaces: title bar (compact indicators), sidebar (per-pane badges), and expandable detail panels. The system detects which tool is running in each pane (by process name) and activates the relevant plugin automatically.

**WHY**: Terminal sessions generate rich contextual data (task progress, build status, test results) that's invisible to the user unless they switch contexts to check. Visualisation plugins surface this data inline — a developer running Copilot CLI can see their task completion progress as coloured pills in the title bar without leaving their terminal. The plugin architecture makes this extensible: future plugins for Claude, build systems, CI/CD, or any data source a user cares about.

## Goals

1. **Plugin infrastructure** — A registration system where plugins declare their process triggers, data stores, rendering components, and settings. The platform manages lifecycle, routing, and rendering surfaces.
2. **Backend data collection** — Go `DataCollector` interface with periodic polling. Collectors read from any source (SQL, files, APIs) and push structured JSON via a new `plugin_data` WebSocket message type.
3. **Process detection** — Backend detects the foreground process running in each PTY (child of shell) and reports it as session metadata. Plugins activate when their process match is detected.
4. **Per-pane scope** — Each pane independently activates plugins based on what's running in it. Multi-pane layouts show stacked plugin indicators in the sidebar.
5. **Three rendering surfaces** — Title bar (inline compact widgets), sidebar (per-pane badges/rings), and expandable detail panel (full data view on click).
6. **Per-plugin and per-surface settings** — Each plugin can be enabled/disabled globally, and each rendering surface (title bar, sidebar, panel) can be toggled independently.
7. **First plugin: Copilot Todo Tracker** — Reads task/phase progress from Copilot CLI's session SQLite database and visualises it as battery-pill phase indicators (title bar), Apple Watch activity rings (sidebar), and a full task list (panel).

## Non-Goals

- **Dynamic plugin loading** — Plugins are compiled into the trex codebase. Runtime/external plugin loading is future work.
- **Plugin marketplace/registry** — No distribution mechanism. Plugins are added by developers contributing to the codebase.
- **Cross-pane plugin data sharing** — Each pane's plugin data is independent. Aggregating across panes is future work.
- **Plugin-to-plugin communication** — Plugins are isolated. No inter-plugin messaging or data sharing.
- **Global-scope plugins** — Plugins attach to panes only. App-wide visualisations (e.g., system monitor) are future work.
- **Remote data sources** — Collectors run on the same machine as the backend. Remote API polling is future work.
- **Copilot session matching by cwd** — The first plugin uses most-recently-modified session DB. Exact session-to-pane matching is future work.

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=2, N=1, F=1, T=1
  - Surface Area (S=2): Backend Go (process detection, collector framework, WebSocket), frontend TypeScript (plugin registry, 3 rendering surfaces, settings, stores)
  - Integration (I=1): SQLite access from Go for Copilot plugin; child process detection is platform-specific
  - Data/State (D=2): New plugin data model, per-plugin Zustand stores, WebSocket message schema, settings expansion
  - Novelty (N=1): Plugin architecture is well-understood but first implementation in this codebase; visual design (pills, rings) needs iteration
  - Non-Functional (F=1): Polling performance (process detection + data collection per session); SQLite concurrent access
  - Testing/Rollout (T=1): Integration tests for end-to-end data flow; fakes for process detection and SQLite
- **Confidence**: 0.75
- **Assumptions**:
  - Go can detect child processes reliably on macOS and Linux
  - Go can read SQLite databases (via `mattn/go-sqlite3` or `modernc.org/sqlite`)
  - Copilot CLI session DB schema (`todos`, `todo_deps` tables) is stable
  - Plugin count stays small (< 10) — no need for lazy loading
- **Dependencies**:
  - Go SQLite library (new dependency for Copilot plugin)
  - No frontend dependencies beyond existing stack
- **Risks**:
  - Process detection may miss short-lived processes
  - Copilot session DB path may change across versions
  - Multiple Copilot sessions could confuse "most recently modified" heuristic
  - Plugin rendering in title bar may conflict with translucent mode
- **Phases**: 4 phases (infrastructure → rendering surfaces → Copilot plugin → polish)

## Acceptance Criteria

**AC-01: Plugin registration**
A plugin registers via `registerPlugin()` with an ID, name, process match patterns, three rendering components, a store factory, and settings schema. The platform discovers and manages it.

**AC-02: Backend process detection**
Backend periodically detects the foreground process name for each PTY session and includes it in session metadata sent to the frontend. Configurable polling interval.

**AC-03: Plugin activation by process**
When a pane's detected process matches a plugin's `processMatch` patterns, that plugin activates for that pane. When the process changes or exits, the plugin deactivates.

**AC-04: WebSocket plugin data transport**
Backend collectors send data via `plugin_data` WebSocket message with `pluginId`, `sessionId`, and a generic JSON `data` payload. Frontend routes it to the correct plugin store.

**AC-05: Title bar widget rendering**
Active plugins render their `TitleBarWidget` inline in the pane's title bar, after the session name and before the control buttons. Multiple plugins stack horizontally.

**AC-06: Sidebar widget rendering**
Active plugins render their `SidebarWidget` in the sidebar item for each pane. Multi-pane layouts show stacked widgets. Widgets are compact (≤20px height).

**AC-07: Expandable detail panel**
Clicking a plugin's title bar or sidebar widget opens a detail panel overlay showing the plugin's `PanelWidget` with full data view. Panel can be dismissed.

**AC-08: Per-plugin settings**
Each plugin has an enabled/disabled toggle in Settings. Per-surface toggles (title bar, sidebar, panel) control where the plugin renders.

**AC-09: Isolated plugin stores**
Each plugin gets its own Zustand store. Plugin data updates don't trigger re-renders in other plugins or unrelated components.

**AC-10: Backend DataCollector interface**
Go `DataCollector` interface with `ID()`, `ProcessMatch()`, `Collect()`, and `Interval()` methods. Collectors are compiled in and registered at startup.

**AC-11: Copilot todo collector**
A `DataCollector` implementation reads the most recently modified Copilot CLI session SQLite database, queries `todos` and `todo_deps` tables, and returns phase/task progress as JSON.

**AC-12: Copilot title bar pills**
Battery-pill segments in the title bar, one per phase. Colors: grey (pending), amber (in-progress), green (done), red (blocked). Task count badge showing `done/total`.

**AC-13: Copilot sidebar activity rings**
Apple Watch-style concentric arcs in the sidebar. Outer ring = overall task completion percentage. Inner rings = per-phase completion. Fits in ≤20px.

**AC-14: Copilot detail panel**
Full task list grouped by phase. Each task shows status (checkbox style), title, and status color. Phase headers show completion count and percentage.

**AC-15: Graceful degradation**
If a plugin's data source is unavailable (DB not found, process exited), the plugin shows no widget (not an error state). No crashes, no error modals.

## Risks & Assumptions

### Risks
1. **Process detection reliability** — Child process detection via `ps` or `/proc` may miss processes that spawn and exit quickly, or may report intermediate shell wrappers instead of the actual tool. Mitigation: match against full process tree, not just immediate child.
2. **Copilot DB location** — The `~/.copilot/session-state/` path is an implementation detail that could change. Mitigation: configurable path in settings; graceful fallback.
3. **SQLite concurrent access** — Copilot CLI and the trex backend could read the DB simultaneously. Mitigation: read-only access with WAL mode; retry on SQLITE_BUSY.
4. **Title bar space** — Plugin widgets compete with session name, tmux badge, and control buttons for limited title bar space. Mitigation: compact widget design; overflow handling.
5. **Performance** — Per-session polling (process detection + data collection) could add overhead with many sessions. Mitigation: configurable intervals; disable when not needed.

### Assumptions
1. Alpha product, single user — no multi-tenancy concerns
2. Copilot CLI session DB uses `todos` and `todo_deps` tables with stable schema
3. Go SQLite library works cross-platform (macOS + Linux)
4. Plugin count stays small (< 10 compiled-in plugins)
5. Process detection works via `ps` on macOS and `/proc` on Linux

## Open Questions

All open questions resolved in Clarifications session 2026-02-26. See `## Clarifications` section.

## ADR Seeds (Optional)

- **Decision Drivers**: Extensibility (future plugins), isolation (no cross-plugin interference), performance (per-session polling overhead), developer experience (adding new plugins should be straightforward)
- **Candidate Alternatives**:
  - A: Compiled-in plugins with Go collectors + React renderers (chosen) — maximum type safety, simple deployment
  - B: Script-based collectors (shell/python) with JSON output — more flexible but less type-safe, harder to test
  - C: Frontend-only plugins reading from terminal output patterns — no backend changes but limited to what's visible in the terminal
- **Stakeholders**: Single developer (alpha)

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Plugin Registration API | API Contract | Registration interface defines the contract between platform and plugins — affects all future plugins | What metadata is required? How do components receive data? How are stores created? How do settings schemas work? |
| Activity Ring SVG Rendering | Data Model | Apple Watch-style concentric arcs need precise SVG math for variable phase counts, sizes, and animations | How to handle 1 vs 5 vs 10 phases? Arc gap angles? Animation on data change? Color mapping? |
| Process Tree Detection | Integration Pattern | Platform-specific child process detection with varying reliability | Walk full tree or immediate child? How to handle `node → npx → copilot` chains? Caching strategy? |

## Testing & Documentation Strategy

### Testing Strategy
- **Approach**: Hybrid — TDD for backend (process detection, collector framework, WebSocket transport, SQLite reader); Lightweight for frontend (widget rendering, settings UI)
- **Rationale**: Backend data pipeline is high regression risk; frontend widgets are straightforward React components
- **Focus Areas**: DataCollector interface compliance, process tree detection accuracy, WebSocket message routing, SQLite query correctness, plugin registration lifecycle
- **Excluded**: Visual widget styling, SVG rendering precision (manual verification)
- **Mock Usage**: Fakes only (ADR-0004). Create `FakeProcessDetector`, `FakeSQLiteReader`, `FakeDataCollector` for Go backend tests.

### Documentation Strategy
- **Location**: docs/how/ only — add plugin development guide
- **Rationale**: Plugin system introduces a new extensibility pattern; future contributors need a guide for adding plugins
- **Target Audience**: Developers adding new visualisation plugins to trex
- **Maintenance**: Update when plugin interface changes
- **Content**: How to implement DataCollector (Go), how to register a frontend plugin, how to create widgets for each surface, settings integration

## Clarifications

### Session 2026-02-26

**C1 — Workflow Mode**: Full mode (multi-phase). CS-4 with backend+frontend plugin architecture warrants comprehensive gates.

**C2 — Testing Strategy**: Hybrid — TDD for backend collector/WebSocket/registry, Lightweight for UI widgets.

**C3 — Mock Usage**: Fakes only (ADR-0004). Create `FakeProcessDetector`, `FakeSQLiteReader`, `FakeDataCollector`.

**C4 — Documentation Strategy**: docs/how/ only — add plugin development guide for future plugin authors.

**C5 — SQLite Library**: `modernc.org/sqlite` (pure Go). No CGo dependency. Future-proof for Electron cross-compilation.

**C6 — Process Tree Depth**: Walk full process tree. Find matching process name anywhere in descendants of the shell process, not just immediate child.

**C7 — Detail Panel Positioning**: Inline expansion below title bar. Two modes: overlay (default, floats over terminal) and pinned (pushes terminal down). Click "pin" to toggle. Configurable per-plugin in settings.

### Coverage Summary

| Area | Status |
|------|--------|
| Workflow Mode | ✅ Resolved — Full |
| Testing Strategy | ✅ Resolved — Hybrid (TDD + Lightweight) |
| Mock Usage | ✅ Resolved — Fakes only (ADR-0004) |
| Documentation | ✅ Resolved — docs/how/ plugin guide |
| SQLite Library | ✅ Resolved — modernc.org/sqlite (pure Go) |
| Process Tree Depth | ✅ Resolved — full tree walk |
| Panel Positioning | ✅ Resolved — inline overlay with pin toggle |
| Open Questions | 0 remaining |
