# Dynamic Session Titles via OSC Escape Sequences

**Mode**: Simple

## Summary

**WHAT**: Enable terminal sessions to dynamically update their sidebar display name based on OSC (Operating System Command) escape sequences sent by shell applications.

**WHY**: Currently, session names are static (`bash-1`, `zsh-2`) based on shell type. Users working with multiple terminal sessions cannot easily identify which session is running what command. When shells, editors (vim), multiplexers (tmux), or build tools send standard title escape sequences, trex should capture these and update the session name, providing at-a-glance context for each terminal.

---

## Goals

- **G1**: Capture OSC 0 and OSC 2 escape sequences from terminal output and update session display name
- **G2**: Provide immediate visual feedback in sidebar when session title changes
- **G3**: Preserve user's ability to manually rename sessions (user rename should take precedence)
- **G4**: Maintain existing session naming as fallback (shellType-count pattern)
- **G5**: Zero impact on terminal input latency or rendering performance

---

## Non-Goals

- **NG1**: Backend escape sequence parsing (frontend-only implementation)
- **NG2**: Persisting title history or title changes across page refresh
- **NG3**: Custom title formatting or truncation rules (use raw title as-is)
- **NG4**: Supporting OSC sequences beyond title (OSC 0, OSC 2) - e.g., no clipboard, hyperlinks
- **NG5**: Title change notifications or animations
- **NG6**: Server-side title state synchronization

---

## Complexity

**Score**: CS-2 (small)

**Breakdown**:
| Factor | Score | Rationale |
|--------|-------|-----------|
| Surface Area (S) | 1 | 2-3 files: Terminal.tsx, sessions.ts, possibly Session type |
| Integration (I) | 0 | Internal only, uses existing xterm.js API |
| Data/State (D) | 1 | Minor: add `userRenamed` flag to Session type |
| Novelty (N) | 0 | Well-specified, xterm.js API documented |
| Non-Functional (F) | 0 | Standard performance expectations |
| Testing (T) | 1 | Integration tests for title → store flow |

**Total**: P = 3 → **CS-2 (small)**

**Confidence**: 0.90

**Assumptions**:
- xterm.js `onTitleChange` event works as documented
- Title updates are infrequent enough to not cause performance issues
- Session store's `updateName()` handles rapid updates gracefully

**Dependencies**:
- xterm.js v6.0.0 (already installed, provides `onTitleChange`)

**Risks**:
- Shells may send rapid title updates during command execution (mitigated by store batching)
- Very long titles could overflow sidebar UI (accept for v1, truncation is non-goal)

**Phases**:
1. Add `onTitleChange` handler to Terminal.tsx
2. Add `userRenamed` flag to Session type for rename precedence
3. Add tests for title handling

---

## Acceptance Criteria

| ID | Criterion | Observable Outcome |
|----|-----------|-------------------|
| AC-01 | OSC 0 title capture | Running `echo -ne '\033]0;My Title\007'` in terminal updates sidebar session name to "My Title" |
| AC-02 | OSC 2 title capture | Running `echo -ne '\033]2;Window Title\007'` in terminal updates sidebar session name |
| AC-03 | User rename precedence | After user manually renames session to "Work", shell title updates do NOT override the name |
| AC-04 | Initial name fallback | New sessions start with `shellType-count` pattern (e.g., "bash-1") until first title change |
| AC-05 | Title restoration on clear | User can clear their custom name to re-enable automatic title updates |
| AC-06 | No input latency impact | Terminal input responsiveness remains under 5ms (existing benchmark) |
| AC-07 | Multi-session isolation | Title change in Session 1 does not affect Session 2's name |
| AC-08 | Event cleanup | No memory leaks from title event listeners (disposed on unmount) |

---

## Risks & Assumptions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Rapid title updates cause re-render storms | Medium | Store updates are already batched; monitor performance |
| Long titles overflow sidebar | Low | Accept for v1; CSS truncation already in place |
| Shell-specific title formats vary | Low | Pass through as-is; user can rename if needed |

### Assumptions

- xterm.js fires `onTitleChange` synchronously when parsing OSC sequences
- Users prefer dynamic titles over static names (can always manually rename)
- Title changes are infrequent (typically on directory change, command start)

---

## Testing Strategy

**Approach**: Lightweight
**Rationale**: CS-2 feature with well-defined xterm.js API; focus on core flow validation
**Focus Areas**:
- Title change → store update flow
- User rename precedence (userRenamed flag)
- Event listener cleanup on unmount
**Excluded**: Exhaustive OSC sequence parsing (xterm.js responsibility)
**Mock Usage**: Targeted mocks - mock xterm.js Terminal for unit tests only

---

## Documentation Strategy

**Location**: None
**Rationale**: Feature is discoverable through normal terminal usage; no user action required
**Target Audience**: N/A - transparent enhancement
**Maintenance**: N/A

---

## Open Questions

~~1. **Q1**: Should there be a global setting to disable automatic title updates entirely?~~
   - **Resolved**: Defer to v2 if requested; keep v1 simple

~~2. **Q2**: Should empty titles (`\033]0;\007`) clear the name back to shellType pattern?~~
   - **Resolved**: Yes, treat empty title as "reset to default" (shellType-count pattern)

~~3. **Q3**: Should the original shellType-based name be preserved anywhere for reference?~~
   - **Resolved**: Already stored in `session.shellType`; can reconstruct as needed

---

## Clarifications

### Session 2026-02-05

| Question | Resolution |
|----------|------------|
| Workflow Mode | Simple (pre-set, CS-2 complexity) |
| Testing Strategy | Lightweight - core flow validation |
| Empty title behavior | Reset to shellType pattern |
| Documentation | None - transparent enhancement |
| Global disable setting | Defer to v2 |

---

## ADR Seeds (Optional)

**Decision Drivers**:
- Minimize code changes (frontend-only preferred)
- Leverage existing xterm.js capabilities
- Preserve user agency (manual rename takes precedence)

**Candidate Alternatives**:
- A: Frontend-only with `onTitleChange` hook (recommended)
- B: Backend OSC parsing with metadata messages (over-engineered for this use case)
- C: Hybrid with server-side title persistence (unnecessary complexity)

**Stakeholders**: End users who work with multiple terminal sessions

---

## Research Context

📚 This specification incorporates findings from `/plan-1a-explore` research (console output).

**Key Findings**:
- xterm.js provides `Terminal.onTitleChange: IEvent<string>` (fires on OSC 0/2)
- Backend passes raw PTY bytes unchanged - no server modification needed
- Session store has `updateName(id, name)` action ready to use
- Prior learnings confirm shellType naming was intentional v1; title handling is enhancement

**Components Affected**:
- `frontend/src/components/Terminal.tsx` - Add event handler
- `frontend/src/stores/sessions.ts` - Add `userRenamed` flag to Session type
- `frontend/src/types/terminal.ts` - Optional: extend Session interface

**Critical Dependencies**:
- xterm.js `onTitleChange` event (available in v6.0.0)
- Existing `updateName()` store action

**Modification Risks**: Low - additive changes only, no existing behavior modified

---

*Spec created: 2026-02-05*
*Plan directory: `docs/plans/008-dynamic-session-titles/`*
