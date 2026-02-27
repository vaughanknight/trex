# Session State Apply

Apply or update session state injection blocks in all skill files.

## What This Does

1. Reads the schema from `backend/config/session-state-schema.yaml`
2. Discovers skill files (asks user for location if not found)
3. For each skill file, injects or updates a `<!-- SESSION_STATE_BEGIN -->` / `<!-- SESSION_STATE_END -->` block
4. The block contains SQL that the agent executes on skill entry to update `session_state`
5. Validates injections against the schema
6. Reports what was added/updated/unchanged

## How to Run

This script is executed by the AI agent (Copilot CLI) inside the trex project. The agent reads these instructions and uses its tools (view, edit, glob) to patch files.

```
/session-state-apply
```

## Steps

### Step 1: Read Schema

Read `backend/config/session-state-schema.yaml` from the project root. Parse the `skills` section to get per-skill context mappings.

### Step 2: Discover Skill Files

Search for skill files:
1. Check `.claude/commands/*.md` in the project root
2. Check `~/.claude/commands/*.md` (user-level)
3. If neither found, ask the user for the skill file directory

List all discovered `.md` files and confirm with the user: "Found N skill files in <path>. Proceed?"

### Step 3: Generate Injection Block Per Skill

For each skill file, generate an injection block based on the schema mapping:

```markdown
<!-- SESSION_STATE_BEGIN -->
<!-- Auto-managed by session-state-apply. Do not edit manually. -->
<!-- On skill entry, update session_state table with context: -->
<!--
INSERT OR REPLACE INTO session_state (key, value, updated_at) VALUES
  ('current_skill', '{SKILL_ID}', datetime('now')),
  ('workflow_phase', '{PHASE}', datetime('now')),
  ('status', 'in_progress', datetime('now')),
  ('activity', '{ACTIVITY_TEMPLATE}', datetime('now'));
-->
<!-- SESSION_STATE_END -->
```

Where `{SKILL_ID}`, `{PHASE}`, `{ACTIVITY_TEMPLATE}` come from the schema's `skills` section.

### Step 4: Inject or Update

For each skill file:
1. Check if `<!-- SESSION_STATE_BEGIN -->` exists
2. If YES: replace everything between BEGIN and END with the new block (idempotent update)
3. If NO: insert the block after the frontmatter/description section (before the first `#` heading)
4. Preserve all other content unchanged

### Step 5: Validate

After injection:
1. Verify each skill file still has valid markdown structure
2. Verify the injection block contains all required keys from schema (`current_skill`, `workflow_phase`, `status`, `activity`)
3. Report: "Updated N files, skipped M files (already current), errors E files"

### Step 6: Report

Output a summary table:

| Skill File | Status | Skill ID | Phase |
|-----------|--------|----------|-------|
| plan-1a-explore.md | ✅ Updated | plan-1a | Discovery |
| plan-6-implement-phase.md | ⏭ Unchanged | plan-6 | Execution |

## Idempotency

Running this script multiple times produces identical results. The `<!-- SESSION_STATE_BEGIN/END -->` delimiters ensure only the injection block is modified, never the skill's actual instructions.

## Adding New Keys

1. Add the key to `backend/config/session-state-schema.yaml`
2. Run this script again — all skill files will be updated with the new key
