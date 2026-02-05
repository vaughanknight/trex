# Settings Panel Rework - Snap Panel Layout

**Mode**: Simple

---

## Summary

**WHAT**: Replace the current overlay-based Settings panel with a snap-in panel that sits beside the sidebar. When settings is opened, a second panel appears instantly (no slide animation) next to the sidebar, and the terminal area resizes to accommodate it. The sidebar collapse/expand should also snap instantly with no animation.

**WHY**: The current Sheet-based settings panel overlays the terminal and feels disconnected from the sidebar. A panel-based layout provides a more integrated, IDE-like experience where opening settings feels like expanding a workspace panel, not opening a modal.

---

## Goals

1. **Instant snap behavior**: Settings panel appears/disappears instantly with no slide or fade animations
2. **Panel layout**: Settings sits as a second panel next to the sidebar (sidebar | settings | terminal)
3. **Terminal resizes**: Terminal area shrinks when settings opens, grows when it closes - not overlaid
4. **Sidebar snap**: Sidebar expand/collapse should also be instant (no 200ms transition)
5. **Consistent visual style**: Settings panel matches sidebar styling (same background, borders, etc.)
6. **State persistence**: Settings open/closed state does NOT need to persist across refresh

---

## Non-Goals

1. **No drag-to-resize**: Panels have fixed widths, no resizable dividers
2. **No multiple panels**: Only sidebar + optional settings panel, not a generic panel system
3. **No panel reordering**: Settings always appears to the right of sidebar
4. **No mobile changes**: Focus on desktop layout only

---

## Complexity

**Score**: CS-2 (small)

**Breakdown**:
| Factor | Score | Rationale |
|--------|-------|-----------|
| Surface Area (S) | 1 | 3-4 files: SettingsPanel, SessionSidebar, App.tsx, sidebar.tsx |
| Integration (I) | 0 | Internal only |
| Data/State (D) | 0 | Uses existing settingsPanelOpen state |
| Novelty (N) | 0 | Well-specified layout change |
| Non-Functional (F) | 0 | Standard requirements |
| Testing/Rollout (T) | 1 | Update existing tests |

**Total**: P = 2 → **CS-2**

**Confidence**: 0.90

**Assumptions**:
- Can remove Sheet component and use simple conditional div
- Flexbox layout will handle panel arrangement
- Terminal will resize correctly when panel widths change

**Dependencies**: None

**Risks**: Terminal resize may need to trigger xterm.fit() call

---

## Acceptance Criteria

### AC-01: Settings Panel Appears Instantly
**Given** the settings panel is closed
**When** I click the Settings button
**Then** the settings panel appears immediately with no animation (no slide, no fade)

### AC-02: Settings Panel Position
**Given** the settings panel is open
**When** I look at the layout
**Then** I see: [Sidebar] [Settings Panel] [Terminal] from left to right

### AC-03: Terminal Resizes
**Given** the settings panel is closed and terminal is full width
**When** I open the settings panel
**Then** the terminal area shrinks to make room (settings does not overlay terminal)

### AC-04: Settings Panel Closes Instantly
**Given** the settings panel is open
**When** I click the Settings button in sidebar OR the X button in settings panel header
**Then** the settings panel disappears immediately with no animation

### AC-05: Sidebar Snap (No Animation)
**Given** the sidebar is expanded
**When** I click the collapse toggle
**Then** the sidebar collapses instantly with no transition animation

### AC-06: Sidebar Expand Snap
**Given** the sidebar is collapsed
**When** I click the expand toggle
**Then** the sidebar expands instantly with no transition animation

### AC-07: Settings Panel Styling
**Given** the settings panel is open
**When** I look at its appearance
**Then** it has:
- Same background color as sidebar (`bg-sidebar`)
- Same border style (border-r to separate from terminal)
- More generous padding than sidebar (p-4 vs p-2) for form controls

### AC-08: No Overlay/Dim
**Given** the settings panel is open
**When** I look at the terminal
**Then** there is no dimming overlay, terminal is fully visible and interactive

---

## Risks & Assumptions

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Terminal doesn't resize properly | Medium | Medium | Call terminal.fit() when panel opens/closes |
| Layout breaks on narrow screens | Low | Low | Panel widths are reasonable, can hide on very narrow |

### Assumptions
1. Removing CSS transitions from sidebar won't cause visual glitches
2. Simple flex layout can replace Sheet portal-based rendering
3. xterm.js will handle container resize via existing ResizeObserver

---

## Open Questions

None - resolved via clarifications.

---

## Clarifications

### Session 2026-02-05

**Q2: Settings panel padding and spacing?**
- **Answer**: B - Slightly more generous (p-4) since settings has form controls
- **Applied to**: AC-07, Implementation Notes

**Q3: Settings panel width?**
- **Answer**: B - 20rem (slightly wider than sidebar's 16rem)
- **Applied to**: AC-02, Implementation Notes

**Q4: How should settings panel be closed?**
- **Answer**: C - Both (Settings button toggles AND X button in panel header)
- **Applied to**: AC-04

**Q5: Testing approach?**
- **Answer**: C - Lightweight (layout change, update existing tests)
- **Applied to**: Testing Strategy section

**Q6: Documentation needed?**
- **Answer**: B - docs/how/ only (detailed guides)
- **Applied to**: Documentation Strategy section

---

## Testing Strategy

**Approach**: Lightweight
**Rationale**: Layout change with minimal logic; existing tests cover settings functionality
**Focus Areas**:
- Settings panel renders when open
- Settings panel hidden when closed
- Close button works
**Excluded**: Animation timing (removed), complex interaction flows
**Mock Usage**: Avoid mocks - use real Zustand stores as existing tests do

---

## Documentation Strategy

**Location**: docs/how/ only
**Rationale**: Document the panel layout system for future reference
**Target Audience**: Developers extending the UI
**Maintenance**: Update if panel system changes

---

## Implementation Notes

**Key changes**:
1. Replace `<Sheet>` in SettingsPanel with a simple `<div>` that conditionally renders
2. Move SettingsPanel rendering from inside SessionSidebar to App.tsx (sibling to sidebar)
3. Use flexbox: `[Sidebar][SettingsPanel?][Terminal]` layout in App.tsx
4. Remove `transition-*` classes from sidebar.tsx for instant snap
5. Ensure terminal container has `flex-1` to fill remaining space

**Panel dimensions**:
- Sidebar: 16rem expanded, 3rem collapsed
- Settings panel: 20rem wide, p-4 padding

**Approximate structure**:
```tsx
<div className="flex h-screen">
  <Sidebar /> {/* Always present, expands/collapses */}
  {settingsOpen && <SettingsPanel />} {/* 20rem wide, p-4, no animation */}
  <main className="flex-1"> {/* Takes remaining space */}
    <Terminal />
  </main>
</div>
```
