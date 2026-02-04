/**
 * TAD Scratch Test: Settings Store with Full Persist
 *
 * Exploring: Settings store that persists all fields to localStorage
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FakeStorage } from '../../../test/fakeStorage'

interface SettingsStore {
  theme: 'light' | 'dark' | 'system'
  fontSize: number
  fontFamily: string
  autoOpenTerminal: boolean
  setTheme: (theme: SettingsStore['theme']) => void
  setFontSize: (size: number) => void
  setFontFamily: (family: string) => void
  setAutoOpenTerminal: (auto: boolean) => void
  reset: () => void
}

const defaultSettings = {
  theme: 'system' as const,
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  autoOpenTerminal: false,
}

describe('scratch: settings store', () => {
  const createSettingsStore = (storage: FakeStorage) =>
    create<SettingsStore>()(
      persist(
        (set) => ({
          ...defaultSettings,
          setTheme: (theme) => set({ theme }),
          setFontSize: (fontSize) => set({ fontSize }),
          setFontFamily: (fontFamily) => set({ fontFamily }),
          setAutoOpenTerminal: (autoOpenTerminal) => set({ autoOpenTerminal }),
          reset: () => set(defaultSettings),
        }),
        {
          name: 'trex-settings',
          storage: createJSONStorage(() => storage),
        }
      )
    )

  it('should start with default settings', async () => {
    const storage = new FakeStorage()
    const useSettings = createSettingsStore(storage)

    expect(useSettings.getState().theme).toBe('system')
    expect(useSettings.getState().fontSize).toBe(14)
    expect(useSettings.getState().autoOpenTerminal).toBe(false)
  })

  it('should persist theme changes', async () => {
    const storage = new FakeStorage()
    const useSettings = createSettingsStore(storage)

    useSettings.getState().setTheme('dark')
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { theme: string }
    }>('trex-settings')
    expect(stored?.state.theme).toBe('dark')
  })

  it('should persist fontSize changes', async () => {
    const storage = new FakeStorage()
    const useSettings = createSettingsStore(storage)

    useSettings.getState().setFontSize(18)
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { fontSize: number }
    }>('trex-settings')
    expect(stored?.state.fontSize).toBe(18)
  })

  it('should restore settings from storage', async () => {
    const storage = new FakeStorage()

    // Pre-populate storage
    storage.setItem(
      'trex-settings',
      JSON.stringify({
        state: {
          theme: 'dark',
          fontSize: 16,
          fontFamily: 'Fira Code',
          autoOpenTerminal: true,
        },
        version: 0,
      })
    )

    const useSettings = createSettingsStore(storage)
    await new Promise((r) => setTimeout(r, 0))

    expect(useSettings.getState().theme).toBe('dark')
    expect(useSettings.getState().fontSize).toBe(16)
    expect(useSettings.getState().fontFamily).toBe('Fira Code')
    expect(useSettings.getState().autoOpenTerminal).toBe(true)
  })

  it('should reset to defaults', async () => {
    const storage = new FakeStorage()
    const useSettings = createSettingsStore(storage)

    useSettings.getState().setTheme('dark')
    useSettings.getState().setFontSize(20)

    expect(useSettings.getState().theme).toBe('dark')
    expect(useSettings.getState().fontSize).toBe(20)

    useSettings.getState().reset()

    expect(useSettings.getState().theme).toBe('system')
    expect(useSettings.getState().fontSize).toBe(14)
  })
})
