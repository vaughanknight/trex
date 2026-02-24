# Research Report: Sidebar Session Removal on Drag-to-Layout

**Generated**: 2026-02-24T01:58:00Z
**Research Query**: "When you drag a session into another layout/session, it keeps the item in the sidebar. We need this to disappear when pulled in. Exception: tmux sessions create NEW terminal sessions, so they should remain visible."
**Mode**: Pre-Plan
**Location**: docs/plans/021-sidebar-drag-session-removal/research-dossier.md
**FlowSpace**: Not Available
**Findings**: 55+

## Executive Summary

### What It Does
The sidebar displays terminal sessions and tmux sessions as draggable items. Users drag sessions into pane layouts to create split-pane terminal views. The drag-and-drop system uses `@atlaskit/pragmatic-drag-and-drop` with hitbox-based edge detection.

### The Bug
When a regular (non-tmux) session is dragged from the sidebar into a layout pane, **the session's standalone workspace item is not removed** from the workspace items list. The session gets added to the layout's pane tree via `splitPane()`, but its original `WorkspaceSessionItem` persists in the `items[]` array, causing it to remain visible in the sidebar.

### Root Cause
The `splitPane()` action in `workspace.ts` adds the session to a layout's tree but **never removes the original standalone workspace item**. The drop handler chain (`DropZoneOverlay → PaneContainer → splitPane`) only passes `sessionId` — it doesn't extract or use the `itemId` from drag data to remove the source item.

### Key Insights
1. **The `itemId` is already in the drag data** (SessionItem.tsx line 127) but is never extracted by the drop handler (DropZoneOverlay.tsx line 101)
2. **tmux sessions work correctly by design** — they use drag type `'sidebar-tmux-session'` and create NEW sessions on drop, never linking to existing workspace items
3. **The fix requires 2 changes**: (a) pass `itemId` through the drop chain, and (b) remove the standalone workspace item after adding to layout

### Quick Stats
- **Components involved**: 5 files (SessionItem, DropZoneOverlay, PaneContainer, workspace store, SessionList)
- **Dependencies**: @atlaskit/pragmatic-drag-and-drop, Zustand workspace store
- **Test Coverage**: No automated DnD tests (deferred to Phase 7 per plan 015)
- **Complexity**: Low — surgical fix in drop handler + workspace store
- **Prior Learnings**: 15 relevant discoveries from previous implementations

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| SessionItem drag | DnD Source | `components/SessionItem.tsx:118-149` | Makes sidebar session draggable |
| TmuxSessionItem drag | DnD Source | `components/TmuxSessionItem.tsx:35-67` | Makes tmux session draggable |
| DropZoneOverlay drop | DnD Target | `components/DropZoneOverlay.tsx:53-117` | Receives drops on pane edges |
| PaneContainer handleDrop | Callback | `components/PaneContainer.tsx:71-74` | Bridges drop to workspace action |
| splitPane() | Store Action | `stores/workspace.ts:176-185` | Adds session to layout tree |

### Core Execution Flow (Current — Buggy)

1. **User drags session from sidebar**
   - `SessionItem.tsx` registers draggable via `@atlaskit/pragmatic-drag-and-drop`
   - Drag data includes: `{ type: 'sidebar-session', sessionId, sessionName, itemId, index }`

2. **User drops on pane edge**
   - `DropZoneOverlay.tsx` detects drop, extracts edge direction
   - **Only extracts `sessionId`** from drag data — ignores `itemId`
   - Calls `onDropRef.current(data.sessionId, direction)`

3. **PaneContainer receives drop**
   - `handleDrop(droppedSessionId, direction)` calls `splitPane(itemId, paneId, direction, droppedSessionId)`
   - Only has layout's `itemId`, not the source workspace item's `itemId`

4. **splitPane() modifies layout tree**
   - Adds new `PaneLeaf` with `sessionId` to the layout's binary tree
   - **Does NOT remove the standalone `WorkspaceSessionItem`** from `items[]`

5. **Sidebar re-renders with stale item**
   - `SessionList.tsx` builds `sessionsInWorkspace` set from all workspace items
   - The session appears in BOTH a standalone item AND a layout leaf
   - Session still shows in sidebar because its standalone item persists

### tmux Flow (Correct — For Reference)

1. `TmuxSessionItem.tsx` sets drag type: `'sidebar-tmux-session'`
2. Drop handler calls `createTmuxSession()` which creates a **brand new** backend session
3. The new session is added to the layout via `splitPane()` with the new session ID
4. The tmux sidebar item is NOT a workspace item — it's rendered from `useTmuxStore`
5. No removal needed — tmux items are always visible, and each drop creates independent sessions

### Data Flow
```
SessionItem (drag)
  ├─ type: 'sidebar-session'
  ├─ sessionId ────────────────────► DropZoneOverlay.onDrop()
  ├─ itemId ──── ✗ NOT EXTRACTED     │
  └─ index                           ▼
                              PaneContainer.handleDrop(sessionId, direction)
                                      │
                                      ▼
                              workspace.splitPane(layoutItemId, paneId, direction, sessionId)
                                      │
                                      ├─► Adds PaneLeaf to layout tree ✅
                                      └─► Remove standalone item?      ✗ MISSING
```

## Architecture & Design

### Component Map

#### Core Components
- **SessionItem.tsx**: Draggable sidebar item for regular sessions. Provides `itemId` in drag data.
- **TmuxSessionItem.tsx**: Draggable sidebar item for tmux sessions. Uses different drag type.
- **DropZoneOverlay.tsx**: Drop target overlay on pane edges. Routes drops by type.
- **PaneContainer.tsx**: Wraps terminal pane, provides `handleDrop` callback.
- **SessionList.tsx**: Renders sidebar list, calculates which sessions are "orphans".
- **workspace.ts (store)**: Central state for workspace items and layout trees.

### Design Patterns Identified
1. **Type-discriminated drag data**: `type` field routes to different handlers (`sidebar-session` vs `sidebar-tmux-session` vs `pane`)
2. **Immutable binary tree**: Layout mutations produce new tree references, triggering re-renders
3. **Fail-silent DnD**: Early returns on precondition failures, no try-catch
4. **canDrop guards**: Validates duplicates, pane cap (8), self-drop prevention

### Workspace Item Types
```typescript
// A session NOT in any layout (standalone in sidebar)
interface WorkspaceSessionItem {
  type: 'session'
  id: string        // workspace item ID
  sessionId: string // backend session ID
}

// A layout containing multiple sessions in a split tree
interface WorkspaceLayoutItem {
  type: 'layout'
  id: string
  name: string
  tree: PaneLayout        // binary tree of PaneLeaf | PaneSplit
  focusedPaneId: string | null
}
```

## Dependencies & Integration

### What This Depends On
| Dependency | Type | Purpose |
|------------|------|---------|
| @atlaskit/pragmatic-drag-and-drop | Required | Drag-and-drop framework |
| @atlaskit/pragmatic-drag-and-drop-hitbox | Required | Edge detection for split direction |
| useWorkspaceStore | Required | Workspace items and layout tree state |
| useSessionStore | Required | Terminal session metadata |
| useTmuxStore | Required | Available tmux sessions list |

### What Depends on This
- **SessionList.tsx**: Computes sidebar display from workspace items
- **URL sync (useURLSync)**: Encodes layout state in URL
- **Session lifecycle cleanup**: Subscription removes workspace items when sessions close

## Quality & Testing

### Current Test Coverage
- **Unit Tests**: SessionSidebar, SessionList have tests for rendering/selection
- **DnD Tests**: **None** — explicitly deferred per Plan 015 Phase 7
- **Integration**: multi-session.test.tsx covers add/switch/remove workflows
- **Store Tests**: Workspace store operations tested

### Known Issues
| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| Standalone item not removed on drop | **High** | workspace.ts splitPane() | Session stays in sidebar after drag |
| itemId not extracted from drag data | Medium | DropZoneOverlay.tsx onDrop | Drop handler can't identify source item |

## Modification Considerations

### ✅ Safe to Modify
1. **DropZoneOverlay.tsx onDrop handler**: Extract `itemId` from source drag data — low coupling
2. **PaneContainer.tsx handleDrop**: Add `sourceItemId` parameter — simple callback change
3. **workspace.ts splitPane()**: Add item removal logic — well-isolated action

### ⚠️ Modify with Caution
1. **SessionItem.tsx drag data**: Already includes `itemId` — no changes needed, but verify consistency
2. **SessionList.tsx filtering**: Currently works correctly IF items are properly managed
3. **URL sync**: Layout changes trigger URL updates — verify roundtrip after fix

### 🚫 Danger Zones
1. **tmux session handling**: Must NOT remove tmux items — they use separate drag type and store
2. **Zustand selectors**: Use `useShallow` for any new array subscriptions (PL-01)
3. **convertToLayout()**: Similar flow for first-time splits — may need same fix

## Prior Learnings (From Previous Implementations)

### 📚 PL-01: Zustand Array Selector Infinite Loop
**Source**: Plan 003, Phase 3 (T004)
**Type**: gotcha
**What**: Array selectors create new references each call → infinite re-renders
**Resolution**: Use `useShallow` from `zustand/shallow`
**Action**: Any new sidebar subscriptions MUST use `useShallow`

### 📚 PL-04: react-resizable-panels defaultSize
**Source**: Plan 015, Phase 2 (T002)
**Type**: gotcha  
**What**: `defaultSize` takes pixels, not percentages
**Resolution**: Use `"50%"` string format
**Action**: Verify split ratios after fix

### 📚 PL-07: Immutable Updates Drive Re-Renders
**Source**: Plan 019
**Type**: insight
**What**: Tree mutations produce new objects → sidebar re-renders automatically
**Action**: Removing the workspace item will automatically update sidebar rendering — no manual refresh needed

### 📚 PL-14: URL Format Roundtrip
**Source**: Plan 015, Phase 6 (T006)
**Type**: insight
**What**: URL encoding had post-ship design flaw
**Action**: Verify URL roundtrip serialization after item removal

## Critical Discoveries

### 🚨 Critical Finding 01: itemId Available But Unused
**Impact**: Critical — this is the root cause
**Source**: IA-02, IA-04, IA-09
**What**: `SessionItem.tsx` already includes `itemId` in drag data (line 127), but `DropZoneOverlay.tsx` only extracts `sessionId` (line 101). The `itemId` is needed to identify which workspace item to remove.
**Required Action**: Extract `itemId` in drop handler and pass it through to workspace action.

### 🚨 Critical Finding 02: splitPane() Has No Removal Logic
**Impact**: Critical
**Source**: IA-06
**What**: `splitPane()` only modifies the target layout's tree. It has no concept of "source item" cleanup.
**Required Action**: Either add removal logic to `splitPane()` or create a composite action that splits then removes.

### 🚨 Critical Finding 03: convertToLayout() May Have Same Bug
**Impact**: High
**Source**: IA-03, PS-06
**What**: `convertToLayout()` converts a standalone session into a layout when the first split is created. Need to verify it doesn't leave orphan items either.
**Required Action**: Audit `convertToLayout()` for the same pattern.

### 🚨 Critical Finding 04: tmux Exception Is Architecturally Sound
**Impact**: Informational — confirms no changes needed for tmux
**Source**: IA-07, DC-09
**What**: tmux sessions use a completely separate drag type (`sidebar-tmux-session`), a separate store (`useTmuxStore`), and create new backend sessions on every drop. They are never added as workspace items, so no removal logic applies.

## Recommendations

### Fix Approach (Minimal Changes)

**Option A: Remove in drop handler (Recommended)**
1. In `DropZoneOverlay.tsx`: Extract `itemId` from `source.data` for `sidebar-session` drops
2. Pass `itemId` through `onDrop` callback to `PaneContainer`
3. In `PaneContainer`: After `splitPane()`, call `removeItem(sourceItemId)` to clean up standalone item
4. Guard: Only remove if `itemId` exists (orphan sessions dragged from sidebar have itemId; sessions without workspace items don't)

**Option B: Remove in workspace store action**
1. Add a new composite action `moveSessionToLayout(sourceItemId, targetItemId, paneId, direction)` 
2. Internally calls `splitPane()` then `removeItem(sourceItemId)`
3. Cleaner separation but more code

### tmux Exception
No changes needed. tmux uses:
- Different drag type: `'sidebar-tmux-session'`
- Different drop handler path: `onTmuxDropRef.current?.()`
- Creates NEW sessions via WebSocket
- Never creates workspace items for tmux sidebar entries

## Appendix: File Inventory

### Core Files (Need Changes)
| File | Purpose | Lines |
|------|---------|-------|
| `frontend/src/components/DropZoneOverlay.tsx` | Drop target — extract itemId | ~120 |
| `frontend/src/components/PaneContainer.tsx` | Drop callback — pass itemId | ~100 |
| `frontend/src/stores/workspace.ts` | Remove standalone item after split | ~540 |

### Related Files (Verify Only)
| File | Purpose |
|------|---------|
| `frontend/src/components/SessionItem.tsx` | Drag source — already provides itemId |
| `frontend/src/components/TmuxSessionItem.tsx` | tmux drag — no changes needed |
| `frontend/src/components/SessionList.tsx` | Sidebar rendering — auto-updates on item removal |
| `frontend/src/types/workspace.ts` | WorkspaceItem types — no changes needed |

### Test Files
| File | Purpose |
|------|---------|
| `frontend/src/components/__tests__/SessionSidebar.test.tsx` | Sidebar render tests |
| `frontend/src/components/__tests__/SessionList.test.tsx` | Session list tests |
| `frontend/src/stores/__tests__/workspace.test.ts` | Workspace store tests |

## Next Steps

1. Run `/plan-1b-specify` to create the bug fix specification
2. Then `/plan-3-architect` to create implementation plan
3. Implementation should be a single-phase fix (3 files, ~20 lines changed)

---

**Research Complete**: 2026-02-24T02:00:00Z
**Report Location**: docs/plans/021-sidebar-drag-session-removal/research-dossier.md
