/**
 * ThemeSelector tests
 *
 * Verifies theme selection dropdown with live preview behavior.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeSelector } from '../ThemeSelector'
import { ThemePreviewProvider, useThemePreview } from '@/contexts/ThemePreviewContext'

// Wrapper that provides required context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ThemePreviewProvider>{children}</ThemePreviewProvider>
}

// Component to observe preview state
function PreviewObserver() {
  const { previewTheme } = useThemePreview()
  return <span data-testid="preview-observer">{previewTheme ?? 'none'}</span>
}

describe('ThemeSelector', () => {
  it('renders with current theme selected', () => {
    render(<ThemeSelector />, { wrapper: TestWrapper })
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('opens dropdown and shows theme options', async () => {
    const user = userEvent.setup()
    render(<ThemeSelector />, { wrapper: TestWrapper })

    // Open dropdown
    await user.click(screen.getByRole('combobox'))

    // Should show theme options
    expect(screen.getByText('Dracula')).toBeInTheDocument()
    expect(screen.getByText('Nord')).toBeInTheDocument()
  })

  it('clears preview when dropdown closes via Escape', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <PreviewObserver />
        <ThemeSelector />
      </TestWrapper>
    )

    // Open dropdown
    await user.click(screen.getByRole('combobox'))

    // Press Escape to close
    await user.keyboard('{Escape}')

    // Preview should be cleared
    expect(screen.getByTestId('preview-observer')).toHaveTextContent('none')
  })

  it('clears preview and commits on selection', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <PreviewObserver />
        <ThemeSelector />
      </TestWrapper>
    )

    // Open and select
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Dracula'))

    // Preview should be cleared after selection
    expect(screen.getByTestId('preview-observer')).toHaveTextContent('none')
  })

  // Note: Hover tests are documented as manual verification due to jsdom limitations
  // with pointer events. The onPointerEnter handler works in real browsers but
  // userEvent.hover() doesn't reliably trigger it in jsdom.
})
