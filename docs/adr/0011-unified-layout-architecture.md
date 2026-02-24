---
id: ADR-0011
title: "Unified Layout Architecture — Everything Is a Layout"
status: accepted
date: 2026-02-24
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["workspace", "data-model", "frontend"]
complexity: CS-3
---

# ADR-0011: Unified Layout Architecture — Everything Is a Layout

## Context

The workspace system used a discriminated union (`WorkspaceSessionItem | WorkspaceLayoutItem`) to represent sidebar items. Standalone sessions had `{ type: 'session', id, sessionId }` and layouts had `{ type: 'layout', id, name, tree, focusedPaneId }`. This two-type model created:

- **Type transition functions** (`convertToLayout`, `maybeAutoDissolve`, `dissolveLayout`) managing morphing between types
- **Duplicate code paths** (`FirstDragDropZone` for sessions, `DropZoneOverlay` for layouts)
- **Branching logic** across ~15 files checking `item.type === 'session'` vs `'layout'`
- **Edge cases** at the session→layout boundary (drag source cleanup, pane ordering)

## Decision Drivers

- **Simplicity**: Eliminating type transitions removes an entire class of edge cases
- **Consistency**: Every drop should behave the same way — `splitPane()` everywhere
- **Alpha freedom**: Single user, no backward compatibility constraints
- **Code reduction**: ~120 lines of transition code removed, ~15 branching sites eliminated
- **Mental model**: "Everything is a layout" is simpler than "sessions can become layouts"

## Considered Options

### Option A: Unified Single Type (Everything Is a Layout)

**Description**: Remove the discriminated union entirely. Every workspace item has `{ id, name, tree, focusedPaneId, userRenamed }`. A single-terminal item is a layout with one leaf node. Sidebar rendering adapts by pane count.

**Pros**:
- Eliminates all type transition functions and edge cases
- Single drop handler path (`splitPane` everywhere)
- `FirstDragDropZone` component deleted entirely
- Simpler mental model for contributors
- Sidebar rendering is data-driven (pane count), not type-driven

**Cons**:
- Every item carries tree/focusedPaneId overhead (minimal — one leaf node)
- URL encoding slightly larger for 1-pane items
- Large changeset (~15 files, 200+ test expectations)

### Option B: Keep Union but Add Tree to Sessions

**Description**: Both `WorkspaceSessionItem` and `WorkspaceLayoutItem` contain a `tree` field. Session items have a single-leaf tree. Type field remains for rendering hints.

**Pros**:
- Less disruptive — keeps existing type checks
- Smaller changeset

**Cons**:
- Still requires branching in sidebar, drop handlers, codec
- Type transitions still exist conceptually (just less code)
- Doesn't solve the fundamental complexity

### Option C: Adapter Pattern

**Description**: Create a `UnifiedWorkspaceItem` wrapper that normalizes both types into a common interface.

**Pros**:
- Non-breaking — old code still works
- Incremental migration path

**Cons**:
- Adds a layer of indirection
- Two representations of the same concept in the codebase
- Adapter must be maintained alongside both types

## Decision

**Chosen Option**: Option A (Unified Single Type) because it maximally simplifies the codebase, eliminates an entire class of transition bugs, and is feasible given alpha-stage freedom from backward compatibility. The 20-question Q&A session with the stakeholder confirmed all behavioral rules for adaptive rendering.

## Consequences

### Positive

- `convertToLayout`, `convertToLayoutWith`, `maybeAutoDissolve` deleted (~120 lines)
- `FirstDragDropZone.tsx` deleted entirely (~150 lines)
- All `item.type` branching eliminated across 15 files
- Unified drop handling: every drop is `splitPane()`
- Sidebar rendering is purely data-driven (pane count threshold)
- No more session→layout edge cases in drag-and-drop

### Negative

- Old `?w=` URLs with `{t:'s'}` format stop working (acceptable for alpha)
- All 200+ workspace/codec tests required expectation updates
- 1-pane items carry slightly more data (tree + focusedPaneId + userRenamed)

### Neutral

- Session store remains independent (no changes)
- Backend/WebSocket protocol unchanged
- Binary tree layout system (`layoutTree.ts`) unchanged
- WebGL pool lifecycle unchanged (mount/unmount based)

## Implementation Notes

- **Adaptive name display**: `userRenamed` boolean flag determines whether to show session name (auto-derived) or user's chosen name. Clearing a name resets to pane[0]'s session name.
- **Sidebar threshold**: 1 pane → terminal icon, no badge; 2+ panes → columns icon, badge shown.
- **Context menu**: "Rename", "Close" always; "Dissolve All" at 2+ panes only. Word "Layout" removed from all labels.
- **Drag source removal**: 1-pane items removed from sidebar on drop; multi-pane items stay.
- **Session exit**: Items stay with SessionEndedOverlay; no auto-removal (user closes manually).

## References

- [Plan 022: Unified Layout Architecture](../plans/022-unified-layout-architecture/unified-layout-architecture-plan.md)
- [Spec](../plans/022-unified-layout-architecture/unified-layout-architecture-spec.md)
- [Q&A Perspective (20 questions)](../plans/022-unified-layout-architecture/qa-perspective.md)
- [Research Dossier](../plans/022-unified-layout-architecture/research-dossier.md)
- [ADR-0010: URL Layout Format](./0010-url-layout-format.md) — prefix notation preserved within new schema
- [docs/how/workspace-architecture.md](../how/workspace-architecture.md) — architecture guide
