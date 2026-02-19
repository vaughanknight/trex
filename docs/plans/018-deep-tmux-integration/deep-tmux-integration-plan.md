# Deep tmux Integration Implementation Plan

**Plan Version**: 1.1.0
**Created**: 2026-02-18
**Spec**: [./deep-tmux-integration-spec.md](./deep-tmux-integration-spec.md)
**Status**: DRAFT
**Mode**: Full
**File Management**: Legacy

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Constitution & Architecture Gates](#constitution--architecture-gates)
6. [ADR Ledger](#adr-ledger)
7. [Implementation Phases](#implementation-phases)
   - [Phase 1: Backend tmux Session Discovery](#phase-1-backend-tmux-session-discovery)
   - [Phase 2: Backend tmux-Attach Session Creation](#phase-2-backend-tmux-attach-session-creation)
   - [Phase 3: Frontend Sidebar & Click-to-Attach](#phase-3-frontend-sidebar--click-to-attach)
   - [Phase 4: Drag-and-Drop tmux Sessions into Panes](#phase-4-drag-and-drop-tmux-sessions-into-panes)
   - [Phase 5: URL Encoding & Auto-Reconnect](#phase-5-url-encoding--auto-reconnect)
   - [Phase 6: Polish — Visual Indicators, Settings, Death Detection](#phase-6-polish--visual-indicators-settings-death-detection)
8. [Cross-Cutting Concerns](#cross-cutting-concerns)
9. [Complexity Tracking](#complexity-tracking)
10. [Progress Tracking](#progress-tracking)
11. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Users running tmux sessions (especially for Claude Code, long-running builds, and dev workflows) must manually type `tmux attach -t <name>` every time they create a new trex terminal. This is repetitive, error-prone, and disconnects tmux from the visual workspace model that trex provides.

**Solution approach**:
- Extend the existing Plan 014 `TmuxDetector`/`TmuxMonitor` infrastructure with `ListSessions()` to discover available tmux sessions
- Add tmux-target session creation to the backend (spawn `tmux attach -t <name>` in PTY with `TMUX` env var stripping)
- Build a dedicated "tmux sessions" sidebar section with click-to-attach and drag-to-pane
- Extend the workspace URL codec to encode tmux session name + window index for auto-reconnect on refresh
- Add visual differentiation, settings toggle, session death detection, and configurable socket support

**Expected outcomes**:
- Single-click or drag tmux attachment from sidebar
- Full URL persistence and auto-reconnect for tmux sessions
- Graceful lifecycle (close pane = detach, not kill)
- Feature hidden when tmux unavailable

**Success metrics**: All 12 acceptance criteria from spec satisfied.

---

## Technical Context

### Current System State
- **Plan 014 infrastructure (complete)**: `TmuxDetector` interface (`ListClients()`, `IsAvailable()`), `TmuxMonitor` polling loop (2s default), `FakeTmuxDetector`, `Session.TmuxSessionName` field, `Registry.ListByTmuxSession()`
- **Session creation flow**: WebSocket `create` → `NewUnstartedPTY()` → deferred `StartShell()` on first resize → shell at correct dimensions
- **Workspace model**: `WorkspaceItem[]` with `WorkspaceSessionItem` (standalone) and `WorkspaceLayoutItem` (split tree)
- **URL codec v2**: Base64url JSON (`?w=<base64>`) with single-char keys, schema v1

### Integration Requirements
- **tmux CLI**: Only external dependency. Commands: `tmux list-sessions`, `tmux attach -t <name>:<window>`
- **WebSocket protocol**: Extend `ClientMessage`/`ServerMessage` with tmux-specific fields and new message types
- **Workspace codec**: Additive extension with optional `tm` (tmux name) and `tw` (window index) fields

### Constraints and Limitations
- Must strip `TMUX` and `TMUX_PANE` env vars when spawning tmux-attach PTYs (nested tmux prevention)
- Multi-client resize: standard tmux behavior, not a trex concern
- Polling-based discovery: ~5s latency for session list changes
- tmux session names may contain dots, hyphens, underscores (must survive URL encoding)

### Assumptions
- Plan 014 infrastructure is stable and ready to extend
- `tmux attach -t <name>` inside a Go-spawned PTY works correctly
- Raw CLI calls sufficient (gotmux library evaluation confirmed this)
- URL backward compatibility maintained via additive-only schema changes

---

## Critical Research Findings

Findings synthesized from 2 research subagents (implementation strategy + risk analysis), the research dossier (65+ findings), and external research (gotmux evaluation, control mode parser).

### 01: TMUX Environment Variable Stripping is Critical
**Impact**: Critical
**Sources**: [R1-01, I1-04, Research Dossier §Critical Discoveries]
**Problem**: When trex runs inside tmux (common dev setup), spawned PTY shells inherit `TMUX`/`TMUX_PANE` env vars. Running `tmux attach` with these set causes: `"sessions should be nested with care, unset $TMUX to force"`.
**Solution**: Create `filterTmuxEnv(env []string) []string` helper that strips **all `TMUX`-prefixed** env vars (not just `TMUX` and `TMUX_PANE` — also `TMUX_PLUGIN_MANAGER_PATH`, `TMUX_TMPDIR`, etc.). The attached tmux session sets its own `TMUX_*` vars fresh. Call only for tmux-attach sessions, not regular shells.
**Example**:
```go
// ❌ WRONG — inherits TMUX env vars, tmux refuses to attach
cmd.Env = append(os.Environ(), "TERM=xterm-256color")

// ✅ CORRECT — strip all TMUX-prefixed vars for tmux-attach sessions
cmd.Env = append(filterTmuxEnv(os.Environ()), "TERM=xterm-256color")

// filterTmuxEnv strips all env vars with "TMUX" prefix
func filterTmuxEnv(env []string) []string { ... strings.HasPrefix(key, "TMUX") ... }
```
**Action Required**: Implement env filtering in `real_pty.go`; apply only when tmux target is specified.
**Affects Phases**: Phase 2

### 02: Terminal Lifecycle Must Distinguish Detach from Close
**Impact**: Critical
**Sources**: [R1-08, Research Dossier Q6]
**Problem**: Current terminal cleanup kills the PTY process on pane close. For tmux-attached sessions, this should **detach** (tmux session survives) rather than kill. The `onExit` handler and `SessionEndedOverlay` must also differentiate: tmux detach is expected, not an error.
**Solution**: Track `isTmuxAttached` in session store. On pane close, send `detach` message (not `close`) for tmux sessions. Backend handles detach by terminating the tmux client process (which detaches from tmux without killing the session).
**Action Required**: Add `detach` message type; update terminal cleanup logic; update overlay logic.
**Affects Phases**: Phase 2, Phase 6

### 03: Workspace Codec Backward Compatibility is Non-Negotiable
**Impact**: Critical
**Sources**: [R1-05, I1-09]
**Problem**: URL codec schema v1 uses strict validation. Adding tmux fields must not reject URLs from pre-Plan 018 deployments. Fields must be optional with graceful defaults.
**Solution**: Add `tm?: string` and `tw?: number` as optional fields to `URLSessionItem`. Update `validateSchema()` to accept missing optional fields. Old URLs decode with `tm=undefined, tw=undefined`.
**Example**:
```typescript
// ❌ WRONG — required field breaks old URLs
interface URLSessionItem { t: 's'; s: string; tm: string }

// ✅ CORRECT — optional field, backward compatible
interface URLSessionItem { t: 's'; s: string; tm?: string; tw?: number }
```
**Action Required**: Extend codec with optional fields; add backward-compatibility tests.
**Affects Phases**: Phase 5

### 04: TmuxDetector Interface Extension Pattern
**Impact**: High
**Sources**: [I1-01, I1-02, R1-02]
**Problem**: `TmuxDetector` interface only has `ListClients()` and `IsAvailable()`. Plan 018 needs `ListSessions()` to enumerate available tmux sessions.
**Solution**: Add `ListSessions() ([]TmuxSessionInfo, error)` to the interface. Implement in `RealTmuxDetector` using `tmux list-sessions -F '#{session_name}\t#{session_windows}\t#{session_attached}'`. Extend `FakeTmuxDetector` with `AddSession()`/`RemoveSession()` helpers.
**Action Required**: Extend interface, both implementations, and all tests. All tmux library code in `backend/internal/terminal/` must remain extraction-ready — no trex-specific imports (server, config, etc.) in detector/monitor code.
**Affects Phases**: Phase 1

### 05: TmuxMonitor Needs Dual-Callback Architecture
**Impact**: High
**Sources**: [I1-02, R1-03, R1-10]
**Problem**: Current monitor has single `onChange` callback for client attachment tracking. Plan 018 needs a second callback for session list changes (additions/removals). Must handle `ListSessions()` errors gracefully — reuse previous result on failure, don't flash empty sidebar.
**Solution**: Add `onSessionsChanged func(sessions []TmuxSessionInfo)` callback. Track `lastSessions` for error recovery. Call `ListSessions()` on same polling interval.
**Action Required**: Extend monitor with second callback; add error recovery logic.
**Affects Phases**: Phase 1

### 06: WebSocket Protocol Extension Must Be Additive
**Impact**: High
**Sources**: [R1-12, I1-06]
**Problem**: Message protocol has no versioning. New message types and fields must be forward/backward compatible. Unknown types are already logged-and-ignored (safe). New optional fields on `ClientMessage` are safe (Go `omitempty` + JS `undefined`).
**Solution**: Add optional `TmuxSessionName` and `TmuxWindowIndex` to `ClientMessage`. Add new message types: `tmux_sessions` (server→client list), `detach` (client→server). Reuse existing dispatch pattern.
**Action Required**: Extend `ClientMessage`, add message type constants, add dispatch handlers.
**Affects Phases**: Phase 1, Phase 2

### 07: Session Store Needs tmux Metadata
**Impact**: High
**Sources**: [R1-06, I1-08]
**Problem**: Frontend session store (`useSessionStore`) lacks tmux-specific fields. The URL codec, title bar indicator, and lifecycle logic all need to know if a session is tmux-attached and which tmux session it targets.
**Solution**: Extend `Session` interface with optional `tmuxSessionName?: string` and `tmuxWindowIndex?: number`. Backend includes these in `session_created` response. Frontend stores them for rendering and codec use.
**Action Required**: Extend session type, update `addSession()` call sites.
**Affects Phases**: Phase 3, Phase 5

### 08: handleCreate Validation for tmux Targets
**Impact**: High
**Sources**: [R1-04, I1-03]
**Problem**: `handleCreate()` has minimal validation. When accepting tmux target, must validate: tmux is available, session name is valid (alphanumeric + hyphen/underscore/dot), and session exists (soft check — race condition acceptable).
**Solution**: Add `validateTmuxTarget()` function. Call before PTY creation. Send clear error messages: `"tmux not available"`, `"tmux session not found: xyz"`, `"invalid tmux session name"`.
**Action Required**: Implement validation; add error response path.
**Affects Phases**: Phase 2

### 09: Drop Zone Must Support tmux Drag Type
**Impact**: High
**Sources**: [R1-07, I1-11]
**Problem**: `DropZoneOverlay` only handles `sidebar-session` and `pane` drag types. Tmux sessions from sidebar need a distinct drag type to carry tmux metadata (session name + window index) through the drop handler.
**Solution**: Add `sidebar-tmux-session` drag type with `tmuxSessionName` and `tmuxWindowIndex` data. Update `canDrop()` and `onDrop` handler to dispatch appropriately. Multi-attach is allowed (no duplicate check for tmux).
**Action Required**: Extend drag data, update drop handlers.
**Affects Phases**: Phase 4

### 10: Raw CLI Approach Confirmed Over gotmux Library
**Impact**: High
**Sources**: [External Research: gotmux-library-evaluation.md]
**Problem**: Should we use gotmux library or raw CLI calls?
**Solution**: **Raw CLI calls**. gotmux is solid but adds unnecessary dependency. We only need 3 commands (`list-sessions`, `list-clients`, `attach`). Same performance profile (subprocess per call, 10-50ms). Pattern already established in `TmuxDetector`.
**Action Required**: No library to add. Extend existing `exec.Command` pattern.
**Affects Phases**: Phase 1

### 11: URL Sync Must Handle Missing tmux Sessions on Decode
**Impact**: Medium
**Sources**: [R1-09]
**Problem**: URL may encode a tmux session that no longer exists (killed between encode and decode). Attempting to attach will fail, leaving an orphaned workspace item.
**Solution**: On URL decode, attempt tmux attachment normally. If backend returns error (session not found), show "Session Ended" overlay immediately. Don't pre-validate (adds latency and complexity for a rare case). The error path handles it naturally.
**Action Required**: Ensure backend error response triggers overlay; no pre-validation needed.
**Affects Phases**: Phase 5

### 12: Workspace Store Needs tmux Session Lifecycle Subscription
**Impact**: Medium
**Sources**: [R1-10]
**Problem**: When a tmux session is killed externally, attached trex panes become orphaned. The workspace store doesn't know about tmux session death unless told.
**Solution**: Backend broadcasts `tmux_sessions` message on session list changes. Frontend compares against attached sessions and shows "Session Ended" overlay for panes whose tmux session is gone. Reuse existing exit/overlay mechanism.
**Action Required**: Wire monitor's `onSessionsChanged` callback to WebSocket broadcast; frontend handles overlay.
**Affects Phases**: Phase 6

### 13: Settings Store Already Has tmux Infrastructure
**Impact**: Medium
**Sources**: [I1-10]
**Problem**: Where to put tmux feature toggle and socket config?
**Solution**: Settings store already has `tmuxPollingInterval` with clamping, persistence, and backend sync via `MsgTypeTmuxConfig`. Add `tmuxSidebarEnabled: boolean` (default `true`) and `tmuxSocketPath: string` (default `""`, meaning default socket).
**Action Required**: Extend settings store with 2 new fields.
**Affects Phases**: Phase 6

### 14: Layout Types Need No Changes
**Impact**: Medium
**Sources**: [I1-14]
**Problem**: Do layout tree types need tmux-specific extensions?
**Solution**: **No**. Tmux target metadata belongs on workspace items, not layout leaves. `PaneLeaf` stores `sessionId` which links to the session store where tmux metadata lives. Layout tree operations remain pure and tmux-agnostic.
**Action Required**: None for layout types.
**Affects Phases**: None

### 15: Existing docs/how/tmux-detection.md Should Be Extended
**Impact**: Low
**Sources**: [Documentation Strategy from spec]
**Problem**: `docs/how/tmux-detection.md` exists from Plan 014 but covers only detection, not integration.
**Solution**: Create new `docs/how/tmux-integration.md` for Plan 018 content (setup, usage, configuration, troubleshooting). Keep `tmux-detection.md` as-is (detection is a separate concern). Update README with brief mention + link.
**Action Required**: New doc file + README update.
**Affects Phases**: Phase 6

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Hybrid (per spec)
- **Rationale**: TDD for backend tmux detector/session logic (extends existing `FakeTmuxDetector` pattern) + Zustand store factory tests for frontend state. Lightweight for UI components.
- **Focus Areas**:
  - Backend `ListSessions()` and tmux-target session creation (TDD with `FakeTmuxDetector`)
  - Frontend workspace store tmux extensions (factory-based store tests)
  - URL codec tmux encoding/decoding (unit tests)
  - Settings store tmux toggle (unit tests)

### Hybrid Approach Annotations
| Phase | Testing Approach | Rationale |
|-------|-----------------|-----------|
| Phase 1 | **TDD** | Extending detector interface + monitor — must not break Plan 014 |
| Phase 2 | **TDD** | Session creation with tmux target — critical path, env stripping |
| Phase 3 | **Lightweight** | Sidebar UI — follows existing patterns, manual verification |
| Phase 4 | **Lightweight** | Drag-and-drop — follows existing @atlaskit patterns, manual verification |
| Phase 5 | **TDD** | URL codec — must verify backward compatibility, round-trip encoding |
| Phase 6 | **Lightweight** | Visual polish, settings, overlay — manual verification |

### Coverage Target
- **Minimum**: 80% overall (per Rules §Coverage)
- **Critical components**: Higher coverage for tmux detector, session creation, URL codec

### Mock Usage
- **Policy**: Targeted fakes (per ADR-0004)
- Continue existing `FakeTmuxDetector` and `FakeStorage` patterns
- No general mocking libraries

---

## Constitution & Architecture Gates

### GATE — Constitution
- **Validated against**: `docs/project-rules/constitution.md` v1.4.0

**No deviations**. Constitution v1.4.0 establishes that trex owns tmux integration directly via the `TmuxDetector` interface in `backend/internal/terminal/`. All tmux CLI calls go through the interface (not raw `exec.Command` in handlers). Design is composable and extraction-ready.

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| (none) | — | — | — |

### GATE — Architecture
- **Validated against**: `docs/project-rules/architecture.md` v1.2.0
- No layer-boundary violations. All changes follow established patterns:
  - Backend: `internal/terminal/` for tmux logic, `internal/server/` for WebSocket handling
  - Frontend: `stores/` for state, `components/` for UI, `lib/` for codec, `hooks/` for behavior

### GATE — ADR (Optional)
No ADRs directly reference Plan 018. Relevant existing ADRs:

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0001: Go backend with tmux integration | **Superseded** | All | Originally mandated external tmax library; superseded by Constitution v1.4.0 — trex owns tmux integration directly as composable internal library |
| ADR-0004: Fakes Only Testing | Accepted | All | Mandates `FakeTmuxDetector` extension, no mocking libraries |
| ADR-0008: Split Panel Library | Accepted | Phase 4 | `react-resizable-panels` + `@atlaskit/pragmatic-drag-and-drop` patterns |
| ADR-0009: DnD Library | Accepted | Phase 4 | @atlaskit patterns for sidebar tmux drag |
| ADR-0010: URL Layout Format | Accepted | Phase 5 | Base64url codec patterns, additive extension |

---

## Implementation Phases

### Phase 1: Backend tmux Session Discovery

**Objective**: Extend `TmuxDetector` with `ListSessions()` and wire session list broadcasting through `TmuxMonitor` and WebSocket.

**Deliverables**:
- `TmuxSessionInfo` struct and `ListSessions()` on `TmuxDetector` interface
- `RealTmuxDetector.ListSessions()` implementation (parses `tmux list-sessions`)
- `FakeTmuxDetector` extended with session management helpers
- `TmuxMonitor` extended with `onSessionsChanged` callback
- New `tmux_sessions` WebSocket message type (server→client)
- New `list_tmux_sessions` WebSocket message type (client→server)

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing Plan 014 tests | Low | High | Run full test suite after each change |
| ListSessions() fails when tmux server not running | Medium | Low | Same pattern as ListClients() — exit code 1 → empty list, not error |

### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Define `TmuxSessionInfo` struct and add `ListSessions()` to `TmuxDetector` interface | 1 | Interface compiles; existing implementations fail to compile (forces implementation) | - | `backend/internal/terminal/tmux_detector.go` |
| 1.2 | [x] | Write tests for `RealTmuxDetector.ListSessions()` parser | 2 | Tests cover: empty output, single session, multiple sessions, sessions with special chars, tmux not running | - | `backend/internal/terminal/tmux_detector_test.go` |
| 1.3 | [x] | Implement `RealTmuxDetector.ListSessions()` | 2 | All tests from 1.2 pass. Uses `tmux list-sessions -F` with pipe-delimited format | - | `backend/internal/terminal/tmux_detector.go` |
| 1.4 | [x] | Extend `FakeTmuxDetector` with `AddSession()`, `RemoveSession()`, `ListSessions()` | 1 | Fake returns configured sessions; existing fake tests still pass | - | `backend/internal/terminal/tmux_detector.go` |
| 1.5 | [x] | Write tests for `TmuxMonitor` session list change detection | 2 | Tests cover: initial discovery, session added, session removed, ListSessions error recovery (reuse previous) | - | `backend/internal/terminal/tmux_monitor_test.go` |
| 1.6 | [x] | Extend `TmuxMonitor` with `onSessionsChanged` callback and `lastSessions` caching | 2 | Tests from 1.5 pass. Error recovery works: failed ListSessions reuses cached result | - | `backend/internal/terminal/tmux_monitor.go` |
| 1.7 | [x] | Add `MsgTypeTmuxSessions` and `MsgTypeListTmuxSessions` message constants | 1 | Constants defined in `messages.go`; no existing message types affected | - | `backend/internal/terminal/messages.go` |
| 1.8 | [x] | Wire `TmuxMonitor.onSessionsChanged` to WebSocket broadcast in server | 2 | When monitor detects session list change, all connected clients receive `tmux_sessions` message. Client can also request current list via `list_tmux_sessions`. | - | `backend/internal/server/terminal.go` |
| 1.9 | [x] | Run existing backend test suite | 1 | `cd backend && go test ./...` passes. No regressions from Plan 014. | - | Verification task |

### Test Examples (Write First!)

```go
func TestRealTmuxDetector_ListSessions_ParsesOutput(t *testing.T) {
    // Test Doc:
    // - Why: Core discovery mechanism for tmux sidebar
    // - Contract: ListSessions parses tmux list-sessions output into TmuxSessionInfo slice
    // - Usage Notes: Returns empty slice (not error) when tmux server not running
    // - Quality Contribution: Prevents sidebar crashes on malformed tmux output
    // - Worked Example: "work\t3\t1\ndebug\t1\t0" → [{Name:"work",Windows:3,Attached:1},{Name:"debug",Windows:1,Attached:0}]

    tests := []struct {
        name   string
        output string
        want   []TmuxSessionInfo
    }{
        {"empty", "", nil},
        {"single", "work\t3\t1", []TmuxSessionInfo{{Name: "work", Windows: 3, Attached: 1}}},
        {"multiple", "work\t3\t1\ndebug\t1\t0", []TmuxSessionInfo{
            {Name: "work", Windows: 3, Attached: 1},
            {Name: "debug", Windows: 1, Attached: 0},
        }},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            got := parseTmuxSessions(tc.output)
            assert.Equal(t, tc.want, got)
        })
    }
}
```

### Non-Happy-Path Coverage
- [ ] tmux not installed → `IsAvailable()` returns false, `ListSessions()` returns empty
- [ ] tmux server not running → exit code 1 → empty slice, not error
- [ ] Malformed session name → parsed as-is (tmux validates names)
- [ ] Monitor ListSessions failure → reuse cached result, increment failure counter

### Acceptance Criteria
- [ ] `TmuxDetector.ListSessions()` returns accurate session list
- [ ] `FakeTmuxDetector` supports session add/remove for testing
- [ ] `TmuxMonitor` detects session additions and removals
- [ ] WebSocket clients receive `tmux_sessions` messages on changes
- [ ] All existing Plan 014 tests pass (no regressions)
- [ ] Error recovery: transient failures don't flash empty session list

---

### Phase 2: Backend tmux-Attach Session Creation

**Objective**: Extend session creation to accept a tmux target, spawn `tmux attach -t <name>` in PTY with proper env var stripping, and handle detach lifecycle.

**Deliverables**:
- `ClientMessage` extended with optional `TmuxSessionName` and `TmuxWindowIndex`
- `filterTmuxEnv()` helper function
- `handleCreate()` extended for tmux-target sessions
- PTY spawns `tmux attach` instead of shell when tmux target provided
- `detach` message type for graceful tmux disconnection
- `session_created` response includes tmux metadata

**Dependencies**: Phase 1 (TmuxDetector interface must be extended)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TMUX env var not stripped → nested tmux error | High | High | filterTmuxEnv() applied unconditionally for tmux-attach sessions |
| tmux session killed between create request and PTY start | Medium | Medium | PTY start fails, session enters error state, overlay shows |
| Shell injection via session name | Low | High | Validate session name: `^[a-zA-Z0-9._-]+$` |

### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests for `filterTmuxEnv()` helper | 2 | Tests cover: no TMUX vars, TMUX only, TMUX+TMUX_PANE, TMUX_PLUGIN_MANAGER_PATH and other TMUX_* vars, preserves non-TMUX vars, empty env | - | New function in `backend/internal/terminal/real_pty.go` or separate file |
| 2.2 | [ ] | Implement `filterTmuxEnv()` | 1 | All tests from 2.1 pass. Strips all `TMUX`-prefixed vars from env slice (`strings.HasPrefix(key, "TMUX")`) | - | Pure function, no side effects |
| 2.3 | [ ] | Write tests for tmux session name validation | 1 | Tests cover: valid names (alphanum, dots, hyphens), invalid names (semicolons, pipes, backticks), empty name | - | `backend/internal/server/terminal.go` or `backend/internal/terminal/validation.go` |
| 2.4 | [ ] | Extend `ClientMessage` with `TmuxSessionName` and `TmuxWindowIndex` fields | 1 | Fields added with `json:"...,omitempty"`. Existing messages marshal/unmarshal correctly. | - | `backend/internal/terminal/messages.go` |
| 2.5 | [ ] | Add `MsgTypeDetach` message constant and handler skeleton | 1 | Constant defined, switch case added in `handleMessage()`, handler sends close to PTY | - | `backend/internal/terminal/messages.go`, `backend/internal/server/terminal.go` |
| 2.6 | [ ] | Extend `handleCreate()` for tmux-target sessions | 3 | When `TmuxSessionName` is set: validates name, validates tmux available, spawns `tmux attach -t <name>:<window>` with filtered env. Regular sessions unchanged. | - | `backend/internal/server/terminal.go` |
| 2.7 | [ ] | Include tmux metadata in `session_created` response | 1 | `ServerMessage` for `session_created` includes `TmuxSessionName` and `TmuxWindowIndex` if present | - | `backend/internal/server/terminal.go` |
| 2.8 | [ ] | Write integration-style test for tmux-attach flow (with FakeTmuxDetector) | 2 | Test verifies: create message with tmux target → session created → tmux metadata in response. Uses fakes for tmux detector. | - | `backend/internal/server/terminal_test.go` |
| 2.9 | [ ] | Run full backend test suite | 1 | `cd backend && go test ./...` passes | - | Verification task |

### Test Examples (Write First!)

```go
func TestFilterTmuxEnv(t *testing.T) {
    // Test Doc:
    // - Why: Prevents "sessions should be nested with care" error in nested tmux
    // - Contract: filterTmuxEnv removes TMUX and TMUX_PANE from env, preserves all others
    // - Usage Notes: Call only for tmux-attach sessions, not regular shells
    // - Quality Contribution: Prevents complete feature failure in most common dev setup
    // - Worked Example: ["HOME=/home/user","TMUX=/tmp/tmux-501/default,123,0","TMUX_PANE=%0","SHELL=/bin/zsh"]
    //                  → ["HOME=/home/user","SHELL=/bin/zsh"]

    env := []string{
        "HOME=/home/user",
        "TMUX=/tmp/tmux-501/default,123,0",
        "TMUX_PANE=%0",
        "TMUX_PLUGIN_MANAGER_PATH=/home/user/.tmux/plugins/tpm",
        "SHELL=/bin/zsh",
        "TERM=xterm-256color",
    }
    filtered := filterTmuxEnv(env)
    assert.Equal(t, []string{"HOME=/home/user", "SHELL=/bin/zsh", "TERM=xterm-256color"}, filtered)
}
```

### Non-Happy-Path Coverage
- [ ] tmux not available when create with tmux target → error response
- [ ] tmux session doesn't exist → PTY start fails → session error state
- [ ] Invalid session name (shell metacharacters) → validation error
- [ ] Concurrent creates for same tmux session → both succeed (tmux handles multi-client)

### Acceptance Criteria
- [ ] `tmux attach -t <name>:<window>` spawns correctly in PTY
- [ ] `TMUX` and `TMUX_PANE` env vars stripped for tmux-attach sessions
- [ ] Regular (non-tmux) session creation unchanged
- [ ] Session name validated against injection
- [ ] `detach` message type closes PTY without killing tmux session
- [ ] `session_created` response includes tmux metadata
- [ ] All backend tests pass

---

### Phase 3: Frontend Sidebar & Click-to-Attach

**Objective**: Add "tmux Sessions" section to sidebar that lists available tmux sessions and supports click-to-attach.

**Deliverables**:
- New Zustand store `frontend/src/stores/tmux.ts` (`useTmuxStore`) for available tmux session list — factory function pattern, transient (not persisted)
- `TmuxSessionItem` sidebar component with click handler
- Integration with `useCentralWebSocket` for `tmux_sessions` message handling
- `createSession` call with tmux target on click
- Session store extended with tmux metadata

**Dependencies**: Phase 2 (backend must accept tmux-target create messages)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Zustand infinite loop from session list selector | Medium | High | Use `useShallow` for array selector or store sessions in Map |
| WebSocket message timing (sidebar shows before backend ready) | Low | Low | Initial `list_tmux_sessions` request on mount; updates via push |

### Tasks (Hybrid: Store tests TDD, UI lightweight)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Extend **frontend** `Session` interface with optional `tmuxSessionName` and `tmuxWindowIndex` fields | 1 | Types compile; existing session creation unaffected. Note: backend `Session` already has `TmuxSessionName` and `TtyPath` from Plan 014. `Registry.ListByTmuxSession(name)` also exists — useful for focus-existing check. | - | `frontend/src/stores/sessions.ts` or types file (frontend only) |
| 3.2a | [ ] | Write factory tests for tmux sessions store | 1 | Tests cover: initial empty state, setTmuxSessions, clear, selector with useShallow | - | `frontend/src/stores/__tests__/tmux.test.ts` (TDD: tests first) |
| 3.2b | [ ] | Implement tmux sessions store | 2 | `frontend/src/stores/tmux.ts` — `createTmuxStore()` factory + `useTmuxStore` singleton. Holds `TmuxSessionInfo[]`. All tests from 3.2a pass. | - | Zustand factory pattern, transient (not persisted) |
| 3.3 | [ ] | Handle `tmux_sessions` and `session_created` (with tmux metadata) in WebSocket hook | 2 | When `tmux_sessions` message arrives, update tmux sessions store. When `session_created` arrives with tmux metadata, pass to session store. | - | `frontend/src/hooks/useCentralWebSocket.ts` |
| 3.4 | [ ] | Send `list_tmux_sessions` request on WebSocket connect | 1 | Initial session list populated on page load | - | `frontend/src/hooks/useCentralWebSocket.ts` |
| 3.5 | [ ] | Create `TmuxSessionItem` component | 2 | Renders tmux session name, window count, attached indicator. Click calls `createSession` with tmux target. | - | `frontend/src/components/TmuxSessionItem.tsx` (new) |
| 3.6 | [ ] | Add "tmux Sessions" section to `SessionList.tsx` | 2 | Section appears when tmux available + sessions exist. Hidden when tmux unavailable or no sessions. Renders `TmuxSessionItem` for each. Section header includes a refresh button that sends `list_tmux_sessions` for immediate update (mitigates 5s poll latency). | - | `frontend/src/components/SessionList.tsx` |
| 3.7 | [ ] | Wire click-to-attach with focus-existing behavior | 2 | Clicking tmux session: if workspace already has a pane attached to that tmux session name, focus it instead of creating a duplicate. Otherwise, `createSession()` with tmux target. Drag-to-split always creates new attachment (multi-attach). Controlled by `tmuxClickFocusExisting` setting (default `true`). | - | End-to-end wiring; check workspace store for existing tmux attachment |
| 3.8 | [ ] | Manual verification: sidebar shows tmux sessions, click attaches | 1 | Visual confirmation in browser with running tmux sessions | - | Manual test |

### Non-Happy-Path Coverage
- [ ] No tmux sessions available → section hidden
- [ ] tmux not installed → section hidden
- [ ] Session killed between listing and click → error overlay

### Acceptance Criteria
- [ ] Sidebar shows "tmux Sessions" section when tmux available and sessions exist
- [ ] Each session displays name and window count
- [ ] Clicking a session creates a trex terminal attached to that tmux session
- [ ] Section hidden when tmux unavailable
- [ ] No infinite render loops from session list subscription
- [ ] ADR-0004: FakeStorage used for store tests

---

### Phase 4: Drag-and-Drop tmux Sessions into Panes

**Objective**: Enable dragging tmux sessions from sidebar into pane drop zones to create split panes attached to tmux sessions.

**Deliverables**:
- `TmuxSessionItem` made draggable with `sidebar-tmux-session` type
- `DropZoneOverlay` extended to accept tmux drag type
- `PaneContainer` drop handler creates session with tmux target
- `FirstDragDropZone` supports tmux sessions for standalone→layout conversion

**Dependencies**: Phase 3 (sidebar tmux items must exist)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Drag data conflicts with existing types | Low | Medium | Use distinct type string `sidebar-tmux-session` |
| Multi-attach creates resize conflicts | Medium | Low | Document as known limitation; tmux `window-size=latest` mitigates |

### Tasks (Lightweight)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Make `TmuxSessionItem` draggable with @atlaskit `draggable()` | 2 | Drag data: `{ type: 'sidebar-tmux-session', tmuxSessionName, tmuxWindowIndex }` | - | Follow `SessionItem` drag pattern |
| 4.2 | [ ] | Extend `DropZoneOverlay.canDrop()` to accept `sidebar-tmux-session` | 1 | tmux sessions can be dropped; pane cap check still enforced; no duplicate session check (multi-attach allowed) | - | `frontend/src/components/DropZoneOverlay.tsx` |
| 4.3 | [ ] | Extend `DropZoneOverlay.onDrop` to handle tmux drop data | 2 | When `sidebar-tmux-session` dropped, calls `createSession` with tmux target, then `splitPane` | - | `frontend/src/components/DropZoneOverlay.tsx`, `PaneContainer.tsx` |
| 4.4 | [ ] | Extend `FirstDragDropZone` to accept tmux sessions | 1 | Dropping tmux session on empty workspace creates standalone session with tmux attach | - | `frontend/src/components/FirstDragDropZone.tsx` |
| 4.5 | [ ] | Manual verification: drag tmux session to split zone | 1 | Visual confirmation: drag from sidebar → drop on pane edge → new pane with tmux attach | - | Manual test |

### Non-Happy-Path Coverage
- [ ] Drop on full layout (8 panes) → rejected by canDrop
- [ ] Drop same tmux session twice → both panes attach (multi-client)
- [ ] Drag cancelled → no side effects

### Acceptance Criteria
- [ ] tmux sessions can be dragged from sidebar to pane drop zones
- [ ] Drop creates new pane with tmux-attached session
- [ ] Existing drag-and-drop (regular sessions, pane rearrangement) unaffected
- [ ] Multi-attach allowed (same tmux session in multiple panes)
- [ ] ADR-0008/0009: Uses `react-resizable-panels` + `@atlaskit` patterns

---

### Phase 5: URL Encoding & Auto-Reconnect

**Objective**: Extend workspace URL codec to encode tmux session name + window index, enabling auto-reconnect on page refresh.

**Deliverables**:
- `URLSessionItem` extended with optional `tm` and `tw` fields
- Codec encoder includes tmux metadata when present
- Codec decoder restores tmux sessions on URL load
- URL sync hook passes tmux metadata through session creation
- Backward compatibility with pre-Plan 018 URLs

**Dependencies**: Phase 3 (session store must have tmux metadata)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Old URLs rejected by new validator | Low | High | Optional fields default to undefined; explicit backward-compat tests |
| tmux session gone on decode → broken workspace | Medium | Medium | Backend error → session ends → overlay shows naturally |

### Tasks (TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write tests for codec with tmux fields | 2 | Tests cover: encode session with tmux info, decode with tmux info, round-trip, backward compat (no tmux fields), mixed items (some tmux, some not) | - | `frontend/src/lib/__tests__/workspaceCodec.test.ts` |
| 5.2 | [ ] | Extend `URLSessionItem` type with optional `tm` and `tw` fields | 1 | Type compiles; existing codec tests still pass | - | `frontend/src/lib/workspaceCodec.ts` |
| 5.3 | [ ] | Update `buildWorkspaceSchema()` to include tmux fields | 2 | When workspace item has tmux metadata (via session store), schema includes `tm` and `tw`. Without metadata, fields omitted. | - | `frontend/src/lib/workspaceCodec.ts` |
| 5.4 | [ ] | Update `decodeWorkspace()` and `validateSchema()` for optional tmux fields | 2 | Accepts URLs with and without tmux fields. Type validation: `tm` is string if present, `tw` is number if present. | - | `frontend/src/lib/workspaceCodec.ts` |
| 5.5 | [ ] | Update `useURLSync` to pass tmux metadata through session creation | 2 | When decoding URL with tmux fields, `createSession()` call includes `tmuxSessionName` and `tmuxWindowIndex`. Backend receives and spawns tmux attach. | - | `frontend/src/hooks/useURLSync.ts` |
| 5.6 | [ ] | Write backward-compatibility tests | 1 | Tests verify: v1 URLs without tmux fields decode correctly; new URLs with tmux fields decode correctly; round-trip preserves tmux metadata | - | `frontend/src/lib/__tests__/workspaceCodec.test.ts` |
| 5.7 | [ ] | Run full frontend build | 1 | `cd frontend && npm run build` passes (tsc -b + vite build) | - | Pre-push verification |

### Test Examples (Write First!)

```typescript
describe('workspace codec tmux extension', () => {
  test('encodes session with tmux metadata', () => {
    /**
     * Test Doc:
     * - Why: tmux sessions must survive URL encoding for auto-reconnect
     * - Contract: URLSessionItem with tm/tw fields round-trips through encode/decode
     * - Usage Notes: tm/tw are optional; omitted when session is not tmux-attached
     * - Quality Contribution: Prevents lost tmux reconnection on page refresh
     * - Worked Example: {t:'s',s:'zsh',tm:'work',tw:0} → base64 → decode → same object
     */
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: [{ t: 's', s: 'zsh', tm: 'work', tw: 0 }],
    }
    const encoded = encodeWorkspace(schema)
    const decoded = decodeWorkspace(encoded)
    expect(decoded).toEqual(schema)
  })

  test('decodes pre-Plan-018 URL without tmux fields', () => {
    const schema: WorkspaceURLSchema = {
      v: 1,
      a: 0,
      i: [{ t: 's', s: 'zsh' }],  // No tm, no tw
    }
    const encoded = encodeWorkspace(schema)
    const decoded = decodeWorkspace(encoded)
    expect(decoded).toEqual(schema)
    // tm and tw should be undefined, not null or empty
    const item = decoded!.i[0] as URLSessionItem
    expect(item.tm).toBeUndefined()
    expect(item.tw).toBeUndefined()
  })
})
```

### Non-Happy-Path Coverage
- [ ] URL with tmux session that no longer exists → session creation fails → overlay
- [ ] URL with invalid tmux session name → validation error → skip item
- [ ] Mixed URL: some sessions with tmux, some without → both decode correctly

### Acceptance Criteria
- [ ] URLs with tmux sessions encode `tm` (name) and `tw` (window index)
- [ ] Pre-Plan 018 URLs decode correctly (backward compatible)
- [ ] Page refresh with tmux URL auto-reconnects to tmux sessions
- [ ] Mixed workspace (regular + tmux sessions) encodes/decodes correctly
- [ ] All existing codec tests pass (no regressions)
- [ ] ADR-0010: Base64url format maintained

---

### Phase 6: Polish — Visual Indicators, Settings, Death Detection

**Objective**: Add visual differentiation for tmux sessions, settings toggle and socket configuration, and session death detection with overlay.

**Deliverables**:
- PaneTitleBar tmux indicator (icon + session name badge)
- Settings panel: tmux sidebar toggle and socket path field
- Session death detection via monitor → overlay display
- Documentation: `docs/how/tmux-integration.md` and README update

**Dependencies**: Phase 3, Phase 5 (sidebar and URL sync must work)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Settings toggle doesn't propagate to backend | Low | Low | Reuse existing `MsgTypeTmuxConfig` pattern |
| Session death overlay timing with poll interval | Medium | Low | Accept 5s latency; documented as known limitation |

### Tasks (Lightweight)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Add tmux indicator to `PaneTitleBar` | 2 | When session has `tmuxSessionName`, show badge with tmux icon and session name. Tooltip: "Attached to tmux: work:0" | - | `frontend/src/components/PaneTitleBar.tsx` |
| 6.2 | [ ] | Add `tmuxSidebarEnabled` to settings store | 1 | Boolean toggle, default `true`. Persisted. Write unit test. | - | `frontend/src/stores/settings.ts` |
| 6.3 | [ ] | Add `tmuxSocketPath` to settings store | 1 | String field, default `""`. Persisted. Write unit test. | - | `frontend/src/stores/settings.ts` |
| 6.3b | [ ] | Add `tmuxClickFocusExisting` to settings store | 1 | Boolean, default `true`. When true, clicking a tmux session focuses existing attached pane instead of creating duplicate. Drag-to-split always creates new. Persisted. Write unit test. | - | `frontend/src/stores/settings.ts` |
| 6.4 | [ ] | Add tmux settings to `SettingsPanel` UI | 2 | Toggle for "Show tmux sessions in sidebar". Text field for "Additional tmux socket path". | - | `frontend/src/components/SettingsPanel.tsx` |
| 6.5 | [ ] | Wire `tmuxSidebarEnabled` to sidebar visibility | 1 | When toggle is off, "tmux Sessions" section hidden even if tmux sessions exist | - | `frontend/src/components/SessionList.tsx` |
| 6.6 | [ ] | Wire `tmuxSocketPath` to backend via `tmux_config` message | 1 | When socket path changes, send to backend. Backend uses `-L` or `-S` flag for tmux commands. | - | `frontend/src/hooks/useCentralWebSocket.ts`, `backend/internal/server/terminal.go` |
| 6.7a | [ ] | Verify PTY-exit death detection for attached panes | 1 | When tmux session killed, `tmux attach` PTY exits → existing SessionEndedOverlay triggers automatically. Manual verification only — no new code expected. | - | Existing PTY exit flow handles this |
| 6.7b | [ ] | Implement sidebar staleness removal via monitor | 1 | When monitor detects tmux session removed, update `useTmuxStore` to remove the session from the list. Sidebar updates reactively. Note: `useTmuxStore` is the reusable in-memory tmux session list (also available for future UI surfaces like dropdowns). | - | `backend/internal/server/terminal.go`, `frontend/src/stores/tmux.ts` |
| 6.8 | [ ] | Create `docs/how/tmux-integration.md` | 2 | Setup requirements, usage guide, configuration (sockets, toggle), troubleshooting (nested tmux, death detection), limitations | - | `docs/how/tmux-integration.md` |
| 6.9 | [ ] | Update `README.md` with tmux integration mention | 1 | Brief section noting tmux integration capability, link to docs/how/tmux-integration.md | - | `README.md` |
| 6.10 | [ ] | Manual end-to-end verification | 1 | Full workflow: start tmux sessions → open trex → see sidebar → click/drag to attach → refresh page → auto-reconnect → kill tmux session → overlay shows → toggle off → section hidden | - | Manual test |
| 6.11 | [ ] | Run full frontend build | 1 | `cd frontend && npm run build` passes | - | Pre-push verification |

### Non-Happy-Path Coverage
- [ ] Settings toggle off → sidebar section disappears, existing tmux panes unaffected
- [ ] Invalid socket path → error in backend log, sidebar uses default socket
- [ ] tmux session killed → attached pane overlay appears immediately (PTY exit); sidebar list updates within one poll cycle (~5s)

### Acceptance Criteria
- [ ] tmux-attached panes show visual indicator in title bar
- [ ] Settings toggle controls sidebar section visibility
- [ ] Socket path configurable via settings
- [ ] Session death triggers overlay on attached panes
- [ ] Documentation complete (docs/how/ + README)
- [ ] Full end-to-end workflow verified manually

---

## Cross-Cutting Concerns

### Security Considerations
- **Shell injection prevention**: tmux session names validated against `^[a-zA-Z0-9._-]+$` before use in shell commands
- **Environment variable handling**: `filterTmuxEnv()` strips all `TMUX`-prefixed env vars, preserves all non-TMUX env vars
- **WebSocket input validation**: tmux fields on `ClientMessage` validated server-side before use

### Observability
- **Logging**: Backend logs tmux session discovery events, attach/detach actions, and errors at `info` level
- **Metrics**: tmux session count available via existing health endpoint
- **Error tracking**: tmux command failures logged with context (command, exit code, stderr)

### Documentation
- **Location**: Hybrid (per spec)
  - `README.md`: Brief mention + link to detailed guide
  - `docs/how/tmux-integration.md`: Full setup, usage, configuration, troubleshooting
- **Existing**: `docs/how/tmux-detection.md` (Plan 014) — kept as-is, separate concern
- **Target audience**: Developers using trex with tmux workflows
- **Maintenance**: Update when tmux feature scope expands

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Overall Plan | 3 | Medium | S=2,I=1,D=1,N=0,F=1,T=1 | Cross-cutting backend+frontend, single external dep (tmux CLI), minor state changes, well-specified, moderate non-functional concerns, hybrid testing | Feature toggle provides rollout control; phased delivery reduces blast radius |
| Phase 1 (session discovery) | 2 | Small | S=1,I=1,D=0,N=0,F=0,T=1 | Extends existing detector+monitor, tmux CLI integration, no state schema changes, established patterns, standard ops, TDD | Extends proven Plan 014 infrastructure |
| Phase 2 (tmux-attach creation) | 3 | Medium | S=1,I=1,D=0,N=0,F=2,T=1 | Multiple backend files, tmux CLI integration, env stripping is safety-critical, TDD testing | filterTmuxEnv() is isolated pure function; validation prevents injection |
| Phase 3 (sidebar + click-to-attach) | 2 | Small | S=1,I=0,D=1,N=0,F=0,T=1 | New store + component, no external integration, minor state addition, follows established patterns, standard ops, lightweight testing | Reuses existing sidebar patterns from SessionItem |
| Phase 4 (drag-and-drop) | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=0 | Extends existing DnD infrastructure, no new integrations, no state changes, follows @atlaskit patterns, standard ops, manual verification | Follows established DropZoneOverlay patterns exactly |
| Phase 5 (URL codec) | 2 | Small | S=1,I=0,D=1,N=0,F=1,T=1 | Codec + URL sync, backward compat concern, must not break existing URLs, TDD testing | Additive-only schema; backward-compat test suite |
| Phase 6 (polish) | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | UI polish + settings + docs, no new integrations, extends existing settings store, follows patterns, standard ops, unit tests for settings | Settings reuse existing persistence + backend sync patterns |

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Backend tmux Session Discovery - Complete
- [ ] Phase 2: Backend tmux-Attach Session Creation - Pending
- [ ] Phase 3: Frontend Sidebar & Click-to-Attach - Pending
- [ ] Phase 4: Drag-and-Drop tmux Sessions into Panes - Pending
- [ ] Phase 5: URL Encoding & Auto-Reconnect - Pending
- [ ] Phase 6: Polish — Visual Indicators, Settings, Death Detection - Pending

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

## Critical Insights (2026-02-18)

| # | Insight | Decision |
|---|---------|----------|
| 1 | PTY exit already handles death detection for attached panes — monitor only needed for sidebar list | Split Task 6.7 into 6.7a (verify PTY exit) + 6.7b (sidebar staleness via monitor) |
| 2 | Multi-client resize thrashing is standard tmux behavior, not trex-specific | No action — removed "momentary artifacts" framing from plan |
| 3 | Session UUID is ephemeral across refreshes; tmux session name is the stable URL reconnection key | Confirmed codec approach correct — `tm` field is the restore key |
| 4 | Clicking same tmux session twice creates duplicate workspace items | Focus existing pane on click; multi-attach via drag-to-split; add `tmuxClickFocusExisting` setting |
| 5 | tmux window index may point to wrong window after reorder/renumber | Accept as-is — trivial impact, user can navigate |
| 6 | Backend `Session.TmuxSessionName` and `Registry.ListByTmuxSession()` already exist from Plan 014 | Task 3.1 clarified as frontend-only; noted existing backend helpers |
| 7 | No UI affordance to kill tmux sessions | Keep as non-goal per spec; already in wishlist |
| 8 | `filterTmuxEnv()` only strips 2 vars but plugins set many `TMUX_*` vars | Strip all `TMUX`-prefixed env vars via `strings.HasPrefix` |
| 9 | Socket path sent to backend — but local trust model means no validation needed | No action — working as designed |
| 10 | 5s polling latency makes sidebar feel stale; no manual refresh | Add refresh button to tmux sidebar section header |

Action items: All applied to plan inline. `useTmuxStore` noted as reusable data source for future UI surfaces (dropdowns, etc.).
