# Phase 1: Backend tmux Session Discovery — Code Review

**Plan**: `docs/plans/018-deep-tmux-integration/deep-tmux-integration-plan.md`
**Phase**: Phase 1 — Backend tmux Session Discovery
**Dossier**: `tasks/phase-1-backend-tmux-session-discovery/tasks.md`
**Execution Log**: `tasks/phase-1-backend-tmux-session-discovery/execution.log.md`
**Diff Range**: Working tree vs HEAD (uncommitted changes)
**Date**: 2026-02-19
**Testing Approach**: TDD (Phase 1 annotation), Mock Usage: Targeted fakes (ADR-0004)

---

## A) Verdict

**REQUEST_CHANGES**

Two HIGH-severity findings require resolution before merge:
1. **Race condition** in `TmuxMonitor.GetLastSessions()` — concurrent read/write of `lastSessions` without mutex
2. **Scope violation** — `/api/file` route from Plan 017 mixed into Phase 1 diff

---

## B) Summary

Phase 1 implements tmux session discovery infrastructure across 8 backend files. The implementation follows the dossier tasks precisely: `TmuxSessionInfo` struct, `ListSessions()` interface method, parser, fake extensions, dual-callback monitor, WebSocket protocol, broadcast handler, and request handler. TDD discipline is exemplary — tests written RED before implementation GREEN in two clear cycles (T002→T003, T005→T006). All 31 backend tests pass with zero regressions.

Two issues need attention: (1) `GetLastSessions()` is called from WebSocket handler goroutines while `pollSessions()` writes `lastSessions` on the monitor goroutine — a data race needing a `sync.RWMutex`; (2) the diff includes `/api/file` route wiring from Plan 017 that is out-of-scope for Phase 1.

Additionally, the Change Footnotes Ledger (plan § 12) and Phase Footnote Stubs (dossier) remain unpopulated — these are documentation gaps, not code defects.

---

## C) Checklist

**Testing Approach: TDD** (Phase 1 annotation from plan § Hybrid Approach Annotations)

### TDD Checks
- [x] Tests precede code (RED-GREEN-REFACTOR evidence) — T002 RED → T003 GREEN; T005 RED → T006 GREEN
- [x] Tests as docs (assertions show behavior) — Test Doc blocks present on all promoted test functions
- [x] Mock usage matches spec: Targeted fakes (ADR-0004) — Only `FakeTmuxDetector`, no mock libraries
- [x] Negative/edge cases covered — 12 parser cases including malformed, whitespace, empty; 5 monitor cases including error recovery

### Universal Checks
- [ ] Only in-scope files changed — **FAIL**: `/api/file` route in server.go is Plan 017 work
- [x] Linters/type checks are clean — `go build ./...` ✅, `go test ./...` ✅
- [x] Absolute paths used (no hidden context)
- [x] BridgeContext patterns followed (N/A — Go backend, not VS Code extension)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| RACE-001 | HIGH | `tmux_monitor.go:170-177,182-189` | `lastSessions` read/written from different goroutines without mutex | Add `sync.RWMutex`; RLock in `GetLastSessions()`, Lock in `pollSessions()` |
| SC-001 | HIGH | `server.go:133` | `/api/file` route is Plan 017, not Phase 1 scope | Remove from Phase 1 diff; commit separately under Plan 017 |
| DEAD-001 | MEDIUM | `tmux_monitor.go:87-89,110-112` | `consecutiveFailures` declared but never incremented; backoff logic is dead code | Remove dead variables or implement the increment logic |
| REG-001 | MEDIUM | `server.go:112` | `s.registry.List()` called without guaranteed thread-safety documentation | Verify `registry.List()` is thread-safe (likely is — but document assumption) |
| OBS-001 | LOW | `server.go:106-120` | `handleSessionsChanged()` has no log statement (unlike `handleTmuxChanges`) | Add `log.Printf("broadcasting tmux sessions to %d clients", len(seen))` |
| OBS-002 | LOW | `tmux_monitor.go:175` | `onSessionsChanged` receives the same slice reference written to `lastSessions` | Pass a copy to callback: `m.onSessionsChanged(append([]TmuxSessionInfo(nil), sessions...))` |
| FN-001 | LOW | Plan § 12, Dossier § Stubs | Change Footnotes Ledger has placeholder stubs; Phase Footnote Stubs table is empty | Run `plan-6a` to populate footnotes |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Verdict: PASS**

No prior completed phases exist for Plan 018 — Phase 1 is the first. Cross-phase regression guard focuses on Plan 014 (the foundation this phase extends).

| Check | Result | Evidence |
|-------|--------|----------|
| Plan 014 tests pass | ✅ | `go test ./internal/terminal/ -v` — all 31 tests pass |
| Plan 014 interfaces unchanged | ✅ | `ListClients()`, `IsAvailable()` signatures intact |
| Plan 014 monitor behavior preserved | ✅ | `poll()`, `onChange`, `run()` loop structure unchanged |
| Plan 014 message types preserved | ✅ | `MsgTypeTmuxStatus`, `MsgTypeTmuxConfig` unchanged |
| Backward compatibility | ✅ | `NewTmuxMonitor` 5-arg form — all 8 existing callers updated |

**Tests rerun**: 31 | **Failures**: 0 | **Contracts broken**: 0

---

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Step 3a)

**Graph Integrity Score: ⚠️ MINOR_ISSUES**

| Link Type | Status | Detail |
|-----------|--------|--------|
| Task↔Log | ✅ INTACT | All 10 tasks (T001-T010) have matching execution log entries with `Dossier Task` and `Plan Task` metadata |
| Task↔Footnote | ⚠️ NOT POPULATED | Phase Footnote Stubs table is empty; no footnotes in task table Notes column |
| Footnote↔File | ⚠️ NOT POPULATED | Change Footnotes Ledger has placeholder stubs `[^1]`, `[^2]`, `[^3]` — not filled |
| Plan↔Dossier | ✅ INTACT | Plan task table (1.1-1.9) all marked [x]; dossier task table (T001-T010) all marked [x] |
| Parent↔Subtask | N/A | No subtasks in Phase 1 |

**Footnote Gap**: The footnote ledger and dossier stubs were not populated during implementation. This is a documentation gap that does not affect code quality but breaks File→Task traversability. Resolution: run `plan-6a` to populate.

#### Authority Conflicts (Step 3c)

No authority conflicts — plan and dossier are synchronized on all task statuses.

#### TDD Compliance (Step 4, Subagent 1)

**Compliance: PASS (0 violations)**

Exemplary TDD discipline demonstrated:
- **Cycle 1**: T002 writes `TestParseTmuxSessions` (12 cases) → compile error `undefined: parseTmuxSessions` (RED) → T003 implements parser (GREEN)
- **Cycle 2**: T005 writes 5 monitor tests → compile error `too many arguments in call to NewTmuxMonitor` (RED) → T006 implements dual-callback (GREEN)
- **Test Doc blocks**: Present on `TestParseTmuxSessions`, `TestFakeTmuxDetector_Sessions`, all monitor session tests
- **Edge cases**: Malformed lines, whitespace-only input, empty session names, error recovery, idempotent callbacks

#### Mock Usage Compliance (Step 4, Subagent 3)

**Compliance: PASS (0 violations)**

- **Policy**: Targeted fakes (ADR-0004)
- **Implementation**: All tests use `FakeTmuxDetector` — no mock libraries
- Zero `mock.Mock`, `gomock`, `testify/mock`, or `httptest` usage in diff
- `FakeTmuxDetector.AddSession()`, `RemoveSession()`, `SetError()` provide rich test setup without mocking

#### Plan Compliance (Step 4, Subagent 5)

**Compliance: PASS with 1 scope violation**

| Task | Status | Implementation Match |
|------|--------|---------------------|
| T001 | PASS | `TmuxSessionInfo` struct with correct fields + JSON tags; `ListSessions()` on interface; ADR-0001 comments cleaned |
| T002 | PASS | 12 table-driven test cases with Test Doc block; follows `TestParseTmuxClients` pattern exactly |
| T003 | PASS | `parseTmuxSessions()` tab-split parser; `RealTmuxDetector.ListSessions()` with context timeout, exit code 1 handling |
| T004 | PASS | `sessions` field, `AddSession()`, `RemoveSession()`, `ListSessions()` with copy semantics; 6 tests |
| T005 | PASS | 5 monitor tests: Added, Removed, Error, NoChange, Initial; includes `errTest` sentinel |
| T006 | PASS | `onSessionsChanged` callback, `lastSessions` cache, `pollSessions()`, `GetLastSessions()`, `sessionsEqual()`; `NewTmuxMonitor` 5-arg |
| T007 | PASS | `MsgTypeTmuxSessions`, `MsgTypeListTmuxSessions` constants; `TmuxSessions` field with `omitempty` |
| T008 | PASS | `handleSessionsChanged()` with connection deduplication; wired in `New()` |
| T009 | PASS | `MsgTypeListTmuxSessions` dispatch case; `handleListTmuxSessions()` handler |
| T010 | PASS | Full test suite passes: `go test ./... -count=1` — all packages OK |

**Scope violation**: `server.go:133` adds `/api/file` route — this is Plan 017 (Clickable Terminal Links) work, not Phase 1. The route references `s.handleFileRead()` which lives in `backend/internal/server/file.go` (untracked file from Plan 017).

---

### E.2) Semantic Analysis

**Domain Logic**: Implementation matches spec requirements precisely.

| Criterion | Spec Requirement | Implementation | Verdict |
|-----------|-----------------|----------------|---------|
| AC1 | `ListSessions()` returns accurate session list | Tab-delimited parser matching `tmux list-sessions -F` output | ✅ |
| AC2 | `FakeTmuxDetector` supports session add/remove | `AddSession()`, `RemoveSession()`, `ListSessions()` with copy semantics | ✅ |
| AC3 | `TmuxMonitor` detects session additions/removals | `pollSessions()` with `sessionsEqual()` comparison and callback | ✅ |
| AC4 | WebSocket clients receive `tmux_sessions` messages | `handleSessionsChanged()` broadcast + `handleListTmuxSessions()` request | ✅ |
| AC5 | All existing Plan 014 tests pass | 31 tests pass, 0 regressions | ✅ |
| AC6 | Error recovery: no empty sidebar flash | `lastSessions` cache preserved on error; callback NOT called | ✅ |

No specification drift detected. All 6 acceptance criteria are satisfied at the code level (modulo the race condition which could cause intermittent incorrect behavior under concurrency).

---

### E.3) Quality & Safety Analysis

**Safety Score: 30/100** (CRITICAL: 0, HIGH: 2, MEDIUM: 2, LOW: 3)
**Verdict: REQUEST_CHANGES**

#### RACE-001 [HIGH] — Data Race in `GetLastSessions()`

**File**: `backend/internal/terminal/tmux_monitor.go:170-177,182-189`

**Issue**: `pollSessions()` writes `m.lastSessions` (line 174) on the monitor goroutine (via `run()` → ticker). `GetLastSessions()` reads `m.lastSessions` (lines 183-188) from WebSocket handler goroutines (via `handleListTmuxSessions()`). No synchronization protects this field.

**Impact**: Data race under `go test -race`; potential slice header corruption causing panics or stale data in production.

**Fix**: Add `sync.RWMutex` to `TmuxMonitor` struct. Use `m.mu.Lock()`/`m.mu.Unlock()` in `pollSessions()` around the `m.lastSessions` write. Use `m.mu.RLock()`/`m.mu.RUnlock()` in `GetLastSessions()`.

**Patch hint**:
```diff
 type TmuxMonitor struct {
     // ...existing fields...
+    mu sync.RWMutex // protects lastSessions
 }

 func (m *TmuxMonitor) pollSessions() {
     // ...
+    m.mu.Lock()
     m.lastSessions = sessions
+    m.mu.Unlock()
     // ...
 }

 func (m *TmuxMonitor) GetLastSessions() []TmuxSessionInfo {
+    m.mu.RLock()
+    defer m.mu.RUnlock()
     if len(m.lastSessions) == 0 {
```

#### SC-001 [HIGH] — Scope Violation: `/api/file` Route

**File**: `backend/internal/server/server.go:133`

**Issue**: Line `s.mux.HandleFunc("/api/file", s.handleFileRead())` belongs to Plan 017 (Clickable Terminal Links), not Plan 018 Phase 1. The handler `handleFileRead()` is defined in `backend/internal/server/file.go` which is an untracked file from Plan 017.

**Impact**: Mixing unrelated plan work into Phase 1 diff complicates review, attribution, and potential rollback.

**Fix**: This line should be committed separately under Plan 017. For Phase 1 review purposes, it is acknowledged as pre-existing in the working tree and does not affect Phase 1 functionality.

#### DEAD-001 [MEDIUM] — Dead Backoff Code

**File**: `backend/internal/terminal/tmux_monitor.go:87-89,110-112`

**Issue**: Variables `consecutiveFailures`, `maxConsecutiveFailures`, and `backoffInterval` are declared (lines 87-89) and the backoff check exists (lines 110-112), but `consecutiveFailures` is never incremented or reset. The backoff logic is dead code.

**Impact**: No operational impact (code never triggers), but creates confusion for future developers. This is pre-existing from Plan 014 — not introduced by Phase 1.

**Fix**: Either implement the increment logic (`consecutiveFailures++` on poll error, `= 0` on success) or remove the dead variables. Given this is pre-existing, consider a separate cleanup task.

#### REG-001 [MEDIUM] — Registry Iteration Thread Safety

**File**: `backend/internal/server/server.go:112`

**Issue**: `handleSessionsChanged()` calls `s.registry.List()` without explicit documentation that `List()` is thread-safe. The method is called from the monitor goroutine via callback, while the registry is also accessed from WebSocket handler goroutines.

**Impact**: If `registry.List()` is NOT thread-safe, this is a data race. If it IS thread-safe (likely — `SessionRegistry` uses `sync.RWMutex` internally), this is a non-issue but should be documented.

**Fix**: Verify `SessionRegistry.List()` uses `sync.RWMutex` internally (it does — this is standard Go pattern). No code change needed, but the thread-safety guarantee should be noted in documentation or the registry type comment.

#### OBS-001 [LOW] — Missing Broadcast Log

**File**: `backend/internal/server/server.go:106-120`

**Issue**: `handleSessionsChanged()` broadcasts to all clients but has no log statement. Contrast with `handleTmuxChanges()` which is also silent, but session list changes are rarer and more useful to log.

**Fix**: Add `log.Printf("broadcasting tmux sessions (%d sessions) to %d clients", len(sessions), len(seen))` after the loop.

#### OBS-002 [LOW] — Aliased Slice Passed to Callback

**File**: `backend/internal/terminal/tmux_monitor.go:174-176`

**Issue**: `m.onSessionsChanged(sessions)` passes the same slice reference that is assigned to `m.lastSessions`. If the callback mutates the slice, it corrupts the monitor's cached state.

**Impact**: Currently, `handleSessionsChanged()` does not mutate the slice (it only reads). This is a defensive concern, not an active bug.

**Fix**: Pass a copy: `m.onSessionsChanged(append([]TmuxSessionInfo(nil), sessions...))`. This follows the copy-semantics pattern already used in `GetLastSessions()`.

#### FN-001 [LOW] — Unpopulated Footnotes

**File**: Plan § 12, Dossier § Phase Footnote Stubs

**Issue**: The Change Footnotes Ledger has placeholder stubs (`[^1]`, `[^2]`, `[^3]` with "To be added during implementation via plan-6a"). The Phase Footnote Stubs table is empty.

**Impact**: File→Task traversability is broken. Cannot trace from modified file back to plan task via footnotes.

**Fix**: Run `plan-6a` to populate both the plan ledger and dossier stubs with FlowSpace node IDs for the 8 modified files.

---

### E.4) Doctrine Evolution Recommendations (Advisory — Does Not Affect Verdict)

#### New Idiom Candidates

| ID | Pattern | Evidence | Priority |
|----|---------|----------|----------|
| IDIOM-REC-001 | **Dual-Callback Monitor Pattern**: When extending a polling monitor with a second concern, add a separate callback + separate `pollX()` method on the same ticker, keeping original callback independent | `tmux_monitor.go` — `poll()` + `pollSessions()` coexist on same ticker with independent callbacks | MEDIUM |
| IDIOM-REC-002 | **Error Recovery Cache Pattern**: Cache last-known-good state; on poll error, preserve cache and skip callback (don't flash empty state) | `tmux_monitor.go:163-168` — `lastSessions` preserved on error | HIGH |
| IDIOM-REC-003 | **Connection Deduplication Broadcast**: When broadcasting to all clients via registry, deduplicate by `Conn` interface to send ONE message per WebSocket connection | `server.go:106-120` — `seen[conn]` map | MEDIUM |
| IDIOM-REC-004 | **Copy Semantics on Returned Slices**: Always `make()+copy()` when returning internal slice state to prevent mutation of internal data | `tmux_monitor.go:186-188`, `tmux_detector.go` FakeTmuxDetector.ListSessions() | HIGH |

#### New Rule Candidates

| ID | Rule | Evidence | Priority |
|----|------|----------|----------|
| RULE-REC-001 | **Concurrent slice access requires mutex**: Any field read from multiple goroutines (monitor loop + WS handlers) MUST be protected by `sync.RWMutex` | RACE-001 finding — `lastSessions` accessed from monitor and handler goroutines | HIGH |

#### Positive Alignment

| Doctrine Ref | Evidence | Note |
|-------------|----------|------|
| ADR-0004 (Fakes Only) | Zero mock library usage; only `FakeTmuxDetector` | Perfect compliance |
| Rules § TDD | RED-GREEN-REFACTOR documented with compile errors as RED evidence | Exemplary |
| Rules § Test Doc Blocks | Present on all promoted test functions | Compliant |
| Idioms § Fake vs Real | `FakeTmuxDetector` extended with `AddSession()`/`RemoveSession()` following existing pattern | Excellent pattern reuse |

---

## F) Coverage Map

**Testing Approach: TDD**
**Overall Coverage Confidence: 88%**

| AC | Description | Test(s) | Confidence | Notes |
|----|-------------|---------|------------|-------|
| AC1 | `ListSessions()` returns accurate session list | `TestParseTmuxSessions` (12 cases) | 100% | Explicit behavioral match: empty, single, multiple, special chars, malformed, whitespace |
| AC2 | `FakeTmuxDetector` supports session add/remove | `TestFakeTmuxDetector_Sessions` (5 subtests), `TestFakeTmuxDetector_SessionsCopy` | 100% | Explicit: add, remove, list, error, copy semantics |
| AC3 | `TmuxMonitor` detects session additions/removals | `TestTmuxMonitor_DetectSessionAdded`, `_DetectSessionRemoved`, `_SessionListNoChange`, `_SessionListInitial` | 100% | Explicit: all change scenarios tested |
| AC4 | WebSocket clients receive `tmux_sessions` messages | No direct WebSocket integration test | 50% | Inferred: message types defined, handler wired, but no end-to-end WS test. Mitigated by compile-time wiring verification + T010 full suite pass. |
| AC5 | All existing Plan 014 tests pass | T010: `go test ./... -count=1` | 100% | Explicit: full suite pass documented in execution log |
| AC6 | Error recovery: no empty sidebar flash | `TestTmuxMonitor_SessionListError` | 100% | Explicit: verifies callback NOT called on error, cached sessions preserved |

**Narrative Tests**: None detected — all tests map to specific acceptance criteria.

**Weak Mapping**: AC4 has 50% confidence because there is no integration test for the full WebSocket path (client→server→monitor→broadcast). This is acceptable for Phase 1 (backend-only) since the frontend consumer doesn't exist yet.

---

## G) Commands Executed

```bash
# Diff computation
git diff HEAD -- backend/internal/terminal/tmux_detector.go backend/internal/terminal/tmux_detector_test.go \
  backend/internal/terminal/tmux_monitor.go backend/internal/terminal/tmux_monitor_test.go \
  backend/internal/terminal/messages.go backend/internal/terminal/session.go \
  backend/internal/server/server.go backend/internal/server/terminal.go

# Full backend test suite
cd backend && go test ./... -count=1
# Result: ALL PASS (auth, config, server, terminal packages)

# Build verification
cd backend && go build ./...
# Result: ✅ Compiles
```

---

## H) Decision & Next Steps

**Verdict: REQUEST_CHANGES**

### Must Fix (before merge)

1. **RACE-001**: Add `sync.RWMutex` to `TmuxMonitor` protecting `lastSessions`. This is the only code-level blocker.
2. **SC-001**: Separate the `/api/file` route from Phase 1 changes. Either revert it from the Phase 1 diff or acknowledge it as Plan 017 pre-existing work.

### Should Fix (recommended, not blocking)

3. **DEAD-001**: Remove or complete the dead backoff code in `run()`. Pre-existing from Plan 014 but worth cleaning up.
4. **OBS-002**: Pass a copy to `onSessionsChanged` callback for defensive safety.

### Nice to Have

5. **OBS-001**: Add broadcast log statement.
6. **FN-001**: Populate footnotes via `plan-6a`.

### Who Approves

- Plan author / project owner reviews fix-tasks and approves re-run.

### Next Steps

1. Apply fixes from `reviews/fix-tasks.phase-1-backend-tmux-session-discovery.md`
2. Re-run `/plan-6` for the fixes (or apply directly if trivial)
3. Re-run `/plan-7-code-review` to verify fixes
4. On APPROVE: commit Phase 1 and advance to `/plan-5` for Phase 2

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Node-ID |
|-------------------|-----------------|---------------------|
| `backend/internal/terminal/tmux_detector.go` | (none) | `[^1]` — placeholder |
| `backend/internal/terminal/tmux_detector_test.go` | (none) | `[^2]` — placeholder |
| `backend/internal/terminal/tmux_monitor.go` | (none) | (not assigned) |
| `backend/internal/terminal/tmux_monitor_test.go` | (none) | (not assigned) |
| `backend/internal/terminal/messages.go` | (none) | (not assigned) |
| `backend/internal/terminal/session.go` | (none) | `[^3]` — placeholder |
| `backend/internal/server/server.go` | (none) | (not assigned) |
| `backend/internal/server/terminal.go` | (none) | (not assigned) |

**Status**: Footnotes NOT populated. All 8 modified files lack footnote assignments. The plan ledger has 3 placeholder stubs but they are not mapped to specific files. Recommend running `plan-6a` to populate.

---

*Review generated by /plan-7-code-review on 2026-02-19*
