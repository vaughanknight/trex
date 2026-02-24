# Unified Layout Architecture — Q&A Perspective

**Date**: 2026-02-24
**Status**: Perspective captured — ready for specification
**Location**: docs/plans/022-unified-layout-architecture/

## Core Decision

**Everything is always a layout.** There are no "standalone sessions" — only layouts with 1 pane or layouts with many panes. The sidebar, context menus, drag-drop, and URL encoding all adapt based on pane count, creating a seamless experience where 1-pane items look identical to today's sessions.

## Q&A Summary (20 Questions)

### Mental Model (Q1)
> **A layout that happens to have 1 pane.** Everything is always a layout. The concept of "standalone session" is eliminated from the data model.

### Naming (Q2, Q15, Q16)
> - Every item always has a `name` field, derived from the first session on creation, renameable anytime.
> - **Display name is adaptive**: 1-pane items show the **session store name** (like today's sessions). 2+ pane items show the **layout item name**.
> - **User renames always win**: If a user explicitly renames an item (e.g., "API Work"), that name persists even if it drops to 1 pane. The "show session name at 1 pane" rule only applies to items with auto-derived names.

### Data Model (Q3, Q10)
> - `focusedPaneId` is always tracked, even for 1-pane items (consistency over special-casing).
> - Every item has at least one pane with a `paneId`. No concerns about terminal caching or URL encoding impact.
> - No backward compatibility needed for any data model changes.

### Sidebar Rendering (Q4, Q5, Q6, Q7)
> - **1-pane items look identical to today's sessions**: Terminal icon, session name, no badge.
> - **2+ pane items**: Columns icon (or dynamic layout preview icon if enabled), layout name, pane count badge.
> - **Icon switches dynamically**: Terminal → Columns at the 2-pane threshold.
> - **Context menu adapts**: Remove the word "layout" everywhere. Menu items: "Rename", "Dissolve All", "Close". Hide "Dissolve All" at 1 pane.
> - **Dynamic layout icons** (Plan 019 pane preview feature) stay as-is when enabled.

### Lifecycle (Q8, Q9, Q18)
> - **No auto-dissolve.** Closing panes to 1 keeps it as a 1-pane layout.
> - **"Dissolve All"** on a multi-pane layout creates N separate 1-pane layouts. 1-pane items hide this option.
> - **Preview panes survive.** If only preview panes remain, keep as a 1-pane layout showing the preview. Don't auto-remove.
> - **Closing the last pane**: Item stays as a 1-pane layout (implied by "everything is always a layout").

### Drag & Drop (Q11, Q12)
> - **`FirstDragDropZone` is eliminated.** Every drop is `splitPane()` on the item's tree — no special first-split flow.
> - **1-pane items disappear** from sidebar when dragged into another layout (like sessions today).
> - **Multi-pane items stay** in sidebar when dragged (like layouts today).

### URL Encoding (Q13, Q14)
> - **Clean break.** New URL format only. Old `{t:'s'}` URLs stop working. Alpha, acceptable.
> - **Slight URL growth is fine.** Consistency matters more than compactness.

### Tmux (Q17)
> - Tmux sessions also become 1-pane layouts when clicked/added. Unified model applies uniformly.

### Edge Cases (Q19)
> - **Per-layout cap only** (8 terminals per layout). No global cap.

### Migration (Q20)
> - **Big bang.** No backward compatibility. Make best decisions for the future. Things can break during implementation. Old URLs don't need to work.

## Design Rules (Derived)

1. **Type**: `WorkspaceItem` becomes a single type (no discriminated union). Every item has `id`, `name`, `tree`, `focusedPaneId`.
2. **Name display**: `paneCount === 1 && !userRenamed ? sessionName : item.name`
3. **Icon**: `paneCount === 1 ? TerminalSquare : (dynamicIconEnabled ? DynamicIcon : Columns2)`
4. **Badge**: `paneCount >= 2 ? show(paneCount) : hide`
5. **Context menu**: Always "Rename", "Close". Show "Dissolve All" only when `paneCount >= 2`.
6. **Drag source removal**: Remove source item from sidebar when `paneCount === 1`.
7. **Drop handler**: Always `splitPane()` — no `convertToLayout()` needed.
8. **Dissolve**: Creates N × 1-pane layouts (not sessions).
9. **Session cleanup**: When backend session terminates, workspace item keeps its tree (pane shows SessionEndedOverlay).
10. **URL**: Single encoding format for all items. Schema version bump. No backward compat.

## What Gets Removed

| Component | Reason |
|-----------|--------|
| `WorkspaceSessionItem` type | Everything is layout |
| `convertToLayout()` | No type transition needed |
| `convertToLayoutWith()` | No type transition needed |
| `maybeAutoDissolve()` | No auto-dissolve |
| `addSessionItem()` | Replaced by unified `addItem()` |
| `FirstDragDropZone.tsx` | Every drop is `splitPane()` |
| `item.type === 'session'` checks | Single type, no branching |
| URL `{t:'s'}` encoding | Single layout encoding |

## What Changes

| Component | Change |
|-----------|--------|
| `WorkspaceItem` | Single type with `name`, `tree`, `focusedPaneId` |
| `SessionList.tsx` | Single component, adapts rendering by pane count |
| `LayoutSidebarItem.tsx` | Becomes the universal sidebar item |
| `SessionItem.tsx` | Merged into LayoutSidebarItem |
| `App.tsx` | Always renders `PaneLayout`, no type branching |
| `PaneContainer.tsx` | No `variant` prop needed |
| `DropZoneOverlay.tsx` | Always uses `splitPane()` |
| `dissolveLayout()` | Creates 1-pane layouts instead of sessions |
| URL codec | Single item type, schema v2 |
| Context menu labels | Remove "Layout" word, add "Dissolve All" |
| ~50 workspace tests | Update expectations |

## Open Questions for Spec Phase

1. **Name tracking**: Need a `userRenamed: boolean` flag on workspace items (or derive from name !== auto-derived-name)?
2. **Closing last pane**: Should the 1-pane item remain with a "session ended" overlay, or should the entire item be removed? (Q8 says "stays as 1-pane layout" but what if the session exits?)
3. **SessionItem.tsx vs LayoutSidebarItem.tsx**: Merge into one component, or keep two with shared logic?
