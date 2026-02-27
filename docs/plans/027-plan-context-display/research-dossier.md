# Research Report: Session State System — Full Workflow Awareness

**Generated**: 2026-02-26T22:52:00Z
**Updated**: 2026-02-26T23:36:00Z
**Research Query**: "Session state infrastructure — schema, skill injection, meta-skill, and visualisation"
**Location**: docs/plans/027-plan-context-display/
**Complexity**: CS-3 (medium) — schema design + skill injection + meta-skill + widget updates

## Executive Summary

### Vision
A complete session state system that:
1. **Defines a schema** for session context data (plan, phase, task, skill, status)
2. **Injects state updates** into every skill file as a reusable snippet
3. **Provides a meta-skill** that can reapply/update the injection across all skill files
4. **Visualises the state** in the title bar, sidebar, and panel via the existing plugin system

### Why This Matters
When a user opens a terminal running Copilot CLI, the UI should answer "what am I doing here?" at all times — whether exploring, specifying, architecting, implementing, or reviewing. The state should update automatically as skills are invoked, not depend on the agent's memory.

### Four Layers

| Layer | What | Deliverable |
|-------|------|-------------|
| **Schema** | Define `session_state` table structure, key conventions, types, validation | Schema definition file + SQL migration |
| **Injection** | Reusable SQL snippet that any skill calls on entry to update state | Shared include/template that skills reference |
| **Meta-skill** | `/session-state-apply` skill that rewrites all skill files to include the injection | New skill file that scans + patches skill files |
| **Visualisation** | Backend reads schema, frontend displays context in all 3 surfaces | Extend existing Copilot plugin reader + widgets |

### Schema Design (Draft)

```sql
CREATE TABLE IF NOT EXISTS session_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Core keys (always present):
-- current_skill        → 'plan-6'
-- workflow_phase       → 'Execution'
-- status              → 'in_progress'
-- last_updated        → ISO timestamp

-- Plan context (present when working on a plan):
-- plan_slug           → '025-visualisation-plugins'  
-- plan_name           → 'Visualisation Plugin System'
-- plan_number         → '025'

-- Phase context (present during plan-5/6/7):
-- phase_heading       → 'Phase 3: Rendering Surfaces'
-- phase_number        → '3'
-- total_phases        → '5'

-- Task context (present during plan-6):
-- current_task_id     → 'T004'
-- current_task_title  → 'Wire panel clicks'
-- task_status         → 'in_progress'

-- Activity description (always present):
-- activity            → 'Implementing Phase 3 task 4 of 6'
```

### Injection Template (Draft)

Each skill file would include at its start:

```
## Session State Update (auto-injected)
Before any other work, update session state:
\`\`\`sql
INSERT OR REPLACE INTO session_state (key, value, updated_at) VALUES
  ('current_skill', '<SKILL_ID>', datetime('now')),
  ('workflow_phase', '<PHASE_NAME>', datetime('now')),
  ('status', 'in_progress', datetime('now')),
  ('activity', '<DESCRIPTION>', datetime('now'));
\`\`\`
```

The meta-skill would replace `<SKILL_ID>`, `<PHASE_NAME>`, `<DESCRIPTION>` with skill-specific values when applying.

### Meta-Skill Approach

A new skill `/session-state-apply` that:
1. Reads a schema definition file (JSON/YAML) listing all skills and their state values
2. Scans all skill files in `~/.claude/commands/`
3. Injects or updates the session state block in each skill
4. Reports what was updated

This means: change the schema once, run the meta-skill, all skills updated.

### All 15+ Skills and Their Context

| Skill | Phase | Activity Description Template |
|-------|-------|-------------------------------|
| plan-0 | Setup | "Setting up project constitution" |
| plan-1a | Discovery | "Exploring: {research query}" |
| plan-1b | Specification | "Specifying: {plan name}" |
| plan-2 | Clarification | "Clarifying: {plan name}" |
| plan-2c | Workshop | "Workshopping: {topic}" |
| plan-3 | Architecture | "Architecting: {plan name}" |
| plan-4 | Validation | "Validating plan readiness" |
| plan-5 | Tasking | "Creating tasks: {phase heading}" |
| plan-6 | Execution | "Implementing: {phase} — {task}" |
| plan-6a | Progress | "Updating progress: {task}" |
| plan-7 | Review | "Reviewing: {phase heading}" |
| iterate-1 | Iteration | "Establishing baseline: {artifact}" |
| iterate-2 | Iteration | "Planning iteration" |
| iterate-3 | Iteration | "Iterating: round {n}" |
| didyouknow | Reflection | "Critical insights — while {phase}" |
| util-0 | Handover | "Generating handover" |

## Next Steps
Run `/plan-1b-specify` to formalize into a spec with acceptance criteria.
