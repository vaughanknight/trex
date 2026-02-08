# Claude Code Instructions for trex

This file contains Claude-specific instructions for working on the trex project.

## Terminal Title Updates (REQUIRED)

You MUST update the terminal title to reflect your current work status. This provides visibility across multiple terminal sessions.

### How to Update Title

Use the provided scripts:

```bash
# When starting work on a plan
./scripts/set_title.sh working 008 P2/3 T3/25

# When waiting for user input (questions, confirmations, "what's next?")
./scripts/set_title.sh waiting 008 P2/3 T3/25

# When a phase is complete and ready for next
./scripts/set_title.sh phase-done 008 P3/3

# When a plan is complete
./scripts/set_title.sh plan-done 008-dynamic-session-titles

# When all work is done (idle)
./scripts/set_title.sh idle
```

### Title States

| State | When to Use | Example |
|-------|-------------|---------|
| `TR-008:P2/3:T3/25` | Actively working on task | Phase 2 of 3, Task 3 of 25 |
| `TR-008:T3/9` | Simple mode (no phases) | Task 3 of 9 |
| `TR-008:P2/3:T5/25:S2/4` | Working on subtask | Subtask 2 of 4 |
| `? TR-008:P2/3:T3/25` | Waiting for ANY user input | Questions, confirmations, "ready?" |
| `→ TR-008:P3/3` | Phase complete, ready for next | Arrow indicates "ready to proceed" |
| `✓ TR-008-dynamic-session-titles` | Plan complete | Checkmark with full slug |
| `trex` | Idle, no active work | Project name only |

### When to Update

1. **Starting a plan**: Set working state immediately
2. **Each task transition**: Update task counter (T3/25 → T4/25)
3. **Asking ANY question**: Add `?` prefix BEFORE asking
4. **User responds**: Remove `?` prefix, resume working state
5. **Phase complete**: Set `→` prefix
6. **Plan complete**: Set `✓` prefix with full slug
7. **All done**: Set idle state

### The `?` Prefix Rule

Add the `?` prefix whenever you stop and wait for user input, including:
- Using AskUserQuestion tool
- Asking "What's next?"
- Asking "Ready to continue?"
- Asking for clarification
- Waiting for approval
- Any pause that requires human response

Remove the `?` as soon as the user responds and you resume work.

## Project Configuration

The project config lives at `.config/project.json`:

```json
{
  "abbreviation": "TR",
  "name": "trex"
}
```

If the config doesn't exist, `scripts/project_title.sh` will auto-create it from the folder name.

## Reference

See `docs/project-rules/constitution.md` § Agent Workflow Status for the full specification.
