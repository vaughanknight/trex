/**
 * ThemeSelector - Theme selection dropdown.
 *
 * Displays all 12 terminal themes with color previews.
 * Changes are applied immediately via useSettingsStore.
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
import { themes } from '@/themes'

export function ThemeSelector() {
  const theme = useSettingsStore(selectTheme)
  const setTheme = useSettingsStore(state => state.setTheme)

  return (
    <div className="space-y-2">
      <Label htmlFor="theme-select">Theme</Label>
      <Select
        value={theme}
        onValueChange={(value) => setTheme(value as TerminalTheme)}
      >
        <SelectTrigger id="theme-select" className="w-full">
          <SelectValue placeholder="Select theme" />
        </SelectTrigger>
        <SelectContent>
          {themes.map((themeInfo) => (
            <SelectItem key={themeInfo.id} value={themeInfo.id}>
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
