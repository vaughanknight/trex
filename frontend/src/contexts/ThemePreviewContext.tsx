/**
 * ThemePreviewContext - Provides ephemeral theme preview state.
 *
 * Used by ThemeSelector to broadcast preview theme to all terminals.
 * Preview is NOT persisted - only exists in React state.
 */

import { createContext, useContext, useState, useMemo, useRef, useCallback, type ReactNode } from 'react'
import type { TerminalTheme } from '@/stores/settings'

interface ThemePreviewContextValue {
  previewTheme: TerminalTheme | null
  setPreviewTheme: (theme: TerminalTheme | null) => void
}

const ThemePreviewContext = createContext<ThemePreviewContextValue | null>(null)

// Debounce delay in ms - prevents flicker when mouse is at boundary between items
const PREVIEW_DEBOUNCE_MS = 30

export function ThemePreviewProvider({ children }: { children: ReactNode }) {
  const [previewTheme, setPreviewThemeState] = useState<TerminalTheme | null>(null)

  // Use ref to track current preview and pending timeout
  const previewRef = useRef<TerminalTheme | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced setter that prevents rapid back-and-forth when mouse is at item boundaries
  const setPreviewTheme = useCallback((theme: TerminalTheme | null) => {
    // Clear any pending preview change
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // If clearing preview (null), do it immediately
    if (theme === null) {
      previewRef.current = null
      setPreviewThemeState(null)
      return
    }

    // If same theme, no change needed
    if (previewRef.current === theme) {
      return
    }

    // Debounce the preview change to prevent flicker at boundaries
    timeoutRef.current = setTimeout(() => {
      previewRef.current = theme
      setPreviewThemeState(theme)
      timeoutRef.current = null
    }, PREVIEW_DEBOUNCE_MS)
  }, [])

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({ previewTheme, setPreviewTheme }),
    [previewTheme, setPreviewTheme]
  )

  return (
    <ThemePreviewContext.Provider value={value}>
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
