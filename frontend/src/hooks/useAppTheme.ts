/**
 * useAppTheme - Applies the terminal theme to the entire app via CSS variables.
 *
 * Reads the committed theme from the settings store and applies CSS variable
 * overrides to document.documentElement. Also toggles the `.dark` class based
 * on the theme's isDark flag.
 *
 * Must work OUTSIDE ThemePreviewProvider (for LoginPage early return).
 * Preview support is added via optional context in a separate effect.
 */

import { useEffect } from 'react'
import { useSettingsStore, selectTheme } from '@/stores/settings'
import { getThemeById, getThemeInfoById } from '@/themes'
import { applyThemeToDocument } from '@/utils/themeCSS'
import { useThemePreview } from '@/contexts/ThemePreviewContext'

function applyThemeById(id: string): void {
  const theme = getThemeById(id)
  const info = getThemeInfoById(id)
  const isDark = info?.isDark ?? true
  applyThemeToDocument(theme, isDark)
}

/** Apply committed theme CSS vars. Works outside ThemePreviewProvider. */
export function useAppTheme(): void {
  const themeId = useSettingsStore(selectTheme)

  useEffect(() => {
    applyThemeById(themeId)
  }, [themeId])
}

/** Apply preview theme CSS vars when hovering. Must be inside ThemePreviewProvider. */
export function useAppThemePreview(): void {
  const themeId = useSettingsStore(selectTheme)
  const { previewTheme } = useThemePreview()

  useEffect(() => {
    if (previewTheme) {
      applyThemeById(previewTheme)
    } else {
      // Revert to committed theme
      applyThemeById(themeId)
    }
  }, [previewTheme, themeId])
}
