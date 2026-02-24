# Research Report: Unified Layout Architecture

**Generated**: 2026-02-24T03:45:00Z
**Research Query**: "Can we make everything always a layout — 1 pane or N panes — instead of separate terminal vs layout item types?"
**Mode**: Pre-Plan
**Location**: docs/plans/022-unified-layout-architecture/
**FlowSpace**: Not Available
**Findings**: 55+

## Executive Summary

### What It Does (Current State)
The workspace system uses a **discriminated union** (`WorkspaceItem = WorkspaceSessionItem | WorkspaceLayoutItem`) to manage sidebar items. Standalone sessions (type='session') reference a single backend session. Layouts (type='layout') contain a binary split tree with 2-8 terminal panes, a user-visible name, and focus tracking.

### Business Purpose
This distinction was introduced in Plan 016 (Sidebar URL Overhaul) to support multiple coexisting layouts alongside standalone sessions. The separation enables lightweight single-terminal items and heavyweight multi-pane layouts to coexist in the sidebar.

### Key Insights
1. **Auto-dissolve exists**: When a layout reduces to 1 pane, it automatically converts back to a `WorkspaceSessionItem` — meaning 1-pane layouts are intentionally prevented today.
2. **The transition functions (convertToLayout/dissolveLayout) are the seams**: They manage type morphing, which a unified model would eliminate entirely.
3. **URL encoding, sidebar rendering, drag-drop, and the main App router all branch on `item.type`** — unification touches ~15+ files but simplifies each one by removing a branch.

### Quick Stats
- **Type discrimination sites**: ~15 files check `item.type === 'session'` vs `'layout'`
- **Transition functions to remove**: `convertToLayout`, `convertToLayoutWith`, `dissolveLayout`, `maybeAutoDissolve`
- **Tests affected**: ~50+ workspace tests, ~49 codec tests, ~36 layout codec tests
- **Prior Learnings surfaced**: 15 relevant discoveries from Plans 003-021

## How It Currently Works

### Two-Type Model

| Aspect | WorkspaceSessionItem | WorkspaceLayoutItem |
|--------|---------------------|-------------------|
| **Type** | `'session'` | `'layout'` |
| **Data** | `sessionId` only | `name`, `tree`, `focusedPaneId` |
| **Sidebar** | Terminal icon + session name | Columns icon + layout name + pane badge |
| **Main area** | `FirstDragDropZone` → single `PaneContainer` | `PaneLayout` recursive tree |
| **Drop behavior** | `convertToLayout()` (creates new layout) | `splitPane()` (adds pane to tree) |
| **URL encoding** | `{t:'s', s:'bash'}` | `{t:'l', n:'name', r:'H50bz'}` |
| **On last pane close** | Item removed | Auto-dissolve → session item |

### Key Transitions
```
Session ──[drag-drop/split]──→ Layout (convertToLayout)
Layout  ──[close panes to 1]──→ Session (maybeAutoDissolve)
Layout  ──[dissolve]──→ N × Session (dissolveLayout)
```

### Files That Branch on item.type
1. `types/workspace.ts` — Type definitions
2. `stores/workspace.ts` — CRUD, mutations, auto-dissolve
3. `lib/workspaceCodec.ts` — URL encoding/decoding
4. `components/SessionList.tsx` — Sidebar item rendering
5. `components/SessionItem.tsx` — Session sidebar item
6. `components/LayoutSidebarItem.tsx` — Layout sidebar item
7. `App.tsx` — Main area rendering (FirstDragDropZone vs PaneLayout)
8. `components/PaneContainer.tsx` — variant='standalone' vs 'layout'
9. `components/FirstDragDropZone.tsx` — Only for standalone sessions
10. `components/DropZoneOverlay.tsx` — Drop handler routing
11. `hooks/useURLSync.ts` — Workspace reconstruction
12. `stores/__tests__/workspace.test.ts` — Test expectations

## The Unified Model Proposal

### Core Idea
Every workspace item is a **layout with a tree**. A "standalone session" is just a layout where `tree = { type: 'terminal', paneId, sessionId }` (a single leaf node).

### What Changes
- **No more `WorkspaceSessionItem`** — everything is `WorkspaceLayoutItem`
- **No more `convertToLayout`** — splitting a 1-pane layout just adds a split node (same as splitPane today)
- **No more `maybeAutoDissolve`** — closing to 1 pane keeps it as a layout
- **Sidebar adapts**: 1 pane → show session name + terminal icon; 2+ panes → show layout name + pane badge
- **`FirstDragDropZone` merges with `DropZoneOverlay`** — same drop behavior everywhere

### What Stays the Same
- Binary tree structure (`PaneLayout`)
- `splitPane`, `closePane`, `movePane` operations
- Session store (completely independent)
- Backend API (no changes)
- WebSocket protocol (no changes)
- Drag-and-drop gestures (simpler, fewer code paths)

## Prior Learnings (From Previous Implementations)

### PL-01: Zustand Array Selector Infinite Loop
**Source**: Plan 003/015 | **Type**: gotcha
Any new selectors returning arrays from workspace items MUST use `useShallow`.

### PL-04: WebGL Pool Context Lifecycle
**Source**: Plan 015/016 | **Type**: insight
Only active layout's terminals are DOM-mounted. Pool handles rebalancing via mount/unmount.

### PL-05: Drag Data itemId Extraction
**Source**: Plan 021 | **Type**: gotcha (FIXED)
Drop handlers must extract `itemId` from drag data for source item cleanup.

### PL-07: Data Model Shift to Workspace Items
**Source**: Plan 016 | **Type**: architecture
The workspace items model was a "Big Bang" migration that replaced layout store entirely. A unified model would be a similar-scope change.

### PL-10: Immutable Tree Mutations Trigger Re-Renders
**Source**: Plan 019/021 | **Type**: insight
Zustand detects tree object reference changes automatically. No manual refresh needed.

### PL-12: LeafFactory Pattern
**Source**: Plan 017 | **Type**: pattern
`splitPaneWith()` accepts factory callback for generic leaf creation. This pattern survives unification unchanged.

### PL-14: URL Format Round-Trip Testing
**Source**: Plan 015 | **Type**: gotcha
URL codec changes MUST include exhaustive round-trip tests before shipping.

## Modification Risk Assessment

### ✅ Safe to Modify
- Type definitions (additive change: remove session variant)
- Sidebar rendering (simplification: single component)
- Auto-dissolve removal (deletion is safe)

### ⚠️ Modify with Caution
- URL codec (public API, backward compatibility)
- Workspace store mutations (many consumers)
- Test expectations (50+ tests reference type discrimination)

### 🚫 Danger Zones
- URL backward compatibility (existing shared URLs break)
- Session lifecycle subscription (cleanup logic changes)

## Next Steps

This research provides the foundation for the 20-question discussion to explore whether unification is the right move and how it should work.

---

**Research Complete**: 2026-02-24T03:45:00Z
**Report Location**: docs/plans/022-unified-layout-architecture/research-dossier.md
