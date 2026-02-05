/**
 * ThemePreviewContext tests
 *
 * Verifies the ephemeral theme preview state management.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemePreviewProvider, useThemePreview } from '../ThemePreviewContext'

function TestComponent() {
  const { previewTheme, setPreviewTheme } = useThemePreview()
  return (
    <div>
      <span data-testid="preview">{previewTheme ?? 'none'}</span>
      <button onClick={() => setPreviewTheme('dracula')}>Set Dracula</button>
      <button onClick={() => setPreviewTheme(null)}>Clear</button>
    </div>
  )
}

describe('ThemePreviewContext', () => {
  it('provides null preview by default', () => {
    render(
      <ThemePreviewProvider>
        <TestComponent />
      </ThemePreviewProvider>
    )
    expect(screen.getByTestId('preview')).toHaveTextContent('none')
  })

  it('updates preview when setPreviewTheme called', async () => {
    const user = userEvent.setup()
    render(
      <ThemePreviewProvider>
        <TestComponent />
      </ThemePreviewProvider>
    )

    await user.click(screen.getByText('Set Dracula'))
    expect(screen.getByTestId('preview')).toHaveTextContent('dracula')
  })

  it('clears preview when set to null', async () => {
    const user = userEvent.setup()
    render(
      <ThemePreviewProvider>
        <TestComponent />
      </ThemePreviewProvider>
    )

    await user.click(screen.getByText('Set Dracula'))
    await user.click(screen.getByText('Clear'))
    expect(screen.getByTestId('preview')).toHaveTextContent('none')
  })

  it('throws when used outside provider', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<TestComponent />)).toThrow(
      'useThemePreview must be used within ThemePreviewProvider'
    )

    spy.mockRestore()
  })
})
