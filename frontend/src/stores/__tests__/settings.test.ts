/**
 * Settings Store Tests
 *
 * Tests for useSettingsStore which manages user preferences
 * with full localStorage persistence.
 *
 * @see /docs/plans/003-sidebar-settings-sessions/sidebar-settings-sessions-spec.md
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FakeStorage } from '@/test/fakeStorage'
import type { SettingsState, SettingsActions, TerminalTheme } from '../settings'

// Test factory that creates isolated store instances with fake storage
const createTestSettingsStore = (storage: FakeStorage) => {
  const defaultSettings: SettingsState = {
    theme: 'default-dark',
    fontSize: 14,
    fontFamily: 'Menlo, monospace',
    autoOpenTerminal: false,
  }

  return create<SettingsState & SettingsActions>()(
    persist(
      (set) => ({
        ...defaultSettings,
        setTheme: (theme: TerminalTheme) => set({ theme }),
        setFontSize: (fontSize: number) => set({ fontSize }),
        setFontFamily: (fontFamily: string) => set({ fontFamily }),
        setAutoOpenTerminal: (autoOpenTerminal: boolean) => set({ autoOpenTerminal }),
        reset: () => set(defaultSettings),
      }),
      {
        name: 'trex-settings',
        storage: createJSONStorage(() => storage),
      }
    )
  )
}

describe('useSettingsStore', () => {
  let storage: FakeStorage

  beforeEach(() => {
    storage = new FakeStorage()
  })

  /**
   * Test: Settings should persist to localStorage
   *
   * Behavior: When theme is changed, it should be written to localStorage
   * Fixture: Fresh FakeStorage, setTheme('dark')
   * Assertion: Storage contains persisted theme value
   *
   * Validates: Spec requirement for settings persistence
   */
  it('should persist settings to localStorage', async () => {
    const useSettings = createTestSettingsStore(storage)

    useSettings.getState().setTheme('dracula')
    await new Promise((r) => setTimeout(r, 0)) // Wait for persist

    const stored = storage.getItemParsed<{
      state: { theme: string }
    }>('trex-settings')

    expect(stored?.state.theme).toBe('dracula')
  })

  /**
   * Test: Settings should restore from localStorage on creation
   *
   * Behavior: When store is created with existing localStorage data, it hydrates
   * Fixture: Pre-populated FakeStorage with dark theme
   * Assertion: Store state matches persisted values
   *
   * Validates: Spec requirement for settings restoration
   */
  it('should restore settings from localStorage', async () => {
    storage.setItem(
      'trex-settings',
      JSON.stringify({
        state: {
          theme: 'dracula',
          fontSize: 16,
          fontFamily: 'Fira Code',
          autoOpenTerminal: true,
        },
        version: 0,
      })
    )

    const useSettings = createTestSettingsStore(storage)
    await new Promise((r) => setTimeout(r, 0)) // Wait for hydration

    expect(useSettings.getState().theme).toBe('dracula')
    expect(useSettings.getState().fontSize).toBe(16)
    expect(useSettings.getState().fontFamily).toBe('Fira Code')
    expect(useSettings.getState().autoOpenTerminal).toBe(true)
  })

  /**
   * Test: Default autoOpenTerminal should be false
   *
   * Behavior: Per Insight 1 decision, autoOpenTerminal defaults to false
   * Fixture: Fresh store with no persisted data
   * Assertion: autoOpenTerminal is false
   *
   * Validates: Insight 1 architectural decision
   */
  it('should default autoOpenTerminal to false', () => {
    const useSettings = createTestSettingsStore(storage)

    expect(useSettings.getState().autoOpenTerminal).toBe(false)
  })
})
