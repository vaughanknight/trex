/**
 * FontSelector - Font family selection dropdown.
 *
 * Displays fonts in groups:
 * - Bundled: Web fonts from @fontsource packages
 * - System: Detected system monospace fonts (if Local Font Access API available)
 * - Fallback: Always-available monospace fonts
 *
 * Changes are applied immediately via useSettingsStore.
 */

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettingsStore, selectFontFamily, BUNDLED_FONTS, FALLBACK_FONTS } from '@/stores/settings'
import { detectSystemFonts, type DetectedFont } from '@/utils/fontDetection'

// Import bundled fonts
import '@fontsource/fira-code/400.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/source-code-pro/400.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource-variable/cascadia-code/index.css'
import '@fontsource/ubuntu-mono/400.css'
import '@fontsource/press-start-2p/400.css'

export function FontSelector() {
  const fontFamily = useSettingsStore(selectFontFamily)
  const setFontFamily = useSettingsStore(state => state.setFontFamily)
  const [systemFonts, setSystemFonts] = useState<DetectedFont[]>([])

  // Detect system fonts on mount
  useEffect(() => {
    detectSystemFonts().then(setSystemFonts)
  }, [])

  // Find current display name for the selected font
  const getCurrentFontName = () => {
    // Check bundled fonts
    const bundled = BUNDLED_FONTS.find(f => f.family === fontFamily)
    if (bundled) return bundled.name

    // Check fallback fonts
    const fallback = FALLBACK_FONTS.find(f => f.family === fontFamily)
    if (fallback) return fallback.name

    // Check system fonts
    const system = systemFonts.find(f => `"${f.family}", monospace` === fontFamily)
    if (system) return system.fullName

    // Default to showing the raw family
    return fontFamily
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="font-select">Font Family</Label>
      <Select
        value={fontFamily}
        onValueChange={setFontFamily}
      >
        <SelectTrigger id="font-select" className="w-full">
          <SelectValue placeholder="Select font">
            <span style={{ fontFamily }}>{getCurrentFontName()}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {/* Bundled Fonts */}
          <SelectGroup>
            <SelectLabel>Bundled Fonts</SelectLabel>
            {BUNDLED_FONTS.map((font) => (
              <SelectItem
                key={font.id}
                value={font.family}
                style={{ fontFamily: font.family }}
              >
                {font.name}
              </SelectItem>
            ))}
          </SelectGroup>

          {/* System Fonts (if detected) */}
          {systemFonts.length > 0 && (
            <SelectGroup>
              <SelectLabel>System Fonts</SelectLabel>
              {systemFonts.map((font) => (
                <SelectItem
                  key={font.family}
                  value={`"${font.family}", monospace`}
                  style={{ fontFamily: `"${font.family}", monospace` }}
                >
                  {font.fullName}
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* Fallback Fonts */}
          <SelectGroup>
            <SelectLabel>Fallback Fonts</SelectLabel>
            {FALLBACK_FONTS.map((font) => (
              <SelectItem
                key={font.id}
                value={font.family}
                style={{ fontFamily: font.family }}
              >
                {font.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
