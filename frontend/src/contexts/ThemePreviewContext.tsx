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
