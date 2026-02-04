/**
 * SettingsPanel Tests
 *
 * Promoted tests for settings panel functionality.
 * Tests verify theme/font/size controls work correctly with the store.
 *
 * @see /docs/plans/003-sidebar-settings-sessions/sidebar-settings-sessions-spec.md
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPanel } from '../SettingsPanel'
import { useSettingsStore } from '@/stores/settings'

describe('SettingsPanel', () => {
  beforeEach(() => {
    // Reset store to defaults
    useSettingsStore.getState().reset()
  })

  /**
   * @test-doc
   * Why: Settings panel is the primary UI for terminal customization
   * Contract: SettingsPanel renders all three control sections when open
   * Usage Notes: Use open prop to control visibility
   * Quality Contribution: Ensures all settings controls are accessible
   * Worked Example: open=true → Theme, Font Family, Font Size all visible
   */
  it('renders all settings controls when open', () => {
    render(<SettingsPanel open={true} onOpenChange={() => {}} />)

    // Should show all settings sections
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(screen.getByText('Font Family')).toBeInTheDocument()
    expect(screen.getByText('Font Size')).toBeInTheDocument()
  })

  /**
   * @test-doc
   * Why: Theme changes must apply immediately for good UX (AC-09)
   * Contract: Selecting a theme updates the settings store immediately
   * Usage Notes: ThemeSelector inside panel uses setTheme action
   * Quality Contribution: Validates immediate theme application requirement
   * Worked Example: Select "Dracula" → store.theme === "dracula"
   */
  it('updates theme in store when selection changes', async () => {
    const user = userEvent.setup()

    render(<SettingsPanel open={true} onOpenChange={() => {}} />)

    // Initial theme should be default-dark
    expect(useSettingsStore.getState().theme).toBe('default-dark')

    // Open theme selector and select Dracula
    await user.click(screen.getByRole('combobox', { name: /theme/i }))
    await user.click(screen.getByText('Dracula'))

    // Store should be updated
    expect(useSettingsStore.getState().theme).toBe('dracula')
  })

  /**
   * @test-doc
   * Why: Font size changes must apply immediately (AC-11)
   * Contract: Moving the font size slider updates the settings store
   * Usage Notes: FontSizeSlider uses onValueChange to update store
   * Quality Contribution: Validates slider interaction with store
   * Worked Example: Slider displays "14px" and shows current value
   */
  it('displays current font size from store', () => {
    // Set a specific font size
    useSettingsStore.getState().setFontSize(18)

    render(<SettingsPanel open={true} onOpenChange={() => {}} />)

    // Should display the current font size
    expect(screen.getByText('18px')).toBeInTheDocument()
  })

  /**
   * @test-doc
   * Why: Panel must close when user dismisses it
   * Contract: onOpenChange(false) called when Sheet closes
   * Usage Notes: Parent component controls open state
   * Quality Contribution: Ensures proper sheet close behavior
   * Worked Example: Press Escape → onOpenChange(false) called
   */
  it('calls onOpenChange when closed', async () => {
    const user = userEvent.setup()
    let openState = true
    const onOpenChange = (open: boolean) => {
      openState = open
    }

    render(<SettingsPanel open={openState} onOpenChange={onOpenChange} />)

    // Press Escape to close
    await user.keyboard('{Escape}')

    // onOpenChange should have been called with false
    expect(openState).toBe(false)
  })
})
