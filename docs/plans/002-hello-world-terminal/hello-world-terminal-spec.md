# Hello World Terminal

**Created**: 2026-02-04
**Status**: DRAFT
**Issue**: [#14](https://github.com/vaughanknight/trex/issues/14)
**Mode**: Simple

---

📚 *This specification incorporates findings from research conducted on 2026-02-04 (see `docs/research/` for full analysis)*

---

## Research Context

Research was conducted across multiple domains to inform this specification:

**Components Affected**:
- `backend/internal/server/` - New WebSocket handler and routes
- `backend/internal/terminal/` - New PTY management package (to create)
- `frontend/src/` - New Terminal React component with xterm.js

**Critical Dependencies**:
- Go: `github.com/creack/pty` (PTY management, 1,800+ stars)
- Go: `github.com/gorilla/websocket` (WebSocket, battle-tested)
- Frontend: `@xterm/xterm` v5.5.0 (universal terminal standard)
- Frontend: `@xterm/addon-fit`, `@xterm/addon-webgl`

**Key Research Findings**:
- xterm.js is used by VS Code, Hyper, JupyterLab - validated choice
- GoTTY/ttyd protocols provide proven WebSocket message patterns
- creack/pty is the Go standard for Unix PTY (no Windows support needed for v1)
- Localhost binding (127.0.0.1) is mandatory for security

**Links**:
- `docs/research/websocket-terminal-protocols.md`
- `docs/research/frontend-terminal-libraries.md`
- `docs/research/similar-implementations.md`

---

## Summary

**WHAT**: Add a terminal component to trex that spawns a local shell (bash/zsh) and displays it in the browser. User can type commands and see output in real-time.

**WHY**: This is the foundational terminal capability that all future tmux integration will build upon. Before managing tmux sessions, we need to prove the basic PTY → WebSocket → xterm.js pipeline works. This validates our technology choices and establishes patterns for the full implementation.

---

## Goals

1. **Spawn User's Shell**: Terminal starts user's configured shell via `$SHELL` env var (fallback: /bin/bash)
2. **Replace Landing Page**: Terminal replaces the "trex is running" content at root URL
3. **Interactive I/O**: User can type commands and see output with <50ms perceived latency
4. **Terminal Rendering**: Full terminal emulation (colors, cursor positioning, vim/nano work correctly)
5. **Resize Support**: Terminal adjusts when browser window is resized
6. **Clean Lifecycle**: Terminal process terminates when browser tab closes or user disconnects
7. **Error Display**: Connection errors shown directly in terminal area (no separate UI)
8. **Dual Distribution**: Works identically in web mode (localhost:3000) and Electron desktop app

---

## Non-Goals

- **No tmux integration**: This is pure local shell, no tmux session management
- **No multiple terminals**: Single terminal only for this iteration
- **No session persistence**: Closing browser kills the shell; no reconnection
- **No authentication**: Localhost-only, no auth required for v1
- **No terminal customization**: Default theme only; no font/color preferences
- **No Windows support**: macOS/Linux only (creack/pty is Unix-only)
- **No remote shells**: Local machine only, no SSH or remote PTY

---

## Complexity

**Score**: CS-2 (small)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 1 | Multiple files: backend (2-3), frontend (1-2), but contained |
| Integration (I) | 1 | One new external dep per layer (pty, websocket, xterm.js) |
| Data/State (D) | 0 | No persistence, no schema changes |
| Novelty (N) | 1 | New concepts (PTY, WebSocket) but well-documented patterns |
| Non-Functional (F) | 1 | <50ms latency requirement; security (localhost binding) |
| Testing/Rollout (T) | 0 | Unit tests sufficient; no staged rollout needed |

**Total**: P = 1+1+0+1+1+0 = 4 → **CS-2**

**Confidence**: 0.85 (research provides clear implementation path)

**Assumptions**:
- creack/pty works reliably on macOS (validated by 23K+ dependent projects)
- gorilla/websocket handles concurrent I/O correctly
- xterm.js addon-fit provides correct resize dimensions

**Dependencies**:
- Go 1.22+ (already present)
- Node.js 20+ (already present)
- macOS or Linux development environment

**Risks**:
- PTY I/O may have edge cases with special characters/escape sequences
- WebSocket message ordering must be preserved for correct terminal output

**Phases**: Single phase (CS-2 doesn't require phased rollout)

---

## Acceptance Criteria

1. **AC-01**: Running `make build-web && ./dist/trex` and opening `http://localhost:3000` shows a functional terminal
2. **AC-02**: Typing `echo "hello world"` in the terminal displays `hello world` as output
3. **AC-03**: Running `vim` or `nano` opens the editor with correct terminal rendering (colors, cursor)
4. **AC-04**: Resizing the browser window causes the terminal to reflow text appropriately
5. **AC-05**: Closing the browser tab terminates the shell process (no orphaned processes)
6. **AC-06**: The terminal works in Electron desktop mode (`make build-electron`)
7. **AC-07**: Terminal input/output latency is imperceptible (<50ms round-trip)
8. **AC-08**: Running `htop` or `top` displays correctly with live updates

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PTY escape sequences not handled correctly | Medium | Medium | Use xterm.js which handles emulation; test with vim/htop |
| WebSocket disconnect doesn't clean up PTY | Medium | High | Implement proper cleanup in defer/finally; test with browser close |
| Performance issues with high output (e.g., `cat large_file`) | Low | Medium | Use binary WebSocket frames; consider flow control for v2 |
| Resize race conditions | Low | Low | Debounce resize events; test with rapid resizing |

### Assumptions

1. Users have bash or zsh installed (standard on macOS/Linux)
2. Localhost binding is sufficient security for single-user desktop app
3. xterm.js handles all terminal emulation (we don't need to parse escape codes)
4. PTY master fd is safe to read/write concurrently from goroutines

---

## Open Questions

*All questions resolved - see Clarifications section below.*

---

## ADR Seeds (Optional)

### ADR Seed: WebSocket Protocol Design

**Decision Drivers**:
- Need bidirectional real-time communication
- <50ms latency requirement
- Future: Will need to multiplex multiple terminals

**Candidate Alternatives**:
- A) JSON protocol (like current `/api/health`) - cleaner, more debuggable
- B) Binary protocol with command prefix (like GoTTY) - more efficient
- C) Use xterm.js addon-attach for raw WebSocket - simplest but less control

**Stakeholders**: Development team, future maintainers

### ADR Seed: PTY Library Selection

**Decision Drivers**:
- Cross-platform support (macOS, Linux priority; Windows deferred)
- Active maintenance
- Go idioms and error handling

**Candidate Alternatives**:
- A) creack/pty - Unix only, most popular (1,800+ stars, 23K dependents)
- B) aymanbagabas/go-pty - Cross-platform via ConPTY, newer (41 stars)
- C) Direct syscalls - Maximum control, most work

**Stakeholders**: Development team

---

## External Research

**Incorporated Research Files**:
- `docs/research/websocket-terminal-protocols.md` - WebSocket message patterns from GoTTY, ttyd
- `docs/research/frontend-terminal-libraries.md` - xterm.js setup, addons, React integration
- `docs/research/similar-implementations.md` - Architecture patterns from VS Code, JupyterLab

**Key Findings Applied**:
- Use `@xterm/xterm` scoped packages (not deprecated `xterm`)
- JSON protocol is acceptable for v1; can optimize to binary later
- creack/pty + gorilla/websocket is proven combination
- addon-fit essential for responsive sizing; addon-webgl for performance

---

## Testing Strategy

**Approach**: Full TDD
**Rationale**: Need to verify integration pieces work correctly with interfaces and fakes for PTY, WebSocket, and terminal components.

**Focus Areas**:
- PTY spawn and I/O (FakePTY for unit tests)
- WebSocket message handling (FakeWebSocket for unit tests)
- Terminal component lifecycle
- Integration between Go backend and React frontend

**Excluded**:
- xterm.js internal rendering (third-party, well-tested)
- Browser-specific behavior

**Mock Usage**: Fakes only (per ADR-0004)
- No mocking frameworks (gomock, testify/mock)
- Use FakePTY, FakeWebSocket implementations
- Real dependencies in integration tests

---

## Documentation Strategy

**Location**: docs/how/ only
**Rationale**: Terminal feature needs detailed technical documentation; README.md stays focused on quick-start.

**Content**:
- `docs/how/terminal-architecture.md` - How terminal system works
- `docs/how/terminal-development.md` - How to extend/modify terminal features

**Target Audience**: Developers extending trex
**Maintenance**: Update when terminal features change

---

## Clarifications

### Session 2026-02-04

| Q# | Question | Answer | Spec Update |
|----|----------|--------|-------------|
| Q1 | Workflow Mode | **Simple** - CS-2 task, single phase | Added `**Mode**: Simple` to header |
| Q2 | Testing Strategy | **Full TDD** - verify integration with interfaces and fakes | Added Testing Strategy section |
| Q3 | Mock Usage | **Fakes only** - per ADR-0004 constitution | Added to Testing Strategy |
| Q4 | Documentation | **docs/how/ only** - detailed technical docs | Added Documentation Strategy section |
| Q5 | Shell Selection | **$SHELL env var** - respect user's configured shell | Updated Goals section |
| Q6 | Error Display | **In terminal** - show errors directly in terminal area | Updated Acceptance Criteria |
| Q7 | UI Location | **Replace current content** - terminal replaces "trex is running" | Updated Goals section |

---

## Next Steps

1. Run `/plan-2-clarify` to resolve open questions
2. Run `/plan-3-architect` to create implementation plan
3. Create GitHub issue linking to this spec

---

**Spec Version**: 1.1.0
**Last Updated**: 2026-02-04
