# Sidebar Toggle Simplification

**Mode**: Simple

📚 This specification incorporates findings from the parallel research session analyzing the current sidebar implementation.

---

## Research Context

**Components affected**:
- `SessionSidebar.tsx` - Main sidebar component with hover wrapper
- `ui.ts` - UIStore with existing `sidebarCollapsed` state (already persisted)
- `App.tsx` - SidebarProvider configuration

**Critical dependencies**:
- `sidebarCollapsed` state exists in UIStore but is NOT wired to SidebarProvider
- `toggleSidebar` action exists but is unused

**Modification risks**: Low - all infrastructure already exists, this is a wiring task

**Link**: Research conducted in parallel agent session (findings documented in this spec)

---

## Summary

**WHAT**: Replace the current hover-based sidebar expand/collapse behavior with a simple, explicit toggle button at the bottom of the sidebar. The button shows `>` when collapsed (to expand) and `<` when expanded (to collapse).

**WHY**: The current hover + pin behavior is "clunky" - it creates implicit state transitions that are unpredictable. Users want direct control: click to open, click to close. The sidebar should be in one of two states: fully open or fully collapsed (icon-only mode).

---

## Goals

1. **Explicit toggle control**: Single button at sidebar bottom toggles between expanded (16rem) and collapsed (3rem/icon-only) states
2. **Remove hover behavior**: No automatic expand on mouse enter or collapse on mouse leave
3. **Persist preference**: Collapsed/expanded state survives page refresh (already implemented via `sidebarCollapsed` in localStorage)
4. **Clear visual affordance**: Toggle button shows directional chevron indicating action (`>` to expand, `<` to collapse)
5. **Maintain session list usability**: When collapsed, session icons still visible and clickable

---

## Non-Goals

1. **No animation changes**: Keep existing 200ms CSS transition
2. **No width changes**: Keep existing 16rem expanded, 3rem collapsed widths
3. **No mobile changes**: Mobile Sheet behavior unchanged
4. **No keyboard shortcut**: Cmd/Ctrl+B shortcut exists but not required for this change
5. **No pin functionality**: Removing pin button (superseded by explicit toggle)

---

## Complexity

**Score**: CS-1 (trivial)

**Breakdown**:
| Factor | Score | Rationale |
|--------|-------|-----------|
| Surface Area (S) | 0 | 2-3 files: SessionSidebar.tsx, App.tsx, possibly ui.ts |
| Integration (I) | 0 | Internal only, no external deps |
| Data/State (D) | 0 | No schema changes, uses existing `sidebarCollapsed` state |
| Novelty (N) | 0 | Well-specified, pattern exists (PinButton) |
| Non-Functional (F) | 0 | Standard performance requirements |
| Testing/Rollout (T) | 0 | Unit tests only, existing test infrastructure |

**Total**: P = 0 → **CS-1**

**Confidence**: 0.95

**Assumptions**:
- `sidebarCollapsed` state wiring is straightforward (SidebarProvider accepts `open` and `onOpenChange` props)
- Existing CSS handles icon-only mode correctly (verified in research)

**Dependencies**: None external

**Risks**: Minimal - removing hover behavior is a simplification, not an addition

**Phases**: Single phase implementation

---

## Acceptance Criteria

### AC-01: Toggle Button Visible in Expanded State
**Given** the sidebar is expanded
**When** I look at the sidebar footer
**Then** I see a toggle button showing `<` (chevron left) with optional "Collapse" label

### AC-02: Toggle Button Collapses Sidebar
**Given** the sidebar is expanded
**When** I click the toggle button
**Then** the sidebar collapses to icon-only mode (3rem width) with 200ms transition

### AC-03: Toggle Button Visible in Collapsed State
**Given** the sidebar is collapsed
**When** I look at the sidebar footer
**Then** I see a toggle button showing `>` (chevron right)

### AC-04: Toggle Button Expands Sidebar
**Given** the sidebar is collapsed
**When** I click the toggle button
**Then** the sidebar expands to full width (16rem) with 200ms transition

### AC-05: No Hover Expansion
**Given** the sidebar is collapsed
**When** I hover my mouse over the sidebar
**Then** the sidebar remains collapsed (no automatic expansion)

### AC-06: No Hover Collapse
**Given** the sidebar is expanded
**When** I move my mouse away from the sidebar
**Then** the sidebar remains expanded (no automatic collapse)

### AC-07: State Persists Across Refresh
**Given** I collapse the sidebar
**When** I refresh the page
**Then** the sidebar remains collapsed

### AC-08: Pin Button Removed
**Given** the sidebar is visible
**When** I look at the sidebar footer
**Then** I do not see a Pin/Unpin button (replaced by toggle)

### AC-09: Sessions Clickable When Collapsed
**Given** the sidebar is collapsed (icon-only mode)
**When** I click a session icon
**Then** that session becomes active (existing behavior preserved)

---

## Risks & Assumptions

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users miss hover behavior | Low | Low | Toggle is more discoverable than hover; power users can use Cmd+B |

### Assumptions
1. `SidebarProvider` component accepts `open` and `onOpenChange` props (verified in shadcn/ui docs)
2. Removing `SidebarWithHover` wrapper doesn't break layout
3. Icon-only mode already works correctly for sessions (verified in research)

---

## Open Questions

None - this is a well-specified simplification with clear scope.

---

## ADR Seeds (Optional)

Not applicable - no architectural decisions needed. This is a behavioral simplification using existing infrastructure.

---

## Implementation Notes (for plan-3)

**Key insight from research**: The `sidebarCollapsed` state in UIStore is already persisted but NOT connected to SidebarProvider. The fix requires:

1. Wire `sidebarCollapsed` to `SidebarProvider.open` prop in App.tsx
2. Wire `setSidebarCollapsed` to `SidebarProvider.onOpenChange` callback
3. Remove `SidebarWithHover` wrapper from SessionSidebar.tsx
4. Replace `PinButton` with `ToggleButton` using ChevronLeft/ChevronRight icons
5. Remove `sidebarPinned` state usage (can leave in store for now)

Estimated: ~30 lines changed across 2 files.
