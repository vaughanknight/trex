/**
 * useTerminalTheme - Hook to apply settings to an xterm.js terminal.
 *
 * Subscribes to useSettingsStore and applies theme, font family, and font size
 * to the provided terminal instance whenever settings change.
 *
 * Per Insight 3: This hook should be used with onRehydrateStorage to prevent
 * theme flash when the app loads with non-default settings.
 */

import { useEffect } from 'react'
import type { Terminal } from '@xterm/xterm'
import { useSettingsStore, selectTheme, selectFontSize, selectFontFamily } from '@/stores/settings'
import { getThemeById } from '@/themes'

/**
 * Apply current settings to a terminal instance.
 *
 * @param terminal - The xterm.js terminal instance
 */
export function useTerminalTheme(terminal: Terminal | null) {
  const theme = useSettingsStore(selectTheme)
  const fontSize = useSettingsStore(selectFontSize)
  const fontFamily = useSettingsStore(selectFontFamily)

  // Apply theme when it changes
  useEffect(() => {
    if (!terminal) return

    const xtermTheme = getThemeById(theme)
    terminal.options.theme = xtermTheme
  }, [terminal, theme])

  // Apply font size when it changes
  useEffect(() => {
    if (!terminal) return

    terminal.options.fontSize = fontSize
  }, [terminal, fontSize])

  // Apply font family when it changes
  useEffect(() => {
    if (!terminal) return

    terminal.options.fontFamily = fontFamily
  }, [terminal, fontFamily])
}

/**
 * Get the initial terminal options from settings store.
 * Use this when creating a new terminal to apply persisted settings immediately.
 *
 * This function reads directly from the store state (not via hook) so it can
 * be called during terminal initialization before React re-renders.
 */
export function getTerminalOptions() {
  const state = useSettingsStore.getState()
  const xtermTheme = getThemeById(state.theme)

  return {
    theme: xtermTheme,
    fontSize: state.fontSize,
    fontFamily: state.fontFamily,
  }
}
