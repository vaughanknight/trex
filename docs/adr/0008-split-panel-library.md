---
id: ADR-0008
title: "react-resizable-panels for split pane layout"
status: accepted
date: 2026-02-10
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: [ui, split-panels, react, layout]
complexity: CS-2
---

# ADR-0008: react-resizable-panels for split pane layout

## Context

trex needs to display multiple terminal sessions simultaneously in resizable split panes. Users should be able to drag dividers to resize panes, with minimum size constraints preventing zero-width panes. The solution must work with React 19, integrate with xterm.js terminals, and support nested binary tree layouts (up to 8 panes).

## Decision Drivers

- **Bundle size**: Terminal app should stay lightweight; large UI framework dependencies are unacceptable
- **React 19 compatibility**: Must work with React 19 (current project dependency)
- **Nested layout support**: Must support recursive binary tree rendering (splits within splits)
- **Accessibility**: WAI-ARIA keyboard navigation for resize handles
- **Zero CSS requirement**: Fully stylable via Tailwind; no mandatory CSS imports
- **API stability**: v4 API should be stable with TypeScript types

## Considered Options

### Option 1: react-resizable-panels

**Description**: MIT-licensed React library specifically for resizable panel layouts. v4 API uses `Group`/`Panel`/`Separator` components. ~8 kB gzipped, zero dependencies.

**Pros**:
- 8 kB gzipped, zero transitive dependencies
- MIT license (compatible with all project licenses)
- Built-in WAI-ARIA keyboard resize support
- `minSize` prop prevents zero-width panels (AC-13)
- `onLayoutChanged` callback for ratio persistence
- Supports percentage and pixel sizing
- Active maintenance, TypeScript-first
- Fully Tailwind-compatible — no CSS imports required

**Cons**:
- v3→v4 API rename (PanelGroup→Group, PanelResizeHandle→Separator) — must verify actual exports
- Relatively new v4 API (less community documentation)

### Option 2: allotment

**Description**: React split pane component. ~15 kB gzipped.

**Pros**:
- Clean API
- Good performance

**Cons**:
- Larger bundle (~15 kB)
- Requires CSS import (conflicts with Tailwind-only approach)
- Less flexible nesting support
- Fewer accessibility features

### Option 3: react-mosaic

**Description**: Full window management system for React.

**Pros**:
- Feature-rich (drag-to-rearrange built-in)
- Used by Firefox DevTools

**Cons**:
- ~25 kB gzipped — heavyweight for our needs
- Opinionated layout model (mosaic, not binary tree)
- Required CSS theme (blueprint dependency)
- Overkill — we manage the tree ourselves

### Option 4: Custom flexbox implementation

**Description**: Build split panes from scratch using CSS flexbox/grid with custom resize handles.

**Pros**:
- Zero dependencies
- Full control over behavior

**Cons**:
- Significant implementation effort (~CS-3 just for resize)
- Must build accessibility manually (keyboard resize, ARIA)
- Must handle edge cases (minimum sizes, nested resize, resize events)
- Reinventing well-solved problems

## Decision

**Chosen Option**: Option 1 (react-resizable-panels) because it provides the best balance of bundle size (8 kB), zero dependencies, accessibility, and API simplicity. The library handles the hard problems (keyboard resize, minimum sizes, nested layouts) while staying lightweight. Our binary tree layout maps cleanly to nested Group/Panel/Separator structures.

## Consequences

### Positive

- 8 kB addition to bundle — well within the 15 kB budget for both new dependencies
- WAI-ARIA keyboard resize support out of the box
- `minSize` prop directly satisfies AC-13 (minimum pane size)
- Zero CSS requirement aligns with project's Tailwind-only approach
- Active maintenance reduces long-term risk

### Negative

- v4 API names must be verified against actual TypeScript exports after install (mitigation: verification task 2.1a)
- External dependency introduces upgrade risk (mitigation: pin to `^4.6.0`)

### Neutral

- Library handles resize events; we handle tree structure and terminal lifecycle separately
- `onLayoutChanged` callback fires once after resize (not continuously), suitable for ratio persistence

## Implementation Notes

- Install: `npm install react-resizable-panels@^4.6.0`
- Use in Phase 2 (Split Rendering) — not installed in Phase 1
- Verify actual component export names in task 2.1a before building components
- PaneLayout component renders binary tree recursively: each PaneSplit becomes a Group with two Panels and a Separator

## References

- [react-resizable-panels npm](https://www.npmjs.com/package/react-resizable-panels)
- [Plan 015: Pane Splitting](../../plans/015-pane-splitting/pane-splitting-plan.md) § Phase 2
- [Spec: Pane Splitting](../../plans/015-pane-splitting/pane-splitting-spec.md) ADR Seed 1
- [External Research: Split Pane Libraries](../../plans/015-pane-splitting/external-research/split-pane-libraries.md)
