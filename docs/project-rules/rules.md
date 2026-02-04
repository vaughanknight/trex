# trex Project Rules

**Version**: 1.1.0
**Status**: RATIFIED
**Last Updated**: 2026-02-04

---

<!-- USER CONTENT START -->
<!-- This section preserves user customizations across rules updates -->
<!-- USER CONTENT END -->

## Purpose

This document contains enforceable MUST/SHOULD statements derived from the [Constitution](./constitution.md).

---

## Source Control Rules

### Branching

- All development MUST use GitHub Flow (feature branches from `main`)
- Feature branches SHOULD be short-lived
- Long-lived develop/release branches MUST NOT be used

### Commits

- All commits MUST use Conventional Commits format: `type(scope): description`
- Valid types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`
- Valid scopes: `backend`, `frontend`, `api`, `ui`, `ws`, `config`

### Pull Requests

- PRs MUST be linked to an issue (no orphan PRs)
- PRs SHOULD be small and focused
- PRs MUST use squash merge to main
- PRs MUST have at least 1 approving review
- PRs MUST use the PR template

---

## Testing Rules

### Test-Driven Development

- All new code SHOULD be written test-first (TDD)
- Tests MUST be written before implementation where practical
- Red-Green-Refactor cycle SHOULD be followed

### Mock Policy

- Mocks MUST NOT be used
- Fakes MUST be used for all test doubles
- This rule is non-negotiable

### Fake vs Real Strategy

- Unit tests MUST use fakes (fake tmux, fake filesystem, fake WebSocket)
- Integration tests MUST use real dependencies (real tmux, real filesystem)
- Real dependencies SHOULD be used where practical
- tmax library MAY provide tmux fakes - MUST NOT duplicate

### Test Organization

- Tests MUST be organized into suites (unit, integration)
- Both unit AND integration tests MUST exist (not either/or)
- `tests/scratch/` MAY be used for TDD exploration
- Working tests MUST be promoted from scratch immediately

### Coverage

- Overall coverage MUST be at least 80%
- Critical components SHOULD have higher coverage:
  - Session management
  - WebSocket reliability
  - Data persistence
  - Terminal I/O

### Test Documentation (TAD)

Promoted tests MUST include Test Doc blocks with 5 fields:

```go
// Test Doc:
// - Why: <business/bug/regression reason>
// - Contract: <what invariant this asserts>
// - Usage Notes: <how to call, gotchas>
// - Quality Contribution: <what failures it catches>
// - Worked Example: <inputs/outputs summary>
```

---

## Quality Gates

### CI Gates (All Required)

- All tests MUST pass (unit + integration suites)
- Coverage MUST be at least 80%
- Go code MUST pass gofmt + configured linter
- TypeScript/JavaScript MUST pass ESLint + Prettier
- TypeScript MUST compile in strict mode with no errors
- Dependency vulnerability scans MUST pass
- Go binary MUST build successfully
- Vite production build MUST succeed
- Electron build MUST succeed (for desktop releases)

### Manual Gates

- At least 1 code review approval MUST be obtained before merge

### Documentation Gates

- Documentation MUST be updated with code changes
- README MUST be updated when user-facing behavior changes

---

## Coding Standards

### Go Backend

- Exported functions/types MUST have godoc-style comments
- Internal functions SHOULD only be commented when non-obvious
- Comments MUST explain WHY, not WHAT

### TypeScript Frontend

- Exported functions/components MUST have JSDoc comments
- Complex props SHOULD be documented with JSDoc or inline comments
- TypeScript strict mode MUST be enabled

### General

- If code requires reading twice to understand, a comment MUST be added

---

## Architecture Rules

### Component Boundaries

- trex MUST NOT implement tmux integration directly
- All tmux operations MUST use tmax library
- New tmux functionality MUST be requested via tmax GitHub issues

### Performance

- Terminal latency MUST be under 50ms
- UI MUST feel native and responsive

### Security (v1)

- trex MUST only bind to localhost
- No authentication is required for v1 (local trust model)
- Terminal history SHOULD be handled carefully (may contain secrets)

---

## Distribution Rules

### Distribution Targets

- trex MUST support both Web and Electron distributions in v1
- Web mode (`trex`): Go binary MUST embed Vite static build
- Electron mode (`trex-desktop`): MUST bundle Electron + Go backend + frontend
- React components MUST be 100% shared between Web and Electron
- Go backend MUST be identical for both modes

### Updates

- `trex update` command MUST be provided for self-updates
- Manual downloads SHOULD NOT be required after initial install

### First-Run

- First-run wizard MUST guide user through setup
- Permission checks MUST be performed with clear messaging
- Config file MUST be generated automatically (not required upfront)

---

## Observability Rules

### Logging

- Logging MUST use OpenTelemetry
- Log format MUST be structured JSON
- Standard log levels MUST be supported (debug, info, warn, error)

### Metrics

- Health check endpoint MUST be exposed
- Session count metrics MUST be tracked
- Latency and memory metrics SHOULD be available

### Startup Diagnostics

- Pre-flight checks MUST run before server starts
- trex MUST fail to start if critical dependencies are missing
- Failure messages MUST clearly explain what's wrong and how to fix it

**Required startup checks**:
- tmux available in PATH
- tmux server accessible
- Port not already in use
- XDG directories writable

---

## Complexity Estimation Rules

### CS 1-5 System

- Time estimates MUST NOT be used
- Complexity Score (CS 1-5) MUST be used for all estimation
- All estimates MUST include the 6-factor breakdown (S, I, D, N, F, T)

### CS ≥ 4 Requirements

For Large (CS-4) or Epic (CS-5) work:
- Feature flags MUST be used for staged rollout
- Rollback plan MUST be documented
- ADR MUST be created for architectural decisions

---

## Dependency Rules

### Evaluation

- License MUST be MIT-compatible (MIT preferred)
- Cutting-edge dependencies MUST receive extra scrutiny
- Maintenance signals MUST be checked (activity, responsiveness, maintainer count)
- Known vulnerabilities MUST be checked before adding

### Hygiene

- Dependencies MUST be checked for updates monthly at minimum
- Lock files (`go.sum`, `package-lock.json`) MUST be committed
- Vulnerability scanning (Dependabot, npm audit, govulncheck) MUST be configured

### Philosophy

- Existing libraries SHOULD be leveraged over building in-house
- Fewer, well-chosen dependencies SHOULD be preferred

---

## Documentation Rules

### Required Documentation

| Document | Requirement |
|----------|-------------|
| README.md | MUST update when user-facing behavior changes |
| ADRs | MUST create for significant architectural decisions |
| API Docs (REST) | MUST document all endpoints (OpenAPI 3.0) |
| API Docs (WebSocket) | MUST document protocol |
| CHANGELOG.md | MUST update for every release |

---

## Data Persistence Rules

### Storage

- Configuration MUST be stored in XDG-compliant paths
- Data format MUST be JSON
- Lock files MUST be committed

### Session Management

- trex MUST NOT persist tmux sessions (tmux handles this)
- trex MUST rediscover available sessions on startup
- Favorites, groups, and preferences MUST be persisted

---

## Governance Rules

### Contributions

- Issues MUST be created before PRs (except small fixes/typos)
- Feature proposals MUST be discussed for CS ≥ 3 work
- Maintainer approval MUST be obtained before merge

### Constitution Changes

- Anyone MAY propose changes via GitHub issues
- Maintainer MUST approve all changes
- Semantic versioning MUST be used for constitution versions
- Changelog MUST be updated for all doctrine changes

---

See [Constitution](./constitution.md) for rationale and context.
