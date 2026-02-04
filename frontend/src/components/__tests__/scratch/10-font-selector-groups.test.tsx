/**
 * TAD Scratch: Font selector with groups
 *
 * Exploring shadcn Select with grouped options (bundled/system/fallback).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BUNDLED_FONTS, FALLBACK_FONTS } from '@/stores/settings'

// Test component mimicking FontSelector
function TestFontSelector({
  value,
  onValueChange,
  systemFonts = [],
}: {
  value: string
  onValueChange: (value: string) => void
  systemFonts?: Array<{ family: string; fullName: string }>
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger data-testid="font-trigger">
        <SelectValue placeholder="Select font" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Bundled Fonts</SelectLabel>
          {BUNDLED_FONTS.map(font => (
            <SelectItem
              key={font.id}
              value={font.family}
              style={{ fontFamily: font.family }}
            >
              {font.name}
            </SelectItem>
          ))}
        </SelectGroup>

        {systemFonts.length > 0 && (
          <SelectGroup>
            <SelectLabel>System Fonts</SelectLabel>
            {systemFonts.map(font => (
              <SelectItem
                key={font.family}
                value={`"${font.family}", monospace`}
                style={{ fontFamily: `"${font.family}", monospace` }}
              >
                {font.fullName}
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        <SelectGroup>
          <SelectLabel>Fallback Fonts</SelectLabel>
          {FALLBACK_FONTS.map(font => (
            <SelectItem
              key={font.id}
              value={font.family}
              style={{ fontFamily: font.family }}
            >
              {font.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

describe('TAD Scratch: Font selector groups', () => {
  it('renders bundled fonts group', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <TestFontSelector
        value="Menlo, monospace"
        onValueChange={onValueChange}
      />
    )

    await user.click(screen.getByTestId('font-trigger'))

    // Should show Bundled Fonts label
    expect(screen.getByText('Bundled Fonts')).toBeInTheDocument()

    // Should show all 6 bundled fonts
    expect(BUNDLED_FONTS).toHaveLength(6)
    for (const font of BUNDLED_FONTS) {
      expect(screen.getByText(font.name)).toBeInTheDocument()
    }
  })

  it('renders fallback fonts group', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <TestFontSelector
        value="Menlo, monospace"
        onValueChange={onValueChange}
      />
    )

    await user.click(screen.getByTestId('font-trigger'))

    // Should show Fallback Fonts label
    expect(screen.getByText('Fallback Fonts')).toBeInTheDocument()

    // Should show specific fallback fonts (not all may be unique)
    expect(screen.getByText('System Monospace')).toBeInTheDocument()
    expect(screen.getByText('Courier New')).toBeInTheDocument()
    expect(screen.getByText('Consolas')).toBeInTheDocument()
  })

  it('renders system fonts group when provided', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    const systemFonts = [
      { family: 'SF Mono', fullName: 'SF Mono Regular' },
      { family: 'Andale Mono', fullName: 'Andale Mono' },
    ]

    render(
      <TestFontSelector
        value="Menlo, monospace"
        onValueChange={onValueChange}
        systemFonts={systemFonts}
      />
    )

    await user.click(screen.getByTestId('font-trigger'))

    // Should show System Fonts label
    expect(screen.getByText('System Fonts')).toBeInTheDocument()

    // Should show system fonts
    expect(screen.getByText('SF Mono Regular')).toBeInTheDocument()
    expect(screen.getByText('Andale Mono')).toBeInTheDocument()
  })

  it('hides system fonts group when empty', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <TestFontSelector
        value="Menlo, monospace"
        onValueChange={onValueChange}
        systemFonts={[]}
      />
    )

    await user.click(screen.getByTestId('font-trigger'))

    // Should NOT show System Fonts label
    expect(screen.queryByText('System Fonts')).not.toBeInTheDocument()
  })

  it('calls onValueChange with font family', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <TestFontSelector
        value="Menlo, monospace"
        onValueChange={onValueChange}
      />
    )

    await user.click(screen.getByTestId('font-trigger'))
    await user.click(screen.getByText('Fira Code'))

    expect(onValueChange).toHaveBeenCalledWith("'Fira Code', monospace")
  })
})
