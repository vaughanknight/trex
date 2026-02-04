/**
 * TAD Scratch: Sheet component behavior
 *
 * Exploring shadcn Sheet controlled state for settings panel.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

// Test wrapper component that manages Sheet state
function TestSheet() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button data-testid="trigger">Open Settings</button>
      </SheetTrigger>
      <SheetContent side="left" data-testid="content">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>
        <div>Settings content here</div>
      </SheetContent>
    </Sheet>
  )
}

// Controlled Sheet (for store integration)
function ControlledSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" data-testid="content">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
}

describe('TAD Scratch: Sheet opens and closes', () => {
  it('opens when trigger is clicked', async () => {
    render(<TestSheet />)

    // Sheet content should not be visible initially
    expect(screen.queryByTestId('content')).not.toBeInTheDocument()

    // Click trigger
    fireEvent.click(screen.getByTestId('trigger'))

    // Sheet content should now be visible
    expect(await screen.findByText('Settings')).toBeInTheDocument()
  })

  it('can be controlled externally', () => {
    const onOpenChange = vi.fn()

    // Render closed
    const { rerender } = render(
      <ControlledSheet open={false} onOpenChange={onOpenChange} />
    )

    // Content not visible
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()

    // Render open
    rerender(<ControlledSheet open={true} onOpenChange={onOpenChange} />)

    // Content visible
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('slides from left side', async () => {
    render(<TestSheet />)

    fireEvent.click(screen.getByTestId('trigger'))

    const content = await screen.findByTestId('content')
    // Sheet content renders - side="left" is applied via CSS classes
    expect(content).toBeInTheDocument()
    // The content should have left-positioning styles applied
    expect(content.className).toContain('left')
  })
})
