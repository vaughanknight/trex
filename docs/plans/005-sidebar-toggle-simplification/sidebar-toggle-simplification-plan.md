# Sidebar Toggle Simplification Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-05
**Spec**: [./sidebar-toggle-simplification-spec.md](./sidebar-toggle-simplification-spec.md)
**Status**: COMPLETE

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Implementation](#implementation)
4. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The current sidebar uses hover-based expand/collapse with a pin override, creating implicit state transitions that feel "clunky" and unpredictable.

**Solution**: Replace hover behavior with an explicit toggle button (`>` to expand, `<` to collapse) at the bottom of the sidebar. Wire the existing `sidebarCollapsed` state from UIStore to SidebarProvider.

**Expected Outcome**: Users have direct, predictable control over sidebar visibility. State persists across page refreshes. Simplified codebase with ~30 lines removed and ~20 lines added.

---

## Critical Research Findings (Concise)

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **State Disconnect**: `sidebarCollapsed` in UIStore is persisted but NOT wired to SidebarProvider's `open` prop | Wire UIStore.sidebarCollapsed ↔ SidebarProvider.open in App.tsx |
| 02 | Critical | **SidebarProvider Props**: Accepts `open?: boolean` and `onOpenChange?: (open: boolean) => void` for controlled mode | Use controlled mode instead of `defaultOpen={true}` |
| 03 | High | **Hover Wrapper Removal**: `SidebarWithHover` component (lines 59-92) wraps sidebar content with mouse event handlers | Delete entire `SidebarWithHover` function and its usage |
| 04 | High | **PinButton Pattern**: Existing toggle pattern at `SessionSidebar.tsx:43-53` uses `SidebarMenuButton` with lucide icon | Follow same pattern for new ToggleButton using ChevronLeft/ChevronRight |
| 05 | High | **Existing Actions**: `toggleSidebar()` and `setSidebarCollapsed()` already exist in UIStore but are unused | Use `toggleSidebar()` for toggle button onClick |
| 06 | Medium | **Test Update Required**: `SessionSidebar.test.tsx` tests Pin button behavior (lines 81-96) | Update test to verify toggle button instead of pin |
| 07 | Medium | **Icon Import**: lucide-react already imported in SessionSidebar for Pin/PinOff/Settings | Add ChevronLeft, ChevronRight to existing import |
| 08 | Low | **Selector Exists**: `selectSidebarCollapsed` selector already exported from ui.ts | Use selector for reading collapsed state in App.tsx |

---

## Implementation (Single Phase)

**Objective**: Replace hover-based sidebar behavior with explicit toggle button control.

**Testing Approach**: Lightweight (update existing tests, manual verification)
**Mock Usage**: Avoid (use real Zustand stores as in existing tests)

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Wire UIStore.sidebarCollapsed to SidebarProvider in App.tsx | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/frontend/src/App.tsx` | App renders with controlled sidebar; state syncs with UIStore | Import selectSidebarCollapsed, use open={!collapsed}, onOpenChange |
| [x] | T002 | Create ToggleButton component replacing PinButton | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/frontend/src/components/SessionSidebar.tsx` | Button shows ChevronLeft when expanded, ChevronRight when collapsed | Follow PinButton pattern; use toggleSidebar action |
| [x] | T003 | Remove SidebarWithHover wrapper and PinButton | 1 | Core | T002 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/SessionSidebar.tsx` | No hover handlers in DOM; no Pin/Unpin text visible | Delete lines 55-92 (SidebarWithHover), lines 43-53 (PinButton) |
| [x] | T004 | Update sidebar footer to use ToggleButton | 1 | Core | T002, T003 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/SessionSidebar.tsx` | Toggle button appears in footer where Pin was | Replace PinButton with ToggleButton in SidebarFooter |
| [x] | T005 | Update SessionSidebar.test.tsx for toggle behavior | 1 | Test | T002, T003, T004 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/__tests__/SessionSidebar.test.tsx` | Tests pass; verify toggle instead of pin | Update test assertions and test-doc comment |
| [x] | T006 | Manual verification of all acceptance criteria | 1 | Verify | T001-T005 | -- | All AC-01 through AC-09 pass manual testing | Test expand, collapse, persistence, no hover |

### Detailed Task Specifications

#### T001: Wire UIStore to SidebarProvider

**Current** (`App.tsx:17`):
```tsx
<SidebarProvider defaultOpen={true}>
```

**Target**:
```tsx
import { useUIStore, selectActiveSessionId, selectSidebarCollapsed } from './stores/ui'

function App() {
  const sidebarCollapsed = useUIStore(selectSidebarCollapsed)
  const setSidebarCollapsed = useUIStore(state => state.setSidebarCollapsed)
  // ... existing code ...

  return (
    <SidebarProvider
      open={!sidebarCollapsed}
      onOpenChange={(open) => setSidebarCollapsed(!open)}
    >
```

#### T002: Create ToggleButton Component

**Pattern** (based on PinButton):
```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'

function ToggleButton() {
  const collapsed = useUIStore(selectSidebarCollapsed)
  const toggleSidebar = useUIStore(state => state.toggleSidebar)

  return (
    <SidebarMenuButton onClick={toggleSidebar} tooltip={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
      {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      <span>{collapsed ? 'Expand' : 'Collapse'}</span>
    </SidebarMenuButton>
  )
}
```

#### T003: Remove SidebarWithHover and PinButton

**Delete**:
- Lines 43-53: `PinButton` function
- Lines 55-92: `SidebarWithHover` function
- Line 101: `<SidebarWithHover>` opening tag
- Line 126: `</SidebarWithHover>` closing tag
- Lines 116-118: PinButton usage in SidebarFooter

**Update imports** (line 15):
- Remove: `Pin, PinOff`
- Add: `ChevronLeft, ChevronRight`

**Update store imports** (line 29):
- Add: `selectSidebarCollapsed`

#### T005: Update Test File

**Current test** (lines 81-96):
```tsx
it('toggles pin state when Pin button is clicked', () => {
  // ... tests Pin/Unpin behavior
})
```

**Target test**:
```tsx
it('toggles sidebar collapsed state when Toggle button is clicked', () => {
  render(
    <SidebarProvider>
      <SessionSidebar />
    </SidebarProvider>
  )

  // Initial state: expanded (collapsed = false)
  expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  expect(screen.getByText('Collapse')).toBeInTheDocument()

  // Click to collapse
  fireEvent.click(screen.getByText('Collapse'))
  expect(useUIStore.getState().sidebarCollapsed).toBe(true)
  expect(screen.getByText('Expand')).toBeInTheDocument()

  // Click to expand
  fireEvent.click(screen.getByText('Expand'))
  expect(useUIStore.getState().sidebarCollapsed).toBe(false)
})
```

**Update test-doc comment** (lines 1-27):
- Remove: "Includes Pin button for hover/pin behavior"
- Add: "Includes Toggle button for explicit expand/collapse"

**Update beforeEach** (line 38):
- Remove: `sidebarPinned: false`
- Add: `sidebarCollapsed: false`

**Update first test assertion** (line 50):
- Remove: `expect(screen.getByText('Pin')).toBeInTheDocument()`
- Add: `expect(screen.getByText('Collapse')).toBeInTheDocument()`

### Acceptance Criteria

- [x] **AC-01**: Toggle button visible in expanded state showing `<` (ChevronLeft)
- [x] **AC-02**: Clicking toggle collapses sidebar to 3rem with 200ms transition
- [x] **AC-03**: Toggle button visible in collapsed state showing `>` (ChevronRight)
- [x] **AC-04**: Clicking toggle expands sidebar to 16rem with 200ms transition
- [x] **AC-05**: Hovering over collapsed sidebar does NOT expand it
- [x] **AC-06**: Moving mouse away from expanded sidebar does NOT collapse it
- [x] **AC-07**: Collapsed state persists after page refresh
- [x] **AC-08**: No Pin/Unpin button visible anywhere
- [x] **AC-09**: Session icons clickable in collapsed mode

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users miss hover behavior | Low | Low | Toggle is more discoverable; keyboard shortcut Cmd+B still works |
| Test file requires SidebarProvider controlled mode | Low | Low | Tests already wrap in SidebarProvider; controlled mode transparent |

---

## Change Footnotes Ledger

[^1]: Task T001-T004 - Sidebar toggle simplification
  - `file:frontend/src/App.tsx` - Wired UIStore.sidebarCollapsed to SidebarProvider controlled mode
  - `function:frontend/src/components/SessionSidebar.tsx:ToggleButton` - New toggle component
  - `file:frontend/src/components/SessionSidebar.tsx` - Removed SidebarWithHover, PinButton

[^2]: Task T005 - Test updates
  - `file:frontend/src/components/__tests__/SessionSidebar.test.tsx` - Updated for toggle behavior

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/005-sidebar-toggle-simplification/sidebar-toggle-simplification-plan.md"`
- **Optional validation**: `/plan-4-complete-the-plan` (recommended but not required for CS-1)
