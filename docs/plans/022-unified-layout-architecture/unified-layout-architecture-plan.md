# Unified Layout Architecture Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-24
**Spec**: [./unified-layout-architecture-spec.md](./unified-layout-architecture-spec.md)
**Research**: [./research-dossier.md](./research-dossier.md)
**Q&A Perspective**: [./qa-perspective.md](./qa-perspective.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Phase 1: Data Model & Core Store](#phase-1-data-model--core-store)
6. [Phase 2: UI Components & Drop Zones](#phase-2-ui-components--drop-zones)
7. [Phase 3: URL Codec & Documentation](#phase-3-url-codec--documentation)
8. [Cross-Cutting Concerns](#cross-cutting-concerns)
9. [Complexity Tracking](#complexity-tracking)
10. [Progress Tracking](#progress-tracking)
11. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The workspace system uses a discriminated union (`WorkspaceSessionItem | WorkspaceLayoutItem`) creating unnecessary complexity — type transitions (`convertToLayout`, `maybeAutoDissolve`), duplicate code paths (`FirstDragDropZone` vs `DropZoneOverlay`), and branching logic across ~15 files.

**Solution**:
- Eliminate the discriminated union; every workspace item becomes a single type with `id`, `name`, `tree`, `focusedPaneId`, `userRenamed`
- A "standalone session" is simply a layout with a single-leaf tree
- Remove `convertToLayout`, `convertToLayoutWith`, `maybeAutoDissolve`, `addSessionItem`, `FirstDragDropZone.tsx`
- Sidebar rendering adapts by pane count: 1-pane → terminal icon + session name; 2+ → columns icon + layout name + badge
- URL codec uses single item format (clean break, no backward compat)

**Expected Outcomes**:
- ~120 lines of type-transition code removed from workspace store
- ~15 `item.type` branches eliminated across codebase
- Drag-drop unifies to single `splitPane()` path everywhere
- Simpler mental model: everything is a layout

**Complexity**: CS-3 (medium) — S=2, I=0, D=2, N=0, F=0, T=1

---

## Technical Context

### Current System State
- `WorkspaceItem` = `WorkspaceSessionItem | WorkspaceLayoutItem` (discriminated union in `types/workspace.ts`)
- Session items: `{ type: 'session', id, sessionId }` — lightweight, references single backend session
- Layout items: `{ type: 'layout', id, name, tree, focusedPaneId }` — binary split tree with 2-8 panes
- `maybeAutoDissolve()` prevents 1-pane layouts (auto-converts to session item)
- `convertToLayout()` handles session → layout transition on first split
- `FirstDragDropZone` wraps standalone sessions for drop handling
- URL codec uses `{t:'s'}` for sessions, `{t:'l'}` for layouts

### Integration Requirements
- Binary tree layout system (`layoutTree.ts`): No structural changes needed
- Session store (`sessions.ts`): Independent, no changes needed
- WebGL pool: Mount/unmount lifecycle unchanged
- Backend/WebSocket: Zero changes required

### Constraints
- **ADR-0004**: Fakes only, no mocks (governs all testing)
- **ADR-0010**: URL layout format uses prefix notation (`H50bz`). Tree encoding stays; wrapper schema changes
- **No backward compatibility**: Old URLs break (alpha, single user)
- **8-pane cap**: Per-layout, enforced in `layoutTree.ts` (unchanged)

### Assumptions
1. `layoutTree.ts` pure functions work identically for 1-pane and N-pane trees
2. Terminal cache (keyed by sessionId) is unaffected by paneId addition to all items
3. WebGL pool acquire/release lifecycle is mount/unmount-based (unchanged)
4. `LeafFactory` pattern (`splitPaneWith`) survives unchanged

### Gate Validation

**Clarify Gate**: ✅ All 7 questions resolved (C1-C7). 0 open questions.

**Constitution Gate**: ✅ No deviations needed.

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| (none) | — | — | — |

**Architecture Gate**: ✅ No layer-boundary violations. All changes are frontend-only within existing module boundaries.

**ADR Ledger**:

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Active | All phases | Fakes only, no mocks. All tests use real data/fixtures. |
| ADR-0008 | Active | Phase 2 | react-resizable-panels v4 governs PaneLayout/PaneContainer structure. |
| ADR-0009 | Active | Phase 2 | @atlaskit/pragmatic-drag-and-drop governs DropZoneOverlay quadrant detection. |
| ADR-0010 | Active | Phase 3 | URL prefix notation format unchanged; wrapper schema changes from v1 to v2. |

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Session Lifecycle Subscription Must Change
**Impact**: Critical
**Sources**: [I1-01, R1-02, R1-08]
**Problem**: Current subscription (workspace.ts:520-542) auto-removes standalone session items when backend session exits. After unification, all items are layouts — no `item.type === 'session'` check possible.
**Solution**: Per spec C6, when a session exits, the workspace item stays with SessionEndedOverlay. Remove the auto-removal logic entirely. Items are only removed by explicit user action ("Close").
**Action Required**: Delete the session removal branch from the cross-store subscription. All panes show SessionEndedOverlay on session exit.
**Affects Phases**: Phase 1

### 🚨 Critical Discovery 02: Four Transition Functions Collapse
**Impact**: Critical
**Sources**: [I1-02]
**Problem**: `convertToLayout()` (90+ lines), `convertToLayoutWith()`, `dissolveLayout()` (30 lines), and `maybeAutoDissolve()` (23 lines) manage type transitions that no longer exist in the unified model.
**Solution**: Delete all four. Splitting a 1-pane item is just `splitPane()`. Dissolving creates N × 1-pane layouts via a new `dissolveAll()` that maps tree leaves to individual items.
**Action Required**: Remove functions, update callers, add `dissolveAll()` that creates 1-pane layouts.
**Affects Phases**: Phase 1

### 🚨 Critical Discovery 03: 205+ Tests Reference Type Discrimination
**Impact**: Critical
**Sources**: [R1-01]
**Problem**: 53 workspace tests, 49 codec tests, 36 layout codec tests, and 8 sidebar tests explicitly check `item.type`. All need updating.
**Solution**: Big-bang test updates per phase — update tests alongside implementation. No adapter layer needed (user confirmed no backward compat).
**Action Required**: Update test expectations in each phase as the corresponding code changes.
**Affects Phases**: Phase 1, 2, 3

### 🔴 High Discovery 04: Drag Data Model Simplification
**Impact**: High
**Sources**: [I1-03, R1-04]
**Problem**: Three drag types exist: `sidebar-session`, `sidebar-layout`, `sidebar-tmux-session`. After unification, `sidebar-session` becomes redundant (all items are layouts).
**Solution**: Replace `sidebar-session` with `sidebar-item`. Drop handlers accept both during transition. `sidebar-tmux-session` stays unchanged (tmux creates new sessions on drop).
**Action Required**: Unify drag type in sidebar component. Update all drop handler `canDrop` checks.
**Affects Phases**: Phase 2

### 🔴 High Discovery 05: App.tsx Router Simplifies to Single Path
**Impact**: High
**Sources**: [I1-06]
**Problem**: App.tsx (lines 87-104) branches on `activeItem?.type` to choose between `FirstDragDropZone + PaneContainer` and `PaneLayout`.
**Solution**: Always render `PaneLayout` for any active item. `PaneLayout` already handles single-leaf trees (renders one `PaneContainer`).
**Action Required**: Remove type branching in App.tsx. Delete `FirstDragDropZone` imports.
**Affects Phases**: Phase 2

### 🔴 High Discovery 06: Store Mutations Unify (~120 Lines Removed)
**Impact**: High
**Sources**: [I1-08]
**Problem**: Store has dual creation paths (`addSessionItem`/`addLayoutItem`), type guards in mutations, and conversion functions.
**Solution**: Single `addItem(name, tree, focusedPaneId?)` creation path. Remove type guards from `splitPane`, `closePane`, `movePane`. Delete conversion functions.
**Action Required**: Refactor workspace store to single-type operations.
**Affects Phases**: Phase 1

### 🔴 High Discovery 07: Orphan Session Detection Becomes Tree-Walking
**Impact**: High
**Sources**: [R1-05]
**Problem**: `SessionList.tsx` (lines 58-70) detects orphan sessions by branching on `item.type`. After unification, all items use `getTerminalLeaves(item.tree)`.
**Solution**: Create `collectSessionsInWorkspace(items)` helper that walks all trees. Orphan = session not in any tree.
**Action Required**: Update `SessionList` orphan detection to always walk trees.
**Affects Phases**: Phase 2

### 🔴 High Discovery 08: PaneContainer Variant Becomes Unnecessary
**Impact**: High
**Sources**: [I1-05]
**Problem**: `PaneContainer` has `variant?: 'standalone' | 'layout'` controlling title bar buttons, close behavior, and drop zones.
**Solution**: Remove variant prop. All items behave as layouts: title bar visible when 2+ panes, close calls `closePane()` (which removes the workspace item if last pane), drag handles always available.
**Action Required**: Remove variant prop and associated branching from PaneContainer.
**Affects Phases**: Phase 2

### 🟡 Medium Discovery 09: Sidebar Component Merge Strategy
**Impact**: Medium
**Sources**: [R1-07, C7]
**Problem**: `SessionItem.tsx` (~200 lines) and `LayoutSidebarItem.tsx` (~300 lines) have overlapping drag/drop/context-menu logic.
**Solution**: Per C7, adapt `LayoutSidebarItem` to handle both cases. Add pane-count-based rendering logic (icon, name, badge, context menu). Eventually remove `SessionItem.tsx`.
**Action Required**: Extend `LayoutSidebarItem` with 1-pane rendering mode.
**Affects Phases**: Phase 2

### 🟡 Medium Discovery 10: URL Codec Clean Break
**Impact**: Medium
**Sources**: [I1-04, R1-06]
**Problem**: Current codec uses `{t:'s', s:'bash'}` for sessions. Unified model needs all items as `{t:'l', ...}` or a single format.
**Solution**: Clean break — new schema v2 with single item format. All items encode as `{n: 'name', r: 'treeNotation', ur: boolean}`. Bump schema version. Old URLs stop working.
**Action Required**: Rewrite encode/decode functions. Update round-trip tests.
**Affects Phases**: Phase 3

### 🟡 Medium Discovery 11: Adaptive Name Display Logic
**Impact**: Medium
**Sources**: [C5, C16]
**Problem**: Display name has 3 branches: session name (1-pane, not renamed), layout name (2+, not renamed uses pane[0] name), user-chosen name (any pane count, renamed).
**Solution**: `userRenamed: boolean` flag. Display: `userRenamed ? item.name : getSessionName(getFirstLeafSessionId(item.tree))`.
**Action Required**: Add `userRenamed` to WorkspaceItem. Update rename/clear logic. Add name derivation helper.
**Affects Phases**: Phase 1, Phase 2

### 🟡 Medium Discovery 12: Dissolve All Creates 1-Pane Layouts
**Impact**: Medium
**Sources**: [C8, C9]
**Problem**: Current `dissolveLayout()` creates N standalone sessions. Unified model creates N × 1-pane layouts.
**Solution**: New `dissolveAll(itemId)` function: extracts terminal leaves, creates 1-pane layout per leaf, removes original item.
**Action Required**: Replace `dissolveLayout` with `dissolveAll`.
**Affects Phases**: Phase 1

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Hybrid (per spec C2)
- **TDD phases**: Phase 1 (data model, store mutations, lifecycle), Phase 3 (URL codec round-trips)
- **Lightweight phases**: Phase 2 (UI components — build passes, manual visual verification)
- **Rationale**: Data model and codec changes are high-risk for regressions; UI adaptations are straightforward

### Mock Usage
- **Policy**: Avoid mocks entirely — fakes only (per ADR-0004, spec C3)
- **Existing fakes**: FakeWebglAddon, FakeGPUContext (unchanged)
- **New fakes needed**: None (workspace store tests use real Zustand store)

### Test Documentation
Every test must include:
```
Purpose: [what truth this test proves]
Quality Contribution: [how this prevents bugs]
Acceptance Criteria: [measurable assertions]
```

### Test Commands Reference
```bash
# Full test suite
cd frontend && npx vitest run --reporter=verbose

# Workspace store tests (Phase 1)
cd frontend && npx vitest run src/stores/__tests__/workspace.test.ts --reporter=verbose

# Layout tree tests
cd frontend && npx vitest run src/lib/__tests__/layoutTree.test.ts --reporter=verbose

# Codec tests (Phase 3)
cd frontend && npx vitest run src/lib/__tests__/workspaceCodec.test.ts --reporter=verbose
cd frontend && npx vitest run src/lib/__tests__/layoutCodec.test.ts --reporter=verbose

# Sidebar component tests (Phase 2)
cd frontend && npx vitest run src/components/__tests__/SessionList.test.tsx --reporter=verbose
cd frontend && npx vitest run src/components/__tests__/SessionSidebar.test.tsx --reporter=verbose

# Build verification
cd frontend && npm run build

# TypeScript type check
cd frontend && npx tsc --noEmit
```

### Source Abbreviation Legend
- **I1-xx**: Implementation Strategy subagent finding (from plan-3-architect research)
- **R1-xx**: Risk & Mitigation subagent finding (from plan-3-architect research)
- **C#**: Clarification answer # (from plan-2-clarify session)
- **Q#**: Q&A question # (from 20-question interactive session)
- **AC-xx**: Acceptance Criteria (from spec)
- **PL-xx**: Prior Learning (from research-dossier.md)
- **DYK-xx**: "Did You Know" code footnote (in source code)

---

## Phase 1: Data Model & Core Store

**Objective**: Unify `WorkspaceItem` type, update store mutations, remove transition functions, and update session lifecycle.

**Testing**: TDD — write/update tests first, then implement.

**Deliverables**:
- Unified `WorkspaceItem` type (single type, no union)
- Updated workspace store with `addItem()`, removed `convertToLayout*`, `maybeAutoDissolve`
- New `dissolveAll()` function creating 1-pane layouts
- Updated session lifecycle subscription (no auto-removal)
- All workspace store tests passing with unified expectations

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Test update misses edge case | Medium | Medium | Run full test suite after each function change |
| Session lifecycle change causes zombie items | Low | High | Add explicit test for session-exit → overlay behavior |
| dissolveAll creates items without proper names | Low | Medium | Derive name from session store for each leaf |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Unify `WorkspaceItem` type in `types/workspace.ts` | 2 | Single type with `id`, `name`, `tree`, `focusedPaneId`, `userRenamed`. No `type` discriminator. All TypeScript imports compile. | - | Remove `WorkspaceSessionItem`, `WorkspaceLayoutItem`. Update `WorkspaceActions` signatures. |
| 1.2 | [ ] | Update workspace store creation functions | 2 | `addItem(name, tree, focusedPaneId?)` replaces `addSessionItem` + `addLayoutItem`. Old functions removed. | - | New items always have a tree (even single leaf). `userRenamed` defaults to `false`. |
| 1.3 | [ ] | Remove transition functions from store | 2 | `convertToLayout`, `convertToLayoutWith`, `maybeAutoDissolve` deleted. No callers remain. Build passes. | - | ~120 lines removed. `closePane` no longer calls `maybeAutoDissolve`. |
| 1.4 | [ ] | Implement `dissolveAll()` in store | 2 | Extracts terminal leaves from tree, creates N × 1-pane layouts. Original item removed. Names derived from session store. | - | Replaces `dissolveLayout`. Preview-only leaves create preview-pane layouts. |
| 1.5 | [ ] | Update session lifecycle subscription | 2 | Session exit does NOT auto-remove workspace items. Panes show SessionEndedOverlay. Test verifies item persists after session exit. | - | Per C6. Delete the `item.type === 'session'` removal branch. |
| 1.6 | [ ] | Update `findItemBySessionId` and derived queries | 1 | Always walks tree for all items. No type branching. `getActiveSessionId` works for 1-pane items. | - | Simplification — remove session-type shortcut path. |
| 1.7 | [ ] | Update workspace store tests | 3 | All workspace tests pass in `src/stores/__tests__/workspace.test.ts` (~53 tests). Type-specific assertions rewritten for unified type. New tests for `addItem`, `dissolveAll`, session-exit persistence. All tests include TAD blocks. Run: `npx vitest run src/stores/__tests__/workspace.test.ts` | - | Largest task — systematic test update. Remove `item.type` checks. Add: `addItem` creates 1-pane layout, `dissolveAll` creates N 1-pane layouts, session exit keeps item. |
| 1.8 | [ ] | Verify frontend build passes | 1 | `npm run build` succeeds with 0 errors. TypeScript strict mode clean. | - | May require temporary type casts in UI components (fixed in Phase 2). |

### Acceptance Criteria
- [ ] `WorkspaceItem` is a single type (no union, no `type` field)
- [ ] `addItem()` creates 1-pane layout for new sessions (AC-01)
- [ ] `dissolveAll()` creates N × 1-pane layouts (AC-09)
- [ ] Session exit keeps item with overlay (AC-14, AC-08)
- [ ] All workspace store tests pass
- [ ] `userRenamed` flag tracks rename state (AC-04)
- [ ] Build passes (type errors may exist in UI files, addressed in Phase 2)
- [ ] ADR-0004 compliance: no mocks in tests

---

## Phase 2: UI Components & Drop Zones

**Objective**: Update all UI components to work with unified workspace items. Remove `FirstDragDropZone`, unify drag-drop, adapt sidebar rendering.

**Testing**: Lightweight — build passes, existing component tests updated, manual visual verification.

**Deliverables**:
- `App.tsx` always renders `PaneLayout` (no type branching)
- `FirstDragDropZone.tsx` deleted
- `LayoutSidebarItem` adapted for 1-pane and multi-pane rendering
- `SessionItem.tsx` removed (functionality merged into `LayoutSidebarItem`)
- `PaneContainer` variant prop removed
- `DropZoneOverlay` uses `splitPane()` for all drops
- Unified drag data model (`sidebar-item` replaces `sidebar-session`)

**Dependencies**: Phase 1 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sidebar visual regression | Medium | Medium | Screenshot comparison before/after |
| Drag-drop flow broken | Medium | High | Test each drag scenario manually |
| Orphan session detection incorrect | Low | Medium | Add helper function with tests |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Update `App.tsx` — always render `PaneLayout` | 2 | Remove `item.type` branching. Active item always rendered as `PaneLayout`. `FirstDragDropZone` import removed. Empty state when no active item. | - | Per Discovery 05. Single render path. |
| 2.2 | [ ] | Delete `FirstDragDropZone.tsx` | 1 | File removed. No imports remain. All drops go through `DropZoneOverlay`. | - | ~150 lines removed. |
| 2.3 | [ ] | Update `DropZoneOverlay.tsx` — unified drop handler | 2 | All drops call `splitPane()`. No `convertToLayout` path. `sidebar-item` drag type accepted alongside legacy types. Source item removal for 1-pane items (AC-07). | - | Per Discovery 04. |
| 2.4 | [ ] | Update `PaneContainer.tsx` — remove variant prop | 2 | No `variant` prop. Always renders layout-style title bar (when 2+ panes). Close calls `closePane()`. Drop zone always active. | - | Per Discovery 08. Title bar visibility controlled by parent. |
| 2.5 | [ ] | Adapt `LayoutSidebarItem.tsx` for 1-pane rendering | 3 | 1-pane: terminal icon, session name (or user name if renamed), no badge. 2+: columns icon, layout name, badge. Context menu: "Rename", "Close" always; "Dissolve All" at 2+ only. No "Layout" word. | - | Per AC-02/03/04/05/07. Largest UI task. |
| 2.6 | [ ] | Update `SessionList.tsx` — single rendering path | 2 | Remove type branching. All items render via adapted `LayoutSidebarItem`. Update orphan detection to use `collectSessionsInWorkspace()` helper. | - | Per Discovery 07. |
| 2.7 | [ ] | Remove `SessionItem.tsx` | 1 | File removed. No imports remain. All sidebar items use `LayoutSidebarItem`. | - | After 2.5 and 2.6 confirm LayoutSidebarItem handles all cases. |
| 2.8 | [ ] | Unify drag data model | 2 | `sidebar-session` type replaced with `sidebar-item`. All drop handlers accept new type. `sidebar-tmux-session` unchanged. Drag source removal: 1-pane items removed on drop, 2+ items stay. | - | Per AC-07, Discovery 04. |
| 2.9 | [ ] | Update component tests | 2 | `SessionList.test.tsx`, `SessionSidebar.test.tsx` pass with unified model. Drag-drop expectations updated. | - | ~8 sidebar tests to update. |
| 2.10 | [ ] | Verify build and full test suite | 1 | `npm run build` passes. `npx vitest run` — all tests pass. | - | Full validation before Phase 3. |

### Acceptance Criteria
- [ ] App.tsx always renders PaneLayout (AC-06)
- [ ] FirstDragDropZone.tsx deleted (AC-06)
- [ ] SessionItem.tsx deleted — LayoutSidebarItem handles all items
- [ ] 1-pane items: terminal icon, session name, no badge (AC-02)
- [ ] 2+ pane items: columns icon, layout name, badge (AC-03)
- [ ] Context menu: "Rename", "Close", "Dissolve All" (2+ only) (AC-05)
- [ ] Drag 1-pane → removes source; drag 2+ → keeps source (AC-07)
- [ ] All drops use `splitPane()` (AC-06)
- [ ] Tmux drag-to-split unchanged (AC-12)
- [ ] All tests pass, build clean

---

## Phase 3: URL Codec & Documentation

**Objective**: Update URL encoding/decoding to single item format, update URL sync, create architecture documentation.

**Testing**: TDD for codec (round-trip tests), Lightweight for documentation.

**Deliverables**:
- Updated `workspaceCodec.ts` with single item format (schema v2)
- Updated `useURLSync.ts` for unified model
- All codec tests passing with new format
- `docs/how/workspace-architecture.md` architecture guide

**Dependencies**: Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| URL round-trip failure | Medium | High | Exhaustive round-trip test suite (per PL-14) |
| URL length growth | Low | Low | Confirmed acceptable per Q14 |
| Documentation drift | Low | Low | Write docs after implementation stabilizes |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write round-trip tests for new URL format | 2 | Tests cover: 1-pane item, multi-pane item, mixed workspace, tmux metadata, userRenamed flag, empty workspace, max items. All fail initially. | - | TDD — tests first. |
| 3.2 | [ ] | Update `workspaceCodec.ts` — unified encoding | 3 | Single item format: `{n: name, r: treeNotation, ur?: boolean}`. Schema version 2. `buildWorkspaceSchema` handles all items uniformly. Encode/decode functions updated. | - | Per Discovery 10. Remove session/layout branches. |
| 3.3 | [ ] | Update `useURLSync.ts` — unified reconstruction | 2 | URL decode creates unified items via `addItem()`. No session vs layout branching. Pending session handling works with 1-pane layouts. | - | Session creation via WebSocket unchanged. |
| 3.4 | [ ] | Update codec tests | 2 | All 49 workspaceCodec tests pass with v2 format. Round-trip tests from 3.1 pass. Remove v1 format tests. | - | ~49 tests to update. |
| 3.5 | [ ] | Create architecture guide | 2 | `docs/how/workspace-architecture.md` created. Covers: unified WorkspaceItem model, store operations, adaptive rendering rules (icon/name/badge by pane count), URL encoding v2, naming rules (`userRenamed` flag). Links to existing docs/how/ guides where relevant. | - | Existing docs/how/ has 12 files (authentication, clickable-links, dynamic-layout-icons, idle-indicators, oauth-setup, pane-splitting, terminal-architecture, terminal-development, tmux-detection, tmux-integration, troubleshooting-auth, webgl-pooling). No existing workspace architecture guide. |
| 3.6 | [ ] | Final full test suite validation | 1 | `npx vitest run` — all 587+ tests pass. `npm run build` clean. No TypeScript errors. | - | Final gate before completion. |

### Acceptance Criteria
- [ ] URL round-trip works for mixed 1-pane and multi-pane workspaces (AC-10)
- [ ] Old `{t:'s'}` URLs not supported (clean break) (AC-10)
- [ ] Tmux metadata preserved in URL encoding (AC-12)
- [ ] `userRenamed` flag round-trips through URL
- [ ] All 587+ tests pass
- [ ] Architecture guide created in docs/how/
- [ ] ADR-0010 format (prefix notation for trees) preserved within new schema

---

## Cross-Cutting Concerns

### Security Considerations
- No security implications — all changes are frontend-only structural refactoring
- No new user input handling (existing sanitization unchanged)
- No authentication/authorization changes

### Observability
- No new logging needed (existing console.info/warn patterns unchanged)
- No new metrics (alpha product)
- Existing error boundaries unchanged

### Documentation
- **Location**: `docs/how/workspace-architecture.md`
- **Content**: Unified WorkspaceItem model, store operations, adaptive rendering rules, URL encoding v2
- **Discovery**: Existing `docs/how/` has: authentication, clickable-links, dynamic-layout-icons, idle-indicators, oauth-setup, pane-splitting, terminal-architecture, terminal-development, tmux-detection, tmux-integration, troubleshooting-auth, webgl-pooling
- **Placement Decision**: New file — no existing workspace architecture guide exists
- **Target Audience**: Future contributors understanding the workspace data model
- **Maintenance**: Update when workspace model changes

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|--------------------------|---------------|------------|
| WorkspaceItem type unification | 3 | Medium | S=2,I=0,D=2,N=0,F=0,T=1 | Fundamental data model change touching ~15 files | Phase 1 establishes type first; subsequent phases adapt consumers |
| URL codec v2 | 3 | Medium | S=1,I=0,D=2,N=0,F=0,T=2 | Schema format change with round-trip testing requirement | Exhaustive round-trip tests per PL-14; clean break simplifies codec |
| Sidebar component merge | 2 | Small | S=1,I=1,D=0,N=0,F=0,T=1 | Merging two ~250-line components with shared patterns | Adapt existing LayoutSidebarItem rather than rewrite |

---

## Progress Tracking

### Phase Completion Checklist
- [ ] Phase 1: Data Model & Core Store - Not Started
- [ ] Phase 2: UI Components & Drop Zones - Not Started
- [ ] Phase 3: URL Codec & Documentation - Not Started

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
