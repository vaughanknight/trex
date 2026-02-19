# Phase 1: Backend tmux Session Discovery — Execution Log

## Task T001: Define TmuxSessionInfo struct + extend interface + clean ADR comments
**Started**: 2026-02-19 11:35
**Status**: ✅ Complete
**Dossier Task**: T001 | **Plan Task**: 1.1

### What I Did
- Added `TmuxSessionInfo` struct with `Name`, `Windows`, `Attached` fields and JSON tags
- Added `ListSessions() ([]TmuxSessionInfo, error)` to `TmuxDetector` interface
- Added stub implementations on both `RealTmuxDetector` and `FakeTmuxDetector` (return nil — forces T003/T004)
- Cleaned stale ADR-0001 comments: replaced "to be replaced with tmax library per ADR-0001" with "Per Constitution v1.4.0, trex owns this integration directly"
- Updated `SetError` doc to reflect it affects both `ListClients` and `ListSessions`

### Evidence
```
$ go build ./...   # ✅ Compiles
$ go test ./internal/terminal/ -v   # ✅ All 10 tests pass, 0 regressions
```

### Files Changed
- `backend/internal/terminal/tmux_detector.go` — struct, interface extension, stub impls, comment cleanup

**Completed**: 2026-02-19 11:35
---

## Task T002: Write parser tests (TDD red phase)
**Started**: 2026-02-19 11:36
**Status**: ✅ Complete
**Dossier Task**: T002 | **Plan Task**: 1.2

### What I Did
- Added `TestParseTmuxSessions` table-driven test with 12 test cases following `TestParseTmuxClients` pattern
- Test cases: empty output, single session, multiple sessions, special char names, malformed lines (missing field, non-numeric windows/attached), whitespace only, trailing newline, mixed valid/malformed, empty session name
- Included Test Doc block

### Evidence
```
$ go test ./internal/terminal/ -run TestParseTmuxSessions -v
# undefined: parseTmuxSessions   ✅ RED — function doesn't exist yet
```

### Files Changed
- `backend/internal/terminal/tmux_detector_test.go` — 12 test cases added

**Completed**: 2026-02-19 11:36
---

## Task T003: Implement parseTmuxSessions() and RealTmuxDetector.ListSessions()
**Started**: 2026-02-19 11:37
**Status**: ✅ Complete
**Dossier Task**: T003 | **Plan Task**: 1.3

### What I Did
- Implemented `parseTmuxSessions()`: tab-split, `strconv.Atoi` for windows/attached, skip malformed lines
- Implemented `RealTmuxDetector.ListSessions()`: context timeout, `tmux list-sessions -F` with tab format, exit code 1 → nil (not error)
- Added `strconv` import
- Follows exact same pattern as `ListClients()`/`parseTmuxClients()`

### Evidence
```
$ go test ./internal/terminal/ -run TestParseTmuxSessions -v
--- PASS: TestParseTmuxSessions (0.00s)   ✅ GREEN — all 12 cases pass
$ go test ./internal/terminal/ -v -count=1
PASS — all existing tests pass, 0 regressions
```

### Files Changed
- `backend/internal/terminal/tmux_detector.go` — `parseTmuxSessions()`, `ListSessions()` impl, `strconv` import

**Completed**: 2026-02-19 11:38
---

## Task T004: Extend FakeTmuxDetector with session helpers
**Started**: 2026-02-19 11:38
**Status**: ✅ Complete
**Dossier Task**: T004 | **Plan Task**: 1.4

### What I Did
- Added `sessions []TmuxSessionInfo` field to `FakeTmuxDetector`
- Implemented `AddSession(name, windows, attached)`, `RemoveSession(name)`, `ListSessions()` with copy semantics
- Added `TestFakeTmuxDetector_Sessions` (5 subtests) + `TestFakeTmuxDetector_SessionsCopy`
- Added sentinel `errTest` for error path testing

### Evidence
```
$ go test ./internal/terminal/ -run "TestFakeTmuxDetector_Sessions" -v
--- PASS: TestFakeTmuxDetector_Sessions (0.00s)   ✅ all 5 subtests
--- PASS: TestFakeTmuxDetector_SessionsCopy (0.00s)   ✅ copy semantics verified
```

### Files Changed
- `backend/internal/terminal/tmux_detector.go` — sessions field, AddSession, RemoveSession, ListSessions
- `backend/internal/terminal/tmux_detector_test.go` — 6 new tests + errTest sentinel

**Completed**: 2026-02-19 11:39
---

## Task T005: Write monitor session list tests (TDD red)
**Started**: 2026-02-19 11:39
**Status**: ✅ Complete
**Dossier Task**: T005 | **Plan Task**: 1.5

### What I Did
- Added 5 tests: `TestTmuxMonitor_DetectSessionAdded`, `_DetectSessionRemoved`, `_SessionListError`, `_SessionListNoChange`, `_SessionListInitial`
- Tests use new 5-arg `NewTmuxMonitor` (adds `onSessionsChanged` callback)
- Tests call `pollSessions()` and `GetLastSessions()` — neither exists yet
- Error recovery test verifies callback NOT called on ListSessions error and cached sessions preserved
- Added Test Doc block + `errTest` sentinel in monitor test file

### Evidence
```
$ go test ./internal/terminal/ -run "TestTmuxMonitor_DetectSessionAdded" -v
# too many arguments in call to NewTmuxMonitor
# monitor.pollSessions undefined
# monitor.GetLastSessions undefined
✅ RED — methods don't exist yet
```

### Files Changed
- `backend/internal/terminal/tmux_monitor_test.go` — 5 new tests, errTest, errors import

**Completed**: 2026-02-19 11:40
---

## Task T006: Implement monitor dual-callback + error recovery
**Started**: 2026-02-19 11:40
**Status**: ✅ Complete
**Dossier Task**: T006 | **Plan Task**: 1.6

### What I Did
- Added `onSessionsChanged` callback field and `lastSessions` cache to `TmuxMonitor` struct
- Updated `NewTmuxMonitor` to accept 5th param `onSessionsChanged func([]TmuxSessionInfo)`
- Implemented `pollSessions()`: calls `ListSessions()`, compares with `lastSessions`, fires callback on change
- Implemented `GetLastSessions()`: returns copy of cached sessions
- Added `sessionsEqual()` helper for slice comparison
- Wired `pollSessions()` into `run()` on same ticker (after `poll()`)
- Updated all callers: 8 test call sites + server.go `New()`

### Evidence
```
$ go test ./internal/terminal/ -v -count=1
PASS — all 31 tests pass including 5 new session list tests + 8 existing Plan 014 tests
TestTmuxMonitor_DetectSessionAdded ✅
TestTmuxMonitor_DetectSessionRemoved ✅
TestTmuxMonitor_SessionListError ✅ (callback NOT called on error, cached sessions preserved)
TestTmuxMonitor_SessionListNoChange ✅ (idempotent)
TestTmuxMonitor_SessionListInitial ✅
```

### Files Changed
- `backend/internal/terminal/tmux_monitor.go` — struct fields, constructor, pollSessions, GetLastSessions, sessionsEqual, run() wiring
- `backend/internal/terminal/tmux_monitor_test.go` — updated 8 existing NewTmuxMonitor calls to 5-arg form
- `backend/internal/server/server.go` — updated NewTmuxMonitor call to pass `nil` for onSessionsChanged

**Completed**: 2026-02-19 11:43
---

## Task T007: Add message type constants + ServerMessage field
**Started**: 2026-02-19 11:44
**Status**: ✅ Complete
**Dossier Task**: T007 | **Plan Task**: 1.7

### What I Did
- Added `MsgTypeTmuxSessions = "tmux_sessions"` constant (server→client)
- Added `MsgTypeListTmuxSessions = "list_tmux_sessions"` constant (client→server)
- Added `TmuxSessions []TmuxSessionInfo` field to `ServerMessage` with `json:"tmuxSessions,omitempty"` tag
- Updated type comment to include "tmux_sessions"

### Evidence
```
$ go build ./...   ✅ Compiles
$ go test ./internal/terminal/ -run "TestServerMessage|TestClientMessage" -v
PASS — all 6 message tests pass, omitempty preserves backward compat
```

### Files Changed
- `backend/internal/terminal/messages.go` — 2 constants, 1 field

**Completed**: 2026-02-19 11:44
---

## Task T008: Wire broadcast handler in server.go
**Started**: 2026-02-19 11:44
**Status**: ✅ Complete
**Dossier Task**: T008 | **Plan Task**: 1.8 (broadcast part)

### What I Did
- Added `handleSessionsChanged(sessions []TmuxSessionInfo)` to server
- Pattern: iterate registry, deduplicate by connection, send ONE `tmux_sessions` message per connection
- Wired as `onSessionsChanged` callback in `New()` (replaced `nil`)
- Added `SendTmuxSessions(sessions []TmuxSessionInfo)` to `Session` in `session.go`

### Evidence
```
$ go build ./...   ✅ Compiles
$ go test ./...    ✅ All packages pass (terminal, server, auth, config)
```

### Files Changed
- `backend/internal/server/server.go` — handleSessionsChanged, New() wiring
- `backend/internal/terminal/session.go` — SendTmuxSessions method

**Completed**: 2026-02-19 11:45
---

## Task T009: Wire request handler in terminal.go
**Started**: 2026-02-19 11:45
**Status**: ✅ Complete
**Dossier Task**: T009 | **Plan Task**: 1.8 (request part)

### What I Did
- Added `MsgTypeListTmuxSessions` case in `handleMessage()` switch
- Implemented `handleListTmuxSessions()`: calls `monitor.GetLastSessions()`, sends `tmux_sessions` response
- Handles nil monitor/server gracefully (returns empty session list)

### Evidence
```
$ go build ./...   ✅ Compiles
$ go test ./...    ✅ All packages pass
```

### Files Changed
- `backend/internal/server/terminal.go` — dispatch case + handler

**Completed**: 2026-02-19 11:46
---

## Task T010: Full backend test suite verification
**Started**: 2026-02-19 11:47
**Status**: ✅ Complete
**Dossier Task**: T010 | **Plan Task**: 1.9

### What I Did
- Ran `go test ./... -count=1` to verify zero regressions

### Evidence
```
$ cd backend && go test ./... -count=1
ok  github.com/vaughanknight/trex/internal/auth      0.923s
ok  github.com/vaughanknight/trex/internal/config    0.150s
ok  github.com/vaughanknight/trex/internal/server    0.794s
ok  github.com/vaughanknight/trex/internal/terminal  0.820s
✅ ALL PASS — zero regressions
```

### Files Changed
- None (verification only)

**Completed**: 2026-02-19 11:47
---

## Phase 1 Summary

All 10 tasks complete. New test count: 18 tests added (12 parser + 6 fake sessions + 5 monitor session list = 23, minus some that were part of the same test function).

### Files Modified
| File | Changes |
|------|---------|
| `backend/internal/terminal/tmux_detector.go` | `TmuxSessionInfo` struct, `ListSessions()` on interface + both impls, `parseTmuxSessions()`, `FakeTmuxDetector` session helpers, stale ADR-0001 comments cleaned |
| `backend/internal/terminal/tmux_detector_test.go` | `TestParseTmuxSessions` (12 cases), `TestFakeTmuxDetector_Sessions` (5), `TestFakeTmuxDetector_SessionsCopy` |
| `backend/internal/terminal/tmux_monitor.go` | `onSessionsChanged` callback, `lastSessions` cache, `pollSessions()`, `GetLastSessions()`, `sessionsEqual()`, `NewTmuxMonitor` 5-arg signature |
| `backend/internal/terminal/tmux_monitor_test.go` | 5 new session list tests, updated 8 existing callers to 5-arg form |
| `backend/internal/terminal/messages.go` | `MsgTypeTmuxSessions`, `MsgTypeListTmuxSessions` constants, `TmuxSessions` field on `ServerMessage` |
| `backend/internal/terminal/session.go` | `SendTmuxSessions()` method |
| `backend/internal/server/server.go` | `handleSessionsChanged()`, wired as monitor callback |
| `backend/internal/server/terminal.go` | `list_tmux_sessions` dispatch + `handleListTmuxSessions()` handler |
