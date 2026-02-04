# Hello World Baseline Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-04
**Spec**: [./hello-world-baseline-spec.md](./hello-world-baseline-spec.md)
**Status**: COMPLETE
**Issue**: [#13](https://github.com/vaughanknight/trex/issues/13)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [ADR Ledger](#adr-ledger)
4. [Implementation](#implementation)
5. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: trex is a documentation-only project with no code. Before building tmux management features, we need to validate that the technology stack (Go backend + Vite/React frontend + Electron desktop) works together as specified in ADRs 0001-0003.

**Solution**: Create a minimal "hello world" baseline that proves:
- Go backend compiles, serves static files, exposes `/api/health`
- Vite + React frontend builds to static assets
- Go embeds frontend and serves as single binary (web mode)
- Electron spawns Go backend and displays React UI (desktop mode)
- Makefile orchestrates builds; CI validates all targets

**Expected Outcome**: A working foundation where `make build-web` produces a single `trex` binary serving a "trex is running" page, and `make build-electron` produces a `trex-desktop.app` that displays the same content.

---

## Critical Research Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **Build order: frontend before Go** - Go `//go:embed` requires files at compile time; Vite `dist/` must exist before `go build` | Makefile dependencies: `build-backend` depends on `build-frontend` |
| 02 | Critical | **Embed path constraints** - Go embed can't cross module boundaries; embed path must be relative to source file | Copy `frontend/dist/` to `backend/static/` during build, embed from there |
| 03 | Critical | **Localhost-only binding mandatory** - v1 security requires `127.0.0.1` binding, not `0.0.0.0` | Use `http.ListenAndServe("127.0.0.1:3000", ...)` explicitly |
| 04 | Critical | **Electron Go binary path resolution** - Path differs between dev (local) and production (app bundle) | Use `app.getPath('exe')` + `process.resourcesPath`; bundle via `extraResources` |
| 05 | Critical | **Go module structure** - Must use `cmd/trex/` for entry, `internal/` for private packages | Create `backend/cmd/trex/main.go`, `backend/internal/server/` |
| 06 | High | **Backend readiness race condition** - Electron must wait for Go to bind port before loading UI | Poll `/api/health` with retry loop before creating BrowserWindow |
| 07 | High | **Vite base path** - Must match Go serving path for asset URLs to work | Set `base: './'` in `vite.config.ts` for relative paths |
| 08 | High | **Frontend API proxy for dev** - Vite dev server (5173) needs proxy to Go backend (3000) | Configure Vite `server.proxy: { '/api': 'http://localhost:3000' }` |
| 09 | High | **TypeScript strict mode** - Non-negotiable CI gate | Set `"strict": true` in `tsconfig.json` from start |
| 10 | High | **Graceful shutdown** - Orphaned Go process blocks subsequent launches | Handle `before-quit` in Electron; add signal handlers in Go |
| 11 | High | **Fakes only, no mocks** - Constitution mandates fakes for all test doubles | No mockery/gomock/jest.mock; use fake implementations |
| 12 | Medium | **Port collision handling** - Port 3000 may be in use | Fail fast with clear error message on EADDRINUSE |
| 13 | Medium | **Version.json as source of truth** - Multiple components need version | Create `version.json` at root; inject via ldflags (Go) and define (Vite) |
| 14 | Medium | **XDG paths for config** - Must handle missing env vars | Implement ConfigDir/DataDir/CacheDir with fallbacks |
| 15 | Medium | **Conventional commits** - Required format for all commits | Use `type(scope): description` format |

---

## ADR Ledger

| ADR | Status | Affects | Notes |
|-----|--------|---------|-------|
| [ADR-0001](../../adr/0001-go-backend-with-tmax-library.md) | Accepted | Go backend structure | No tmax import needed for baseline (no tmux ops) |
| [ADR-0002](../../adr/0002-vite-react-over-nextjs.md) | Accepted | Frontend setup | Use Vite + React, not Next.js |
| [ADR-0003](../../adr/0003-dual-distribution-web-and-electron.md) | Accepted | Dual distribution | Both web and Electron in v1 |
| [ADR-0004](../../adr/0004-fakes-only-testing-no-mocks.md) | Accepted | Testing | Fakes only, mocks forbidden |
| [ADR-0006](../../adr/0006-xdg-compliant-configuration.md) | Accepted | Config paths | XDG paths (deferred - no persistence in baseline) |

---

## Implementation

**Objective**: Create minimal working baseline proving Go + Vite + Electron integration works.

**Testing Approach**: Lightweight (per spec)
**Mock Usage**: Fakes only (per constitution - non-negotiable)

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Create project directory structure | 1 | Setup | -- | `/Users/vaughanknight/GitHub/trex/backend/`, `/Users/vaughanknight/GitHub/trex/frontend/`, `/Users/vaughanknight/GitHub/trex/electron/` | Directories exist with correct layout | Per idioms.md structure |
| [x] | T002 | Create version.json at repo root | 1 | Setup | -- | `/Users/vaughanknight/GitHub/trex/version.json` | File contains `{"version": "0.1.0"}` | Single source of truth |
| [x] | T003 | Initialize Go module | 1 | Setup | T001 | `/Users/vaughanknight/GitHub/trex/backend/go.mod` | `go mod init` succeeds | Module: `github.com/vaughanknight/trex` |
| [x] | T004 | Create Go main.go entry point | 2 | Core | T003 | `/Users/vaughanknight/GitHub/trex/backend/cmd/trex/main.go` | `go build` succeeds | Minimal: starts server on 127.0.0.1:3000 |
| [x] | T005 | Implement /api/health endpoint | 2 | Core | T004 | `/Users/vaughanknight/GitHub/trex/backend/internal/server/server.go`, `/Users/vaughanknight/GitHub/trex/backend/internal/server/health.go` | `curl localhost:3000/api/health` returns `{"status":"ok","version":"0.1.0"}` | Version from ldflags |
| [x] | T006 | Initialize Vite + React + TypeScript project | 2 | Setup | T001 | `/Users/vaughanknight/GitHub/trex/frontend/package.json`, `/Users/vaughanknight/GitHub/trex/frontend/vite.config.ts`, `/Users/vaughanknight/GitHub/trex/frontend/tsconfig.json` | `npm run build` succeeds | Use `npm create vite@latest` template |
| [x] | T007 | Configure TypeScript strict mode | 1 | Setup | T006 | `/Users/vaughanknight/GitHub/trex/frontend/tsconfig.json` | `"strict": true` present | CI gate requirement |
| [x] | T008 | Configure Vite for Go embedding | 1 | Setup | T006 | `/Users/vaughanknight/GitHub/trex/frontend/vite.config.ts` | `base: './'` and dev proxy configured | Relative paths + proxy to :3000 |
| [x] | T009 | Create Hello World React component | 2 | Core | T006 | `/Users/vaughanknight/GitHub/trex/frontend/src/App.tsx`, `/Users/vaughanknight/GitHub/trex/frontend/src/main.tsx` | Browser shows "trex is running" | Fetches /api/health, displays result |
| [x] | T010 | Add ESLint + Prettier configuration | 1 | Setup | T006 | `/Users/vaughanknight/GitHub/trex/frontend/.eslintrc.cjs`, `/Users/vaughanknight/GitHub/trex/frontend/.prettierrc` | `npm run lint` passes | CI gate requirement |
| [x] | T011 | Implement Go static file embedding | 2 | Core | T005, T009 | `/Users/vaughanknight/GitHub/trex/backend/internal/static/embed.go` | Go binary serves frontend assets at / | Use `//go:embed` directive |
| [x] | T012 | Create Makefile with build targets | 2 | Build | T005, T009 | `/Users/vaughanknight/GitHub/trex/Makefile` | `make build-web` produces `dist/trex` | Targets: build-frontend, build-backend, build-web |
| [x] | T013 | Create build-web.sh script | 1 | Build | T012 | `/Users/vaughanknight/GitHub/trex/scripts/build-web.sh` | `./scripts/build-web.sh` works | Wrapper calling Makefile |
| [x] | T014 | Initialize Electron project | 2 | Setup | T001 | `/Users/vaughanknight/GitHub/trex/electron/package.json`, `/Users/vaughanknight/GitHub/trex/electron/electron-builder.yml` | Electron deps installed | electron + electron-builder |
| [x] | T015 | Create Electron main process | 3 | Core | T014, T005 | `/Users/vaughanknight/GitHub/trex/electron/src/main.ts` | Electron spawns Go, creates window | Health check polling before window |
| [x] | T016 | Create Electron preload script | 1 | Setup | T014 | `/Users/vaughanknight/GitHub/trex/electron/src/preload.ts` | Preload compiles | Minimal for baseline |
| [x] | T017 | Configure electron-builder for Go binary | 2 | Build | T015 | `/Users/vaughanknight/GitHub/trex/electron/electron-builder.yml` | Go binary in extraResources | macOS focus for baseline |
| [x] | T018 | Add build-electron target to Makefile | 2 | Build | T012, T017 | `/Users/vaughanknight/GitHub/trex/Makefile` | `make build-electron` produces app | Depends on build-web |
| [x] | T019 | Create build-electron.sh script | 1 | Build | T018 | `/Users/vaughanknight/GitHub/trex/scripts/build-electron.sh` | `./scripts/build-electron.sh` works | Wrapper calling Makefile |
| [x] | T020 | Create GitHub Actions CI workflow | 2 | CI | T012 | `/Users/vaughanknight/GitHub/trex/.github/workflows/build.yml` | Push triggers build workflow | Build Go + frontend + (optional) Electron |
| [x] | T021 | Add health endpoint test | 1 | Test | T005 | `/Users/vaughanknight/GitHub/trex/backend/internal/server/health_test.go` | `go test` passes | Lightweight: just health endpoint |
| [x] | T022 | Update README.md with build instructions | 2 | Docs | T012, T018 | `/Users/vaughanknight/GitHub/trex/README.md` | README has prerequisites, build commands, run instructions | Per documentation strategy |
| [x] | T023 | Add .gitignore entries | 1 | Setup | T001 | `/Users/vaughanknight/GitHub/trex/.gitignore` | Build artifacts excluded | node_modules, dist/, backend/static/ copy |
| [x] | T024 | Verify web mode end-to-end | 1 | Test | T011, T012 | -- | `./dist/trex` serves page at localhost:3000 | Manual verification |
| [x] | T025 | Verify Electron mode end-to-end | 1 | Test | T018 | -- | `trex-desktop.app` launches and shows UI | Manual verification |

### Task Dependency Graph

```
T001 (structure) ─┬─> T003 (go.mod) ─> T004 (main.go) ─> T005 (health) ─┐
                  │                                                       │
                  ├─> T006 (vite init) ─┬─> T007 (strict)                │
                  │                     ├─> T008 (vite config)            │
                  │                     ├─> T009 (React app) ─────────────┼─> T011 (embed) ─> T012 (Makefile) ─┬─> T013 (build-web.sh)
                  │                     └─> T010 (lint)                   │                                    │
                  │                                                       │                                    ├─> T020 (CI)
                  └─> T014 (electron init) ─> T015 (main.ts) ─────────────┘                                    │
                                              │                                                                 │
                                              └─> T016 (preload) ─> T017 (builder) ─> T018 (build-electron) ─> T019 (build-electron.sh)

T002 (version.json) ─> T005 (version in health)
T023 (.gitignore) - independent
T021 (test) ─> T005
T022 (README) ─> T012, T018
T024 (verify web) ─> T011, T012
T025 (verify electron) ─> T018
```

### Acceptance Criteria

- [x] `go build -o trex ./cmd/trex` in `backend/` produces binary without errors
- [x] `curl http://localhost:3000/api/health` returns `{"status":"ok","version":"0.1.0"}`
- [x] `npm run build` in `frontend/` produces `dist/` with index.html, JS, CSS
- [x] `./dist/trex` serves React app at `http://localhost:3000`
- [x] React app displays "trex is running" and shows health check result
- [x] `./dist/trex-desktop.app` (macOS) launches and shows same React content
- [x] Electron app successfully calls `/api/health` via localhost
- [x] `make build-web` produces single binary with embedded frontend
- [x] `make build-electron` produces Electron app bundle
- [x] GitHub Actions workflow builds all targets on push
- [x] README.md documents prerequisites and build/run commands

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Go embed path issues | Medium | Medium | Test embedding early (T011); copy dist to backend/static/ |
| Electron + Go spawn complexity | Medium | Medium | Implement health polling (T015); handle process lifecycle |
| electron-builder config issues | Medium | Low | Use electron-vite patterns; start with macOS only |
| Port 3000 collision | Low | Low | Clear error message; document in README |
| TypeScript strict mode failures | Low | Low | Enable strict from start (T007); fix issues immediately |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

## References

- [Spec](./hello-world-baseline-spec.md)
- [Issue #13](https://github.com/vaughanknight/trex/issues/13)
- [ADR-0001: Go backend](../../adr/0001-go-backend-with-tmax-library.md)
- [ADR-0002: Vite + React](../../adr/0002-vite-react-over-nextjs.md)
- [ADR-0003: Dual distribution](../../adr/0003-dual-distribution-web-and-electron.md)
- [Project idioms](../../project-rules/idioms.md)
- [Constitution](../../project-rules/constitution.md)

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/001-hello-world-baseline"`
- **Optional validation**: `/plan-4-complete-the-plan` (recommended to verify plan completeness)
- **Optional task expansion**: `/plan-5-phase-tasks-and-brief` (if you want a separate dossier)
