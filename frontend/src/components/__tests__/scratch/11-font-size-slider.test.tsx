/**
 * TAD Scratch: Font size slider
 *
 * Exploring shadcn Slider for font size control.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'

// Test component mimicking FontSizeSlider
function TestFontSizeSlider({
  value,
  onValueChange,
}: {
  value: number
  onValueChange: (value: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Font Size</Label>
        <span data-testid="font-size-value">{value}px</span>
      </div>
      <Slider
        data-testid="font-size-slider"
        min={8}
        max={24}
        step={1}
        value={[value]}
        onValueChange={(values) => onValueChange(values[0])}
      />
    </div>
  )
}

describe('TAD Scratch: Font size slider', () => {
  it('displays current value', () => {
    const onValueChange = vi.fn()

    render(<TestFontSizeSlider value={14} onValueChange={onValueChange} />)

    expect(screen.getByTestId('font-size-value')).toHaveTextContent('14px')
  })

  it('has correct min/max range', () => {
    const onValueChange = vi.fn()

    render(<TestFontSizeSlider value={14} onValueChange={onValueChange} />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuemin', '8')
    expect(slider).toHaveAttribute('aria-valuemax', '24')
  })

  it('updates value display on change', () => {
    let currentValue = 14
    const onValueChange = vi.fn((value: number) => {
      currentValue = value
    })

    const { rerender } = render(
      <TestFontSizeSlider value={currentValue} onValueChange={onValueChange} />
    )

    // Simulate value change
    onValueChange(16)
    rerender(<TestFontSizeSlider value={currentValue} onValueChange={onValueChange} />)

    expect(screen.getByTestId('font-size-value')).toHaveTextContent('16px')
  })

  it('slider is keyboard accessible', () => {
    const onValueChange = vi.fn()

    render(<TestFontSizeSlider value={14} onValueChange={onValueChange} />)

    const slider = screen.getByRole('slider')

    // Focus the slider
    slider.focus()
    expect(document.activeElement).toBe(slider)

    // Arrow keys should work (Radix handles this)
    fireEvent.keyDown(slider, { key: 'ArrowRight' })

    // The slider should respond to keyboard input
    expect(onValueChange).toHaveBeenCalled()
  })
})
