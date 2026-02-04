/**
 * TAD Scratch: Settings store persistence
 *
 * Exploring Zustand persist middleware with settings.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSettingsStore, type TerminalTheme } from '@/stores/settings'

describe('TAD Scratch: Settings store persistence', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()

    // Reset store to defaults
    act(() => {
      useSettingsStore.getState().reset()
    })
  })

  it('persists theme to localStorage', async () => {
    const { result } = renderHook(() => useSettingsStore())

    act(() => {
      result.current.setTheme('dracula')
    })

    // Wait for persist middleware to flush
    await new Promise(resolve => setTimeout(resolve, 0))

    const stored = localStorage.getItem('trex-settings')
    expect(stored).not.toBeNull()

    const parsed = JSON.parse(stored!)
    expect(parsed.state.theme).toBe('dracula')
  })

  it('persists fontSize to localStorage', async () => {
    const { result } = renderHook(() => useSettingsStore())

    act(() => {
      result.current.setFontSize(18)
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    const stored = localStorage.getItem('trex-settings')
    const parsed = JSON.parse(stored!)
    expect(parsed.state.fontSize).toBe(18)
  })

  it('persists fontFamily to localStorage', async () => {
    const { result } = renderHook(() => useSettingsStore())

    act(() => {
      result.current.setFontFamily("'Fira Code', monospace")
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    const stored = localStorage.getItem('trex-settings')
    const parsed = JSON.parse(stored!)
    expect(parsed.state.fontFamily).toBe("'Fira Code', monospace")
  })

  it('hydrates from localStorage on store creation', async () => {
    // Pre-populate localStorage
    const settings = {
      state: {
        theme: 'nord' as TerminalTheme,
        fontSize: 16,
        fontFamily: "'JetBrains Mono', monospace",
        autoOpenTerminal: true,
      },
      version: 0,
    }
    localStorage.setItem('trex-settings', JSON.stringify(settings))

    // Force store to re-hydrate
    // Note: In real app, this happens automatically on load
    // For testing, we need to trigger hydration

    // The store should eventually reflect the persisted values
    // after hydration completes
    await new Promise(resolve => setTimeout(resolve, 50))

    // Note: Hydration might not work in test environment
    // This test documents the expected behavior
    // The real hydration is tested via the promoted test in settings.test.ts
  })

  it('reset clears to defaults but keeps persistence', async () => {
    const { result } = renderHook(() => useSettingsStore())

    // Set custom values
    act(() => {
      result.current.setTheme('dracula')
      result.current.setFontSize(20)
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    // Reset to defaults
    act(() => {
      result.current.reset()
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    // Should be back to defaults
    expect(result.current.theme).toBe('default-dark')
    expect(result.current.fontSize).toBe(14)

    // LocalStorage should also reflect defaults
    const stored = localStorage.getItem('trex-settings')
    const parsed = JSON.parse(stored!)
    expect(parsed.state.theme).toBe('default-dark')
  })
})
