/**
 * RetroSettings — Settings for theme bundles (auto font/border on theme select).
 */

import { useSettingsStore } from '@/stores/settings'
import { Label } from '@/components/ui/label'

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
        border-2 border-transparent transition-colors duration-200 ease-in-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
        ${checked ? 'bg-primary' : 'bg-input'}
      `}
    >
      <span
        className={`
          pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg
          ring-0 transition-transform duration-200 ease-in-out
          ${checked ? 'translate-x-4' : 'translate-x-0'}
        `}
      />
    </button>
  )
}

export function RetroSettings() {
  const retroBorderEnabled = useSettingsStore((s) => s.retroBorderEnabled)
  const retroAutoApply = useSettingsStore((s) => s.retroAutoApply)
  const setRetroBorderEnabled = useSettingsStore((s) => s.setRetroBorderEnabled)
  const setRetroAutoApply = useSettingsStore((s) => s.setRetroAutoApply)

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Theme Bundles</Label>
          <p className="text-xs text-muted-foreground">
            Auto-apply font and border with themed experiences
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">CRT Border</Label>
          <p className="text-xs text-muted-foreground">Show themed border around terminal</p>
        </div>
        <ToggleSwitch checked={retroBorderEnabled} onChange={setRetroBorderEnabled} label="CRT Border" />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">Auto-apply on theme</Label>
          <p className="text-xs text-muted-foreground">Auto-switch font and border when selecting a bundled theme</p>
        </div>
        <ToggleSwitch checked={retroAutoApply} onChange={setRetroAutoApply} label="Auto-apply theme bundle" />
      </div>
    </>
  )
}
