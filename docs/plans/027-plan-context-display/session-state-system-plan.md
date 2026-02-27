# Session State System — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-27
**Spec**: [./session-state-system-spec.md](./session-state-system-spec.md)
**Research**: [./research-dossier.md](./research-dossier.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Phase 1: Schema & Backend Reader](#phase-1-schema--backend-reader)
6. [Phase 2: Meta-Skill & Injection](#phase-2-meta-skill--injection)
7. [Phase 3: Frontend Widgets & Documentation](#phase-3-frontend-widgets--documentation)
8. [Cross-Cutting Concerns](#cross-cutting-concerns)
9. [Progress Tracking](#progress-tracking)
10. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Terminal panes show task progress (pills, rings) but no context about *what* plan, phase, or activity is active. Users can't tell at a glance whether they're exploring, architecting, or implementing.

**Solution**:
- YAML schema at `backend/config/session-state-schema.yaml` defining all context keys
- Backend reader extended to query `session_state` table with PID/cwd session matching
- Meta-skill at `scripts/session-state-apply.md` that patches skill files with state update injection
- Frontend widgets show plan name, phase, activity description across all 3 surfaces

**Complexity**: CS-3 (medium) — S=2, I=0, D=1, N=1, F=0, T=1

---

## Technical Context

### Current System State
- Copilot plugin reads `todos` from "most recently modified" session DB
- No `session_state` table queried by reader
- No plan/phase/activity context flows to frontend
- Skill files have no session state update blocks
- Multi-session scenarios show wrong data (all panes see same DB)

### Constraints
- **ADR-0004**: Fakes only (temp dirs for meta-skill tests)
- **Meta-skill is trex-specific**: lives at `scripts/session-state-apply.md`, NOT `~/.claude/commands/`
- **Skill discovery**: dynamic, don't assume `~/.claude/commands/`
- **PID/cwd matching**: correct from day one for multi-session

### Gate Validation

**Clarify Gate**: ✅ All 9 questions resolved (C1-C9).

**Constitution Gate**: ✅ No deviations.

**ADR Ledger**:

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Active | All phases | Fakes only. Temp dirs for meta-skill tests. |
| ADR-0013 | Active | Phase 1, 3 | Plugin architecture — extends existing copilot plugin. |

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Reader Must Match Session DB by PID/CWD
**Impact**: Critical
**Problem**: `findLatestSessionDB()` uses modification time — all panes see same DB in multi-session scenarios.
**Solution**: Extend `Collect()` to receive PID+CWD from `pollCwd`. Match session DB by comparing cwd against session directory contents. Fall back to most-recently-modified for single-session.
**Affects Phases**: Phase 1

### 🚨 Critical Discovery 02: backend/config/ Directory Doesn't Exist
**Impact**: Critical
**Problem**: Schema destination `backend/config/` doesn't exist. No YAML library in go.mod.
**Solution**: Create directory. Schema is read by the meta-skill (agent reads YAML), not by Go code. Go reader just does `SELECT * FROM session_state` dynamically — no YAML parsing needed in Go.
**Affects Phases**: Phase 1

### 🔴 High Discovery 03: Collector Has No PID Context
**Impact**: High
**Problem**: `DataCollector.Collect()` has no parameters — can't pass PID/CWD for session matching.
**Solution**: Extend `Collect()` signature to accept session context, or add a `SetContext(pid int, cwd string)` method.
**Affects Phases**: Phase 1

### 🔴 High Discovery 04: Skill File Format Must Be Validated
**Impact**: High
**Problem**: Meta-skill patches skill files with HTML comment delimiters. Format consistency untested.
**Solution**: TDD with real skill file samples copied to temp directory. Validate injection + extraction round-trips.
**Affects Phases**: Phase 2

### 🟡 Medium Discovery 05: Frontend Data Interface Extension
**Impact**: Medium
**Problem**: `CopilotData` interface has no plan context fields.
**Solution**: Add optional `activity`, `planName`, `currentSkill`, `workflowPhase`, `phaseNumber`, `totalPhases` fields. Graceful degradation when absent.
**Affects Phases**: Phase 3

### 🟡 Medium Discovery 06: Concurrent Skill Execution Could Race
**Impact**: Medium
**Problem**: Two skills running simultaneously could overwrite each other's `session_state` keys.
**Solution**: SQLite serializes writes. Last-write-wins is acceptable for this use case (skills are sequential in practice). Document as known limitation.
**Affects Phases**: Phase 1

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Hybrid (per spec C2)
- **TDD**: Phase 2 (meta-skill file patching — highest risk)
- **Lightweight**: Phase 1 (backend reader), Phase 3 (frontend widgets)
- **Fakes only**: ADR-0004. Temp directories with copied skill files for Phase 2.

### Test Commands
```bash
# Backend
cd backend && go test ./internal/plugins/copilot/... -v

# Frontend
cd frontend && npm run build && npx vitest run
```

---

## Phase 1: Schema & Backend Reader

**Objective**: Define the schema, extend the backend reader to query `session_state`, and implement PID/cwd session matching.

**Testing**: Lightweight — backend build + existing tests pass.

### Tasks

| # | Status | Task | CS | Success Criteria | Notes |
|---|--------|------|----|------------------|-------|
| 1.1 | [ ] | Create `backend/config/session-state-schema.yaml` | 1 | Schema defines all keys with types, descriptions, skill mappings. | Validation contract, read by meta-skill |
| 1.2 | [ ] | Extend `DataCollector` interface with session context | 2 | `Collect()` receives `pid int, cwd string` or new `CollectWithContext()` method. Fake updated. | Backward compatible — old signature still works |
| 1.3 | [ ] | Implement PID/cwd session DB matching | 3 | `findSessionDBForProcess(pid, cwd)` matches by comparing cwd to session directory. Falls back to most-recent. | Replaces `findLatestSessionDB` for copilot collector |
| 1.4 | [ ] | Extend reader to query `session_state` table | 2 | Reader queries `SELECT key, value FROM session_state` and includes in `CopilotData` JSON. Graceful if table missing. | New `context` field in JSON output |
| 1.5 | [ ] | Update `pollCwd` to pass PID/cwd to collectors | 1 | Collector invocation passes session PID and cwd. | Wire existing data through |
| 1.6 | [ ] | Backend build + tests pass | 1 | `go build ./...` clean. `go test ./...` pass. | |

### Acceptance Criteria
- [ ] Schema YAML defines all session_state keys (AC-01)
- [ ] Reader queries session_state alongside todos (AC-08)
- [ ] PID/cwd matching selects correct session DB per pane (spec C9)
- [ ] Graceful degradation when session_state table missing (AC-13)

---

## Phase 2: Meta-Skill & Injection

**Objective**: Create the meta-skill that patches skill files with session state update blocks.

**Testing**: TDD — test with fake skill files in temp directories.

### Tasks

| # | Status | Task | CS | Success Criteria | Notes |
|---|--------|------|----|------------------|-------|
| 2.1 | [ ] | Create `scripts/session-state-apply.md` | 3 | Meta-skill instructions: discover skill files, read schema, inject/update blocks. Clear step-by-step. | Trex-specific, NOT in ~/.claude/ |
| 2.2 | [ ] | Define injection block template | 2 | Template uses `<!-- SESSION_STATE_BEGIN/END -->` delimiters. Per-skill SQL with correct keys. | Per spec C8 |
| 2.3 | [ ] | Test injection on 2-3 real skill files (copy to temp) | 2 | Copy real skill files, inject, verify block present, verify skill content preserved. Idempotent. | TDD with fakes |
| 2.4 | [ ] | Apply injection to all plan skill files | 2 | All `plan-*` skill files have session state blocks. Validate against schema. | Confirm with user before writing |
| 2.5 | [ ] | Verify injection idempotency | 1 | Running meta-skill twice produces identical output. | |

### Acceptance Criteria
- [ ] Meta-skill at `scripts/session-state-apply.md` (AC-06)
- [ ] Injection blocks use HTML comment delimiters (spec C8)
- [ ] All skill files contain state update SQL (AC-05)
- [ ] Idempotent — running twice = same result (AC-06)
- [ ] New skills detected and offered injection (AC-07)

---

## Phase 3: Frontend Widgets & Documentation

**Objective**: Update plugin widgets to show plan context. Create docs.

**Testing**: Lightweight — build + manual visual verification.

### Tasks

| # | Status | Task | CS | Success Criteria | Notes |
|---|--------|------|----|------------------|-------|
| 3.1 | [ ] | Extend TitleBarWidget with activity display | 2 | Shows `activity` text before pills when present. Truncated for space. | AC-09 |
| 3.2 | [ ] | Extend SidebarWidget with plan context | 1 | Plan name as tooltip on rings. | AC-10 |
| 3.3 | [ ] | Extend PanelWidget with full context header | 2 | Header section: plan name, phase, skill, activity. Above task list. | AC-11 |
| 3.4 | [ ] | Add plan context visibility to plugin settings | 1 | Per-surface toggles for plan context display. | AC-12 |
| 3.5 | [ ] | Create `docs/how/session-state.md` | 2 | Documents schema keys, meta-skill usage, how to add new keys. | Per spec C4 |
| 3.6 | [ ] | Build + test + manual verification | 1 | Build clean. Tests pass. Widgets show context when data present, graceful when absent. | |

### Acceptance Criteria
- [ ] Title bar shows activity (AC-09)
- [ ] Sidebar shows plan context (AC-10)
- [ ] Panel shows full context header (AC-11)
- [ ] Settings control visibility per surface (AC-12)
- [ ] Documentation created
- [ ] Build clean, tests pass

---

## Cross-Cutting Concerns

### Security
- Session state is local-only (no external data)
- Schema YAML is read-only reference (no code execution)
- Meta-skill requires user confirmation before writing files

### Observability
- Backend logs session DB matching decisions at DEBUG level
- Frontend logs plan context presence/absence at console.debug

### Documentation
- **Location**: `docs/how/session-state.md`
- **Content**: Schema reference, meta-skill usage, adding new keys, troubleshooting

---

## Progress Tracking

### Phase Completion Checklist
- [ ] Phase 1: Schema & Backend Reader - Not Started
- [ ] Phase 2: Meta-Skill & Injection - Not Started
- [ ] Phase 3: Frontend Widgets & Documentation - Not Started

### STOP Rule
Run `/plan-4-complete-the-plan` to validate, then `/plan-5` + `/plan-6` per phase.

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
