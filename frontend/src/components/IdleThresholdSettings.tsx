/**
 * IdleThresholdSettings - Settings for idle state thresholds.
 *
 * Provides controls for configuring when sessions transition between
 * idle states (active → recent → short → medium → long → dormant).
 *
 * Also includes a toggle to enable/disable idle indicators entirely.
 * Changes are applied immediately via useSettingsStore.
 *
 * Per Phase 4: Session Idle Indicators (AC-05, AC-07, AC-13)
 */

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  useSettingsStore,
  selectIdleThresholds,
  selectIdleIndicatorsEnabled,
  type IdleThresholds,
} from '@/stores/settings'

/** Threshold configuration for UI display */
interface ThresholdConfig {
  key: keyof IdleThresholds
  label: string
  description: string
  min: number
  max: number
  step: number
}

/** Convert milliseconds to seconds for display */
const msToSeconds = (ms: number) => Math.round(ms / 1000)

/** Convert seconds to milliseconds for storage */
const secondsToMs = (s: number) => s * 1000

/** Format seconds for display */
const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

/** Threshold slider configurations */
const THRESHOLD_CONFIGS: ThresholdConfig[] = [
  {
    key: 'active',
    label: 'Active',
    description: 'Blue indicator (actively receiving output)',
    min: 1,
    max: 30,
    step: 1,
  },
  {
    key: 'recent',
    label: 'Recent',
    description: 'Green indicator (recently used)',
    min: 5,
    max: 120,
    step: 5,
  },
  {
    key: 'short',
    label: 'Short Idle',
    description: 'Light green indicator',
    min: 30,
    max: 600,
    step: 30,
  },
  {
    key: 'medium',
    label: 'Medium Idle',
    description: 'Amber indicator',
    min: 60,
    max: 1800,
    step: 60,
  },
  {
    key: 'long',
    label: 'Long Idle',
    description: 'Red indicator (before dormant)',
    min: 300,
    max: 7200,
    step: 300,
  },
]

export function IdleThresholdSettings() {
  const thresholds = useSettingsStore(selectIdleThresholds)
  const enabled = useSettingsStore(selectIdleIndicatorsEnabled)
  const setThresholds = useSettingsStore((state) => state.setIdleThresholds)
  const setEnabled = useSettingsStore((state) => state.setIdleIndicatorsEnabled)

  const handleThresholdChange = (key: keyof IdleThresholds, seconds: number) => {
    setThresholds({
      ...thresholds,
      [key]: secondsToMs(seconds),
    })
  }

  return (
    <div className="space-y-4">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="idle-enabled">Idle Indicators</Label>
          <p className="text-xs text-muted-foreground">
            Show color-coded session activity status
          </p>
        </div>
        <button
          id="idle-enabled"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`
            relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
            border-2 border-transparent transition-colors duration-200 ease-in-out
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
            ${enabled ? 'bg-primary' : 'bg-input'}
          `}
        >
          <span
            className={`
              pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg
              ring-0 transition-transform duration-200 ease-in-out
              ${enabled ? 'translate-x-4' : 'translate-x-0'}
            `}
          />
        </button>
      </div>

      {/* Threshold Sliders (only shown when enabled) */}
      {enabled && (
        <div className="space-y-4 pt-2">
          <p className="text-xs text-muted-foreground">
            Adjust when sessions transition between idle states
          </p>

          {THRESHOLD_CONFIGS.map((config) => {
            const valueSeconds = msToSeconds(thresholds[config.key])
            return (
              <div key={config.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">{config.label}</Label>
                    <p className="text-xs text-muted-foreground">
                      {config.description}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">
                    {formatDuration(valueSeconds)}
                  </span>
                </div>
                <Slider
                  min={config.min}
                  max={config.max}
                  step={config.step}
                  value={[valueSeconds]}
                  onValueChange={(values) =>
                    handleThresholdChange(config.key, values[0])
                  }
                  className="w-full"
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
