# Session State System

> **Last updated**: 2026-02-27 | **Plan**: [027-plan-context-display](../plans/027-plan-context-display/)

## Overview

The session state system answers "what am I doing here?" at all times. It tracks the active skill, workflow phase, plan, and task context in a SQLite `session_state` table that the Copilot todo plugin reads and displays in the terminal workspace.

## How It Works

```
Skill invoked → Agent updates session_state table → Backend polls every 5s →
Backend reads session_state + todos → WebSocket plugin_data → Frontend widgets show context
```

## Schema

The `session_state` table is a key-value store:

```sql
CREATE TABLE IF NOT EXISTS session_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Core Keys (set by every skill)

| Key | Example | Description |
|-----|---------|-------------|
| `current_skill` | `plan-6` | Active skill ID |
| `workflow_phase` | `Execution` | Human-readable phase |
| `status` | `in_progress` | Current status |
| `activity` | `Implementing Phase 3` | Display description |

### Plan Context (set by plan skills, inherited)

| Key | Example | Description |
|-----|---------|-------------|
| `plan_name` / `active_plan_name` | `Visualisation Plugin System` | Plan name |
| `plan_slug` / `active_plan` | `025-visualisation-plugins` | Plan folder slug |
| `phase_heading` / `active_phase` | `Phase 3: Rendering Surfaces` | Current phase |
| `phase_number` / `active_phase_number` | `3` | Phase number |
| `total_phases` | `5` | Total phases |

### Task Context (set during plan-6)

| Key | Example | Description |
|-----|---------|-------------|
| `current_task_id` | `T004` | Task ID |
| `current_task_title` | `Wire panel clicks` | Task title |

## Skill Injection

Each skill file has an HTML comment block that tells the agent what SQL to run on skill entry:

```html
<!-- SESSION_STATE_BEGIN -->
<!-- sql: INSERT OR REPLACE INTO session_state (key, value) VALUES
  ('current_skill', 'plan-6'), ('workflow_phase', 'Execution'),
  ('status', 'in_progress'), ('activity', 'Implementing phase'); -->
<!-- SESSION_STATE_END -->
```

These blocks are managed by the meta-skill at `scripts/session-state-apply.md`.

## Meta-Skill

To update all skill files after schema changes:

```
/session-state-apply
```

This reads `backend/config/session-state-schema.yaml` and patches all skill files.

## Display

The Copilot todo plugin's widgets show plan context:
- **Title bar**: Activity text + phase pills + task pills
- **Sidebar**: Activity rings with plan name tooltip
- **Panel**: Plan name, phase heading, and activity as header above task list

## Key Files

| File | Purpose |
|------|---------|
| `backend/config/session-state-schema.yaml` | Schema definition (validation contract) |
| `backend/internal/plugins/copilot/reader.go` | Reads session_state + todos from SQLite |
| `scripts/session-state-apply.md` | Meta-skill for injection management |
| `frontend/src/plugins/copilot-todos/*.tsx` | Widget components showing context |
