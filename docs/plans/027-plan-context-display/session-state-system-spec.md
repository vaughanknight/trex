# Session State System — Full Workflow Awareness

**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md` and interactive Q&A.

## Research Context

- **Components affected**: Copilot plugin reader (Go), frontend plugin widgets, all 15+ skill files in `~/.claude/commands/`, new meta-skill, session SQLite DB schema
- **Critical dependencies**: Existing `session_state` table (already created), Copilot todo plugin pipeline (already working), skill file format conventions
- **Modification risks**: Patching skill files requires careful template management; schema changes affect both backend reader and frontend consumers
- **Link**: See `research-dossier.md` for full analysis including 4-layer architecture and skill mapping

## Summary

Create a session state system that answers "what am I doing here?" at all times. Four layers: a defined schema for session context data, an injection mechanism that updates state when any skill is invoked, a meta-skill that applies/reapplies injections across all skill files, and visualisation of the state in the terminal workspace via the existing plugin system.

**WHY**: The terminal workspace shows task progress (pills, rings) but has no context about *what* plan, phase, or activity is active. A user switching between terminals — or returning after a break — can't tell at a glance whether they're exploring, architecting, or implementing. The state should update automatically as skills are invoked, making the terminal self-documenting.

## Goals

1. **Schema definition** — A well-defined `session_state` table with documented keys, types, and lifecycle rules. Core keys (skill, phase, status, activity) are always present; plan/phase/task keys appear contextually.
2. **Skill injection** — Every skill file includes a session state update block that fires on skill entry. The block updates core keys with skill-specific values and preserves plan context from prior skills.
3. **Meta-skill** — A `/session-state-apply` skill that reads a schema definition, scans all skill files, and injects/updates the state update block. Change the schema once, run one command, all skills updated.
4. **Visualisation** — The Copilot plugin's backend reader reads `session_state` alongside `todos`, and the frontend widgets display plan name, phase, and activity description in the title bar, sidebar, and panel.
5. **Schema evolution** — Adding new keys or modifying the schema is a single-file change followed by running the meta-skill. No manual editing of individual skill files.

## Non-Goals

- **Cross-session state sharing** — Each Copilot CLI session has its own `session_state`. No aggregation across sessions.
- **State persistence across restarts** — `session_state` is ephemeral per session. It's recreated when a skill runs.
- **Non-skill state tracking** — Only skill invocations update state. Manual terminal commands don't trigger updates.
- **Real-time sub-second updates** — State updates on skill entry, not continuously. The 5s poll interval is sufficient.
- **Modifying skill logic** — The injection only adds a state update preamble. It doesn't change how skills work.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=0, D=1, N=1, F=0, T=1
  - Surface Area (S=2): 15+ skill files to patch, backend reader, frontend widgets, new meta-skill, schema definition
  - Integration (I=0): All internal — no external dependencies
  - Data/State (D=1): New `session_state` schema with key conventions; minor reader extension
  - Novelty (N=1): Meta-skill (file patching) is new pattern; schema design needs thought
  - Non-Functional (F=0): No performance/security concerns
  - Testing/Rollout (T=1): Integration test for reader; manual verification of skill injection
- **Confidence**: 0.85
- **Assumptions**:
  - Skill files follow a consistent markdown format that can be pattern-matched for injection
  - The `session_state` table survives within a Copilot CLI session (same DB as `todos`)
  - Backend reader can query `session_state` in the same DB read as `todos`
  - Skill file patching is idempotent (running meta-skill twice produces same result)
- **Dependencies**: Existing Copilot todo plugin (Plan 025) must be working
- **Risks**:
  - Skill file format may vary — injection template must be resilient
  - Meta-skill patching could corrupt skill files if template matching fails
  - Schema keys may need to evolve — migration strategy needed
- **Phases**: 4 phases (schema → injection + meta-skill → backend reader → frontend widgets)

## Acceptance Criteria

**AC-01: Schema defined**
A schema definition file (JSON or YAML) in the repository lists all `session_state` keys with their names, types, descriptions, which skills set them, and whether they're required or contextual.

**AC-02: Table creation**
The `session_state` table is created with `key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMP` if it doesn't exist. Table creation is idempotent.

**AC-03: Core keys always present**
After any skill invocation, `session_state` contains at minimum: `current_skill`, `workflow_phase`, `status`, `activity`. These are non-null.

**AC-04: Plan context keys preserved**
When a skill sets plan context (e.g., `plan-1b` sets `plan_name`), subsequent skills that don't explicitly set plan context preserve the existing values. Only skills that change plans overwrite them.

**AC-05: Skill injection block**
Each skill file contains a session state update section with SQL that inserts/replaces the appropriate keys. The block is clearly delimited for the meta-skill to find and update.

**AC-06: Meta-skill applies injections**
Running `/session-state-apply` reads the schema definition and patches all skill files in `~/.claude/commands/`. It's idempotent — running twice produces the same result. It reports what was added/updated/unchanged.

**AC-07: Meta-skill handles new skills**
When a new skill file is added without a state injection block, the meta-skill detects it and offers to inject the block with sensible defaults.

**AC-08: Backend reads session_state**
The Copilot plugin's `reader.go` queries `session_state` alongside `todos` and includes plan context (plan name, phase, activity) in the JSON payload sent to the frontend.

**AC-09: Title bar shows activity**
The title bar widget displays the `activity` value (e.g., "Exploring: Plugin system") when available, before the phase pills. Truncated for space.

**AC-10: Sidebar shows plan context**
The sidebar widget shows plan name as a tooltip or compact label alongside the activity rings.

**AC-11: Panel shows full context**
The detail panel shows plan name, current phase, activity description, and current skill as a header section above the task list.

**AC-12: Settings control visibility**
Per-surface toggles in settings control whether plan context is shown in title bar, sidebar, and panel independently.

**AC-13: Graceful degradation**
If `session_state` table doesn't exist or has no data, widgets show task progress only (current behavior). No errors, no empty labels.

**AC-14: Schema evolution path**
Adding a new key to the schema definition file and running the meta-skill updates all skill files to include the new key. No manual editing required.

## Risks & Assumptions

### Risks
1. **Skill file format fragility** — If skill files have inconsistent formatting, the meta-skill's pattern matching may fail or corrupt content. Mitigation: use clear delimiters (`<!-- SESSION_STATE_BEGIN -->` / `<!-- SESSION_STATE_END -->`) and validate before writing.
2. **Key collisions** — Multiple skills running in quick succession could overwrite each other's context. Mitigation: core keys overwrite always; plan context uses "preserve if not explicitly set" semantics.
3. **Schema migration** — If key names change, old values persist in the DB. Mitigation: meta-skill can include a "cleanup" step that removes deprecated keys.

### Assumptions
1. Copilot CLI session DB is writable by the SQL tool during skill execution
2. Skill files are markdown with predictable structure
3. The meta-skill runs inside a Copilot CLI session with file system access to `~/.claude/commands/`
4. `session_state` table persists within a session but resets between sessions

## Open Questions

All open questions resolved in Clarifications session 2026-02-26. See `## Clarifications` section.

## ADR Seeds (Optional)

- **Decision Drivers**: Reliability (automatic, not memory-dependent), evolvability (schema changes propagate), non-intrusiveness (skills work the same, just with state updates)
- **Candidate Alternatives**:
  - A: Skill injection via meta-skill (chosen) — mechanical, reapplicable, schema-driven
  - B: Store memory convention — agent remembers to update state. Unreliable across context compactions.
  - C: Middleware/wrapper approach — a pre-skill hook that runs before every skill. Not supported by Copilot CLI architecture.
- **Stakeholders**: Single developer (alpha)

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Schema Key Design | Data Model | Key naming conventions, required vs contextual keys, and lifecycle rules affect every downstream consumer | What are the minimal core keys? How do contextual keys inherit/clear? Should keys be flat or hierarchical? |
| Skill File Patching Strategy | Integration Pattern | The meta-skill must reliably find, update, and preserve content in 15+ markdown files with varying formats | What delimiters are safe? How to handle edge cases (no frontmatter, already patched, custom modifications)? Should it use AST parsing or regex? |

## Testing & Documentation Strategy

### Testing Strategy
- **Approach**: Hybrid — TDD for meta-skill file patching (test with temp directories + fake skill files); Lightweight for backend reader extension and frontend widget updates
- **Rationale**: File patching is highest-risk operation; reader/widget changes are minor extensions
- **Focus Areas**: Injection idempotency, delimiter matching, schema validation, multi-session DB matching
- **Excluded**: Visual widget styling (manual verification)
- **Mock Usage**: Fakes only (ADR-0004). Test with temp directories containing fake skill files.

### Documentation Strategy
- **Location**: docs/how/ only — add session-state guide
- **Rationale**: Documents schema keys, meta-skill usage, and how to add new keys
- **Target Audience**: Future contributors and agents working in this codebase

## Clarifications

### Session 2026-02-26

**C1 — Workflow Mode**: Full mode (multi-phase). CS-3 warrants comprehensive planning.

**C2 — Testing Strategy**: Hybrid — TDD for meta-skill file patching, Lightweight for rest.

**C3 — Mock Usage**: Fakes only (ADR-0004). Temp directories with fake skill files for meta-skill tests.

**C4 — Documentation Strategy**: docs/how/ only — session-state guide.

**C5 — Schema Format & Location**: YAML format. Lives at `backend/config/session-state-schema.yaml` in trex repo. Acts as validation contract — agent validates injections against it. Reader queries `session_state` table dynamically (no hardcoded keys in Go).

**C6 — Meta-skill Location**: `scripts/session-state-apply.md` in trex repo. NOT in `~/.claude/commands/`. It's a trex-specific capability. The agent (Copilot CLI) reads the script and uses its own tools (view, edit, glob) to discover and patch skill files.

**C7 — Skill File Discovery**: Meta-skill discovers skill files dynamically — doesn't assume `~/.claude/commands/`. Scans from project root, checks common locations, confirms files with user before patching.

**C8 — Injection Delimiters**: HTML comments — `<!-- SESSION_STATE_BEGIN -->` / `<!-- SESSION_STATE_END -->`. Invisible in rendered markdown, greppable, parseable, scalable for future injectable blocks.

**C9 — Multi-Session Scoping**: Scope state to the specific Copilot session from day one. Match pane to session DB by PID/cwd of the detected Copilot process, not "most recently modified." Each pane sees its own plan context. Correct behavior for multi-tab/multi-worktree scenarios.

### Coverage Summary

| Area | Status |
|------|--------|
| Workflow Mode | ✅ Resolved — Full |
| Testing Strategy | ✅ Resolved — Hybrid (TDD + Lightweight) |
| Mock Usage | ✅ Resolved — Fakes only (ADR-0004) |
| Documentation | ✅ Resolved — docs/how/ session-state guide |
| Schema Format | ✅ Resolved — YAML at backend/config/ |
| Meta-skill Location | ✅ Resolved — scripts/session-state-apply.md |
| Skill Discovery | ✅ Resolved — dynamic, confirm with user |
| Injection Delimiters | ✅ Resolved — HTML comments |
| Multi-Session | ✅ Resolved — scope by PID/cwd from day one |
| Open Questions | 0 remaining |
