/**
 * TAD Scratch Test: Zustand Persist Middleware
 *
 * Exploring: How does persist work with FakeStorage?
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FakeStorage } from '../../../test/fakeStorage'

describe('scratch: zustand persist', () => {
  it('should persist state to storage', async () => {
    const storage = new FakeStorage()

    interface SettingsStore {
      theme: string
      setTheme: (theme: string) => void
    }

    const useSettings = create<SettingsStore>()(
      persist(
        (set) => ({
          theme: 'light',
          setTheme: (theme) => set({ theme }),
        }),
        {
          name: 'test-settings',
          storage: createJSONStorage(() => storage),
        }
      )
    )

    // Change theme
    useSettings.getState().setTheme('dark')

    // Wait for persist to complete (it's async)
    await new Promise((r) => setTimeout(r, 0))

    // Check storage
    const stored = storage.getItemParsed<{ state: { theme: string } }>(
      'test-settings'
    )
    expect(stored?.state.theme).toBe('dark')
  })

  it('should restore state from storage on creation', async () => {
    const storage = new FakeStorage()

    // Pre-populate storage
    storage.setItem(
      'test-settings',
      JSON.stringify({ state: { theme: 'dracula' }, version: 0 })
    )

    interface SettingsStore {
      theme: string
      setTheme: (theme: string) => void
    }

    const useSettings = create<SettingsStore>()(
      persist(
        (set) => ({
          theme: 'light', // default
          setTheme: (theme) => set({ theme }),
        }),
        {
          name: 'test-settings',
          storage: createJSONStorage(() => storage),
        }
      )
    )

    // Wait for hydration
    await new Promise((r) => setTimeout(r, 0))

    // Should have restored 'dracula' from storage
    expect(useSettings.getState().theme).toBe('dracula')
  })

  it('should support onRehydrateStorage callback', async () => {
    const storage = new FakeStorage()
    storage.setItem(
      'test-settings',
      JSON.stringify({ state: { theme: 'nord' }, version: 0 })
    )

    let rehydrated = false

    interface SettingsStore {
      theme: string
    }

    create<SettingsStore>()(
      persist(
        () => ({
          theme: 'light',
        }),
        {
          name: 'test-settings',
          storage: createJSONStorage(() => storage),
          onRehydrateStorage: () => {
            return () => {
              rehydrated = true
            }
          },
        }
      )
    )

    await new Promise((r) => setTimeout(r, 0))
    expect(rehydrated).toBe(true)
  })
})
