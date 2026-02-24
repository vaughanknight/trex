# Sidebar Session Removal on Drag-to-Layout — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-24
**Spec**: [./sidebar-drag-session-removal-spec.md](./sidebar-drag-session-removal-spec.md)
**Research**: [./research-dossier.md](./research-dossier.md)
**Status**: IMPLEMENTING

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Implementation](#implementation)
4. [Change Footnotes Ledger](#change-footnotes-ledger)

## Executive Summary

When a regular terminal session is dragged from the sidebar into a layout pane, the
session's standalone workspace item persists in the sidebar — appearing as a confusing
duplicate. The root cause is that drop handlers (`DropZoneOverlay`, `FirstDragDropZone`)
never remove the source workspace item after adding the session to a layout tree. The fix
calls `useWorkspaceStore.getState().removeItem()` imperatively in each drop handler after
the layout operation completes, using the `itemId` already present in drag data. tmux
sessions are unaffected (separate drag type and code path).

## Critical Research Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **Orphan sessions have `itemId = undefined`** — orphan sessions (not yet in workspace) are draggable but have no workspace item to remove (R1-05) | Add null guard: only call `removeItem()` when `itemId` is defined |
| 02 | Critical | **Two drop flows affected** — Flow 1: DropZoneOverlay→PaneContainer→splitPane (existing layout); Flow 2: FirstDragDropZone→convertToLayout (first split) (I1-04, I1-07) | Fix both flows independently |
| 03 | High | **`removeItem()` has no session side effects** — it only removes the workspace item from `items[]` array; backend session stays alive in session store (R1-01, R1-08) | Safe to call after any layout operation |
| 04 | High | **No race condition** — `splitPane()` and `convertToLayout()` are synchronous Zustand `set()` calls; state is fully updated before `removeItem()` executes (R1-03) | Call `removeItem()` immediately after layout op |
| 05 | High | **Imperative store access pattern** — drop handlers are callbacks (not render), so `useWorkspaceStore.getState().removeItem()` is the correct pattern per CLAUDE.md § Zustand Store Selectors (I1-07) | Use `getState()` in onDrop callbacks — no new subscriptions |
| 06 | High | **`itemId` in drag data is workspace item ID** — confirmed via SessionItem.tsx props; safe to pass directly to `removeItem()` (R1-04) | Extract `data.itemId` from `source.data` in drop handlers |
| 07 | Medium | **No callback signature changes needed** — by calling `removeItem()` directly in the drop handler (not threading through callback chain), no prop types or interfaces change (I1-07) | Simpler fix: add imperative `removeItem()` call in DropZoneOverlay and FirstDragDropZone |
| 08 | Medium | **URL sync auto-triggers correctly** — workspace store subscription debounces URL updates at 300ms; removed items are excluded automatically (R1-02) | No URL sync changes needed |
| 09 | Medium | **tmux uses separate code path** — drag type `'sidebar-tmux-session'` routes to `onTmuxDropRef` which creates NEW sessions; never touches workspace items (I1-05) | No tmux code changes needed |
| 10 | Medium | **splitPane() callers unaffected** — PaneTitleBar split buttons and pane-to-pane moves don't involve sidebar items; only sidebar→pane drops need removal (I1-06) | No changes to PaneTitleBar or movePane |
| 11 | Low | **`findItemBySessionId()` exists as fallback** — could locate source item by sessionId instead of itemId, but itemId is already in drag data and more direct (R1-07) | Use drag data `itemId` (O(1) vs O(n) scan) |
| 12 | Low | **Existing test coverage for `removeItem()`** — 4 tests cover basic CRUD, auto-selection, and no-op for invalid IDs (R1-06) | Add 1 integration test for split→remove sequence |

### Constitution & Architecture Gates

**Constitution**: ✅ No deviations. Fix follows existing patterns (imperative store access,
fail-silent DnD, immutable state updates).

**Architecture**: ✅ No layer-boundary violations. All changes are within the frontend
React component layer.

**ADR Ledger**:

| ADR | Status | Affects | Notes |
|-----|--------|---------|-------|
| ADR-0009 | Accepted | Drop handlers | @atlaskit/pragmatic-drag-and-drop patterns preserved |

## Implementation (Single Phase)

**Objective**: Remove standalone sidebar workspace item when a regular session is dragged
into a layout pane, while preserving tmux session visibility.

**Testing Approach**: Lightweight
**Mock Usage**: Avoid mocks — real Zustand store state sufficient

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Extract `itemId` from drag source data and call `removeItem()` after `onDrop` in DropZoneOverlay for `sidebar-session` drops | 1 | Core | -- | /Users/vaughanknight/GitHub/trex/frontend/src/components/DropZoneOverlay.tsx | After dragging a sidebar session onto an existing layout pane, the session's standalone item is removed from workspace items; tmux drops unchanged | Only remove when `data.itemId` is defined (orphan guard) |
| [x] | T002 | Extract `itemId` from drag source data and call `removeItem()` after `convertToLayout` in FirstDragDropZone for `sidebar-session` drops | 1 | Core | -- | /Users/vaughanknight/GitHub/trex/frontend/src/components/FirstDragDropZone.tsx | After dragging a sidebar session onto a standalone session, the dragged session's standalone item is removed; target session is converted to layout | Only remove when `data.itemId` is defined (orphan guard) |
| [x] | T003 | Add workspace store integration test: `splitPane()` then `removeItem()` completes without errors; verify items array is correct | 1 | Test | T001 | /Users/vaughanknight/GitHub/trex/frontend/src/stores/__tests__/workspace.test.ts | Test passes; items array reflects removal after split | Lightweight: 1-2 test cases |
| [x] | T004 | Verify frontend builds cleanly (`cd frontend && npm run build`) | 1 | Validate | T001,T002 | /Users/vaughanknight/GitHub/trex/frontend/ | Build succeeds with zero errors | Pre-push CI check per CLAUDE.md |
| [x] | T005 | Manual verification: drag regular session → existing layout pane; confirm sidebar item disappears | 1 | Validate | T004 | -- | Session visible only within layout, not in sidebar | AC-01 |
| [x] | T006 | Manual verification: drag regular session → standalone session; confirm sidebar item disappears and layout created | 1 | Validate | T004 | -- | Dragged session removed from sidebar; 2-pane layout visible | AC-02 |
| [x] | T007 | Manual verification: drag tmux session → pane; confirm tmux item remains in sidebar | 1 | Validate | T004 | -- | tmux sidebar item persists; new terminal session created in layout | AC-03, AC-04 |

### Acceptance Criteria

- [ ] AC-01: Dragging a regular session onto an existing layout pane removes its standalone sidebar entry
- [ ] AC-02: Dragging a regular session onto a standalone session removes the dragged session's sidebar entry
- [ ] AC-03: Dragging a tmux session onto a pane creates a new terminal and keeps the tmux item in sidebar
- [ ] AC-04: tmux sessions can be dragged multiple times (each creating independent terminals)
- [ ] AC-05: Closing a pane after drag-split terminates the session (no behavior change)
- [ ] AC-06: No orphan standalone workspace items remain after drag-to-layout operations

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Orphan session drag crashes (no itemId) | Medium | High | Null guard on `data.itemId` before calling `removeItem()` |
| tmux sessions accidentally removed | Low | High | tmux uses separate `sidebar-tmux-session` type — different code path |
| URL sync breaks after removal | Low | Medium | Existing debounced subscription handles removals (tested via session close) |

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/021-sidebar-drag-session-removal/sidebar-drag-session-removal-plan.md"`
- **Optional validation**: `/plan-4-complete-the-plan` (recommended but optional for CS-1)
- **Optional task expansion**: `/plan-5-phase-tasks-and-brief` (if you want a separate dossier)
