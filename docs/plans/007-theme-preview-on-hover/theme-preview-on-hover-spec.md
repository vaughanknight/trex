# Theme Preview on Hover - Specification

**Mode**: Simple

---

## Summary

**WHAT**: Add live theme preview when hovering over theme options in the ThemeSelector dropdown. The terminal displays the hovered theme temporarily, reverting to the committed theme when the user exits the dropdown without selecting.

**WHY**: Currently users must select a theme to see how it looks, then potentially re-select multiple times to find their preferred theme. Hover preview provides instant visual feedback, reducing trial-and-error and improving the theme selection experience.

**GitHub Issue**: #26

---

## Goals

1. **Instant preview**: Theme applies to terminal immediately on hover (no delay)
2. **Revert on exit**: When dropdown closes without selection, revert to committed theme
3. **Commit on click**: Clicking a theme commits it to store (current behavior preserved)
4. **Keyboard support**: Arrow key navigation also triggers preview on focused item
5. **Multi-terminal**: All active terminals preview the same theme simultaneously
6. **No persistence**: Preview state is ephemeral - never persisted to localStorage

---

## Non-Goals

1. **No transition animations**: Theme changes snap instantly (consistent with sidebar/settings panel)
2. **No preview button**: Use hover, not explicit "Preview" button
3. **No font/size preview**: Only theme preview for now (font/size can be added later)
4. **No preview timeout**: Preview persists as long as hovering, no auto-revert timer

---

## Complexity

**Score**: CS-2 (Small)

**Breakdown**:
| Factor | Score | Rationale |
|--------|-------|-----------|
| Surface Area (S) | 1 | 2-3 files: ThemeSelector, useTerminalTheme, possibly new hook |
| Integration (I) | 0 | Internal only, no API changes |
| Data/State (D) | 1 | New ephemeral preview state, careful not to persist |
| Novelty (N) | 1 | Custom hover events on Radix UI Select (not standard pattern) |
| Non-Functional (F) | 0 | Standard requirements |
| Testing (T) | 1 | Need to test hover behavior (jsdom limitations) |

**Total**: P = 4 → **CS-2**

**Confidence**: 0.85

**Assumptions**:
- Radix UI Select allows adding pointer event handlers to SelectItem
- xterm.js theme changes remain synchronous (confirmed in research)
- Local React state sufficient for preview (no store changes needed)

**Dependencies**: None

**Risks**:
- Radix UI may intercept pointer events in unexpected ways
- Keyboard navigation preview may require focus event handling

---

## Acceptance Criteria

### AC-01: Hover Triggers Preview
**Given** the ThemeSelector dropdown is open
**When** I hover over a theme option (e.g., "Dracula")
**Then** the terminal immediately displays the Dracula theme

### AC-02: Preview Updates on Hover Change
**Given** I am hovering over "Dracula" (terminal shows Dracula)
**When** I move my mouse to hover over "Nord"
**Then** the terminal immediately switches to display Nord theme

### AC-03: Revert on Dropdown Exit
**Given** the terminal is showing a preview theme (e.g., Dracula)
**And** my committed theme is "Default Dark"
**When** I move my mouse away from the dropdown without clicking
**Then** the terminal reverts to "Default Dark"

### AC-04: Commit on Selection
**Given** the terminal is showing a preview theme (e.g., Dracula)
**When** I click on "Dracula" to select it
**Then** the terminal keeps Dracula theme
**And** Dracula is persisted to localStorage

### AC-05: Keyboard Navigation Preview
**Given** the ThemeSelector dropdown is open
**When** I press Arrow Down to focus on "Dracula"
**Then** the terminal immediately displays the Dracula theme

### AC-06: Escape Cancels Preview
**Given** the terminal is showing a preview theme
**When** I press Escape to close the dropdown
**Then** the terminal reverts to the committed theme

### AC-07: Multi-Terminal Preview
**Given** I have multiple terminal sessions open
**When** I hover over a theme in the dropdown
**Then** all visible terminals display the preview theme

### AC-08: No Persistence of Preview
**Given** I hover over "Dracula" (preview active)
**When** I close the dropdown without selecting
**And** I refresh the page
**Then** my original committed theme is still active (Dracula was never saved)

### AC-09: Instant Snap (No Animation)
**Given** the ThemeSelector dropdown is open
**When** I hover between different themes rapidly
**Then** each theme change is instant with no fade or transition

---

## Technical Design

### State Management

```typescript
// Local state in ThemeSelector (NOT in store)
const [previewTheme, setPreviewTheme] = useState<TerminalTheme | null>(null)
const committedTheme = useSettingsStore(selectTheme)

// Active theme = preview if set, else committed
const activeTheme = previewTheme ?? committedTheme
```

### Event Handlers

```typescript
// On hover enter
const handlePreviewStart = (themeId: TerminalTheme) => {
  setPreviewTheme(themeId)
}

// On hover leave / dropdown close
const handlePreviewEnd = () => {
  setPreviewTheme(null)
}

// On selection (commit)
const handleCommit = (themeId: TerminalTheme) => {
  setPreviewTheme(null)  // Clear preview
  setTheme(themeId)      // Persist to store
}
```

### SelectItem with Hover Events

```tsx
<SelectItem
  key={themeInfo.id}
  value={themeInfo.id}
  onPointerEnter={() => handlePreviewStart(themeInfo.id)}
  onFocus={() => handlePreviewStart(themeInfo.id)}  // For keyboard nav
>
  {/* existing content */}
</SelectItem>
```

### Dropdown Close Handler

```tsx
<Select
  value={theme}
  onValueChange={handleCommit}
  onOpenChange={(open) => {
    if (!open) handlePreviewEnd()  // Revert on close
  }}
>
```

### Terminal Theme Application

Option A: Pass preview to existing hook
```typescript
// Modified useTerminalTheme signature
export function useTerminalTheme(terminal: Terminal | null, previewTheme?: TerminalTheme)
```

Option B: Create preview context
```typescript
// ThemePreviewContext provides active theme to all terminals
const activeTheme = useThemePreview()  // Returns preview ?? committed
```

---

## Risks & Assumptions

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Radix UI intercepts pointer events | Medium | Medium | Test early; may need wrapper div with events |
| Keyboard focus events not firing | Low | Medium | Use onFocus on SelectItem |
| Performance with rapid hovering | Low | Low | xterm.js handles synchronous updates well |

### Assumptions
1. SelectItem accepts onPointerEnter/onPointerLeave props (passes through to DOM)
2. Terminal instances can receive theme updates from multiple sources
3. Preview state local to ThemeSelector is sufficient (no cross-component needs)

---

## Testing Strategy

**Approach**: Lightweight + Manual verification

**Focus Areas**:
- Preview state changes on hover events
- Revert on dropdown close
- Commit on selection preserves theme
- Multiple terminals receive preview

**Excluded**:
- E2E hover testing (jsdom limitations with pointer events)
- Performance benchmarks

**Manual Verification Required**:
- Visual confirmation of instant theme switching
- Keyboard navigation preview behavior

---

## Implementation Notes

### Files to Modify

1. **`frontend/src/components/ThemeSelector.tsx`**
   - Add `previewTheme` local state
   - Add `onPointerEnter`/`onFocus` handlers to SelectItem
   - Add `onOpenChange` handler to Select for revert
   - Pass active theme to terminals (via context or prop)

2. **`frontend/src/hooks/useTerminalTheme.ts`** (optional)
   - Accept optional `previewTheme` parameter
   - Use preview theme if provided, else use store theme

3. **New: `frontend/src/contexts/ThemePreviewContext.tsx`** (optional)
   - If preview needs to reach terminals without prop drilling
   - Provides `activeTheme` (preview ?? committed) to consumers

### Key Patterns from Prior Learnings

- **PL-02**: xterm.js themes apply synchronously - no async handling needed
- **PL-07**: Snap behavior (no transitions) - matches sidebar/settings panel UX
- **PL-09**: Use selectors to prevent cascading re-renders
- **PL-13**: Direct onChange → terminal update pattern works well
- **PL-15**: Preview state must NOT persist to localStorage

---

## Open Questions

None - resolved via research.

---

## References

- Research: Theme preview on hover (2026-02-05)
- GitHub Issue: #26
- Prior art: Plan 003 (settings implementation), Plan 006 (instant snap behavior)
