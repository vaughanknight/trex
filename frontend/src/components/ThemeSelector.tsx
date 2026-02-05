/**
 * ThemeSelector - Theme selection dropdown with live preview.
 *
 * Displays all 12 terminal themes with color previews.
 * Hovering over a theme previews it in all terminals.
 * Changes are committed via useSettingsStore on selection.
 */

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
import { themes } from '@/themes'

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
