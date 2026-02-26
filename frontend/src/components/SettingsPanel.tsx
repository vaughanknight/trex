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
import { LayoutIconSettings } from './LayoutIconSettings'
import { URLSessionSettings } from './URLSessionSettings'
import { TmuxSettings } from './TmuxSettings'
import { RetroSettings } from './RetroSettings'
import { TitleBarSettings } from './TitleBarSettings'
import { OutputIntervalSlider } from './OutputIntervalSlider'
import { LinkDetectionSettings } from './LinkDetectionSettings'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  if (!open) return null

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 bg-black/50 z-[60] md:hidden"
        onClick={onClose}
      />
      <div className="bg-sidebar border-r w-full md:w-80 flex-shrink-0 fixed md:relative z-[60] md:z-auto top-0 left-0 bottom-0 md:top-auto md:left-auto md:bottom-auto md:h-svh overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* Header with title and X button */}
      <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-sidebar z-10">
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
      <div className="p-4 space-y-6">
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

        {/* Title Bar */}
        <div className="space-y-2">
          <TitleBarSettings />
        </div>

        {/* Idle Indicators */}
        <div className="space-y-2">
          <IdleThresholdSettings />
        </div>

        {/* Layout Icons */}
        <div className="space-y-2">
          <LayoutIconSettings />
        </div>

        {/* URL Sessions */}
        <div className="space-y-2">
          <URLSessionSettings />
        </div>

        {/* Unfocused Pane Output */}
        <div className="space-y-2">
          <OutputIntervalSlider />
        </div>

        {/* Link Detection */}
        <div className="space-y-2">
          <LinkDetectionSettings />
        </div>

        {/* tmux Detection */}
        <div className="space-y-2">
          <TmuxSettings />
        </div>

        {/* Theme Bundles */}
        <div className="space-y-2">
          <RetroSettings />
        </div>
      </div>
    </div>
    </>
  )
}
