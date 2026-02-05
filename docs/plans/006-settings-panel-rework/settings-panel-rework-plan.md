# Settings Panel Rework - Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-05
**Spec**: [./settings-panel-rework-spec.md](./settings-panel-rework-spec.md)
**Status**: COMPLETE

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Implementation](#implementation)
4. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The current SettingsPanel uses a Sheet overlay that slides in from the left, positioning is broken (`left: 0` behind sidebar), and it feels disconnected from the main layout. Sidebar also has 200ms transition animations that feel sluggish.

**Solution**: Replace Sheet-based SettingsPanel with a simple conditional div that renders as a sibling to the sidebar in a flexbox layout. Remove all transition animations for instant snap behavior. Terminal area will resize automatically via `flex-1`.

**Expected Outcome**:
- Settings panel appears instantly as `[Sidebar][Settings][Terminal]` layout
- Terminal resizes to accommodate settings (not overlaid)
- Sidebar expand/collapse also instant (no animations)
- Consistent visual styling between sidebar and settings panel

---

## Critical Research Findings (Concise)

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **SettingsPanel uses Sheet**: Currently wrapped in radix Dialog/Sheet which renders via portal outside DOM tree, causing positioning issues | Replace Sheet with simple conditional `<div>` |
| 02 | Critical | **SettingsPanel in SessionSidebar**: Rendered as sibling to `<Sidebar>` inside SessionSidebar.tsx | Move to App.tsx as sibling after SessionSidebar |
| 03 | High | **Sidebar transition classes**: `sidebar.tsx:221,232` has `transition-[width]` and `transition-[left,right,width] duration-200` | Remove transition classes for instant snap |
| 04 | High | **Existing state**: `settingsPanelOpen` state and `toggleSettingsPanel` action already exist in UIStore | Reuse existing state, no store changes needed |
| 05 | High | **Sheet component imports**: SettingsPanel imports Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription from `@/components/ui/sheet` | Remove Sheet imports, use native divs |
| 06 | Medium | **X close button**: Sheet currently has close button via `SheetPrimitive.Close`. Need to add explicit close button | Add X button using lucide-react XIcon |
| 07 | Medium | **Test file uses Sheet behavior**: Tests check escape key closes panel, which is Sheet behavior | Update tests for new panel behavior |
| 08 | Low | **SidebarInset has flex-1**: Already uses `flex w-full flex-1` in sidebar.tsx:311-312 | Terminal will auto-resize when siblings added |

---

## Implementation (Single Phase)

**Objective**: Replace overlay-based settings panel with snap-in panel layout.

**Testing Approach**: Lightweight (update existing tests, manual verification)
**Mock Usage**: Avoid (use real Zustand stores as in existing tests)

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Remove transition classes from sidebar.tsx for instant snap | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/frontend/src/components/ui/sidebar.tsx` | Sidebar expands/collapses instantly with no animation | Remove `transition-*` and `duration-*` classes |
| [x] | T002 | Rewrite SettingsPanel as simple div panel (no Sheet) | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/frontend/src/components/SettingsPanel.tsx` | Panel renders with bg-sidebar, p-4, 20rem width, X close button | Remove all Sheet imports, use styled div |
| [x] | T003 | Move SettingsPanel rendering from SessionSidebar to App.tsx | 1 | Core | T002 | `/Users/vaughanknight/GitHub/trex/frontend/src/App.tsx`, `/Users/vaughanknight/GitHub/trex/frontend/src/components/SessionSidebar.tsx` | Layout is [Sidebar][Settings?][Terminal] in flexbox | Conditionally render between sidebar and SidebarInset |
| [x] | T004 | Update SettingsPanel.test.tsx for new panel behavior | 1 | Test | T002 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/__tests__/SettingsPanel.test.tsx` | Tests pass; verify panel renders when open, X button works | Remove escape key test (Sheet behavior) |
| [x] | T005 | Manual verification of all acceptance criteria | 1 | Verify | T001-T004 | -- | All AC-01 through AC-08 pass manual testing | Test instant snap, layout, no overlay |

### Detailed Task Specifications

#### T001: Remove Sidebar Transition Classes

**Current** (`sidebar.tsx:220-227`):
```tsx
<div
  data-slot="sidebar-gap"
  className={cn(
    "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
    // ...
  )}
/>
```

**Current** (`sidebar.tsx:229-241`):
```tsx
<div
  data-slot="sidebar-container"
  className={cn(
    "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
    // ...
  )}
```

**Target**: Remove `transition-[width]`, `transition-[left,right,width]`, and `duration-200 ease-linear` from both elements. Keep all other classes.

#### T002: Rewrite SettingsPanel Component

**Current structure** (Sheet-based):
```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent side="left" className="..." showOverlay={false}>
    <SheetHeader>
      <SheetTitle>Settings</SheetTitle>
      <SheetDescription>...</SheetDescription>
    </SheetHeader>
    <div className="mt-6 space-y-6">
      {/* Controls */}
    </div>
  </SheetContent>
</Sheet>
```

**Target structure** (simple div):
```tsx
interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  if (!open) return null

  return (
    <div className="bg-sidebar border-r h-full w-80 flex-shrink-0 flex flex-col">
      {/* Header with title and X button */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="font-semibold text-foreground">Settings</h2>
          <p className="text-sm text-muted-foreground">Customize your terminal appearance</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-sm opacity-70 hover:opacity-100 focus:ring-2 focus:ring-ring"
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>

      {/* Content with settings controls */}
      <div className="p-4 space-y-6 overflow-auto flex-1">
        <ThemeSelector />
        <FontSelector />
        <FontSizeSlider />
      </div>
    </div>
  )
}
```

**Key changes**:
- Remove all Sheet imports
- Add `X` icon from lucide-react
- Use `w-80` (20rem) width
- Use `bg-sidebar` background
- Use `p-4` padding
- Use `border-r` to separate from terminal
- Change prop from `onOpenChange` to `onClose` for clarity

#### T003: Move SettingsPanel to App.tsx Layout

**Current** (`SessionSidebar.tsx`):
```tsx
export function SessionSidebar() {
  const settingsPanelOpen = useUIStore(selectSettingsPanelOpen)
  const closeSettings = useUIStore(state => state.closeSettingsPanel)

  return (
    <>
      <Sidebar variant="floating" collapsible="icon">
        {/* ... */}
      </Sidebar>
      <SettingsPanel
        open={settingsPanelOpen}
        onOpenChange={(open) => { if (!open) closeSettings() }}
      />
    </>
  )
}
```

**Current** (`App.tsx`):
```tsx
<SidebarProvider open={!sidebarCollapsed} onOpenChange={(open) => setSidebarCollapsed(!open)}>
  <SessionSidebar />
  <SidebarInset className="app">
    {/* Terminal */}
  </SidebarInset>
</SidebarProvider>
```

**Target** (`App.tsx`):
```tsx
import { SettingsPanel } from './components/SettingsPanel'
import { selectSettingsPanelOpen } from './stores/ui'

function App() {
  const settingsPanelOpen = useUIStore(selectSettingsPanelOpen)
  const closeSettings = useUIStore(state => state.closeSettingsPanel)
  // ... existing code ...

  return (
    <SidebarProvider open={!sidebarCollapsed} onOpenChange={(open) => setSidebarCollapsed(!open)}>
      <SessionSidebar />
      <SettingsPanel open={settingsPanelOpen} onClose={closeSettings} />
      <SidebarInset className="app">
        {/* Terminal */}
      </SidebarInset>
    </SidebarProvider>
  )
}
```

**Target** (`SessionSidebar.tsx`):
- Remove `SettingsPanel` import
- Remove `settingsPanelOpen` and `closeSettings` state hooks
- Remove `<SettingsPanel />` from render
- Keep `SettingsButton` (it uses `openSettingsPanel` action)

#### T004: Update SettingsPanel Tests

**Current tests**:
1. `renders all settings controls when open` - Keep, works with new component
2. `updates theme in store when selection changes` - Keep, works with new component
3. `displays current font size from store` - Keep, works with new component
4. `calls onOpenChange when closed` - **Update**: Test X button click instead of Escape key

**Target test update**:
```tsx
it('calls onClose when X button clicked', async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()

  render(<SettingsPanel open={true} onClose={onClose} />)

  // Click X button to close
  await user.click(screen.getByRole('button', { name: /close/i }))

  expect(onClose).toHaveBeenCalled()
})
```

**Update other tests**: Change `onOpenChange={() => {}}` to `onClose={() => {}}` in all test renders.

### Acceptance Criteria

- [x] **AC-01**: Settings panel appears instantly with no animation
- [x] **AC-02**: Layout is [Sidebar][Settings Panel][Terminal] from left to right
- [x] **AC-03**: Terminal area shrinks when settings opens (not overlaid)
- [x] **AC-04**: Settings panel disappears instantly (Settings button toggle OR X button)
- [x] **AC-05**: Sidebar collapses instantly with no transition animation
- [x] **AC-06**: Sidebar expands instantly with no transition animation
- [x] **AC-07**: Settings panel has bg-sidebar, border-r, p-4 padding
- [x] **AC-08**: No dimming overlay when settings is open

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Terminal doesn't resize properly | Medium | Medium | SidebarInset already has flex-1; verify xterm.fit() fires via ResizeObserver |
| Settings panel too wide for narrow screens | Low | Low | 20rem is reasonable; can add responsive breakpoint if needed |

---

## Change Footnotes Ledger

[^1]: Task T001 - Sidebar snap behavior
  - `file:frontend/src/components/ui/sidebar.tsx` - Removed transition classes

[^2]: Task T002 - Settings panel rewrite
  - `file:frontend/src/components/SettingsPanel.tsx` - Replaced Sheet with div panel

[^3]: Task T003 - Layout restructure
  - `file:frontend/src/App.tsx` - Moved SettingsPanel here
  - `file:frontend/src/components/SessionSidebar.tsx` - Removed SettingsPanel

[^4]: Task T004 - Test updates
  - `file:frontend/src/components/__tests__/SettingsPanel.test.tsx` - Updated for new component API

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/006-settings-panel-rework/settings-panel-rework-plan.md"`
