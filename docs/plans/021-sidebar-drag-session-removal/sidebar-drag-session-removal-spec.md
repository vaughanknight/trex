# Sidebar Session Removal on Drag-to-Layout

**Mode**: Simple
**File Management**: Legacy

## Research Context

📚 This specification incorporates findings from `research-dossier.md`

- **Components affected**: DropZoneOverlay, PaneContainer, FirstDragDropZone, workspace store, SessionList
- **Critical dependencies**: @atlaskit/pragmatic-drag-and-drop drag data contract, Zustand workspace store item management
- **Modification risks**: tmux sessions must remain unaffected (architecturally separate drag type); `convertToLayout()` has the same bug for the *source* session; URL sync must roundtrip correctly after item removal
- **Root cause identified**: `itemId` is present in drag data but never extracted by drop handlers; standalone workspace items are never cleaned up after a session is absorbed into a layout
- Link: See `research-dossier.md` for full analysis

## Summary

When a user drags a regular terminal session from the sidebar into an existing layout pane (or onto another standalone session), the session is correctly added to the layout's pane tree — but the original standalone sidebar entry persists. This creates a confusing duplicate where the session appears both as a sidebar item and inside the layout. The standalone sidebar entry should be removed when a session is absorbed into a layout.

**tmux sessions are the exception**: dragging a tmux session always creates a *new* terminal session attached to that tmux session. tmux sidebar items should always remain visible regardless of how many times they are dragged into layouts, because each drag produces an independent session.

## Goals

- **G-01**: When a regular session is dragged from the sidebar into a layout pane, its standalone sidebar entry disappears immediately
- **G-02**: When a regular session is dragged onto another standalone session (creating a new layout), the dragged session's standalone sidebar entry disappears
- **G-03**: tmux sessions remain visible in the sidebar at all times, regardless of how many times they are dragged into layouts
- **G-04**: tmux sessions can appear multiple times in the same layout or across different layouts (each as an independent terminal session)
- **G-05**: The fix is invisible to users — no new UI elements, no behavioral changes beyond the bug fix

## Non-Goals

- **NG-01**: Changing how tmux sessions work (they are architecturally correct already)
- **NG-02**: Adding undo/restore for sessions removed from sidebar after drag
- **NG-03**: Adding automated drag-and-drop tests (deferred per existing plan 015 Phase 7)
- **NG-04**: Modifying the drag preview, drop zone indicators, or split direction logic
- **NG-05**: Changing the 8-pane-per-layout cap or canDrop validation logic

## Complexity

- **Score**: CS-1 (trivial)
- **Breakdown**: S=1, I=0, D=0, N=0, F=0, T=0
  - Surface Area (S=1): 3-4 files in frontend, all within the same drag-drop subsystem
  - Integration (I=0): Internal only — no new external dependencies
  - Data/State (D=0): No schema or data model changes; uses existing `removeItem()` action
  - Novelty (N=0): Root cause fully identified; fix approach is clear
  - Non-Functional (F=0): No performance, security, or compliance considerations
  - Testing/Rollout (T=0): Manual verification sufficient; existing store tests cover primitives
- **Confidence**: 0.95
- **Assumptions**:
  - `removeItem()` in workspace store correctly removes standalone items (verified in research)
  - Removing a workspace item triggers sidebar re-render via Zustand subscription (confirmed by PL-07)
  - URL sync handles item removal gracefully (existing behavior for session close)
- **Dependencies**: None — all required infrastructure exists
- **Risks**: Minimal — the only risk is accidentally affecting tmux sessions, which use a completely separate code path
- **Phases**: Single phase — surgical fix across 3-4 files

## Acceptance Criteria

- **AC-01**: Given a regular session visible in the sidebar, when the user drags it onto an existing layout pane's edge, then the session's standalone sidebar entry is removed and the session appears only within the layout
- **AC-02**: Given a regular session visible in the sidebar, when the user drags it onto another standalone session (creating a new 2-pane layout), then the dragged session's standalone sidebar entry is removed
- **AC-03**: Given a tmux session visible in the sidebar, when the user drags it onto a layout pane, then a new terminal session is created attached to that tmux session AND the tmux session remains visible in the sidebar
- **AC-04**: Given a tmux session that has already been dragged into one layout, when the user drags it into a second layout (or the same layout again), then a second independent terminal session is created and the tmux sidebar item still remains visible
- **AC-05**: Given a session that was dragged into a layout, when the user closes that pane, the session is terminated (same behavior as closing any pane — no change from current behavior)
- **AC-06**: Given the fix is applied, when the sidebar re-renders after a drag-to-layout, then no "orphan" standalone workspace items exist for sessions that are already inside a layout's pane tree

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| tmux sessions accidentally affected | Low | High | tmux uses separate drag type (`sidebar-tmux-session`) — completely different code path |
| URL sync breaks after item removal | Low | Medium | Existing URL sync handles item removal (tested via session close) — verify roundtrip |
| Zustand infinite re-render from new selector | Low | High | No new subscriptions needed — existing `useShallow` patterns sufficient (PL-01) |
| `convertToLayout()` source cleanup missed | Medium | Medium | Research confirms this flow has the same bug — include in fix |

**Assumptions**:
- The existing `removeItem()` workspace store action works correctly for standalone session items
- Removing a workspace item from the `items[]` array causes `SessionList.tsx` to re-render and exclude the session from the sidebar (confirmed by immutable update pattern PL-07)
- No other code depends on the standalone workspace item persisting after a session is added to a layout

## Open Questions

*None — root cause and fix approach are fully understood from research.*

## ADR Seeds (Optional)

*Not applicable — this is a bug fix, not an architectural decision. The existing architecture (type-discriminated drag data, workspace item management) is sound; the bug is simply a missing cleanup step.*

## Workshop Opportunities

*None — the fix is straightforward and does not require design exploration.*

## Testing Strategy

- **Approach**: Lightweight
- **Rationale**: CS-1 bug fix with clear root cause; existing store tests cover primitives; DnD interaction tests deferred per plan 015
- **Focus Areas**: Workspace store `removeItem()` after `splitPane()` / `convertToLayout()`; verify no orphan items remain
- **Excluded**: DnD interaction tests, UI rendering tests, tmux flow tests (architecturally unaffected)
- **Mock Usage**: Avoid mocks — real Zustand store state sufficient for validation

## Documentation Strategy

- **Location**: None
- **Rationale**: Internal bug fix — no user-facing documentation needed; the fix is invisible to users

## Clarifications

### Session 2026-02-24

| # | Question | Answer | Sections Updated |
|---|----------|--------|-----------------|
| Q1 | Workflow mode? | **Simple** — CS-1 bug fix, single phase, surgical change | Header (Mode) |
| Q2 | Testing approach? | **Lightweight** — core validation only, simple bug fix | Testing Strategy |
| Q3 | Documentation location? | **None** — internal bug fix, no user-facing docs | Documentation Strategy |

**Coverage Summary**:
- **Resolved**: Workflow mode, Testing strategy, Documentation strategy
- **Deferred**: None
- **Outstanding**: None — all critical ambiguities resolved
