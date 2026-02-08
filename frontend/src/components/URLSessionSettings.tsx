/**
 * URLSessionSettings - Settings for URL session confirmation behavior.
 *
 * Provides controls for configuring when a confirmation dialog appears
 * before opening sessions from URL params.
 *
 * Changes are applied immediately via useSettingsStore.
 *
 * Per Plan 009: URL Routing (T003)
 */

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  useSettingsStore,
  selectUrlConfirmAlways,
  selectUrlConfirmThreshold,
} from '@/stores/settings'

export function URLSessionSettings() {
  const confirmAlways = useSettingsStore(selectUrlConfirmAlways)
  const threshold = useSettingsStore(selectUrlConfirmThreshold)
  const setConfirmAlways = useSettingsStore((state) => state.setUrlConfirmAlways)
  const setThreshold = useSettingsStore((state) => state.setUrlConfirmThreshold)

  return (
    <div className="space-y-4">
      {/* Always Ask Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="url-confirm-always">Always ask before opening</Label>
          <p className="text-xs text-muted-foreground">
            Confirm before creating sessions from URL
          </p>
        </div>
        <button
          id="url-confirm-always"
          role="switch"
          aria-checked={confirmAlways}
          onClick={() => setConfirmAlways(!confirmAlways)}
          className={`
            relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
            border-2 border-transparent transition-colors duration-200 ease-in-out
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
            ${confirmAlways ? 'bg-primary' : 'bg-input'}
          `}
        >
          <span
            className={`
              pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg
              ring-0 transition-transform duration-200 ease-in-out
              ${confirmAlways ? 'translate-x-4' : 'translate-x-0'}
            `}
          />
        </button>
      </div>

      {/* Threshold Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Session threshold</Label>
            <p className="text-xs text-muted-foreground">
              Ask if opening more than this many sessions
            </p>
          </div>
          <span className="text-sm text-muted-foreground font-mono">
            {threshold}
          </span>
        </div>
        <Slider
          min={0}
          max={50}
          step={1}
          value={[threshold]}
          onValueChange={(values) => setThreshold(values[0])}
          className="w-full"
        />
      </div>
    </div>
  )
}
