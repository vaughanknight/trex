/**
 * OutputIntervalSlider - Controls the output flush interval for unfocused panes.
 *
 * Lower values (50ms) give near-instant updates across all panes.
 * Higher values (1000ms) reduce CPU usage when many panes are open.
 * Changes are applied immediately via useSettingsStore.
 */

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useSettingsStore, selectUnfocusedOutputInterval } from '@/stores/settings'

const MIN_INTERVAL = 50
const MAX_INTERVAL = 1000
const STEP = 50

export function OutputIntervalSlider() {
  const interval = useSettingsStore(selectUnfocusedOutputInterval)
  const setInterval = useSettingsStore(state => state.setUnfocusedOutputInterval)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="output-interval-slider">Unfocused Pane Refresh</Label>
        <span className="text-sm text-muted-foreground">{interval}ms</span>
      </div>
      <Slider
        id="output-interval-slider"
        min={MIN_INTERVAL}
        max={MAX_INTERVAL}
        step={STEP}
        value={[interval]}
        onValueChange={(values) => setInterval(values[0])}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Fast ({MIN_INTERVAL}ms)</span>
        <span>Slow ({MAX_INTERVAL}ms)</span>
      </div>
    </div>
  )
}
