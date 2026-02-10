/**
 * TmuxSettings - Settings for tmux detection polling interval.
 *
 * Provides a slider to adjust how frequently the backend polls tmux
 * for session attachment changes. On change, sends a tmux_config
 * WebSocket message to update the backend polling interval.
 */

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  useSettingsStore,
  selectTmuxPollingInterval,
} from '@/stores/settings'
import { useWebSocketStore } from '@/hooks/useCentralWebSocket'

/** Format milliseconds for display */
const formatInterval = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  return seconds % 1 === 0 ? `${seconds}s` : `${seconds.toFixed(1)}s`
}

export function TmuxSettings() {
  const interval = useSettingsStore(selectTmuxPollingInterval)
  const setInterval = useSettingsStore((state) => state.setTmuxPollingInterval)

  const handleChange = (values: number[]) => {
    const newInterval = values[0]
    setInterval(newInterval)

    // Send tmux_config message to backend
    const ws = useWebSocketStore.getState().ws
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'tmux_config', interval: newInterval }))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>tmux Detection</Label>
        <p className="text-xs text-muted-foreground">
          How often to check for tmux session attachments
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Poll Interval</Label>
          <span className="text-sm text-muted-foreground font-mono">
            {formatInterval(interval)}
          </span>
        </div>
        <Slider
          min={500}
          max={30000}
          step={500}
          value={[interval]}
          onValueChange={handleChange}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Lower values detect changes faster but use more resources
        </p>
      </div>
    </div>
  )
}
