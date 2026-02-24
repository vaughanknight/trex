/**
 * ThemePreviewContext tests
 *
 * Verifies the ephemeral theme preview state management.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
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
    vi.useFakeTimers()
    render(
      <ThemePreviewProvider>
        <TestComponent />
      </ThemePreviewProvider>
    )

    // Directly click the button using fireEvent (avoids userEvent timer conflicts)
    await act(async () => {
      screen.getByText('Set Dracula').click()
    })
    // Flush the 30ms debounce
    await act(async () => { vi.advanceTimersByTime(50) })
    expect(screen.getByTestId('preview')).toHaveTextContent('dracula')
    vi.useRealTimers()
  })

  it('clears preview when set to null', async () => {
    vi.useFakeTimers()
    render(
      <ThemePreviewProvider>
        <TestComponent />
      </ThemePreviewProvider>
    )

    // Set dracula first
    await act(async () => {
      screen.getByText('Set Dracula').click()
    })
    await act(async () => { vi.advanceTimersByTime(50) })
    expect(screen.getByTestId('preview')).toHaveTextContent('dracula')

    // Clear it (null is immediate, no debounce)
    await act(async () => {
      screen.getByText('Clear').click()
    })
    expect(screen.getByTestId('preview')).toHaveTextContent('none')
    vi.useRealTimers()
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
