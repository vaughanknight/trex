# Unified Layout Architecture

**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md` and `qa-perspective.md` (20-question interactive Q&A).

## Research Context

- **Components affected**: `WorkspaceItem` types, workspace store, URL codec, sidebar components (`SessionList`, `SessionItem`, `LayoutSidebarItem`), `App.tsx`, `PaneContainer`, `FirstDragDropZone`, `DropZoneOverlay`, `useURLSync`
- **Critical dependencies**: Binary tree layout system (`layoutTree.ts`), session store (independent, no changes), WebGL pool (mount/unmount lifecycle), drag-and-drop (`@atlaskit/pragmatic-drag-and-drop`)
- **Modification risks**: URL format breaking change (acceptable per Q13), ~200+ test expectation changes, sidebar rendering logic rewrite
- **Link**: See `research-dossier.md` for full analysis, `qa-perspective.md` for design decisions

## Summary

Eliminate the distinction between "standalone sessions" and "layouts" in the workspace model. Every workspace item becomes a layout — a container with a binary tree of 1 or more panes. A single-terminal item is simply a layout with one pane. The sidebar, context menus, icons, drag-drop behavior, and URL encoding all adapt dynamically based on pane count, creating a seamless experience where 1-pane items look and feel identical to today's standalone sessions.

**WHY**: The current two-type model (`WorkspaceSessionItem` / `WorkspaceLayoutItem`) creates unnecessary complexity — type transitions (`convertToLayout`, `maybeAutoDissolve`), duplicate code paths (`FirstDragDropZone` vs `DropZoneOverlay`), and branching logic across ~15 files. Unifying to a single type simplifies the codebase, removes transition edge cases, and makes drag-drop behavior consistent everywhere.

## Goals

1. **Single workspace item type** — Every sidebar item is a layout with `id`, `name`, `tree`, `focusedPaneId`. No discriminated union.
2. **Seamless 1-pane experience** — 1-pane items look identical to today's standalone sessions: terminal icon, session name, no badge. Users should not notice a difference.
3. **Adaptive sidebar rendering** — Icon, name display, badge, and context menu all adapt at the 2-pane threshold.
4. **Unified drop handling** — Every drop is `splitPane()`. No separate first-split flow. `FirstDragDropZone` is eliminated.
5. **No auto-dissolve** — Closing panes to 1 keeps the item as a 1-pane layout. No type morphing.
6. **Simplified codebase** — Remove `convertToLayout`, `convertToLayoutWith`, `maybeAutoDissolve`, `addSessionItem`, `FirstDragDropZone.tsx`, and all `item.type` branching.
7. **Clean URL encoding** — Single item encoding format. Schema version bump. No backward compatibility.

## Non-Goals

- **Backend changes** — No Go backend or WebSocket protocol changes. Session management is unchanged.
- **New features** — This is a refactor, not a feature addition. No new user capabilities beyond consistency.
- **Global pane cap** — No global terminal limit across layouts. Per-layout 8-pane cap remains.
- **Backward-compatible URLs** — Old `{t:'s'}` format URLs will stop working. Acceptable for alpha.
- **Session store changes** — The session store remains independent and unchanged.
- **Tmux store changes** — Tmux sidebar entries stay in `useTmuxStore`. They create 1-pane layouts when clicked (instead of standalone sessions).

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=0, D=2, N=0, F=0, T=1
  - Surface Area (S=2): ~15+ files across types, stores, components, codecs, tests
  - Integration (I=0): All internal changes, no external dependency changes
  - Data/State (D=2): Fundamental data model restructure — `WorkspaceItem` type union eliminated, URL schema changed
  - Novelty (N=0): Requirements fully specified via 20-question Q&A with clear design rules
  - Non-Functional (F=0): No performance, security, or compliance implications
  - Testing/Rollout (T=1): Integration tests required; big-bang with no feature flags
- **Confidence**: 0.90
- **Assumptions**:
  - Binary tree layout system (`layoutTree.ts`) requires no structural changes
  - Session store independence means zero backend changes
  - WebGL pool mount/unmount lifecycle works identically for 1-pane and multi-pane items
- **Dependencies**: None — entirely frontend refactor
- **Risks**:
  - Large test surface (~200+ tests) increases chance of missed update
  - URL format change breaks any bookmarked/shared URLs (acceptable)
  - Sidebar component merge could introduce visual regressions
- **Phases**: 3-4 phases suggested (data model → store logic → UI components → URL codec/tests)

## Acceptance Criteria

**AC-01: Single item type**
Every workspace item uses a single type with `id`, `name`, `tree`, and `focusedPaneId`. No `type` field discriminator. Creating a new terminal session produces a 1-pane layout item.

**AC-02: 1-pane sidebar rendering**
A 1-pane item in the sidebar displays: terminal icon (TerminalSquare), session name from session store, no pane count badge. Visually indistinguishable from today's standalone session rendering.

**AC-03: 2+ pane sidebar rendering**
A 2+ pane item in the sidebar displays: columns icon (Columns2) or dynamic layout preview icon if enabled, layout item name, pane count badge. Consistent with today's layout rendering.

**AC-04: Adaptive display name**
- Items have a `userRenamed: boolean` flag
- 1-pane items where `userRenamed === false` show the session store name (updates with terminal title changes)
- 1-pane items where `userRenamed === true` show the user's chosen name
- 2+ pane items where `userRenamed === false` show the first terminal pane's (pane[0]) session name
- 2+ pane items where `userRenamed === true` show the user's chosen name
- Clearing a name resets `userRenamed` to `false` and reverts to pane[0]'s session name
- If pane[0] is closed, name auto-updates to the new pane[0]'s session name (when `userRenamed === false`)

**AC-05: Context menu adapts**
- All items show "Rename" and "Close"
- Items with 2+ panes also show "Dissolve All"
- Items with 1 pane hide "Dissolve All"
- The word "Layout" does not appear in any menu item

**AC-06: Unified drop handling**
Dropping a sidebar session onto any pane (whether the item has 1 pane or many) calls `splitPane()`. No separate `convertToLayout()` flow. `FirstDragDropZone` component is removed.

**AC-07: Drag source removal**
- Dragging a 1-pane item into another layout removes the source item from the sidebar
- Dragging a 2+ pane item does NOT remove the source item from the sidebar
- Tmux drags create new sessions (existing behavior, unchanged)

**AC-08: No auto-dissolve**
Closing panes in a layout down to 1 remaining pane keeps the item as a 1-pane layout. The item does not change type or behavior. The sidebar rendering adapts to show terminal icon and session name.

**AC-09: Dissolve All creates 1-pane layouts**
"Dissolve All" on a 3-pane layout creates 3 separate 1-pane layout items in the sidebar. Each contains one terminal pane from the original layout.

**AC-10: URL round-trip**
Workspace state with mixed 1-pane and multi-pane items encodes to URL and decodes back to identical state. All items use the same encoding format. Old `{t:'s'}` URLs are not supported.

**AC-11: Preview pane survival**
If all terminal panes in a layout are closed, leaving only a preview pane, the item remains as a 1-pane layout showing the preview. No auto-removal.

**AC-12: Tmux creates 1-pane layouts**
Clicking a tmux session in the sidebar creates a 1-pane layout (not a standalone session). Drag-to-split behavior for tmux sessions is unchanged.

**AC-13: All existing tests pass**
After refactoring, all existing test files pass (with updated expectations). No test files are deleted — only modified to match the unified model.

**AC-14: Session exit in 1-pane layout**
When a backend session exits in a 1-pane layout, the item remains in the sidebar with a SessionEndedOverlay. The user must manually close it. No auto-removal.

## Risks & Assumptions

### Risks
1. **Large changeset** — ~15 files and 200+ tests in a single big-bang change. Mitigated by phased implementation within the big-bang (data model first, then store, then UI, then codec).
2. **Visual regression in sidebar** — Merging `SessionItem` and `LayoutSidebarItem` could introduce subtle rendering differences. Mitigated by visual comparison testing.
3. **URL breakage** — Existing bookmarked/shared URLs stop working. Accepted risk for alpha.
4. **Name display logic complexity** — The adaptive name rule (session name vs layout name vs user-renamed) has 3 branches. Needs thorough testing.

### Assumptions
1. Alpha product with single user — no migration path needed
2. Backend and WebSocket protocol require zero changes
3. WebGL pool lifecycle (acquire on mount, release on unmount) works identically for unified items
4. Terminal cache keyed by sessionId is unaffected (paneId is a separate concept)
5. The `LeafFactory` pattern (`splitPaneWith`) survives unchanged

## Open Questions

All open questions resolved in Clarifications session 2026-02-24. See `## Clarifications` section.

## ADR Seeds (Optional)

- **Decision Drivers**: Code simplification, elimination of type transitions, consistent drag-drop behavior, alpha-stage freedom from backward compatibility
- **Candidate Alternatives**:
  - A: Unified single type (chosen) — remove discriminated union entirely
  - B: Keep union but make both types contain a tree — less disruptive but keeps branching
  - C: Adapter pattern — wrap old types with unified interface — adds complexity
- **Stakeholders**: Single developer (alpha)

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Adaptive Name Display | State Machine | 3 naming branches (session name / layout name / user rename) interact with pane count changes | How does name transition when panes change? What triggers "user renamed" flag? How do terminal title updates flow? |
| Sidebar Component Merge | Integration Pattern | Two complex components (SessionItem 200+ lines, LayoutSidebarItem 300+ lines) with different drag/drop/context-menu logic need unification | What's shared vs unique? Single component or wrapper? How does drag data change? |

## Testing & Documentation Strategy

### Testing Strategy
- **Approach**: Hybrid — TDD for data model/store/codec changes; Lightweight for UI components
- **Rationale**: Data model and URL codec changes need rigorous test coverage (regression risk); UI component changes are straightforward adaptations
- **Focus Areas**: WorkspaceItem type changes, workspace store mutations, URL codec round-trips, adaptive name display logic
- **Excluded**: Visual styling changes, icon switching (manual verification sufficient)
- **Mock Usage**: Avoid mocks entirely — use fakes (per ADR-0004 pattern). Real data/fixtures only.

### Documentation Strategy
- **Location**: docs/how/ only
- **Rationale**: Architecture guide documenting the unified model for future reference
- **Target Audience**: Future contributors understanding the workspace item model
- **Maintenance**: Update when workspace model changes

## Clarifications

### Session 2026-02-24

**C1 — Workflow Mode**: Full mode (multi-phase, comprehensive gates). CS-3 warrants full planning.

**C2 — Testing Strategy**: Hybrid — TDD for data model/store/codec, Lightweight for UI components.

**C3 — Mock Usage**: Avoid mocks entirely. Use fakes (per ADR-0004). Real data/fixtures only.

**C4 — Documentation Strategy**: docs/how/ only — architecture guide for the unified model.

**C5 — Name Tracking**: Use a `userRenamed: boolean` flag on WorkspaceItem. When user clears the name, it reverts to the name of the first terminal pane (pane[0]). If pane[0] is closed and other panes remain, the name changes to the new pane[0]'s session name. `userRenamed` resets to `false` on clear.

**C6 — Session Exit Behavior**: Keep item with SessionEndedOverlay (like layout panes today). User manually closes. No auto-removal of 1-pane items when session exits.

**C7 — Component Merge**: Adapt `LayoutSidebarItem.tsx` to handle both 1-pane and multi-pane cases. `SessionItem.tsx` is eventually removed. `LayoutSidebarItem` becomes the universal sidebar item component.

### Coverage Summary

| Area | Status |
|------|--------|
| Workflow Mode | ✅ Resolved — Full |
| Testing Strategy | ✅ Resolved — Hybrid (TDD + Lightweight) |
| Mock Usage | ✅ Resolved — Fakes only, no mocks |
| Documentation | ✅ Resolved — docs/how/ architecture guide |
| Name Tracking | ✅ Resolved — `userRenamed` boolean + pane[0] fallback |
| Session Exit | ✅ Resolved — SessionEndedOverlay, manual close |
| Component Merge | ✅ Resolved — Adapt LayoutSidebarItem |
| Open Questions | 0 remaining |
