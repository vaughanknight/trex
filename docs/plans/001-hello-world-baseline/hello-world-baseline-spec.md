# Hello World Baseline

**Status**: Draft
**Created**: 2026-02-04
**Issue**: [#13](https://github.com/vaughanknight/trex/issues/13)
**Mode**: Simple

ℹ️ Consider running `/plan-1a-explore` for deeper codebase understanding if modifications to existing code are needed in future phases.

---

## Summary

**WHAT**: Create a minimal "hello world" implementation that proves the complete build pipeline works across all three distribution targets: Go backend, Vite + React frontend (web mode), and Electron desktop app.

**WHY**: Before investing in feature development (tmux integration, terminal emulation, session management), we need confidence that the foundational technology stack decisions work together:
- Go can embed and serve Vite build output
- Electron can spawn and communicate with the Go backend
- The dual distribution model (web + desktop) is achievable
- CI/CD can build all targets

This is the first code written for trex. It validates ADR-0001 (Go backend), ADR-0002 (Vite + React), and ADR-0003 (dual distribution) before any business logic is added.

---

## Goals

1. **Prove Go backend builds and runs** - Single Go binary that starts an HTTP server and serves static files
2. **Prove Vite + React frontend builds** - TypeScript React app that compiles to production-ready static assets
3. **Prove web mode works** - Go binary embeds frontend assets and serves them at localhost
4. **Prove Electron mode works** - Native desktop app launches, spawns Go backend, displays React UI
5. **Establish project structure** - Create the canonical `backend/`, `frontend/`, `electron/` folder layout
6. **Establish build scripts** - Reproducible builds for web and Electron distributions
7. **Establish CI foundation** - GitHub Actions workflow that builds all targets
8. **Enable future development** - Clean foundation that subsequent features can build upon

---

## Non-Goals

1. **tmux integration** - No tmax library import, no tmux operations, no session discovery
2. **Terminal emulation** - No xterm.js, no WebSocket server, no terminal I/O
3. **Persistence** - No favorites, groups, preferences, or any data storage
4. **Startup wizard** - No first-run setup flow or configuration
5. **OpenTelemetry** - No structured logging, metrics, or tracing infrastructure
6. **Real functionality** - The UI shows "hello world" only; no actual features
7. **Cross-platform testing** - Focus on macOS initially; Linux/Windows can follow
8. **Production polish** - No error handling, no edge cases, no performance optimization
9. **Electron-specific features** - No system tray, global hotkeys, or native notifications
10. **Authentication/security** - Localhost binding only, no auth (per v1 spec)

---

## Complexity

**Score**: CS-2 (Small)

**Breakdown**:
| Factor | Score | Rationale |
|--------|-------|-----------|
| **S**urface Area | 1 | Multiple files across backend/frontend/electron, but all new code (no existing code to modify) |
| **I**ntegration | 1 | Vite↔Go embedding, Electron↔Go spawning - established patterns but first-time for this project |
| **D**ata & State | 0 | No persistence, no schema, no migrations |
| **N**ovelty | 1 | Well-specified by ADRs, but first-time project setup has some discovery |
| **F**unctional (NFR) | 0 | Standard - no performance/security/compliance requirements for hello world |
| **T**esting & Rollout | 1 | Basic CI needed; no feature flags or staged rollout |
| **Total** | **4** | **CS-2** |

**Confidence**: 0.85

**Assumptions**:
- Go 1.21+ with `embed` package works as expected
- Vite 5.x builds cleanly to static assets
- electron-vite provides smooth integration
- macOS is primary development target

**Dependencies**:
- Go toolchain installed locally
- Node.js/npm installed locally
- Electron build tools (may require Xcode on macOS)

**Risks**:
- Go embed + Vite output compatibility unknown until tested
- Electron process spawning of Go binary may have edge cases
- electron-builder configuration can be fiddly

**Phases** (suggested):
1. Go backend skeleton with health endpoint
2. Vite + React frontend skeleton
3. Go + frontend integration (web mode)
4. Electron integration (desktop mode)
5. CI/CD workflow

---

## Acceptance Criteria

### AC-1: Go Backend Builds and Runs
**Given** the `backend/` directory structure exists with `cmd/trex/main.go`
**When** I run `go build -o trex ./cmd/trex`
**Then** a `trex` binary is produced without errors

### AC-2: Health Endpoint Works
**Given** the trex binary is running
**When** I request `GET http://localhost:3000/api/health`
**Then** I receive `{"status":"ok","version":"0.1.0"}` with HTTP 200

### AC-3: Frontend Builds
**Given** the `frontend/` directory with Vite + React setup
**When** I run `npm run build`
**Then** the `frontend/dist/` directory contains production assets (index.html, JS, CSS)

### AC-4: Web Mode Serves Frontend
**Given** the trex binary with embedded frontend assets
**When** I run `./trex` and open `http://localhost:3000` in a browser
**Then** I see a page displaying "trex is running" (or similar hello world message)

### AC-5: Web Mode Frontend Calls Backend
**Given** the trex web page is loaded
**When** the page loads
**Then** it fetches `/api/health` and displays the result on the page

### AC-6: Electron App Launches
**Given** the Electron app has been built
**When** I run `trex-desktop.app` (or platform equivalent)
**Then** a native window opens displaying the same React content as web mode

### AC-7: Electron Uses Local Backend
**Given** the Electron app is running
**When** the React app loads
**Then** it successfully calls the Go backend's `/api/health` endpoint via localhost

### AC-8: Build Script (Web)
**Given** the `scripts/build-web.sh` script exists
**When** I run `./scripts/build-web.sh`
**Then** a single `trex` binary is produced in `dist/` that includes the embedded frontend

### AC-9: Build Script (Electron)
**Given** the `scripts/build-electron.sh` script exists
**When** I run `./scripts/build-electron.sh`
**Then** a `trex-desktop.app` (or platform equivalent) is produced in `dist/`

### AC-10: CI Workflow Succeeds
**Given** the `.github/workflows/build.yml` workflow exists
**When** I push to the repository
**Then** the workflow builds Go backend, frontend, and (optionally) Electron without errors

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Go embed doesn't work cleanly with Vite output | Low | Medium | Test early; Vite outputs standard static files |
| Electron + Go process management is complex | Medium | Medium | Start simple; spawn Go as child process |
| electron-builder config is fragile | Medium | Low | Use proven electron-vite patterns |
| Cross-platform builds differ significantly | Medium | Low | Focus macOS first; defer others |

### Assumptions

1. **Development environment**: macOS with Go 1.21+, Node.js 20+, npm 10+
2. **Target port**: 3000 (fixed, hardcoded for baseline)
3. **No authentication**: Localhost trust model per constitution
4. **Single binary**: Go embeds all static assets (no separate file serving)
5. **Electron spawns Go**: Main process starts Go binary as child process
6. **Build orchestration**: Makefile with targets for each distribution
7. **Dev workflow**: Vite dev server (5173) + Go backend (3000) run separately for hot reload
8. **Version source**: Config file (e.g., `version.json`) as single source of truth, read at build time

---

## Open Questions

All questions resolved - see Clarifications section.

---

## Testing Strategy

**Approach**: Lightweight
**Rationale**: This is scaffolding/infrastructure work with no business logic. Focus on verifying builds succeed and services start.

**Focus Areas**:
- Health endpoint returns expected JSON
- Build scripts produce artifacts
- CI workflow passes

**Excluded**:
- Comprehensive unit tests (no logic to test)
- Integration tests (no integrations yet)
- e2e tests (deferred until real features exist)

**Mock Usage**: Fakes only (per constitution - non-negotiable)
- No mocks allowed in this project
- Fakes used when needed for unit tests
- Real dependencies for integration tests

---

## Documentation Strategy

**Location**: README.md only
**Rationale**: Baseline needs quick-start essentials. Detailed architecture docs come when there's architecture to document.

**Content**:
- Prerequisites (Go, Node.js, npm)
- Build commands (make build, make build-web, make build-electron)
- How to run web mode
- How to run Electron mode
- Development workflow (Vite dev server + Go backend)

**Target Audience**: Developers setting up the project for the first time
**Maintenance**: Update README when build commands or prerequisites change

---

## ADR Seeds (Optional)

These capture potential architectural decisions that may be formalized during implementation:

### Seed 1: Frontend Embedding Strategy
**Decision Drivers**:
- Single binary distribution requirement
- Need for development-time hot reload
- Go 1.16+ embed package availability

**Candidate Alternatives**:
- A: Go `embed` with Vite build output at compile time
- B: Go binary + separate `static/` folder at runtime
- C: Hybrid with dev mode flag

**Stakeholders**: @vaughanknight

### Seed 2: Electron Process Architecture
**Decision Drivers**:
- Go backend must run locally
- Need clean shutdown behavior
- macOS/Windows/Linux differences

**Candidate Alternatives**:
- A: Electron main process spawns Go as child process
- B: Separate "launcher" that starts both
- C: Go embedded as native addon (complex)

**Stakeholders**: @vaughanknight

---

## External Research

**Incorporated**: None (no `/deepresearch` has been run)

**Recommended Topics** (if desired before architecture phase):
1. Best practices for Go embed + Vite integration (2024-2026)
2. electron-vite recommended project structure
3. Electron + external process management patterns

---

## References

- [GitHub Issue #13](https://github.com/vaughanknight/trex/issues/13)
- [ADR-0001: Go backend](../adr/0001-go-backend-with-tmax-library.md)
- [ADR-0002: Vite + React](../adr/0002-vite-react-over-nextjs.md)
- [ADR-0003: Dual distribution](../adr/0003-dual-distribution-web-and-electron.md)
- [Project structure idiom](../project-rules/idioms.md)
- [Constitution](../project-rules/constitution.md)

---

## Clarifications

### Session 2026-02-04

| # | Question | Answer | Sections Updated |
|---|----------|--------|------------------|
| Q1 | Workflow mode? | **Simple** - CS-2 task, single phase, quick path | Header (Mode: Simple) |
| Q2 | Testing approach? | **Lightweight** - scaffolding work, no business logic | Testing Strategy section added |
| Q3 | Documentation location? | **README.md only** - quick-start essentials | Documentation Strategy section added |
| Q4 | Build orchestration? | **Makefile** - idiomatic for Go, clean targets | Assumptions #6 |
| Q5 | Port allocation? | **Fixed 3000** - simple, predictable for baseline | Assumptions #2 |
| Q6 | Dev workflow? | **Vite dev server** - hot reload on 5173, Go on 3000 | Assumptions #7 |
| Q7 | Version source? | **Config file** - single source of truth, bumped on release | Assumptions #8 |

**Coverage Summary**:
- **Resolved**: 7/7 questions (Mode, Testing, Docs, Build, Port, Dev workflow, Versioning)
- **Deferred**: 0
- **Outstanding**: 0

**Mock Policy Note**: Not asked - constitution mandates "fakes only, no mocks" (non-negotiable)
