# Deep tmux Integration

**Mode**: Full
**File Management**: Legacy

📚 This specification incorporates findings from `research-dossier.md`

✅ **Research Opportunities Resolved** (2026-02-18)
Both external research topics from research-dossier.md have been addressed via Perplexity Deep Research:
- **gotmux Library Deep Dive**: Evaluated — raw CLI calls recommended over gotmux (see `external-research/gotmux-library-evaluation.md`)
- **tmux Control Mode Protocol Parser**: Architecture documented for future reference — deferred as wishlist (see `external-research/tmux-control-mode-parser.md`)

## Research Context

- **Components affected**: Backend (`TmuxDetector`, `TmuxMonitor`, `handleCreate`, `RealPTY`, `SessionRegistry`, `messages.go`), Frontend (`SessionList`, workspace store, workspace codec, settings store, sidebar components)
- **Critical dependencies**: Plan 014 infrastructure (`TmuxDetector` interface, `TmuxMonitor` polling, `FakeTmuxDetector`, `Session.TmuxSessionName` field, `Registry.ListByTmuxSession()`)
- **Modification risks**: Must strip `TMUX` env var when spawning PTY for tmux attach; must not break existing session creation flow; URL encoding must be backward-compatible (additive only); tmux session names can contain special characters that must survive URL encoding
- **Link**: See `research-dossier.md` for full analysis (65+ findings, 20-question Q&A)

## Summary

**WHAT**: Add a dedicated "tmux sessions" section to the trex sidebar that lists all tmux sessions running on the server. Users can click or drag tmux sessions to create new trex terminals that automatically run `tmux attach -t <name>`, connecting the web terminal to the tmux session. On page reload, the URL encodes the tmux session name and window index, enabling automatic reconnection.

**WHY**: Users (especially developers running Claude Code and other long-running processes) frequently create tmux sessions and want to manage them from trex's web UI. Currently, users must manually type `tmux attach -t <name>` every time they create a new trex session — a repetitive, error-prone workflow. This feature makes tmux a first-class citizen in trex, turning a multi-step manual process into a single click or drag.

## Goals

- **Quick-access tmux attachment**: Users can attach to any tmux session with a single click or drag, eliminating the need to manually type `tmux attach -t <name>`
- **Sidebar discovery**: All tmux sessions on the machine are listed in a dedicated sidebar section, providing at-a-glance visibility of available sessions
- **Drag-to-pane**: Users can drag tmux sessions from the sidebar into pane drop zones, creating a new trex terminal attached to that tmux session in the target split position
- **URL persistence and auto-reconnect**: Layouts containing tmux-attached terminals encode the tmux session name and window index in the URL, so refreshing the page or sharing the URL automatically reconnects to the same tmux sessions
- **Multi-client support**: Multiple trex panes can attach to the same tmux session simultaneously; tmux handles this natively
- **Visual differentiation**: Tmux-attached terminals are visually distinguishable from regular shell sessions via icon and title bar indicators
- **Graceful lifecycle**: Closing a trex pane detaches from tmux without killing the tmux session; the tmux session continues running independently
- **Session death detection**: When a tmux session is killed externally, the attached trex pane shows an overlay (similar to the existing "Session Ended" overlay)
- **Feature toggle**: Users can enable/disable the tmux sidebar section via settings
- **Configurable sockets**: Users can specify additional tmux sockets (`-L`/`-S`) in settings to connect to non-default tmux servers
- **Graceful degradation**: When tmux is not installed on the server, all tmux features are hidden — no sidebar section, no errors, no broken UI

## Non-Goals

- **Creating tmux sessions from trex**: No "New tmux session" button or project directory picker (wishlist item)
- **Deleting, renaming, or managing tmux sessions**: Attach only — no CRUD operations from the trex UI
- **Showing tmux windows/panes in sidebar tree**: Session names only, not a full tmux hierarchy
- **Auto-mirroring tmux layouts**: No automatic replication of tmux window arrangements into trex pane layouts
- **tmux control mode (`-CC`) integration**: Not using the text-based control mode protocol; using standard terminal attach via PTY
- **Zellij, screen, or other multiplexer support**: tmux only for this plan
- **tmux session groups or shared sessions**: No multi-user collaboration features

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=1, N=0, F=1, T=1
- **Total P**: 6 → CS-3

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | Cross-cutting: backend (detector, monitor, session, PTY, messages, server) + frontend (sidebar, workspace store, codec, settings, new components) |
| Integration (I) | 1 | One external dependency: tmux CLI. Well-understood, stable, existing integration pattern from Plan 014 |
| Data/State (D) | 1 | Minor state changes: extend workspace codec for tmux info in URL, add tmux session list to frontend state, extend WebSocket messages |
| Novelty (N) | 0 | Well-specified: 20-question Q&A completed, all decisions documented, Plan 014 infrastructure already proven |
| Non-Functional (F) | 1 | Moderate: tmux CLI polling frequency, multi-client resize conflicts (`window-size=latest`), `TMUX` env var stripping for nested tmux prevention |
| Testing/Rollout (T) | 1 | Integration testing needed: FakeTmuxDetector for unit tests, but real tmux needed for integration tests; feature toggle provides rollout control |

- **Confidence**: 0.85
- **Assumptions**:
  - Plan 014 infrastructure (`TmuxDetector`, `TmuxMonitor`, `FakeTmuxDetector`) is stable and ready to extend
  - `tmux attach -t <name>` inside a Go-spawned PTY works correctly (confirmed in research)
  - tmux CLI polling is sufficient (no need for control mode or inotify)
  - URL backward compatibility can be maintained by adding tmux fields to existing codec
- **Dependencies**:
  - Plan 014 (tmux session tracking) — already complete
  - tmux installed on server (graceful degradation when absent)
- **Risks**:
  - `TMUX` env var stripping must be surgical — only for tmux-attach sessions, not regular shells
  - Multi-client resize artifacts when two panes attach to same tmux session
  - Stale sidebar entries if tmux session is killed between polls
  - tmux session names with special characters in URL encoding
- **Phases** (suggested):
  1. Backend: Extend `TmuxDetector` with `ListSessions()`, add tmux session listing via WebSocket
  2. Backend: Extend session creation to accept tmux target, spawn `tmux attach` in PTY
  3. Frontend: Sidebar tmux sessions section with click-to-attach
  4. Frontend: Drag-and-drop tmux sessions into pane layout
  5. URL encoding: Extend workspace codec for tmux session name + window index, auto-reconnect on reload
  6. Polish: Visual indicators, session death detection, settings toggle, configurable sockets

## Acceptance Criteria

1. **Sidebar lists tmux sessions**: When tmux is installed and running sessions exist, a "tmux sessions" section appears in the sidebar showing each session by name
2. **Click-to-attach**: Clicking a tmux session in the sidebar creates a new trex terminal that automatically attaches to that tmux session via `tmux attach`
3. **Drag-to-pane**: Dragging a tmux session from the sidebar into a pane drop zone creates a new trex terminal attached to that tmux session in the target split position
4. **tmux survives close**: Closing a trex pane that is attached to a tmux session detaches from tmux; the tmux session continues running
5. **URL auto-reconnect**: After attaching to tmux sessions and refreshing the page, the same tmux sessions are automatically reattached based on URL-encoded session names
6. **Multi-attach works**: Two trex panes can attach to the same tmux session simultaneously; both display the same tmux content
7. **Visual indicator**: Tmux-attached panes display a distinguishing icon and tmux session name in the title bar
8. **Session death overlay**: When a tmux session is killed externally, the attached trex pane shows an overlay indicating the session has ended
9. **No tmux = no section**: When tmux is not installed on the server, the tmux sidebar section does not appear
10. **Settings toggle**: Users can disable the tmux sidebar section via the settings panel
11. **Stale removal**: When a tmux session is killed, it is removed from the sidebar on the next poll cycle
12. **TMUX env stripping**: Creating a tmux-attach session works even when trex is itself running inside tmux (nested tmux scenario)

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Nested tmux env var causes "sessions should be nested with care" error | High (common dev setup) | Blocks feature entirely | Strip `TMUX` and `TMUX_PANE` env vars when spawning tmux-attach PTYs |
| Multi-client resize conflicts | Medium | Visual artifacts (momentary wrong size) | Use tmux `window-size=latest` setting; document limitation |
| tmux session killed between polls | Medium | Stale sidebar entry for one poll cycle | Accept latency; overlay shows on next poll; user can manually refresh |
| Special characters in tmux session names break URL encoding | Low | Broken auto-reconnect | Base64url encoding handles arbitrary UTF-8; validate on decode |
| tmux CLI not in PATH on some systems | Low | Feature silently unavailable | `IsAvailable()` check already handles this; sidebar section hidden |

### Assumptions

- tmux is the dominant terminal multiplexer for the target user base
- Users prefer clicking/dragging over typing `tmux attach` commands
- Polling `tmux list-sessions` at ~5s intervals is acceptable latency
- Plan 014's `TmuxDetector` and `TmuxMonitor` are stable and extensible
- The WebSocket message protocol can accommodate new message types without breaking existing clients
- `tmux attach` inside a Go-spawned PTY provides a standard terminal experience (no rendering artifacts)

## Open Questions

All open questions resolved in clarification session 2026-02-18. See Clarifications below.

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: TDD for backend tmux detector/session logic (extends existing FakeTmuxDetector pattern) + Zustand store factory tests for frontend state. Lightweight for UI components (sidebar rendering, drag-drop interactions).
- **Focus Areas**:
  - Backend `ListSessions()` and tmux-target session creation (TDD with FakeTmuxDetector)
  - Frontend workspace store tmux extensions (factory-based store tests)
  - URL codec tmux encoding/decoding (unit tests)
  - Settings store tmux toggle (unit tests)
- **Excluded**:
  - Sidebar component visual rendering (manual verification)
  - Drag-and-drop interaction testing (manual verification — follows existing @atlaskit patterns)
  - Real tmux integration tests (deferred — require tmux server running)
- **Mock Usage**: Targeted fakes — continue existing FakeTmuxDetector and FakeStorage patterns per ADR-0004. No general mocking libraries.

## Documentation Strategy

- **Location**: Hybrid (README + docs/how/)
- **Rationale**: tmux integration is a significant feature that warrants both a brief README mention and a detailed guide
- **Content Split**:
  - **README**: Brief section noting tmux integration capability, link to detailed guide
  - **docs/how/tmux-integration.md**: Setup requirements, usage guide, configuration (sockets, feature toggle), troubleshooting (nested tmux, session death), limitations
- **Target Audience**: Developers using trex with tmux workflows
- **Maintenance**: Update when tmux feature scope expands (e.g., create session, control mode)

## ADR Seeds (Optional)

### ADR Seed: tmux Integration Approach

- **Decision Drivers**: Simplicity over depth; Plan 014 infrastructure reuse; avoid control mode complexity; standard PTY rendering
- **Candidate Alternatives**:
  - A. CLI-based attach via PTY (simple, proven, `tmux attach` in spawned shell)
  - B. Control mode (`tmux -CC`) with custom protocol parser (deep, complex, no existing Go library)
  - C. gotmux Go library wrapping CLI calls (type-safe, but adds dependency)
- **Stakeholders**: Developer (primary user), maintainer

### ADR Seed: tmux Session Discovery Mechanism

- **Decision Drivers**: Simplicity; existing polling pattern; no daemon/socket watching needed
- **Candidate Alternatives**:
  - A. Poll `tmux list-sessions` at fixed interval (simple, proven pattern from TmuxMonitor)
  - B. Watch tmux socket file for changes via fsnotify (lower latency, more complex)
  - C. Use tmux control mode notifications (`%sessions-changed`) (real-time, high complexity)
- **Stakeholders**: Developer, maintainer

## External Research

- **Incorporated**:
  - `external-research/gotmux-library-evaluation.md` — gotmux library assessment
  - `external-research/tmux-control-mode-parser.md` — control mode protocol parser design
- **Key Findings**:
  - **gotmux**: Solid library but adds unnecessary dependency. Raw CLI calls are sufficient — we already have the pattern in `TmuxDetector`. Same performance profile (subprocess per call). No thread safety advantage.
  - **Control mode**: Well-documented protocol (~1,200-1,900 lines for Go parser). Deferred — only needed for native pane rendering or real-time notifications, neither required for Plan 018.
- **Applied To**: Complexity scoring (confirmed CS-3), ADR seeds (Candidate A — CLI-based attach — confirmed as recommended approach), Risks (subprocess overhead confirmed negligible for 5s polling)

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| WebSocket tmux protocol | API Contract | New message types (`tmux_list_sessions`, `create` with tmux target) need precise format. Both backend and frontend consume these. | 1. What fields in `tmux_list_sessions` response? 2. How does `create` message encode tmux target? 3. How are tmux session updates pushed (new type vs. existing `tmux_status`)? |
| URL codec v3 for tmux | Data Model | Workspace codec must encode tmux session info per-pane alongside existing session IDs. Affects URL sync, reconnection, and backward compatibility. | 1. Where does tmux session name live in the codec schema? 2. How to handle missing tmux sessions on decode? 3. Is window index per-item or per-pane? |
| Sidebar tmux section UX | CLI Flow | New sidebar section with click + drag + polling + stale removal. Interacts with existing workspace items and drag-and-drop system. | 1. How does the tmux section relate to the workspace items list? 2. What drag data format for tmux items? 3. How to distinguish tmux drag from session drag in drop targets? |

## Clarifications

### Session 2026-02-18

| # | Question | Answer | Sections Updated |
|---|----------|--------|-----------------|
| Q1 | Workflow mode? | **Full** — CS-3 with cross-cutting backend+frontend changes across 6 phases | Mode header |
| Q2 | Testing approach? | **Hybrid** — TDD for backend detector/session logic + store tests; lightweight for UI | Testing Strategy |
| Q3 | Mock/stub policy? | **Targeted fakes** — continue FakeTmuxDetector + FakeStorage patterns (ADR-0004) | Testing Strategy |
| Q4 | Documentation location? | **Hybrid** — brief README mention + detailed docs/how/tmux-integration.md | Documentation Strategy |
| Q5 | File management? | **Legacy** — traditional layer-based locations, consistent with existing codebase | File Management header |
| Q6 | Poll interval for session list? | **Reuse TmuxMonitor interval** — same ~5s, single config, simpler | Open Questions (resolved) |
| Q7 | URL window index encoding? | **Session name + window index** — always encode both for precise reconnection | Open Questions (resolved), URL persistence goal |
| Q8 | Socket configuration UX? | **Simple text field** — single additional socket path/name, minimal UI | Open Questions (resolved) |

### Coverage Summary

| Status | Count | Items |
|--------|-------|-------|
| **Resolved** | 8 | Mode, testing, mocks, docs, files, poll interval, window index, socket UX |
| **Deferred** | 0 | — |
| **Outstanding** | 0 | — |
