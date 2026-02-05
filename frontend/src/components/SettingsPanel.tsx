/**
 * SettingsPanel - Settings panel that snaps beside the sidebar.
 *
 * Displays theme, font, and font size controls in a simple panel.
 * All changes are applied immediately via useSettingsStore.
 */

import { X } from 'lucide-react'
import { ThemeSelector } from './ThemeSelector'
import { FontSelector } from './FontSelector'
import { FontSizeSlider } from './FontSizeSlider'
import { IdleThresholdSettings } from './IdleThresholdSettings'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  if (!open) return null

  return (
    <div className="bg-sidebar border-r h-full w-80 flex-shrink-0 flex flex-col">
      {/* Header with title and X button */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="font-semibold text-foreground">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Customize your terminal appearance
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-sm opacity-70 hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-none"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Content with settings controls */}
      <div className="p-4 space-y-6 overflow-auto flex-1">
        {/* Theme Selection */}
        <div className="space-y-2">
          <ThemeSelector />
        </div>

        {/* Font Selection */}
        <div className="space-y-2">
          <FontSelector />
        </div>

        {/* Font Size */}
        <div className="space-y-2">
          <FontSizeSlider />
        </div>

        {/* Idle Indicators */}
        <div className="space-y-2">
          <IdleThresholdSettings />
        </div>
      </div>
    </div>
  )
}
