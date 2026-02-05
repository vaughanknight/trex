/**
 * ThemeSelector - Theme selection dropdown with live preview.
 *
 * Displays all 12 terminal themes with color previews.
 * Hovering over a theme previews it in all terminals.
 * Changes are committed via useSettingsStore on selection.
 */

import { memo, useCallback } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettingsStore, selectTheme, type TerminalTheme } from '@/stores/settings'
import { useThemePreview } from '@/contexts/ThemePreviewContext'
import { themes, type ThemeInfo } from '@/themes'

// Memoized item to prevent re-renders when context changes
const ThemeOption = memo(function ThemeOption({
  themeInfo,
  onPreview,
}: {
  themeInfo: ThemeInfo
  onPreview: (id: TerminalTheme) => void
}) {
  const handlePointerEnter = useCallback(() => {
    onPreview(themeInfo.id as TerminalTheme)
  }, [themeInfo.id, onPreview])

  return (
    <SelectItem
      value={themeInfo.id}
      onPointerEnter={handlePointerEnter}
      onFocus={handlePointerEnter}
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
  )
})

export function ThemeSelector() {
  const theme = useSettingsStore(selectTheme)
  const setTheme = useSettingsStore(state => state.setTheme)
  const { setPreviewTheme } = useThemePreview()

  // Stable callback for preview - context setter is already memoized
  const handlePreview = useCallback((themeId: TerminalTheme) => {
    setPreviewTheme(themeId)
  }, [setPreviewTheme])

  // Clear preview when dropdown closes
  const handleDropdownClose = useCallback((open: boolean) => {
    if (!open) {
      setPreviewTheme(null)
    }
  }, [setPreviewTheme])

  // Commit theme and clear preview
  const handleCommit = useCallback((value: string) => {
    setPreviewTheme(null)
    setTheme(value as TerminalTheme)
  }, [setPreviewTheme, setTheme])

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
            <ThemeOption
              key={themeInfo.id}
              themeInfo={themeInfo}
              onPreview={handlePreview}
            />
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
