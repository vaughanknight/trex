/**
 * TitleBarSettings — Settings for translucent title bar overlay.
 */

import { useSettingsStore } from '@/stores/settings'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

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

export function TitleBarSettings() {
  const translucentTitleBar = useSettingsStore((s) => s.translucentTitleBar)
  const titleBarOpacity = useSettingsStore((s) => s.titleBarOpacity)
  const titleBarHoverOpacity = useSettingsStore((s) => s.titleBarHoverOpacity)
  const setTranslucentTitleBar = useSettingsStore((s) => s.setTranslucentTitleBar)
  const setTitleBarOpacity = useSettingsStore((s) => s.setTitleBarOpacity)
  const setTitleBarHoverOpacity = useSettingsStore((s) => s.setTitleBarHoverOpacity)

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Title Bar</Label>
          <p className="text-xs text-muted-foreground">
            Translucent title bar overlays terminal content
          </p>
        </div>
        <ToggleSwitch checked={translucentTitleBar} onChange={setTranslucentTitleBar} label="Translucent title bar" />
      </div>

      {translucentTitleBar && (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Resting opacity</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{Math.round(titleBarOpacity * 100)}%</span>
            </div>
            <Slider
              value={[titleBarOpacity * 100]}
              onValueChange={([v]) => setTitleBarOpacity(v / 100)}
              min={5}
              max={100}
              step={5}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Hover opacity</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{Math.round(titleBarHoverOpacity * 100)}%</span>
            </div>
            <Slider
              value={[titleBarHoverOpacity * 100]}
              onValueChange={([v]) => setTitleBarHoverOpacity(v / 100)}
              min={10}
              max={100}
              step={5}
            />
          </div>
        </>
      )}
    </>
  )
}
