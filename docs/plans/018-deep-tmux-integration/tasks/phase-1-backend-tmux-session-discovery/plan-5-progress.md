# Plan-5 Progress — Phase 1: Backend tmux Session Discovery

**Status**: Codebase context gathered. Ready to launch audit + requirements flow subagents, then write tasks.md.

## Context Gathered

All source files for Phase 1 have been read and analyzed:

### Files to Modify (7 files)

| File | Action | Key Observations |
|------|--------|-----------------|
| `backend/internal/terminal/tmux_detector.go` | Modify | TmuxDetector interface (ListClients, IsAvailable). RealTmuxDetector, FakeTmuxDetector. Has stale ADR-0001/tmax comments to clean up. Need to add: TmuxSessionInfo struct, ListSessions() to interface, parseTmuxSessions(), both implementations. |
| `backend/internal/terminal/tmux_detector_test.go` | Modify | Has TestParseTmuxClients (12 cases) and TestFakeTmuxDetector (4 subtests). Need to add: TestParseTmuxSessions, TestFakeTmuxDetector_Sessions. |
| `backend/internal/terminal/tmux_monitor.go` | Modify | TmuxMonitor with single onChange callback, poll() method (snapshot→exec→apply pattern). Backoff at 3 consecutive failures. Need to add: onSessionsChanged callback, ListSessions() call in poll loop, lastSessions caching, error recovery. |
| `backend/internal/terminal/tmux_monitor_test.go` | Modify | 8 tests: attach, detach, switch, idempotent, stop, unavailable, multi-session, no-tty. Uses newTestSession() helper. Need to add: session list change detection tests. |
| `backend/internal/terminal/messages.go` | Modify | ClientMessage (SessionId, Type, Data, Cols, Rows, Interval), ServerMessage (SessionId, ShellType, Type, Data, Error, Code, TmuxUpdates). Constants: create, session_created, close, tmux_status, tmux_config. Need to add: MsgTypeTmuxSessions, MsgTypeListTmuxSessions, TmuxSessions field on ServerMessage. |
| `backend/internal/server/server.go` | Modify | New() creates monitor with single onChange callback. handleTmuxChanges groups by connection. Need to add: second callback (handleTmuxSessionsChanged) passed to monitor, broadcast tmux_sessions to all connections. |
| `backend/internal/server/terminal.go` | Modify | connectionHandler with handleMessage switch. handleCreate(), handleTmuxConfig(). Need to add: handleListTmuxSessions() dispatch case, broadcast infrastructure for tmux_sessions. |

### Critical Research Findings Affecting Phase 1

- **#04**: TmuxDetector interface extension — add ListSessions(), extraction-ready
- **#05**: TmuxMonitor dual-callback — onSessionsChanged + lastSessions caching + error recovery
- **#06**: WebSocket protocol additive — new message types, optional fields
- **#10**: Raw CLI confirmed — extend existing exec.Command pattern

### ADR Constraints

- **ADR-0001 (Superseded)**: trex owns tmux directly. Stale tmax comments in tmux_detector.go need cleanup.
- **ADR-0004 (Accepted)**: Fakes only — extend FakeTmuxDetector, no mocking libraries.

### Expanded Task Table (Draft)

| ID | Plan Ref | Task | CS | Type | Dependencies | Files |
|----|----------|------|----|------|-------------|-------|
| T001 | 1.1 | Define TmuxSessionInfo struct + add ListSessions() to TmuxDetector interface. Clean stale tmax/ADR-0001 comments. | 1 | Setup | – | tmux_detector.go |
| T002 | 1.2 | Write tests for parseTmuxSessions() parser (TDD: tests first) | 2 | Test | T001 | tmux_detector_test.go |
| T003 | 1.3 | Implement parseTmuxSessions() + RealTmuxDetector.ListSessions() | 2 | Core | T002 | tmux_detector.go |
| T004 | 1.4 | Extend FakeTmuxDetector with AddSession(), RemoveSession(), ListSessions() + tests | 1 | Core | T001 | tmux_detector.go, tmux_detector_test.go |
| T005 | 1.5 | Write tests for TmuxMonitor session list change detection (TDD) | 2 | Test | T004 | tmux_monitor_test.go |
| T006 | 1.6 | Extend TmuxMonitor with onSessionsChanged callback + lastSessions caching | 2 | Core | T005 | tmux_monitor.go |
| T007 | 1.7 | Add MsgTypeTmuxSessions + MsgTypeListTmuxSessions constants, TmuxSessions field on ServerMessage | 1 | Setup | – | messages.go |
| T008 | 1.8 | Wire onSessionsChanged to WebSocket broadcast in server.go | 2 | Integration | T006, T007 | server.go |
| T009 | 1.8 | Add list_tmux_sessions request handler in terminal.go | 1 | Integration | T007 | terminal.go |
| T010 | 1.9 | Run full backend test suite — verify no regressions | 1 | Verification | T008, T009 | – |

### Next Steps

1. Launch Pre-Implementation Audit subagent (files above)
2. Launch Requirements Flow subagent (Phase 1 ACs from plan)
3. Write complete tasks.md with all sections
4. Generate flight plan via /plan-5b-flightplan
