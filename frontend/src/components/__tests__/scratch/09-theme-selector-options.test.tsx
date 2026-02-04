/**
 * TAD Scratch: Theme selector dropdown
 *
 * Exploring shadcn Select with theme options.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { themes } from '@/themes'

// Test component mimicking ThemeSelector
function TestThemeSelector({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger data-testid="theme-trigger">
        <SelectValue placeholder="Select theme" />
      </SelectTrigger>
      <SelectContent>
        {themes.map(theme => (
          <SelectItem key={theme.id} value={theme.id} data-testid={`theme-${theme.id}`}>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: theme.theme.background }}
              />
              {theme.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

describe('TAD Scratch: Theme selector options', () => {
  it('renders all 12 themes', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(<TestThemeSelector value="default-dark" onValueChange={onValueChange} />)

    // Open dropdown
    await user.click(screen.getByTestId('theme-trigger'))

    // Check all 12 themes are present
    expect(themes).toHaveLength(12)

    // Use getAllByText since current value appears both in trigger and dropdown
    for (const theme of themes) {
      const elements = screen.getAllByText(theme.name)
      expect(elements.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('calls onValueChange when theme selected', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(<TestThemeSelector value="default-dark" onValueChange={onValueChange} />)

    // Open dropdown
    await user.click(screen.getByTestId('theme-trigger'))

    // Select Dracula
    await user.click(screen.getByText('Dracula'))

    expect(onValueChange).toHaveBeenCalledWith('dracula')
  })

  it('displays current selection', async () => {
    const onValueChange = vi.fn()

    render(<TestThemeSelector value="dracula" onValueChange={onValueChange} />)

    // Should show Dracula as current value
    expect(screen.getByText('Dracula')).toBeInTheDocument()
  })

  it('shows color preview for each theme', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(<TestThemeSelector value="default-dark" onValueChange={onValueChange} />)

    // Open dropdown
    await user.click(screen.getByTestId('theme-trigger'))

    // Each theme option should have a color preview div
    // Dracula's background is #282a36
    const draculaOption = screen.getByText('Dracula').parentElement
    expect(draculaOption).toBeInTheDocument()

    // Check there's a div with background color style
    const preview = draculaOption?.querySelector('div[style]')
    expect(preview).toHaveStyle({ backgroundColor: '#282a36' })
  })
})
