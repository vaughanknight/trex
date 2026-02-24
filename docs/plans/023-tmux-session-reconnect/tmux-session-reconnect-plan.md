# Session Reconnect & Full URL State Persistence — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-24
**Spec**: [./tmux-session-reconnect-spec.md](./tmux-session-reconnect-spec.md)
**Research**: [./research-dossier.md](./research-dossier.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Phase 1: Backend cwd Detection & WebSocket Changes](#phase-1-backend-cwd-detection--websocket-changes)
6. [Phase 2: JSON URL Codec & Compression](#phase-2-json-url-codec--compression)
7. [Phase 3: tmux Reconnection & cwd Restore](#phase-3-tmux-reconnection--cwd-restore)
8. [Phase 4: Documentation & Polish](#phase-4-documentation--polish)
9. [Cross-Cutting Concerns](#cross-cutting-concerns)
10. [Complexity Tracking](#complexity-tracking)
11. [Progress Tracking](#progress-tracking)
12. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Users lose all terminal context on every page reload. tmux sessions survive on the server but trex creates fresh terminals. Working directories reset to `$HOME`. Layout names disappear.

**Solution**:
- Backend detects and reports cwd per session (platform-specific: Linux `/proc`, macOS `lsof`)
- URL encoding moves from prefix notation to gzip-compressed JSON with per-pane metadata
- tmux panes silently reconnect on reload; regular sessions restore shell type + cwd
- fflate library for gzip compression (~94.5% reduction proven in spike)

**Expected Outcomes**:
- tmux sessions reconnect seamlessly across page reloads
- Regular sessions start in their last working directory
- URL captures complete workspace state (names, focus, pane metadata)
- Prefix notation (`H50bz`) completely removed from codebase

**Complexity**: CS-4 (large) — S=2, I=1, D=2, N=1, F=1, T=1

---

## Technical Context

### Current System State
- URL encoding uses prefix notation (`H50bz`) via `layoutCodec.ts` — cannot store per-pane metadata
- `workspaceCodec.ts` wraps layouts in base64url JSON (`{v:1, a:0, i:[...]}`)
- Sessions are ephemeral — new IDs on every page reload
- tmux metadata (`tm`, `tw`) stored at item level, not per-pane
- Backend has no cwd detection — sessions always start in `$HOME`
- `useURLSync.ts` creates fresh sessions on reload, never reconnects

### Integration Requirements
- Backend Go: cwd detection (platform-specific), WebSocket message changes
- Frontend: fflate compression library (new dependency), codec rewrite, URL sync changes
- Session store: add `cwd` field
- No backend API endpoint changes — all via WebSocket

### Constraints
- **ADR-0004**: Fakes only, no mocks (FakeCwdDetector for Go tests)
- **ADR-0010**: Prefix notation being replaced entirely (superseded)
- **No backward compat**: Old URLs break (alpha, single user)
- **Platform**: Must work on macOS (primary dev) and Linux

### Assumptions
1. Alpha product, single user — no migration path needed
2. tmux server is always local (same machine as trex backend)
3. Go can detect child process cwd via `/proc/pid/cwd` (Linux) and `lsof -p pid` or `proc_pidinfo` (macOS)
4. fflate library works in both browser and Node/Vitest test environments

### Gate Validation

**Clarify Gate**: ✅ All 7 questions resolved (C1-C7). 0 open questions.

**Constitution Gate**: ✅ No deviations needed.

**Architecture Gate**: ✅ Backend changes are within existing terminal handler. Frontend changes are within existing codec/sync layer.

**ADR Ledger**:

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Active | All phases | Fakes only. Create FakeCwdDetector for Go backend tests. |
| ADR-0010 | Superseded by ADR-0012 | Phase 2 | Prefix notation replaced by compressed JSON. |
| ADR-0011 | Active | Phase 2, 3 | Unified layout architecture — all items are layouts. Per-pane metadata fits naturally. |
| ADR-0012 | Active | Phase 2 | Compressed JSON URL encoding. fflate gzip + base64url. |

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Backend cwd Detection Is Platform-Specific
**Impact**: Critical
**Sources**: [I1-02, R1-03]
**Problem**: Go stdlib has no cross-platform cwd detection for child processes. Linux uses `/proc/pid/cwd` symlink; macOS has no procfs.
**Solution**: Use `os.Readlink("/proc/pid/cwd")` on Linux. On macOS, use `lsof -a -p <pid> -d cwd -Fn` (outputs cwd as `n/path`). Both wrapped in `CwdDetector` interface with `FakeCwdDetector` for tests.
**Action Required**: Create `backend/internal/terminal/cwd.go` with platform-specific implementations and interface.
**Affects Phases**: Phase 1

### 🚨 Critical Discovery 02: WebSocket Message Needs cwd Field
**Impact**: Critical
**Sources**: [I1-03]
**Problem**: `ServerMessage` struct has no `Cwd` field. Session creation response doesn't include working directory.
**Solution**: Add `Cwd string` to `ServerMessage`. Backend populates on `session_created` and periodic `cwd_update` messages. Frontend captures in session store.
**Action Required**: Update `messages.go`, `terminal.go`, frontend WebSocket handler.
**Affects Phases**: Phase 1

### 🚨 Critical Discovery 03: URL Codec Requires Coordinated 3-File Rewrite
**Impact**: Critical
**Sources**: [I1-05, R1-01, R1-02]
**Problem**: `layoutCodec.ts` (15 tests), `workspaceCodec.ts` (49 tests), and `useURLSync.ts` form a coupled system. All must change simultaneously.
**Solution**: Replace `layoutCodec.ts` entirely — JSON tree encoding is inline in `workspaceCodec.ts`. Delete prefix notation. Rewrite all 64+ tests. Install fflate for compression.
**Action Required**: Phase 2 rewrites codec layer completely.
**Affects Phases**: Phase 2

### 🔴 High Discovery 04: Regular Session cwd Restore Needs Backend cd Support
**Impact**: High
**Sources**: [I1-08]
**Problem**: Backend `createSession` starts shells in `$HOME`. There's no mechanism to set initial cwd.
**Solution**: Add `Cwd` field to `ClientMessage` create request. Backend uses `Setenv("PWD", cwd)` + starts shell with cwd as working directory via `os.Chdir` or `cmd.Dir`.
**Action Required**: Update create message handling in backend; frontend passes cwd from URL.
**Affects Phases**: Phase 3

### 🔴 High Discovery 05: tmux Reconnection Must Bypass Confirmation Dialog
**Impact**: High
**Sources**: [I1-06]
**Problem**: `useURLSync.ts` shows confirmation dialog for multi-session URLs. tmux reconnection should be silent.
**Solution**: Distinguish "fresh URL navigation" (show dialog) from "page reload with tmux sessions" (silent). Count only new sessions for confirmation; tmux reconnections are exempt.
**Action Required**: Update `useURLSync.ts` confirmation logic.
**Affects Phases**: Phase 3

### 🔴 High Discovery 06: JSON Tree Schema Must Be Compact
**Impact**: High
**Sources**: [I1-07]
**Problem**: Full JSON trees are ~40x larger than prefix notation per leaf.
**Solution**: Use short keys (`s` for split, `d` for direction, `r` for ratio, `f`/`e` for first/second, `sh` for shell, `c` for cwd, `tm` for tmux, `tw` for tmux window). Compression spike proved 94.5% reduction.
**Action Required**: Design compact JSON schema with short keys.
**Affects Phases**: Phase 2

### 🟡 Medium Discovery 07: Session Store cwd Field Is Purely Additive
**Impact**: Medium
**Sources**: [I1-04]
**Problem**: Session store needs `cwd` field for per-session cwd tracking.
**Solution**: Add optional `cwd?: string` to Session interface. Zero breaking changes.
**Action Required**: Update `sessions.ts` interface and `addSession` call sites.
**Affects Phases**: Phase 1

### 🟡 Medium Discovery 08: SessionEndedOverlay Handles Dead tmux Gracefully
**Impact**: Medium
**Sources**: [R1-06]
**Problem**: If tmux session died between page loads, pane needs to show overlay.
**Solution**: When `createTmuxSession` fails (backend returns error or session exits immediately), set exit code to trigger `SessionEndedOverlay`. Add "tmux session not found" message variant.
**Action Required**: Update error handling in tmux reconnection flow.
**Affects Phases**: Phase 3

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Hybrid (per spec C2)
- **TDD phases**: Phase 1 (backend cwd Go tests), Phase 2 (codec round-trip tests)
- **Lightweight phases**: Phase 3 (tmux reconnection — manual verification), Phase 4 (docs)
- **Rationale**: Codec and backend are high regression risk; reconnection flow is integration-level

### Mock Usage
- **Policy**: Fakes only (ADR-0004, spec C3)
- **New fakes**: `FakeCwdDetector` (Go backend), provides deterministic cwd responses
- **Existing fakes**: FakeWebglAddon, FakeGPUContext (unchanged)

### Test Commands Reference
```bash
# Backend Go tests
cd backend && go test ./internal/terminal/... -v

# Frontend full test suite
cd frontend && npx vitest run --reporter=verbose

# Frontend codec tests only
cd frontend && npx vitest run src/lib/__tests__/workspaceCodec.test.ts --reporter=verbose

# Frontend build
cd frontend && npm run build
```

---

## Phase 1: Backend cwd Detection & WebSocket Changes

**Objective**: Backend detects and reports working directory per session. WebSocket messages carry cwd data.

**Testing**: TDD — write Go tests first with FakeCwdDetector.

**Deliverables**:
- `CwdDetector` interface with platform-specific implementations
- `FakeCwdDetector` for testing
- `Cwd` field in `ServerMessage` and `ClientMessage`
- cwd reported on `session_created` and periodic `cwd_update` messages
- Configurable polling interval (default 5s, 0 = disabled)
- Frontend session store `cwd` field

**Dependencies**: None (foundational)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| macOS cwd detection fails | Medium | High | Fallback to empty string; cwd becomes optional |
| Polling performance at scale | Low | Medium | Default 5s interval; 0 disables polling |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Create `CwdDetector` interface + `FakeCwdDetector` | 2 | Interface defined with `DetectCwd(pid int) (string, error)`. Fake returns configurable values. Go tests pass. | - | `backend/internal/terminal/cwd.go` |
| 1.2 | [ ] | Implement Linux cwd detection | 2 | `os.Readlink("/proc/<pid>/cwd")` returns correct cwd. Falls back to empty string on error. | - | Build-tagged `cwd_linux.go` |
| 1.3 | [ ] | Implement macOS cwd detection | 2 | Uses `lsof -a -p <pid> -d cwd -Fn` to detect cwd. Parses output. Falls back to empty string. | - | Build-tagged `cwd_darwin.go` |
| 1.4 | [ ] | Add `Cwd` to WebSocket messages | 1 | `ServerMessage.Cwd` and `ClientMessage.Cwd` fields added. JSON tags set. | - | `backend/internal/terminal/messages.go` |
| 1.5 | [ ] | Report cwd on session creation | 2 | `session_created` response includes initial cwd. Frontend receives it. | - | `backend/internal/server/terminal.go` |
| 1.6 | [ ] | Add periodic cwd polling | 2 | Goroutine polls cwd at configurable interval. Sends `cwd_update` message. Interval 0 disables. | - | New goroutine per session |
| 1.7 | [ ] | Add `cwd` to frontend session store | 1 | `Session` interface has `cwd?: string`. WebSocket handler captures from `session_created` and `cwd_update`. | - | `frontend/src/stores/sessions.ts` + WebSocket handler |
| 1.8 | [ ] | Backend tests pass | 1 | `go test ./internal/terminal/... -v` — all pass including new cwd tests. | - | |

### Acceptance Criteria
- [ ] CwdDetector interface with FakeCwdDetector: `go test ./internal/terminal/... -run TestCwd -v` shows ≥4 PASS
- [ ] Platform-specific cwd detection: `os.Readlink` (Linux) or `lsof` (macOS) returns valid path for running process
- [ ] `session_created` includes cwd: WebSocket message JSON contains `"cwd":"/some/path"` field
- [ ] Periodic cwd updates: `cwd_update` message type sent at configured interval. Verify: start session, `cd /tmp`, wait interval, check session store `cwd === "/tmp"`
- [ ] Frontend session store tracks cwd: `useSessionStore.getState().sessions.get(id).cwd` is non-empty string
- [ ] Backend tests pass: `cd backend && go test ./... -v` — 0 failures

---

## Phase 2: JSON URL Codec & Compression

**Objective**: Replace prefix notation with gzip-compressed JSON tree encoding. Install fflate. Full round-trip fidelity.

**Testing**: TDD — write round-trip tests first, then implement codec.

**Deliverables**:
- fflate installed as dependency
- `workspaceCodec.ts` rewritten for JSON tree encoding with compression
- `layoutCodec.ts` deleted (prefix notation removed)
- All codec tests rewritten for JSON format
- Round-trip fidelity verified

**Dependencies**: Phase 1 complete (cwd field available in session store)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| fflate not compatible with Vitest | Low | High | Test in setup; fallback to pako |
| JSON schema too verbose | Low | Low | Use short keys + compression; spike proved <2300 chars for 100 items |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Install fflate | 1 | `npm install fflate` succeeds. Import works in Vitest and browser. | - | ~13KB bundled |
| 2.2 | [ ] | Design JSON tree schema | 2 | Schema defined with short keys. Document: split nodes, terminal leaves, tmux leaves, preview leaves. All metadata fields included. | - | Compact keys: `s`=split, `d`=dir, `r`=ratio, `1`=first, `2`=second, `t`=terminal, `sh`=shell, `c`=cwd, `tm`=tmux, `tw`=window |
| 2.3 | [ ] | Write round-trip tests (TDD RED) | 3 | Tests cover: 1-pane, multi-pane, mixed tmux/regular, cwd paths, userRenamed, empty workspace, max panes. All FAIL initially. | - | ~20 round-trip tests |
| 2.4 | [ ] | Implement JSON codec with fflate compression | 3 | `encodeWorkspace()`: JSON → gzip → base64url. `decodeWorkspace()`: reverse. All round-trip tests PASS. | - | Replace `workspaceCodec.ts` internals |
| 2.5 | [ ] | Delete `layoutCodec.ts` and all prefix notation code | 2 | File deleted. No imports remain. All `serializeLayout`/`parseLayout` references removed. | - | ~15 tests deleted |
| 2.6 | [ ] | Rewrite codec tests | 3 | All workspace codec tests pass with JSON format. tmux metadata tests updated. Schema validation tests updated. | - | ~49 tests rewritten |
| 2.7 | [ ] | Update `useURLSync.ts` to use new codec | 2 | URL sync uses JSON codec. No prefix notation references. Sessions created from decoded JSON tree. | - | |
| 2.8 | [ ] | Verify build + full test suite | 1 | `npm run build` clean. `npx vitest run` — all tests pass. | - | |

### Acceptance Criteria
- [ ] Prefix notation removed: `grep -r "H50bz\|serializeLayout\|parseLayout\|layoutCodec" frontend/src/ | grep -v __tests__ | wc -l` = 0
- [ ] fflate compression works: `npx vitest run src/lib/__tests__/workspaceCodec.test.ts` — all pass, verify gzip/gunzip round-trip
- [ ] Round-trip fidelity: encode→decode produces identical workspace state for ≥10 test scenarios
- [ ] Per-pane metadata encoded: JSON tree leaves contain `sh`, `c`, `tm`, `tw` fields
- [ ] Item state encoded: JSON items contain `n`, `ur`, `fp` fields
- [ ] All tests pass: `npx vitest run` — 0 failures. `npm run build` — 0 errors

---

## Phase 3: tmux Reconnection & cwd Restore

**Objective**: tmux panes silently reconnect on page reload. Regular sessions start in restored cwd. Dead tmux shows overlay.

**Testing**: Lightweight — manual verification with dev servers.

**Deliverables**:
- tmux panes reconnect to existing server-side sessions on reload
- Regular sessions start in restored cwd (backend `cmd.Dir`)
- Dead tmux sessions show SessionEndedOverlay
- Mixed layouts handle independently

**Dependencies**: Phase 1 + Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| tmux session dies during reconnect | Medium | Medium | SessionEndedOverlay with error message |
| cwd directory deleted between reloads | Low | Low | Fallback to $HOME (per C6) |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Update `useURLSync.ts` for tmux reconnection | 3 | When decoding URL with tmux pane metadata, calls `createTmuxSession(name, window)` instead of `createSession()`. Silent — no confirmation dialog for tmux panes. | - | Per Discovery 05 |
| 3.2 | [ ] | Update backend create handler for initial cwd | 2 | `ClientMessage.Cwd` field used to set `cmd.Dir` before shell start. Shell starts in specified cwd. Falls back to $HOME if cwd invalid. | - | Per Discovery 04 |
| 3.3 | [ ] | Update `useURLSync.ts` to pass cwd on session create | 2 | Regular session creation passes `cwd` from decoded URL pane metadata. Backend receives cwd in create message. | - | |
| 3.4 | [ ] | Handle dead tmux sessions | 2 | When `createTmuxSession` fails or session exits immediately, pane shows SessionEndedOverlay with "tmux session not found" message. | - | Per Discovery 08 |
| 3.5 | [ ] | Mixed layout independent reconnection | 2 | Each pane in a layout creates/reconnects independently. Failure of one pane doesn't affect others. | - | Per AC-09 |
| 3.6 | [ ] | Manual testing: tmux reconnection | 1 | Create tmux session → add to layout → reload page → pane reconnects to same tmux session. Verify with `tmux list-clients`. | - | Chrome DevTools available |
| 3.7 | [ ] | Manual testing: cwd restore | 1 | Create session → `cd /tmp` → reload → new session starts in `/tmp`. | - | |
| 3.8 | [ ] | Manual testing: dead tmux | 1 | Create tmux session → add to layout → kill tmux → reload → overlay shows. | - | |

### Acceptance Criteria
- [ ] tmux reconnect: create tmux session → add to layout → reload page → `tmux list-clients` shows trex re-attached
- [ ] Dead tmux overlay: kill tmux session → reload → pane shows SessionEndedOverlay with error message
- [ ] cwd restore: `cd /tmp` → reload → `pwd` in new session outputs `/tmp`
- [ ] Mixed layout: 3-pane layout (tmux + bash + dead tmux) → reload → each pane behaves independently
- [ ] Manual tests pass: tasks 3.6-3.8 verified via Chrome DevTools + terminal commands

---

## Phase 4: Documentation & Polish

**Objective**: Update architecture docs, clean up deprecated code, final verification.

**Testing**: Lightweight — build + full test suite.

**Deliverables**:
- Updated `docs/how/workspace-architecture.md` with JSON encoding and reconnection
- Deprecated code removed (prefix notation remnants)
- Final test suite green

**Dependencies**: Phase 3 complete

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Update `docs/how/workspace-architecture.md` | 2 | JSON URL encoding documented. Reconnection behavior documented. cwd persistence documented. Compression details noted. | - | Per Documentation Strategy C4 |
| 4.2 | [ ] | Remove any remaining prefix notation references | 1 | `grep -r "H50bz\|serializeLayout\|parseLayout\|layoutCodec" frontend/src/` returns nothing (excluding test snapshots). | - | Cleanup |
| 4.3 | [ ] | Final build + test verification | 1 | `npm run build` clean. `npx vitest run` — all tests pass. `go test ./...` — all pass. | - | |

### Acceptance Criteria
- [ ] Architecture docs updated: `docs/how/workspace-architecture.md` contains sections on JSON encoding, reconnection, cwd detection
- [ ] No prefix notation remnants: `grep -r "H50bz\|serializeLayout\|parseLayout\|layoutCodec" frontend/src/` returns 0 matches
- [ ] All tests pass: `npx vitest run` — 0 failures. `npm run build` — 0 errors. `cd backend && go test ./... -v` — 0 failures

---

## Cross-Cutting Concerns

### Security Considerations
- tmux session names validated on backend (regex: `^[^\x00-\x1f\x7f]+$`, max 256 chars — already implemented)
- cwd paths from URLs validated: must be absolute path, no path traversal (backend rejects relative paths)
- Compressed URL data is base64url-encoded — no injection risk

### Observability
- Backend logs cwd detection failures at WARN level
- Backend logs tmux reconnection attempts at INFO level
- Frontend logs codec errors to console.warn

### Documentation
- **Location**: `docs/how/workspace-architecture.md` (update existing)
- **Content**: Add sections for JSON URL encoding, per-pane metadata schema, tmux reconnection flow, cwd detection, compression
- **Target Audience**: Future contributors

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|--------------------------|---------------|------------|
| Backend cwd detection | 3 | Medium | S=1,I=1,D=1,N=1,F=0,T=1 | Platform-specific Go code; Linux/macOS divergence | FakeCwdDetector; graceful fallback to empty string |
| JSON URL codec | 3 | Medium | S=1,I=0,D=2,N=1,F=0,T=2 | Complete format change; 64+ tests to rewrite; fflate integration | TDD round-trip tests; compression spike validated |
| tmux reconnection | 3 | Medium | S=2,I=1,D=1,N=0,F=1,T=1 | Backend+frontend coordination; race conditions; dead session handling | Manual testing with dev servers; SessionEndedOverlay fallback |

---

## Progress Tracking

### Phase Completion Checklist
- [ ] Phase 1: Backend cwd Detection & WebSocket Changes - Not Started
- [ ] Phase 2: JSON URL Codec & Compression - Not Started
- [ ] Phase 3: tmux Reconnection & cwd Restore - Not Started
- [ ] Phase 4: Documentation & Polish - Not Started

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
