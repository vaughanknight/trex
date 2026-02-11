---
id: ADR-0009
title: "@atlaskit/pragmatic-drag-and-drop for pane splitting DnD"
status: accepted
date: 2026-02-10
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["drag-and-drop", "dnd", "pane-splitting", "atlaskit"]
complexity: CS-2
---

# ADR-0009: @atlaskit/pragmatic-drag-and-drop for pane splitting DnD

## Context

Pane splitting requires drag-and-drop interaction: users drag sessions from the sidebar onto terminal panes to create splits, and drag pane title bars to rearrange layouts. The DnD library must coexist with xterm.js, which captures mouse events on its canvas element.

## Decision Drivers

- Must work with xterm.js canvas mouse capture (overlay pattern required)
- Small bundle size (terminal app, not a full CMS)
- No React-specific dependency (vanilla JS core preferred for stability)
- Quadrant-based hit detection for drop zones (left/right/top/bottom)
- Custom ghost/drag previews
- Active maintenance and community support

## Considered Options

### Option 1: @atlaskit/pragmatic-drag-and-drop

**Description**: Atlassian's headless, framework-agnostic DnD library. Core is vanilla JS with optional React wrappers. Hitbox addon provides closest-edge detection.

**Pros**:
- Tiny bundle: ~4.7 kB core + ~1 kB hitbox addon
- Framework-agnostic vanilla JS core — no React version coupling
- Built-in `attachClosestEdge`/`extractClosestEdge` for quadrant detection
- `setCustomNativeDragPreview` for ghost previews
- Overlay-friendly: works with `pointer-events: none/auto` toggle pattern
- Apache 2.0 license (MIT-compatible)
- Actively maintained by Atlassian

**Cons**:
- Less community adoption than dnd-kit or react-beautiful-dnd
- Documentation focused on Atlassian use cases

### Option 2: @dnd-kit/core

**Description**: Popular React DnD toolkit with sensors, modifiers, and collision detection.

**Pros**:
- Large community, well-documented
- Flexible sensor system
- Good React integration

**Cons**:
- ~15 kB bundle (3x larger than pragmatic-drag-and-drop)
- React-specific — version coupling risk
- No built-in closest-edge/quadrant detection
- Collision detection would need custom implementation for split zones

### Option 3: react-dnd (HTML5 backend)

**Description**: Dan Abramov's React DnD library with HTML5 drag-and-drop backend.

**Pros**:
- Mature, battle-tested
- Good documentation

**Cons**:
- ~22 kB bundle
- React-specific with context provider requirement
- HTML5 backend has browser inconsistencies
- No built-in quadrant detection
- Less actively maintained

### Option 4: Custom implementation (native HTML5 DnD API)

**Description**: Use browser's native drag-and-drop events directly.

**Pros**:
- Zero bundle size
- Full control

**Cons**:
- Browser inconsistencies (especially Safari)
- No built-in quadrant/hitbox detection
- Significant implementation effort for ghost previews
- Maintenance burden for cross-browser edge cases

## Decision

**Chosen Option**: Option 1 (@atlaskit/pragmatic-drag-and-drop) because it provides the smallest bundle with built-in quadrant detection (closest-edge hitbox), which is the core requirement for split-direction determination. The vanilla JS core eliminates React version coupling risk. The overlay pattern needed for xterm.js coexistence works naturally with its event model.

Installed versions: `@atlaskit/pragmatic-drag-and-drop@1.7.7`, `@atlaskit/pragmatic-drag-and-drop-hitbox@1.1.0`.

## Consequences

### Positive

- ~5.7 kB total bundle addition (smallest option)
- Quadrant detection works out-of-the-box via hitbox addon
- No React version coupling — vanilla JS core
- Ghost preview API (`setCustomNativeDragPreview`) provides polished UX

### Negative

- Smaller community than dnd-kit means fewer StackOverflow answers
- Atlassian-centric documentation requires some translation to our patterns

### Neutral

- Apache 2.0 license is compatible with our MIT licensing
- Library is stable (v1.x) with no expected breaking changes

## Implementation Notes

- Core pattern: `draggable()` on sidebar items, `dropTargetForElements()` on pane overlays
- `monitorForElements()` provides global drag state for `pointer-events` toggle
- `attachClosestEdge` with `allowedEdges: ['top', 'bottom', 'left', 'right']` for quadrant detection
- Overlay div sits above xterm.js canvas with `pointer-events: none` normally, `auto` during drag
- `canDrop` guards prevent: dropping same session, dropping duplicates, exceeding 8-pane cap

## References

- [External research: Drag-and-Drop Approaches](../plans/015-pane-splitting/external-research/drag-and-drop-approaches.md)
- [Pane splitting plan](../plans/015-pane-splitting/pane-splitting-plan.md) § Phase 4
- [@atlaskit/pragmatic-drag-and-drop documentation](https://atlassian.design/components/pragmatic-drag-and-drop)
