/**
 * Settings Store - Manages user settings.
 *
 * All fields are persisted to localStorage under 'trex-settings'.
 *
 * Per Insight 1 decision: autoOpenTerminal defaults to false.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

export interface SettingsState {
  theme: Theme
  fontSize: number
  fontFamily: string
  autoOpenTerminal: boolean
}

export interface SettingsActions {
  setTheme: (theme: Theme) => void
  setFontSize: (size: number) => void
  setFontFamily: (family: string) => void
  setAutoOpenTerminal: (auto: boolean) => void
  reset: () => void
}

export type SettingsStore = SettingsState & SettingsActions

const defaultSettings: SettingsState = {
  theme: 'system',
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  autoOpenTerminal: false,
}

export const useSettingsStore = create<SettingsStore>()(
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
      storage: createJSONStorage(() => localStorage),
    }
  )
)

// Selectors for fine-grained subscriptions
export const selectTheme = (state: SettingsStore) => state.theme
export const selectFontSize = (state: SettingsStore) => state.fontSize
export const selectFontFamily = (state: SettingsStore) => state.fontFamily
export const selectAutoOpenTerminal = (state: SettingsStore) => state.autoOpenTerminal
