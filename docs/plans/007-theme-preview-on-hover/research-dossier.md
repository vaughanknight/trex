# Theme Preview on Hover - Research Dossier

**Generated**: 2026-02-05
**Research Query**: "when a user mouses over a theme, it should change the theme in the terminal so the user can preview without selecting it"
**Subagents**: 7 parallel research agents
**Total Findings**: 65+

---

## Executive Summary

The current ThemeSelector uses immediate commit-on-select with static color swatches. Adding hover preview is technically straightforward because xterm.js theme application is synchronous. The main challenge is that Radix UI Select uses focus-based navigation (not hover), requiring custom pointer event handlers.

---

## Critical Findings

### CF-01: No Preview Mechanism Exists
**Source**: IA-01, IA-09
**Impact**: High

Current ThemeSelector commits immediately on selection:
```typescript
<Select onValueChange={(value) => setTheme(value as TerminalTheme)}>
```
No intermediate preview state exists. Color swatches are static (not live preview).

### CF-02: xterm.js Theme Application is Synchronous
**Source**: IA-05, IC-04, PL-02
**Impact**: Critical (enables feature)

Theme changes apply instantly via direct property assignment:
```typescript
terminal.options.theme = xtermTheme  // Immediate re-render
```
No async handling, debouncing, or buffering needed. Preview can use same mechanism.

### CF-03: Radix UI Select Uses Focus, Not Hover
**Source**: QT-01, QT-02, QT-05
**Impact**: High (implementation challenge)

SelectItem has `focus:bg-accent` but NO hover styling or handlers:
- Keyboard navigation moves focus
- No `onPointerMove`, `onMouseEnter`, `onMouseLeave` exposed
- Must add custom pointer event handlers

### CF-04: Settings Store Persists Immediately
**Source**: DC-03, IC-03, PL-13
**Impact**: High

Theme changes persist to localStorage via Zustand middleware:
```typescript
persist({
  name: 'trex-settings',
  storage: createJSONStorage(() => localStorage),
})
```
Preview must bypass this - use local React state instead.

---

## Architecture Analysis

### Current Data Flow
```
ThemeSelector.onValueChange
    ↓
useSettingsStore.setTheme(id)
    ↓
localStorage (persisted)
    ↓
selectTheme selector
    ↓
useTerminalTheme hook
    ↓
terminal.options.theme = ITheme
```

### Proposed Preview Flow
```
ThemeSelector.onPointerEnter
    ↓
setPreviewTheme(id)  [local state, NOT store]
    ↓
activeTheme = preview ?? committed
    ↓
useTerminalTheme(terminal, activeTheme)
    ↓
terminal.options.theme = ITheme
```

### Key Difference
- Current: Store → localStorage → Terminals
- Preview: Local state → Terminals (no persistence)

---

## Component Analysis

### ThemeSelector.tsx
**Location**: `frontend/src/components/ThemeSelector.tsx`
**Lines**: 53
**Current Implementation**:
- Uses shadcn/ui Select component
- Maps over 12 themes with color swatches
- Calls `setTheme` directly on selection

**Required Changes**:
- Add `previewTheme` state
- Add pointer event handlers to SelectItem
- Add `onOpenChange` handler for revert
- Calculate `activeTheme = preview ?? committed`

### useTerminalTheme.ts
**Location**: `frontend/src/hooks/useTerminalTheme.ts`
**Lines**: 65
**Current Implementation**:
- Subscribes to store via `selectTheme`
- Applies theme in useEffect when theme changes

**Potential Changes**:
- Accept optional `previewTheme` parameter
- Use preview if provided, else use store value

### Terminal.tsx
**Location**: `frontend/src/components/Terminal.tsx`
**Lines**: 267
**Current Implementation**:
- Calls `useTerminalTheme(xtermRef.current)`
- Subscribes to `selectTheme` for container background

**Potential Changes**:
- May need to receive preview theme from context
- Or useTerminalTheme handles it internally

---

## Theme System Details

### Theme Registry
**Location**: `frontend/src/themes/index.ts`
**Themes**: 12 total
- default-dark, default-light
- dracula, nord, monokai, tokyo-night
- solarized-dark, solarized-light
- gruvbox-dark, gruvbox-light
- one-dark, one-light

### ITheme Interface
```typescript
interface ITheme {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  selectionForeground: string
  black, red, green, yellow, blue, magenta, cyan, white: string
  brightBlack, brightRed, ... brightWhite: string
}
```

### Lookup Functions
```typescript
getThemeById(id: string): ITheme  // Returns theme or defaultDark
getThemeInfoById(id: string): ThemeInfo | undefined
```

---

## Prior Learnings Applied

### PL-02: xterm.js Themes Apply Synchronously
Preview can apply immediately - no async, no debounce, no race conditions.

### PL-07: No Transition Animations = Snap Preview
Theme changes should snap instantly, matching sidebar/settings panel UX.

### PL-09: Use Zustand Selectors
Must use `selectTheme` selector for committed theme to prevent cascading re-renders.

### PL-13: Direct onChange → Terminal Pattern
Preview follows same pattern as current implementation - direct property assignment.

### PL-15: Preview State Must Not Persist
Preview is ephemeral. Only selection commits to localStorage.

---

## Testing Considerations

### jsdom Limitations
- PointerEvent requires polyfill (already in test/setup.ts)
- Hover simulation limited - Radix internal handlers may not fire
- Focus-based tests more reliable than pointer-based

### Recommended Test Strategy
1. **Unit tests**: Preview state changes correctly
2. **Integration tests**: Theme applies to terminal mock
3. **Manual verification**: Visual confirmation of instant switching

### Existing Test Patterns
From `scratch/09-theme-selector-options.test.tsx`:
```typescript
await user.click(screen.getByTestId('theme-trigger'))
await user.click(screen.getByText('Dracula'))
expect(onValueChange).toHaveBeenCalledWith('dracula')
```

---

## Implementation Options

### Option A: Local State + Pointer Events (Recommended)
- Preview state in ThemeSelector component
- Add `onPointerEnter`/`onPointerLeave` to SelectItem
- Pass active theme to terminals via hook parameter

**Pros**: Minimal changes, isolated logic
**Cons**: Need to verify Radix allows pointer events

### Option B: ThemePreviewContext
- Create context providing active theme
- ThemeSelector sets preview in context
- Terminals consume from context

**Pros**: Clean separation, no prop drilling
**Cons**: More boilerplate, new file

### Option C: Store-based Preview
- Add `previewTheme` field to settings store (not persisted via partialize)
- Terminals read `selectActiveTheme` (preview ?? committed)

**Pros**: Consistent with existing patterns
**Cons**: Adds complexity to store, risk of accidental persistence

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Radix intercepts pointer events | Medium | Medium | Test early; wrapper div fallback |
| Keyboard focus events not firing | Low | Medium | Explicit onFocus handler |
| Multi-terminal sync issues | Low | Low | All terminals subscribe to same source |
| Performance with rapid hovering | Very Low | Low | xterm.js handles well |

---

## Files Inventory

### Core Files
| File | Purpose | Changes Needed |
|------|---------|----------------|
| `ThemeSelector.tsx` | Theme dropdown UI | Add preview state, event handlers |
| `useTerminalTheme.ts` | Applies theme to xterm | Maybe accept preview param |
| `themes/index.ts` | Theme definitions | None |
| `stores/settings.ts` | Theme persistence | None (preview bypasses) |

### Test Files
| File | Purpose |
|------|---------|
| `scratch/09-theme-selector-options.test.tsx` | Existing selector tests |
| `SettingsPanel.test.tsx` | Integration tests |

---

## Conclusion

Theme preview on hover is technically feasible with low risk. The main implementation work is:

1. Add local preview state to ThemeSelector
2. Add pointer/focus event handlers to SelectItem
3. Ensure terminals receive active theme (preview or committed)
4. Handle dropdown close to revert preview

Estimated effort: 40-60 lines of new code across 2-3 files.
