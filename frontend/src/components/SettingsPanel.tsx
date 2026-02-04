/**
 * SettingsPanel - Settings panel that slides from the sidebar.
 *
 * Displays theme, font, and font size controls in a shadcn Sheet.
 * All changes are applied immediately via useSettingsStore.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { ThemeSelector } from './ThemeSelector'
import { FontSelector } from './FontSelector'
import { FontSizeSlider } from './FontSizeSlider'

interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80 sm:w-96">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Customize your terminal appearance
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
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
        </div>
      </SheetContent>
    </Sheet>
  )
}
