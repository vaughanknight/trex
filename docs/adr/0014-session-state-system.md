---
id: ADR-0014
title: "Session State System — Workflow-Aware Terminal Context"
status: accepted
date: 2026-02-27
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["session-state", "plugins", "workflow", "context"]
complexity: CS-3
---

# ADR-0014: Session State System — Workflow-Aware Terminal Context

## Context

The terminal workspace shows task progress (pills, rings) but has no context about *what* plan, phase, or activity is active. A user switching between terminals or returning after a break can't tell at a glance whether they're exploring, architecting, or implementing. The agent (Copilot CLI) works through 15+ skill phases but no state persists between them.

## Decision Drivers

- Visibility: "What am I doing here?" should be answerable at a glance
- Reliability: State updates must be mechanical (skill-driven), not memory-dependent
- Extensibility: New skills should be injectable without modifying existing infrastructure
- Multi-session: Each terminal pane should show its own session's context, not a global state

## Decision

**Four-layer session state system**:

### 1. Schema (`backend/config/session-state-schema.yaml`)
YAML validation contract defining all `session_state` keys with types, descriptions, which skills set them, and inheritance rules. Not runtime config — the Go backend reads the table dynamically.

### 2. Injection (HTML comment blocks in skill files)
Each skill file contains a `<!-- SESSION_STATE_BEGIN/END -->` block with SQL that the agent executes on skill entry. The block updates core keys (`current_skill`, `workflow_phase`, `status`, `activity`) with skill-specific values.

### 3. Meta-Skill (`scripts/session-state-apply.md`)
A trex-specific script that reads the schema, discovers skill files dynamically, and injects/updates the state blocks. Idempotent — running twice produces identical results. Uses HTML comment delimiters for safe, invisible injection.

### 4. Visualisation (existing plugin system)
The Copilot plugin's backend reader queries `session_state` alongside `todos` and includes plan context in the JSON payload. Frontend widgets show activity, plan name, and phase in title bar, sidebar, and detail panel.

### Session Matching
Backend matches session DB to terminal pane by PID/cwd of the detected Copilot process — not "most recently modified." Correct behavior for multi-tab/multi-worktree scenarios.

## Consequences

### Positive
- Terminal always shows current activity context
- Skills update state mechanically via injection blocks
- Schema changes propagate to all skills via meta-skill (change once, apply everywhere)
- Multi-session correct — each pane shows its own context
- Backward compatible — graceful degradation when session_state table missing

### Negative
- Agent must read and execute the injection block SQL on skill entry (currently manual)
- 22 skill files modified with injection blocks
- PID/cwd matching adds complexity to session DB lookup

### Neutral
- Schema YAML is documentation/validation, not runtime config
- Meta-skill is trex-specific (not in `~/.claude/commands/`)
- Session state is ephemeral per Copilot CLI session

## Implementation Notes

- Injection delimiters: `<!-- SESSION_STATE_BEGIN -->` / `<!-- SESSION_STATE_END -->` (invisible in rendered markdown)
- Core keys (always set): `current_skill`, `workflow_phase`, `status`, `activity`
- Plan context keys (inherited): `plan_name`, `plan_slug`, `phase_heading`, `phase_number`, `total_phases`
- Task context keys (during execution): `current_task_id`, `current_task_title`
- PID/cwd matching falls back to most-recently-modified for single-session setups

## References

- [Plan 027: Session State System](../plans/027-plan-context-display/session-state-system-plan.md)
- [Spec](../plans/027-plan-context-display/session-state-system-spec.md)
- [Schema](../config/session-state-schema.yaml)
- [Meta-Skill](../../scripts/session-state-apply.md)
- [Session State Guide](../how/session-state.md)
- [ADR-0013: Visualisation Plugin Architecture](./0013-visualisation-plugin-architecture.md) — data flows through existing plugin system
