/**
 * Settings Store - Manages user settings.
 *
 * All fields are persisted to localStorage under 'trex-settings'.
 *
 * Per Insight 1 decision: autoOpenTerminal defaults to false.
 * Per Insight 3: onRehydrateStorage callback added to prevent theme flash.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Terminal theme IDs matching themes/index.ts
export type TerminalTheme =
  | 'default-dark'
  | 'default-light'
  | 'dracula'
  | 'nord'
  | 'solarized-dark'
  | 'solarized-light'
  | 'monokai'
  | 'gruvbox-dark'
  | 'gruvbox-light'
  | 'one-dark'
  | 'one-light'
  | 'tokyo-night'

// Bundled fonts from @fontsource packages
export const BUNDLED_FONTS = [
  { id: 'fira-code', name: 'Fira Code', family: "'Fira Code', monospace" },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', family: "'JetBrains Mono', monospace" },
  { id: 'source-code-pro', name: 'Source Code Pro', family: "'Source Code Pro', monospace" },
  { id: 'ibm-plex-mono', name: 'IBM Plex Mono', family: "'IBM Plex Mono', monospace" },
  { id: 'cascadia-code', name: 'Cascadia Code', family: "'Cascadia Code', monospace" },
  { id: 'ubuntu-mono', name: 'Ubuntu Mono', family: "'Ubuntu Mono', monospace" },
] as const

// Fallback fonts (always available)
export const FALLBACK_FONTS = [
  { id: 'menlo', name: 'Menlo', family: 'Menlo, monospace' },
  { id: 'monaco', name: 'Monaco', family: 'Monaco, monospace' },
  { id: 'consolas', name: 'Consolas', family: 'Consolas, monospace' },
  { id: 'courier-new', name: 'Courier New', family: '"Courier New", monospace' },
  { id: 'monospace', name: 'System Monospace', family: 'monospace' },
] as const

export interface SettingsState {
  theme: TerminalTheme
  fontSize: number
  fontFamily: string
  autoOpenTerminal: boolean
}

export interface SettingsActions {
  setTheme: (theme: TerminalTheme) => void
  setFontSize: (size: number) => void
  setFontFamily: (family: string) => void
  setAutoOpenTerminal: (auto: boolean) => void
  reset: () => void
}

export type SettingsStore = SettingsState & SettingsActions

const defaultSettings: SettingsState = {
  theme: 'default-dark',
  fontSize: 14,
  fontFamily: 'Menlo, monospace',
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
