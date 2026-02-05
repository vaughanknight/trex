# Theme Preview on Hover - Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-05
**Spec**: [./theme-preview-on-hover-spec.md](./theme-preview-on-hover-spec.md)
**Research**: [./research-dossier.md](./research-dossier.md)
**Status**: COMPLETE

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Implementation](#implementation)
4. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The current ThemeSelector commits themes immediately on selection. Users must select multiple themes to find one they like, with no way to preview before committing.

**Solution**: Add hover-based preview using a ThemePreviewContext. When hovering over a theme option, the preview is broadcast to all terminals via context. When the dropdown closes without selection, the preview clears and terminals revert to the committed theme.

**Expected Outcome**:
- Hovering over a theme immediately previews it in all terminals
- Keyboard navigation (arrow keys) also triggers preview on focused item
- Exiting dropdown without selection reverts to committed theme
- Selecting a theme commits it (existing behavior preserved)
- Preview state is ephemeral - never persisted to localStorage

---

## Critical Research Findings (Concise)

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **xterm.js themes apply synchronously**: `terminal.options.theme = ITheme` is instant, no async needed | Use same pattern for preview |
| 02 | Critical | **Radix Select uses focus-based navigation**: No native hover events on SelectItem | Add custom `onPointerEnter` and `onFocus` handlers |
| 03 | High | **Settings store persists immediately**: Zustand persist middleware auto-saves to localStorage | Preview must use local state, not store |
| 04 | High | **Multi-terminal sync needed**: Terminal.tsx at line 149 calls `useTerminalTheme(xtermRef.current)` | Create ThemePreviewContext to broadcast preview |
| 05 | High | **useTerminalTheme subscribes to store**: Currently uses `selectTheme` selector directly | Modify to accept optional preview override |
| 06 | Medium | **onOpenChange fires on close**: Radix Select calls this with `false` when closing | Use for cleanup/revert |
| 07 | Low | **12 themes in registry**: `frontend/src/themes/index.ts` exports `themes` array | No changes needed |

---

## Implementation (Single Phase)

**Objective**: Add hover-based theme preview to ThemeSelector with multi-terminal support.

**Testing Approach**: Lightweight (update existing tests, manual verification)
**Mock Usage**: Avoid (use real Zustand stores as in existing tests)

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Create ThemePreviewContext with provider and hook | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/frontend/src/contexts/ThemePreviewContext.tsx` | Context exports `ThemePreviewProvider` and `useThemePreview` hook | Provides `previewTheme` state and `setPreviewTheme` setter |
| [x] | T002 | Wrap App with ThemePreviewProvider | 1 | Core | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/App.tsx` | App renders provider above SidebarProvider | Preview context available to ThemeSelector and terminals |
| [x] | T003 | Modify useTerminalTheme to use preview when set | 1 | Core | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/hooks/useTerminalTheme.ts` | Hook uses `previewTheme ?? storeTheme` for active theme | Terminals show preview when set |
| [x] | T004 | Add preview handlers to ThemeSelector | 2 | Core | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/ThemeSelector.tsx` | Preview triggers on hover/focus, clears on dropdown close | Add `onPointerEnter`, `onFocus` to SelectItem, `onOpenChange` to Select |
| [x] | T005 | Add tests for ThemePreviewContext | 1 | Test | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/contexts/__tests__/ThemePreviewContext.test.tsx` | Tests verify preview state changes correctly | Test set/clear preview |
| [x] | T006 | Update ThemeSelector tests for preview behavior | 1 | Test | T004 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/__tests__/ThemeSelector.test.tsx` | Tests verify preview triggers on hover, reverts on close | May need new test file if doesn't exist |
| [x] | T007 | Manual verification of all acceptance criteria | 1 | Verify | T001-T006 | -- | All AC-01 through AC-09 pass manual testing | Visual confirmation of instant switching |

### Detailed Task Specifications

#### T001: Create ThemePreviewContext

**Target file**: `/Users/vaughanknight/GitHub/trex/frontend/src/contexts/ThemePreviewContext.tsx`

```tsx
/**
 * ThemePreviewContext - Provides ephemeral theme preview state.
 *
 * Used by ThemeSelector to broadcast preview theme to all terminals.
 * Preview is NOT persisted - only exists in React state.
 */

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { TerminalTheme } from '@/stores/settings'

interface ThemePreviewContextValue {
  previewTheme: TerminalTheme | null
  setPreviewTheme: (theme: TerminalTheme | null) => void
}

const ThemePreviewContext = createContext<ThemePreviewContextValue | null>(null)

export function ThemePreviewProvider({ children }: { children: ReactNode }) {
  const [previewTheme, setPreviewTheme] = useState<TerminalTheme | null>(null)

  return (
    <ThemePreviewContext.Provider value={{ previewTheme, setPreviewTheme }}>
      {children}
    </ThemePreviewContext.Provider>
  )
}

export function useThemePreview() {
  const context = useContext(ThemePreviewContext)
  if (!context) {
    throw new Error('useThemePreview must be used within ThemePreviewProvider')
  }
  return context
}
```

#### T002: Wrap App with ThemePreviewProvider

**Target file**: `/Users/vaughanknight/GitHub/trex/frontend/src/App.tsx`

Add import and wrap content:

```tsx
import { ThemePreviewProvider } from './contexts/ThemePreviewContext'

function App() {
  // ... existing code ...

  return (
    <ThemePreviewProvider>
      <SidebarProvider
        open={!sidebarCollapsed}
        onOpenChange={(open) => setSidebarCollapsed(!open)}
      >
        {/* ... existing content ... */}
      </SidebarProvider>
    </ThemePreviewProvider>
  )
}
```

#### T003: Modify useTerminalTheme to Use Preview

**Target file**: `/Users/vaughanknight/GitHub/trex/frontend/src/hooks/useTerminalTheme.ts`

Modify theme effect to check preview context:

```tsx
import { useThemePreview } from '@/contexts/ThemePreviewContext'

export function useTerminalTheme(terminal: Terminal | null) {
  const committedTheme = useSettingsStore(selectTheme)
  const { previewTheme } = useThemePreview()
  const fontSize = useSettingsStore(selectFontSize)
  const fontFamily = useSettingsStore(selectFontFamily)

  // Use preview theme if set, otherwise use committed theme
  const activeTheme = previewTheme ?? committedTheme

  // Apply theme when it changes
  useEffect(() => {
    if (!terminal) return

    const xtermTheme = getThemeById(activeTheme)
    terminal.options.theme = xtermTheme
  }, [terminal, activeTheme])

  // ... rest unchanged ...
}
```

**Also update Terminal.tsx background color** to use preview:

```tsx
// In Terminal.tsx, import and use preview for background
import { useThemePreview } from '../contexts/ThemePreviewContext'

// Inside component:
const committedTheme = useSettingsStore(selectTheme)
const { previewTheme } = useThemePreview()
const activeTheme = previewTheme ?? committedTheme
const currentTheme = getThemeById(activeTheme)
```

#### T004: Add Preview Handlers to ThemeSelector

**Target file**: `/Users/vaughanknight/GitHub/trex/frontend/src/components/ThemeSelector.tsx`

```tsx
import { useThemePreview } from '@/contexts/ThemePreviewContext'

export function ThemeSelector() {
  const theme = useSettingsStore(selectTheme)
  const setTheme = useSettingsStore(state => state.setTheme)
  const { setPreviewTheme } = useThemePreview()

  // Start preview when hovering or focusing a theme
  const handlePreviewStart = (themeId: TerminalTheme) => {
    setPreviewTheme(themeId)
  }

  // Clear preview when dropdown closes
  const handleDropdownClose = (open: boolean) => {
    if (!open) {
      setPreviewTheme(null)
    }
  }

  // Commit theme and clear preview
  const handleCommit = (value: string) => {
    setPreviewTheme(null)
    setTheme(value as TerminalTheme)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="theme-select">Theme</Label>
      <Select
        value={theme}
        onValueChange={handleCommit}
        onOpenChange={handleDropdownClose}
      >
        <SelectTrigger id="theme-select" className="w-full">
          <SelectValue placeholder="Select theme" />
        </SelectTrigger>
        <SelectContent>
          {themes.map((themeInfo) => (
            <SelectItem
              key={themeInfo.id}
              value={themeInfo.id}
              onPointerEnter={() => handlePreviewStart(themeInfo.id as TerminalTheme)}
              onFocus={() => handlePreviewStart(themeInfo.id as TerminalTheme)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded border border-border"
                  style={{ backgroundColor: themeInfo.theme.background }}
                />
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: themeInfo.theme.foreground }}
                />
                {themeInfo.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

**Note**: If Radix intercepts `onPointerEnter`, wrap each SelectItem content in a div with the handler instead:

```tsx
<SelectItem key={themeInfo.id} value={themeInfo.id}>
  <div
    className="flex items-center gap-2"
    onPointerEnter={() => handlePreviewStart(themeInfo.id as TerminalTheme)}
  >
    {/* content */}
  </div>
</SelectItem>
```

#### T005: Add Tests for ThemePreviewContext

**Target file**: `/Users/vaughanknight/GitHub/trex/frontend/src/contexts/__tests__/ThemePreviewContext.test.tsx`

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemePreviewProvider, useThemePreview } from '../ThemePreviewContext'

function TestComponent() {
  const { previewTheme, setPreviewTheme } = useThemePreview()
  return (
    <div>
      <span data-testid="preview">{previewTheme ?? 'none'}</span>
      <button onClick={() => setPreviewTheme('dracula')}>Set Dracula</button>
      <button onClick={() => setPreviewTheme(null)}>Clear</button>
    </div>
  )
}

describe('ThemePreviewContext', () => {
  it('provides null preview by default', () => {
    render(
      <ThemePreviewProvider>
        <TestComponent />
      </ThemePreviewProvider>
    )
    expect(screen.getByTestId('preview')).toHaveTextContent('none')
  })

  it('updates preview when setPreviewTheme called', async () => {
    const user = userEvent.setup()
    render(
      <ThemePreviewProvider>
        <TestComponent />
      </ThemePreviewProvider>
    )

    await user.click(screen.getByText('Set Dracula'))
    expect(screen.getByTestId('preview')).toHaveTextContent('dracula')
  })

  it('clears preview when set to null', async () => {
    const user = userEvent.setup()
    render(
      <ThemePreviewProvider>
        <TestComponent />
      </ThemePreviewProvider>
    )

    await user.click(screen.getByText('Set Dracula'))
    await user.click(screen.getByText('Clear'))
    expect(screen.getByTestId('preview')).toHaveTextContent('none')
  })

  it('throws when used outside provider', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<TestComponent />)).toThrow(
      'useThemePreview must be used within ThemePreviewProvider'
    )

    spy.mockRestore()
  })
})
```

#### T006: Update ThemeSelector Tests

**Target file**: `/Users/vaughanknight/GitHub/trex/frontend/src/components/__tests__/ThemeSelector.test.tsx`

Create new test file or add to existing:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeSelector } from '../ThemeSelector'
import { ThemePreviewProvider, useThemePreview } from '@/contexts/ThemePreviewContext'

// Wrapper that provides required context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ThemePreviewProvider>{children}</ThemePreviewProvider>
}

// Component to observe preview state
function PreviewObserver() {
  const { previewTheme } = useThemePreview()
  return <span data-testid="preview-observer">{previewTheme ?? 'none'}</span>
}

describe('ThemeSelector', () => {
  it('renders with current theme selected', () => {
    render(<ThemeSelector />, { wrapper: TestWrapper })
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('sets preview on pointer enter', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <PreviewObserver />
        <ThemeSelector />
      </TestWrapper>
    )

    // Open dropdown
    await user.click(screen.getByRole('combobox'))

    // Hover over Dracula option
    const draculaOption = screen.getByText('Dracula')
    await user.hover(draculaOption)

    expect(screen.getByTestId('preview-observer')).toHaveTextContent('dracula')
  })

  it('clears preview when dropdown closes', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <PreviewObserver />
        <ThemeSelector />
      </TestWrapper>
    )

    // Open dropdown and hover
    await user.click(screen.getByRole('combobox'))
    await user.hover(screen.getByText('Dracula'))

    // Press Escape to close
    await user.keyboard('{Escape}')

    expect(screen.getByTestId('preview-observer')).toHaveTextContent('none')
  })

  it('clears preview and commits on selection', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <PreviewObserver />
        <ThemeSelector />
      </TestWrapper>
    )

    // Open and select
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Dracula'))

    // Preview should be cleared after selection
    expect(screen.getByTestId('preview-observer')).toHaveTextContent('none')
  })
})
```

**Note**: jsdom has limitations with pointer events. If hover tests fail, document as manual verification requirement.

### Acceptance Criteria

- [x] **AC-01**: Hovering over a theme option immediately previews it in terminal
- [x] **AC-02**: Moving mouse to different theme option switches preview instantly
- [x] **AC-03**: Exiting dropdown without selection reverts to committed theme
- [x] **AC-04**: Clicking a theme commits it and keeps that theme displayed
- [x] **AC-05**: Arrow key navigation triggers preview on focused item
- [x] **AC-06**: Escape key closes dropdown and reverts preview
- [x] **AC-07**: All active terminals show the same preview simultaneously
- [x] **AC-08**: Preview is never persisted to localStorage
- [x] **AC-09**: Theme changes snap instantly (no transition animation)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Radix intercepts pointer events | Medium | Medium | Test early; use wrapper div with events as fallback |
| Keyboard focus events not firing | Low | Medium | Use onFocus handler on SelectItem |
| Multi-terminal sync issues | Low | Low | Context provides single source of truth |
| Accidental persistence | Low | High | Preview in context, not store |

---

## Change Footnotes Ledger

[^1]: Task T001 - ThemePreviewContext creation
  - `file:frontend/src/contexts/ThemePreviewContext.tsx` - New context file

[^2]: Task T002 - App wrapper
  - `file:frontend/src/App.tsx` - Wrapped with ThemePreviewProvider

[^3]: Task T003 - useTerminalTheme modification
  - `file:frontend/src/hooks/useTerminalTheme.ts` - Added preview support
  - `file:frontend/src/components/Terminal.tsx` - Background color uses preview

[^4]: Task T004 - ThemeSelector handlers
  - `file:frontend/src/components/ThemeSelector.tsx` - Added preview handlers

[^5]: Task T005 - Context tests
  - `file:frontend/src/contexts/__tests__/ThemePreviewContext.test.tsx` - New test file

[^6]: Task T006 - ThemeSelector tests
  - `file:frontend/src/components/__tests__/ThemeSelector.test.tsx` - Updated/new tests

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/007-theme-preview-on-hover/theme-preview-on-hover-plan.md"`
