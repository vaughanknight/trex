# Hello World Terminal Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-04
**Spec**: [./hello-world-terminal-spec.md](./hello-world-terminal-spec.md)
**Status**: IMPLEMENTED
**Issue**: [#14](https://github.com/vaughanknight/trex/issues/14)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [ADR Ledger](#adr-ledger)
4. [Implementation](#implementation)
5. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: trex has a working hello-world baseline (Go + Vite + Electron), but no terminal functionality. Before building tmux session management, we need to prove the fundamental PTY → WebSocket → xterm.js pipeline works.

**Solution**: Create a minimal terminal implementation that:
- Spawns the user's shell via `$SHELL` environment variable
- Routes terminal I/O over WebSocket to the browser
- Renders the terminal using xterm.js, replacing the "trex is running" landing page
- Handles window resize events correctly
- Cleans up PTY process when the browser disconnects

**Expected Outcome**: Running `make build-web && ./dist/trex` and opening `http://localhost:3000` shows a functional terminal where users can type commands, run vim/nano, and see full terminal emulation.

---

## Critical Research Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **creack/pty is the Go standard** - 1,800+ stars, 23K+ dependents, Unix-only but that's acceptable for v1 | Use `github.com/creack/pty` for PTY management |
| 02 | Critical | **gorilla/websocket is battle-tested** - Proven in GoTTY, extensive documentation, handles concurrent I/O | Use `github.com/gorilla/websocket` for WebSocket server |
| 03 | Critical | **xterm.js is universal** - Used by VS Code, Hyper, JupyterLab; handles all terminal emulation | Use `@xterm/xterm` v5.5.0 (scoped packages, not deprecated `xterm`) |
| 04 | Critical | **JSON protocol is acceptable for v1** - Terminado pattern; easier debugging, extensible | JSON messages for input/output/resize; can optimize to binary later |
| 05 | Critical | **Localhost binding mandatory** - Security requirement from constitution | Bind to `127.0.0.1:3000`, never `0.0.0.0` |
| 06 | High | **addon-fit essential for resize** - Calculates terminal dimensions from container size | Use `@xterm/addon-fit` and call `fitAddon.fit()` on resize |
| 07 | High | **addon-webgl for performance** - WebGL renderer significantly faster for high-throughput output | Use `@xterm/addon-webgl` for <50ms latency target |
| 08 | High | **PTY cleanup critical** - Orphaned processes if WebSocket closes without cleanup | Defer PTY close in goroutine; handle context cancellation |
| 09 | High | **Resize via TIOCSWINSZ** - creack/pty provides `pty.Setsize()` to propagate dimensions | Call `pty.Setsize()` on resize message; sends SIGWINCH to shell |
| 10 | High | **$SHELL fallback** - User may not have SHELL set | Default to `/bin/bash` if `$SHELL` is empty |
| 11 | Medium | **Binary WebSocket for output** - Text for input (JSON), binary for raw terminal output | Use `websocket.BinaryMessage` for terminal output to preserve escape sequences |
| 12 | Medium | **Debounce resize** - Rapid resize events can flood server | Debounce frontend resize to ~100ms before sending |
| 13 | Medium | **GoTTY protocol pattern** - Single-byte command prefix is efficient | Consider for v2; JSON is simpler for v1 debugging |
| 14 | Low | **Flow control for v2** - Fast output can overwhelm xterm.js | Defer to v2; v1 10-20 session target is manageable |
| 15 | Low | **react-xtermjs wrapper available** - Simplifies React integration | Evaluate; may use direct xterm.js for more control |

---

## ADR Ledger

| ADR | Status | Affects | Notes |
|-----|--------|---------|-------|
| [ADR-0001](../../adr/0001-go-backend-with-tmax-library.md) | Accepted | Go backend structure | No tmax import needed (no tmux ops in hello-world terminal) |
| [ADR-0002](../../adr/0002-vite-react-over-nextjs.md) | Accepted | Frontend setup | Use Vite + React, not Next.js |
| [ADR-0003](../../adr/0003-dual-distribution-web-and-electron.md) | Accepted | Dual distribution | Both web and Electron in v1 |
| [ADR-0004](../../adr/0004-fakes-only-testing-no-mocks.md) | Accepted | Testing | Fakes only, mocks forbidden |

---

## Implementation

**Objective**: Create functional terminal in browser proving PTY → WebSocket → xterm.js pipeline works.

**Testing Approach**: Full TDD (per spec clarification)
**Mock Usage**: Fakes only (per ADR-0004 - non-negotiable)

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Define PTY interface | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/pty.go` | Interface compiles | Enables FakePTY for testing |
| [x] | T002 | Implement FakePTY for testing | 2 | Test | T001 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/fake_pty.go` | FakePTY passes interface contract tests | Captures writes, emits canned responses |
| [x] | T003 | Implement RealPTY with creack/pty | 2 | Core | T001 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/real_pty.go` | `go test` passes; spawns actual shell | Wraps creack/pty; respects $SHELL |
| [x] | T004 | Add pty.Setsize for resize | 1 | Core | T003 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/real_pty.go` | Resize method works | Calls pty.Setsize with cols/rows |
| [x] | T005 | Define WebSocket connection interface | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/websocket.go` | Interface compiles | Enables FakeWebSocket for testing |
| [x] | T006 | Implement FakeWebSocket for testing | 2 | Test | T005 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/fake_websocket.go` | FakeWebSocket passes interface tests | Queues messages for assertion |
| [x] | T007 | Define terminal message protocol types | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/messages.go` | Types compile | ClientMessage, ServerMessage structs |
| [x] | T008 | Implement terminal session manager | 3 | Core | T001, T005, T007 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/session.go` | Unit tests pass with fakes | Bridges PTY ↔ WebSocket; handles lifecycle |
| [x] | T009 | Write terminal session unit tests | 2 | Test | T002, T006, T008 | `/Users/vaughanknight/GitHub/trex/backend/internal/terminal/session_test.go` | `go test` passes | Tests input/output/resize/cleanup with fakes |
| [x] | T010 | Implement WebSocket HTTP handler | 2 | Core | T008 | `/Users/vaughanknight/GitHub/trex/backend/internal/server/terminal.go` | Handler upgrades to WebSocket | Uses gorilla/websocket Upgrader |
| [x] | T011 | Add /ws route to server | 1 | Core | T010 | `/Users/vaughanknight/GitHub/trex/backend/internal/server/server.go` | Route exists at /ws | `s.mux.HandleFunc("/ws", ...)` |
| [x] | T012 | Write WebSocket handler tests | 2 | Test | T010 | `/Users/vaughanknight/GitHub/trex/backend/internal/server/terminal_test.go` | `go test` passes | Tests upgrade, message flow |
| [x] | T013 | Add creack/pty dependency | 1 | Setup | -- | `/Users/vaughanknight/GitHub/trex/backend/go.mod` | `go mod tidy` succeeds | `go get github.com/creack/pty` |
| [x] | T014 | Add gorilla/websocket dependency | 1 | Setup | -- | `/Users/vaughanknight/GitHub/trex/backend/go.mod` | `go mod tidy` succeeds | `go get github.com/gorilla/websocket` |
| [x] | T015 | Install xterm.js packages | 1 | Setup | -- | `/Users/vaughanknight/GitHub/trex/frontend/package.json` | `npm install` succeeds | @xterm/xterm, addon-fit, addon-webgl |
| [x] | T016 | Create Terminal React component | 3 | Core | T015 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/Terminal.tsx` | Component renders xterm | Initializes xterm.js with addons |
| [x] | T017 | Add WebSocket connection hook | 2 | Core | T016 | `/Users/vaughanknight/GitHub/trex/frontend/src/hooks/useTerminalSocket.ts` | Hook connects to /ws | Manages connect/disconnect/reconnect |
| [x] | T018 | Implement terminal input handling | 2 | Core | T016, T017 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/Terminal.tsx` | Keystrokes sent to backend | term.onData → ws.send |
| [x] | T019 | Implement terminal output handling | 2 | Core | T016, T017 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/Terminal.tsx` | Output rendered in terminal | ws.onmessage → term.write |
| [x] | T020 | Implement terminal resize handling | 2 | Core | T016, T017 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/Terminal.tsx` | Resize propagates to backend | fitAddon.fit() + send resize message |
| [x] | T021 | Add resize debouncing | 1 | Core | T020 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/Terminal.tsx` | Rapid resizes debounced | 100ms debounce before send |
| [x] | T022 | Create terminal TypeScript types | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/frontend/src/types/terminal.ts` | Types compile | ClientMessage, ServerMessage interfaces |
| [x] | T023 | Update App.tsx to show terminal | 2 | Core | T016 | `/Users/vaughanknight/GitHub/trex/frontend/src/App.tsx` | Terminal replaces hello world | Full viewport terminal |
| [x] | T024 | Add terminal CSS styles | 1 | Core | T23 | `/Users/vaughanknight/GitHub/trex/frontend/src/App.css` | Terminal fills viewport | Height: 100vh, remove padding |
| [x] | T025 | Display connection errors in terminal | 1 | Core | T17, T23 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/Terminal.tsx` | Errors shown in terminal area | term.writeln on error |
| [~] | T026 | Write frontend unit tests | 2 | Test | T016, T022 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/Terminal.test.tsx` | `npm run test` passes | Component render tests (deferred - requires vitest setup) |
| [x] | T027 | Create docs/how/terminal-architecture.md | 2 | Docs | T008, T016 | `/Users/vaughanknight/GitHub/trex/docs/how/terminal-architecture.md` | Doc exists with diagrams | PTY → WS → xterm flow |
| [x] | T028 | Create docs/how/terminal-development.md | 2 | Docs | T027 | `/Users/vaughanknight/GitHub/trex/docs/how/terminal-development.md` | Doc exists with examples | How to extend terminal features |
| [x] | T029 | Integration test: echo command | 2 | Test | T011, T023 | `/Users/vaughanknight/GitHub/trex/backend/internal/server/terminal_test.go` | Test passes with real PTY | `echo "hello"` returns "hello" (in TestHandleTerminal_EchoCommand) |
| [x] | T030 | Verify web mode end-to-end | 1 | Test | T011, T023 | -- | `./dist/trex` serves terminal | AC-01, AC-02 |
| [x] | T031 | Verify Electron mode end-to-end | 1 | Test | T030 | -- | `trex-desktop.app` shows terminal | AC-06 |
| [~] | T032 | Verify vim/nano rendering | 1 | Test | T030 | -- | vim opens with correct colors | AC-03 (manual verification required) |
| [~] | T033 | Verify resize behavior | 1 | Test | T030 | -- | Text reflows on resize | AC-04 (manual verification required) |
| [~] | T034 | Verify process cleanup | 1 | Test | T030 | -- | No orphaned processes | AC-05 (manual verification required) |
| [~] | T035 | Verify htop/top rendering | 1 | Test | T030 | -- | htop displays with live updates | AC-08 (manual verification required) |

### Task Dependency Graph

```
T001 (PTY interface) ───────┬──> T002 (FakePTY) ──────────────┐
                            │                                  │
                            └──> T003 (RealPTY) ──> T004 (resize)
                                                               │
T005 (WS interface) ────────┬──> T006 (FakeWS) ───────────────┤
                            │                                  │
T007 (message types) ───────┴──> T008 (session mgr) ──────────┼──> T009 (session tests)
                                       │                       │
                                       └──> T010 (WS handler) ─┼──> T011 (route) ──> T012 (handler tests)
                                                               │
T013 (creack/pty dep) ─────────────────────────────────────────┘
T014 (gorilla/ws dep) ─────────────────────────────────────────┘

T015 (xterm.js) ──> T016 (Terminal.tsx) ──┬──> T017 (useTerminalSocket)
                         │                │
                         │                ├──> T018 (input)
                         │                ├──> T019 (output)
                         │                ├──> T020 (resize) ──> T021 (debounce)
                         │                └──> T025 (errors)
                         │
T022 (TS types) ─────────┴──> T023 (App.tsx) ──> T024 (CSS)
                                   │
                                   └──> T026 (frontend tests)

T027 (arch docs) ──> T028 (dev docs)

T011 + T023 ──> T029 (integration test) ──> T030 (verify web)
                                                │
                                                ├──> T031 (verify electron)
                                                ├──> T032 (verify vim)
                                                ├──> T033 (verify resize)
                                                ├──> T034 (verify cleanup)
                                                └──> T035 (verify htop)
```

### Acceptance Criteria Mapping

| AC | Task(s) | Validation |
|----|---------|------------|
| AC-01: Terminal at localhost:3000 | T030 | `make build-web && ./dist/trex` shows terminal |
| AC-02: echo command works | T029, T030 | `echo "hello world"` displays output |
| AC-03: vim/nano renders correctly | T032 | Colors, cursor, escape sequences work |
| AC-04: Resize reflows text | T020, T033 | Browser resize updates terminal |
| AC-05: Clean process shutdown | T034 | No orphans after tab close |
| AC-06: Electron works | T031 | `make build-electron` terminal works |
| AC-07: <50ms latency | T019 | Imperceptible input delay |
| AC-08: htop/top works | T035 | Live updates display correctly |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PTY escape sequences not handled | Medium | Medium | xterm.js handles emulation; test with vim/htop |
| WebSocket disconnect doesn't clean up | Medium | High | Defer PTY close; test cleanup explicitly (T034) |
| gorilla/websocket concurrent write | Low | High | Use mutex for writes; follow GoTTY pattern |
| xterm.js memory leak on unmount | Low | Medium | Proper cleanup in useEffect return |
| Resize race conditions | Low | Low | Debounce + test rapid resize |

---

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-02-04 | T002 | gotcha | bytes.Buffer returns io.EOF immediately when empty, unlike real PTY which blocks | Added timeout-based polling in FakePTY.Read() | execution.log#task-t009 |
| 2026-02-04 | T006 | gotcha | FakeWebSocket.ReadMessage returned empty data when queue empty, causing infinite loop | Added timeout-based polling and Closed check | execution.log#task-t009 |
| 2026-02-04 | T009 | insight | Async session tests need polling, not just waiting for goroutines to complete | Used deadline-based polling with early exit on success | execution.log#task-t009 |
| 2026-02-04 | T015 | insight | xterm.js bundle is large (~638KB) - consider code splitting for production | Noted for v2 optimization | execution.log#task-t016 |

---

## Change Footnotes Ledger

[^1]: T001-T014 Backend implementation complete - PTY interface, fakes, session, WebSocket handler
[^2]: T015-T025 Frontend implementation complete - Terminal component, WebSocket hook, types
[^3]: T027-T028 Documentation complete - Architecture and development guides

---

## References

- [Spec](./hello-world-terminal-spec.md)
- [Issue #14](https://github.com/vaughanknight/trex/issues/14)
- [ADR-0001: Go backend](../../adr/0001-go-backend-with-tmax-library.md)
- [ADR-0002: Vite + React](../../adr/0002-vite-react-over-nextjs.md)
- [ADR-0003: Dual distribution](../../adr/0003-dual-distribution-web-and-electron.md)
- [ADR-0004: Fakes only](../../adr/0004-fakes-only-testing-no-mocks.md)
- [WebSocket protocols research](../../research/websocket-terminal-protocols.md)
- [Frontend terminal libraries research](../../research/frontend-terminal-libraries.md)
- [Similar implementations research](../../research/similar-implementations.md)
- [Project idioms](../../project-rules/idioms.md)
- [Constitution](../../project-rules/constitution.md)

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/002-hello-world-terminal"`
- **Optional validation**: `/plan-4-complete-the-plan` (recommended to verify plan completeness)
