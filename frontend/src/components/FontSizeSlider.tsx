/**
 * FontSizeSlider - Font size slider control.
 *
 * Allows selecting font size from 8-24px with immediate feedback.
 * Changes are applied immediately via useSettingsStore.
 */

import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useSettingsStore, selectFontSize } from '@/stores/settings'

const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 24

export function FontSizeSlider() {
  const fontSize = useSettingsStore(selectFontSize)
  const setFontSize = useSettingsStore(state => state.setFontSize)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="font-size-slider">Font Size</Label>
        <span className="text-sm text-muted-foreground">{fontSize}px</span>
      </div>
      <Slider
        id="font-size-slider"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        step={1}
        value={[fontSize]}
        onValueChange={(values) => setFontSize(values[0])}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{MIN_FONT_SIZE}px</span>
        <span>{MAX_FONT_SIZE}px</span>
      </div>
    </div>
  )
}
