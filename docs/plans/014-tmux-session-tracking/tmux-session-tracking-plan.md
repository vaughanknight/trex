# tmux Session Tracking Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-10
**Spec**: [./tmux-session-tracking-spec.md](./tmux-session-tracking-spec.md)
**Status**: READY

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Deviation Ledger](#deviation-ledger)
4. [ADR Ledger](#adr-ledger)
5. [Implementation](#implementation)
6. [Change Footnotes Ledger](#change-footnotes-ledger)

## Executive Summary

trex terminal sessions have no awareness of tmux sessions running inside them. Users see generic names like "bash-1" in the sidebar with no indication of which tmux session they're viewing. This plan adds outside-in detection: the backend polls `tmux list-clients`, matches PTY TTY device paths to trex sessions, and pushes tmux session names to the frontend via WebSocket. The sidebar replaces auto-generated names with tmux session names when detected. The tmux mapping is also exposed via REST API for Plan 013's metadata targeting.

**Approach**: Backend polling via `tmux list-clients -F '#{client_tty}\t#{session_name}'` at a configurable interval (default 2s). PTY TTY path captured at creation via `pty.Open()` replacing `pty.Start()`. Changes behind a `TmuxDetector` interface for future tmax library swap.

## Critical Research Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **PTY creation must change**: `pty.Start(cmd)` discards the TTY path. Must use `pty.Open()` + manual `cmd.Start()` with `SysProcAttr{Setsid: true, Setctty: true}` to capture it. Affects ALL session creation. | Refactor `NewRealPTYWithShell()` carefully; add `ttyPath` field to `RealPTY` struct (not PTY interface -- keep interface minimal per R1-05) |
| 02 | Critical | **No broadcast mechanism exists**: Server has no connection registry. Sessions route output through their own `sendJSON()` with per-session `writeMu`. Monitor needs to push updates to sessions. | Route tmux status through existing `Session.sendJSON()` — the monitor updates `Session.TmuxSessionName` then calls a new `Session.SendTmuxStatus()` method that uses the existing write mutex |
| 03 | High | **ADR-0001 prohibits direct tmux CLI calls**: tmax library is not yet available as Go library. Blocking on tmax would defer this feature indefinitely. | Introduce `TmuxDetector` interface that isolates the CLI call. Document deviation. `RealTmuxDetector` calls tmux directly; swap for tmax later without changing monitor code |
| 04 | High | **Goroutine lifecycle gap**: Server struct has no context/cancel or `Shutdown()` method. Monitor goroutine needs clean lifecycle management to avoid leaks in tests. | Add `context.Context`, `cancel`, and `Shutdown()` to `Server`. Call `Shutdown()` in main.go signal handler and in test cleanup |
| 05 | High | **Race between polling and session create/delete**: Monitor reads registry, execs tmux, then writes back. Sessions can appear/disappear during exec. | Snapshot-exec-apply pattern: snapshot TTY paths under RLock, exec without lock, apply updates individually via `registry.Get(id)` which has its own lock |
| 06 | High | **TTY path NOT available on PTY interface**: Adding `TtyPath()` to the `PTY` interface conflates I/O with metadata. Better to store TTY path on `Session` struct directly. | Set `Session.TtyPath` at creation time from `RealPTY.ttyPath` field. `FakePTY` gets `SimulatedTtyPath` field for testing but no interface method needed |
| 07 | High | **Configurable polling requires frontend→backend communication**: No existing pattern for frontend pushing config to backend at runtime. Settings store is frontend-only (localStorage). | Backend reads `TREX_TMUX_POLL_INTERVAL` env var at startup. Add `tmux_config` WebSocket message type for runtime updates from frontend settings panel. Monitor goroutine reads new interval from channel |
| 08 | Medium | **Session name reversion on tmux detach**: When tmux name replaces auto-generated name, need to store original for reversion. Frontend `Session.name` gets overwritten. | Add `originalName` field to frontend `Session` interface. Set once at `addSession` time. Tmux detach reverts `name` to `originalName` (when `!userRenamed`) |
| 09 | Medium | **exec.Command timeout**: `tmux list-clients` could hang if tmux server is unresponsive. Default `exec.Command` has no timeout. | Use `exec.CommandContext` with 5-second timeout per invocation. After 3 consecutive timeouts, back off to 30s polling |
| 10 | Medium | **Multiple tmux servers scanning**: Users may run `tmux -L custom_socket`. Scanning `/tmp/tmux-<UID>/` could reveal sensitive session names in multi-user scenarios. | Start with default tmux socket only (no `-S` flag). Multi-socket is a future opt-in enhancement |
| 11 | Medium | **FakeTmuxDetector test fidelity**: Must faithfully simulate attach/detach/switch transitions. Too-simple fakes miss edge cases; too-complex fakes become maintenance burdens. | Stateful fake with `AddClient`/`RemoveClient`/`SetUnavailable` methods. Follows existing `FakePTY` and `FakeWebSocket` patterns |
| 12 | Low | **tmux_status message is broadcast, not per-session**: Unlike `output` messages routed by `sessionId`, `tmux_status` carries updates for multiple sessions. Frontend must handle before per-session routing. | Handle `tmux_status` message type before the session handler lookup in `useCentralWebSocket.ts`. Iterate `tmuxUpdates` map and call store actions directly |

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| ADR-0001: No direct tmux CLI calls | tmax is a CLI tool, not yet a Go library. Cannot import as Go module. | Wait for tmax library (blocks feature indefinitely) | `TmuxDetector` interface isolates CLI calls to single implementation (`RealTmuxDetector`). Future swap to tmax requires changing only this file. Code comment documents deviation with ADR reference |

## ADR Ledger

| ADR | Status | Affects Tasks | Notes |
|-----|--------|---------------|-------|
| ADR-0001 | Accepted (with deviation) | T005, T006 | Direct tmux CLI calls via `TmuxDetector` interface; deviation documented above |
| ADR-0004 | Accepted | T001, T005, T006, T015 | Fakes only: `FakeTmuxDetector`, `FakePTY` with `SimulatedTtyPath`, `FakeWebSocket` |
| ADR-0005 | Accepted | T008, T009 | OpenTelemetry structured logging for monitor lifecycle and poll events |
| ADR-0007 | Accepted | T013 | Documentation in `docs/how/` with YAML front matter |

## Implementation (Single Phase)

**Objective**: Detect which tmux session each trex terminal is attached to, display in sidebar, and expose via API.

**Testing Approach**: Hybrid — unit tests for Go parser/monitor logic and frontend store; manual verification for sidebar display and live tmux interaction. Promoted tests MUST include Test Doc blocks per rules.md § Test Documentation (TAD).
**Mock Usage**: Fakes only (per ADR-0004). `TmuxDetector` interface enables `FakeTmuxDetector`. Real `SessionRegistry` + `FakePTY` with `TtyPath` field.
**CS Legend**: 1 = trivial, 2 = small, 3 = medium (per spec § Complexity, CS 1-5 system).

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|-------------------|------------|-------|
| [ ] | T001 | **Add `TtyPath` field to `RealPTY` and `SimulatedTtyPath` to `FakePTY`**. Add exported `TtyPath string` field to `RealPTY` struct. Add `SimulatedTtyPath string` field to `FakePTY` struct. Do NOT modify the `PTY` interface — TTY path is metadata, not I/O. | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/real_pty.go`, `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/fake_pty.go` | `go build ./...` compiles; `go test ./internal/terminal/...` passes | Keep PTY interface minimal (Finding 06). The field is set in T002 during PTY creation |
| [ ] | T002 | **Refactor `NewRealPTYWithShell()` to use `pty.Open()` and capture TTY path**. Replace `pty.Start(cmd)` with: `pty.Open()` → get `ptmx` and `tty` → `tty.Name()` for TTY path → wire `cmd.Stdin/Stdout/Stderr = tty` → set `cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setctty: true, Ctty: int(tty.Fd())}` → `cmd.Start()` → `tty.Close()`. Store TTY path in `RealPTY.TtyPath`. Note: on macOS, `Ctty` must be set to the fd of the secondary TTY for controlling terminal assignment. | 2 | Core | T001 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/real_pty.go` | `go build ./...` compiles; manual test: create session, verify shell works (typing, output, resize, Ctrl-C); verify `RealPTY.TtyPath` is non-empty `/dev/ttys*` (macOS) or `/dev/pts/*` (Linux). Run with `-race` flag | **Highest-risk task** (Finding 01). Examine creack/pty source to replicate `pty.Start()` behavior exactly. Fallback: keep `pty.Start()` with empty TTY path (tmux tracking disabled, sessions still work) |
| [ ] | T003 | **Add `TtyPath` and `TmuxSessionName` fields to `Session` struct and `SessionInfo`**. Add `TtyPath string` and `TmuxSessionName string` to `Session`. Add `TmuxSessionName string json:"tmuxSessionName,omitempty"` to `SessionInfo`. Update `Info()` to copy field. Store TTY path at creation time in `handleCreate()` by reading `pty.TtyPath` directly (the return type is already `*RealPTY` — no type assertion needed). | 2 | Core | T001, T002 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/session.go`, `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/registry.go`, `/Users/vaughanknight/GitHub/trex/backend/internal/server/terminal.go` | `go build ./...`; `go test ./internal/terminal/...` passes; verify `SessionInfo` JSON output includes `tmuxSessionName` when set, omits when empty | In `handleCreate()`: after `terminal.NewRealPTYWithShell()` returns `*RealPTY`, read `pty.TtyPath` directly and set `session.TtyPath = pty.TtyPath`. No type assertion needed — `NewRealPTYWithShell` returns `*RealPTY` |
| [ ] | T004 | **Add `ListByTmuxSession()` method to `SessionRegistry`**. Method signature: `ListByTmuxSession(name string) []*Session`. Returns all sessions whose `TmuxSessionName` matches. Thread-safe via `RLock`. Add unit test with registry containing sessions on different tmux sessions. | 1 | Core | T003 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/registry.go`, `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/registry_test.go` | `go test ./internal/terminal/...` passes; test verifies correct filtering by tmux session name (AC-08) | Satisfies AC-08: registry exposes query for Plan 013's use |
| [ ] | T005 | **Create `TmuxDetector` interface and implementations**. Define interface: `ListClients() (map[string]string, error)` (ttyPath→sessionName) and `IsAvailable() bool`. Implement `RealTmuxDetector`: uses `exec.LookPath("tmux")` for availability, runs `tmux list-clients -F '#{client_tty}\t#{session_name}'` with `exec.CommandContext` (5s timeout), parses output. Implement `FakeTmuxDetector`: stateful fake with `AddClient(path, name)`, `RemoveClient(path)`, `SetUnavailable()`. Add comprehensive parser tests. | 2 | Core | -- | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/tmux_detector.go` (new), `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/tmux_detector_test.go` (new) | `go test ./internal/terminal/...` passes; parser tests cover: normal output (tab-separated), empty output, malformed lines, multiple clients same session, whitespace edge cases. `IsAvailable()` returns false when `exec.LookPath` fails (AC-06). `exec.CommandContext` uses 5s timeout (Finding 09) | New files. Comment: `// NOTE: Direct tmux CLI call - to be replaced with tmax library per ADR-0001 when available` |
| [ ] | T006 | **Add `tmux_status` message type to backend and frontend**. Backend: add `MsgTypeTmuxStatus = "tmux_status"` constant. Add `TmuxUpdates map[string]string json:"tmuxUpdates,omitempty"` field to `ServerMessage`. Frontend: add `'tmux_status'` to `ServerMessageType` union. Add `tmuxUpdates?: Record<string, string>` to `ServerMessage` interface. | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/messages.go`, `/Users/vaughanknight/GitHub/trex/frontend/src/types/terminal.ts` | `go build ./...` passes; `npm run build` passes | The `tmuxUpdates` map carries `{sessionId: tmuxSessionName}` pairs. Empty string means detached |
| [ ] | T007 | **Add `TmuxPollInterval` to backend `Config`**. Add `TmuxPollInterval time.Duration` field to `Config` struct. Read from `TREX_TMUX_POLL_INTERVAL` env var (default "2s"). Parse with `time.ParseDuration`. Add validation (min 500ms, max 30s). | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/backend/internal/config/config.go` | `go test ./internal/config/...` passes; verify default 2s, custom values parsed correctly, out-of-range values rejected | Satisfies AC-13 backend side. Frontend settings UI in T012 |
| [ ] | T008 | **Create tmux monitor goroutine**. Implement `TmuxMonitor` struct with: `detector TmuxDetector`, `registry *SessionRegistry`, `interval time.Duration`, `onChange func(updates map[string]string)` callback, `ctx context.Context`. Polling loop: snapshot session TTY paths → call `detector.ListClients()` → match → detect changes → call `onChange` with changed sessions only → update `Session.TmuxSessionName` on registry sessions. Only starts if `detector.IsAvailable()`. Use OpenTelemetry structured logging (ADR-0005) for monitor lifecycle events (`info`: start/stop, `debug`: each poll cycle, `warn`: consecutive timeouts). Unit tests with `FakeTmuxDetector` and real `SessionRegistry` + `FakePTY`. | 2 | Core | T003, T004, T005 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/tmux_monitor.go` (new), `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/tmux_monitor_test.go` (new) | `go test -race ./internal/terminal/...` passes; tests verify: detect attach (session gets tmux name), detect detach (tmux name cleared), detect session switch (name changes), no-change is idempotent (onChange not called), monitor stops on context cancel, monitor skips when detector unavailable (AC-06, AC-07). Performance: single poll cycle < 10ms (AC-09) | New files. Key pattern: snapshot-exec-apply (Finding 05). `onChange` callback will be wired to WebSocket broadcast in T009 |
| [ ] | T009 | **Wire monitor into Server with lifecycle management and WebSocket broadcast**. Add `monitor *terminal.TmuxMonitor`, `ctx context.Context`, `cancel context.CancelFunc` to `Server` struct. Start monitor in `New()` with `onChange` callback. **Broadcast deduplication**: the `onChange` callback receives `map[string]string` (sessionID→tmuxName). Group changed sessions by their WebSocket connection (via `session.Conn()`), then send ONE `tmux_status` message per connection containing all updates for that connection's sessions. This avoids sending N duplicate messages when a connection owns N sessions. Add `SendTmuxStatus(updates map[string]string)` method to `Session` that sends via existing `sendJSON`/`writeMu`. Add `Shutdown()` method that cancels context. Update `main.go` to call `srv.Shutdown()` on signal. Use OpenTelemetry logging (ADR-0005) for lifecycle events. | 2 | Integration | T002, T003, T006, T007, T008 | `/Users/vaughanknight/GitHub/trex/backend/internal/server/server.go`, `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/session.go`, `/Users/vaughanknight/GitHub/trex/backend/cmd/trex/main.go` | `go build ./...` compiles; `go test -race ./...` passes with no goroutine leaks; manual test: start server, verify no errors when tmux not running (AC-07); verify `Shutdown()` stops monitor cleanly (Finding 04); verify deduplication: 2 sessions on same connection receive ONE tmux_status message (not 2) | `Session.SendTmuxStatus()` reuses existing `sendJSON` with `writeMu` (Finding 02). Deduplication by connection prevents N duplicate messages per poll cycle. Test cleanup must call `srv.Shutdown()` |
| [ ] | T010 | **Add `tmuxSessionName` and `originalName` to frontend Session type and store**. Add `tmuxSessionName?: string` and `originalName?: string` to `Session` interface. Set `originalName` in `addSession` from initial `name` value. Add `updateTmuxSessionName(id: string, name: string \| null)` action: when name is non-empty and `!userRenamed`, replace `session.name` with tmux name; when name is null/empty and `!userRenamed`, revert `session.name` to `originalName`. Add unit tests for: tmux attach updates name, tmux detach reverts to originalName, userRenamed blocks tmux name override, originalName set on addSession. | 1 | UI | -- | `/Users/vaughanknight/GitHub/trex/frontend/src/stores/sessions.ts`, `/Users/vaughanknight/GitHub/trex/frontend/src/stores/sessions.test.ts` | `npm run build` passes; `npx vitest run src/stores/sessions.test.ts` passes; unit tests verify: attach sets tmux name, detach reverts, userRenamed blocks, originalName preserved (AC-14) | Priority order for display name: (1) user rename, (2) tmux session name, (3) auto-generated name. The `originalName` preserves the auto-generated name for reversion (Finding 08) |
| [ ] | T011 | **Handle `tmux_status` WebSocket message in frontend**. In `useCentralWebSocket.ts`, add handler for `msg.type === 'tmux_status'` BEFORE the per-session routing block. Parse `tmuxUpdates` map. For each `[sessionId, tmuxName]` entry, call `useSessionStore.getState().updateTmuxSessionName(sessionId, tmuxName)`. | 1 | Integration | T006, T010 | `/Users/vaughanknight/GitHub/trex/frontend/src/hooks/useCentralWebSocket.ts` | `npm run build` passes; manual test: verify frontend receives `tmux_status` messages and updates sidebar names (AC-01, AC-02, AC-03) | Access store directly via `useSessionStore.getState()` since `tmux_status` is broadcast, not tied to individual session handlers (Finding 12) |
| [ ] | T012 | **Add tmux polling interval to frontend settings**. Add `tmuxPollingInterval: number` to `SettingsState` (default 2000ms, range 500-30000ms, step 500). Add setter and selector. Add to `merge` for backward compat. Create minimal `TmuxSettings.tsx` component with labeled number input. Add to `SettingsPanel.tsx`. On change, send `{type: "tmux_config", interval: <ms>}` WebSocket message. **Backend wiring**: add `MsgTypeTmuxConfig = "tmux_config"` client message type to `messages.go`. In `connectionHandler.handleMessage()` (terminal.go), add case for `tmux_config` → read `interval` from message → call `server.monitor.UpdateInterval(duration)`. `TmuxMonitor.UpdateInterval()` sends new duration on a channel that the poll loop reads to reset its ticker. | 2 | UI | T007, T009 | `/Users/vaughanknight/GitHub/trex/frontend/src/stores/settings.ts`, `/Users/vaughanknight/GitHub/trex/frontend/src/components/TmuxSettings.tsx` (new), `/Users/vaughanknight/GitHub/trex/frontend/src/components/SettingsPanel.tsx`, `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/messages.go`, `/Users/vaughanknight/GitHub/trex/backend/internal/server/terminal.go` | `npm run build` passes; `go build ./...` passes; manual test: change interval in settings, verify backend polling rate adjusts (AC-13) | Frontend→backend config communication via WebSocket message. The `connectionHandler` has access to `server` (which owns the monitor) via existing `h.server` field pattern. Monitor reads new interval from channel, replaces ticker |
| [ ] | T013 | **Write docs/how/ documentation with tmax transferability guide**. Survey existing `docs/how/` files (flat file convention — no subdirectories). Create `docs/how/tmux-detection.md` as flat file. Content MUST include: (1) **How detection works**: PTY TTY path + `tmux list-clients` mechanism, architecture diagram, polling lifecycle. (2) **`TmuxDetector` interface reference**: full interface contract, method signatures, expected behaviors, error cases. (3) **Configuration guide**: env var, frontend settings, interval ranges. (4) **Graceful degradation**: behavior when tmux absent, server not running, timeouts. (5) **tmax Library Transfer Guide**: dedicated section documenting exactly which logic should transfer to the tmax Go library — specifically the `TmuxDetector` interface, `parseTmuxClients()` parser, `RealTmuxDetector` implementation, error handling patterns, and the multi-socket scanning design (deferred). Include code-level mapping: "this function in `tmux_detector.go` becomes this tmax API". Document the interface contract so tmax can implement `TmuxDetector` as a drop-in replacement. Include YAML front matter per ADR-0007. | 2 | Docs | T009 | `/Users/vaughanknight/GitHub/trex/docs/how/tmux-detection.md` (new) | File exists as flat file (not subdirectory); contains all 5 content sections; tmax transfer section clearly maps trex code → future tmax API; YAML front matter present | Survey `docs/how/` first — existing files are flat (e.g., `terminal-architecture.md`). Target audience: (1) developers maintaining tmux detection, (2) tmax library author transferring logic |
| [ ] | T015 | **Integration test for `RealTmuxDetector` with real tmux**. Per rules.md § Fake vs Real Strategy: "Integration tests MUST use real dependencies (real tmux, real filesystem)". Create integration test file `tmux_detector_integration_test.go` with build tag `//go:build integration`. Tests use real `RealTmuxDetector` against an actual tmux server: (1) start a tmux session with `tmux new-session -d -s test-session`, (2) call `ListClients()`, verify output parsing, (3) kill session, verify it disappears. Skip if tmux not installed (`exec.LookPath`). Test Doc blocks required per TAD rules. | 1 | Test | T005 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/tmux_detector_integration_test.go` (new) | `go test -tags=integration ./internal/terminal/...` passes when tmux is available; test skips cleanly when tmux not installed; Test Doc blocks present | Build tag `integration` keeps these out of default `go test` runs. Satisfies rules.md "Both unit AND integration tests MUST exist" |
| [ ] | T014 | **End-to-end manual verification**. Test full flow: (1) Start trex with no tmux running — no errors (AC-06, AC-07). (2) Create terminal session, run `tmux new -s test` — sidebar shows "test" within 2s (AC-01). (3) Detach (Ctrl-b d) — sidebar reverts to auto-name (AC-02). (4) Attach to different tmux session — sidebar updates (AC-03). (5) Open second trex session, attach to same tmux — both show same name (AC-04). (6) Manually rename a session, then attach tmux — user name preserved (AC-14). (7) Check `GET /api/sessions` — includes `tmuxSessionName` (AC-05). (8) Verify collapsed sidebar hides tmux info (AC-12). (9) Change polling interval in settings (AC-13). (10) `npm run build` passes (AC-10). (11) `go test ./...` passes (AC-11). (12) `go test -tags=integration ./...` passes (T015). | 1 | Test | T009, T011, T012, T015 | -- | All acceptance criteria AC-01 through AC-14 pass | Document results in execution log. Fix any issues found during verification |

### Task Dependency Graph

```
T001 (RealPTY/FakePTY TTY path fields)
 └─► T002 (Refactor PTY creation - pty.Open())
      ├─► T003 (Session/SessionInfo/handleCreate fields)
      │    └─► T004 (ListByTmuxSession)
      │         └─► T008 (Monitor goroutine)
      └─► T009 (Wire into Server)

T005 (TmuxDetector + parser)
 ├─► T008 (Monitor goroutine)
 └─► T015 (Integration test with real tmux)

T006 (Message types)
 ├─► T009 (Server wiring)
 ├─► T011 (Frontend WS handler)
 └─► T012 (Settings UI)

T007 (Config)
 └─► T009 (Server wiring)
      └─► T012 (Settings UI)

T008 (Monitor — needs T003, T004, T005)
 └─► T009 (Server wiring — needs T002, T003, T006, T007, T008)

T010 (Frontend store)
 └─► T011 (Frontend WS handler)

T013 (Docs) ─► after T009

Parallelizable groups:
  Group A: T001, T005, T006, T007, T010 (no interdependencies)
  Group B: T002 (after T001), T004 (after T003), T015 (after T005)
  Group C: T003 (after T001 + T002)
  Group D: T008 (after T003 + T004 + T005)
  Group E: T009 (after T002 + T003 + T006 + T007 + T008)
  Group F: T011 (after T006 + T010), T012 (after T007 + T009)
  Final: T013 (after T009), T014 (after T009 + T011 + T012 + T015)
```

### Acceptance Criteria

- [ ] AC-01: Sidebar replaces auto-generated name with tmux session name within polling interval
- [ ] AC-02: Sidebar reverts to auto-generated name on tmux detach within polling interval
- [ ] AC-03: Sidebar reflects new tmux session name on session switch within polling interval
- [ ] AC-04: Multiple trex sessions on same tmux session show same name
- [ ] AC-05: `GET /api/sessions` includes `tmuxSessionName` field
- [ ] AC-06: Graceful degradation when tmux not installed (no errors)
- [ ] AC-07: No errors when no tmux server running
- [ ] AC-08: Registry exposes `ListByTmuxSession()` for Plan 013
- [ ] AC-09: Polling overhead < 10ms per cycle
- [ ] AC-10: `npm run build` passes with zero new errors
- [ ] AC-11: `go test ./...` passes
- [ ] AC-12: tmux name follows sidebar collapse behavior
- [ ] AC-13: Polling interval configurable via settings (default 2s)
- [ ] AC-14: User renames take priority over tmux names

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `pty.Open()` breaks session creation on macOS | Medium | Critical | Replicate creack/pty's `pty.Start()` internals exactly. Fallback: keep `pty.Start()` with empty TTY path (sessions work, tmux tracking disabled) |
| Monitor goroutine leaks in tests | Medium | High | `Server.Shutdown()` cancels context. `t.Cleanup()` calls `Shutdown()` in tests |
| Race between polling and session lifecycle | Medium | Medium | Snapshot-exec-apply pattern. No lock held during `tmux list-clients` exec |
| `tmux list-clients` hangs on unresponsive tmux | Low | High | `exec.CommandContext` with 5s timeout. Backoff after 3 consecutive failures |
| Frontend→backend polling interval communication | Medium | Low | WebSocket `tmux_config` message. Backend monitor accepts via channel |

### Security

- **No new attack surface**: tmux detection is read-only (runs `tmux list-clients`, never modifies tmux state)
- **Auth exemption**: Not needed — tmux monitoring is server-side only, not exposed as new endpoint. `GET /api/sessions` already exists and is protected by auth middleware
- **Default socket only**: No scanning of arbitrary file paths. Only default tmux socket used (mitigates information disclosure per R1-10)
- **Command injection**: `exec.Command("tmux", "list-clients", ...)` uses argument list (not shell string), immune to injection

### Observability

- **Logging**: Uses OpenTelemetry structured JSON logging per ADR-0005 and rules.md § Observability. Monitor logs at `info` level when tmux detection starts/stops. Logs at `debug` level each poll cycle with matched sessions. Logs at `warn` on consecutive timeouts
- **Graceful degradation**: No errors logged when tmux is absent or no server running (AC-06, AC-07)

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/014-tmux-session-tracking/tmux-session-tracking-plan.md"`
- **Optional task expansion**: `/plan-5-phase-tasks-and-brief` (if you want a separate dossier)
