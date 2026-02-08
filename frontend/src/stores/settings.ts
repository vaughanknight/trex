/**
 * Settings Store - Manages user settings.
 *
 * All fields are persisted to localStorage under 'trex-settings'.
 *
 * Per Insight 1 decision: autoOpenTerminal defaults to false.
 * Per Insight 3: onRehydrateStorage callback added to prevent theme flash.
 * Per Phase 4 (Session Idle Indicators): Added idleThresholds and idleIndicatorsEnabled.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { type IdleThresholds, DEFAULT_THRESHOLDS } from '../utils/idleState'

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
  /** Thresholds for idle state computation (in milliseconds) */
  idleThresholds: IdleThresholds
  /** Feature flag to enable/disable idle indicators */
  idleIndicatorsEnabled: boolean
  /** Always prompt before creating sessions from URL params */
  urlConfirmAlways: boolean
  /** Prompt if URL requests more than this many sessions (0-50) */
  urlConfirmThreshold: number
}

export interface SettingsActions {
  setTheme: (theme: TerminalTheme) => void
  setFontSize: (size: number) => void
  setFontFamily: (family: string) => void
  setAutoOpenTerminal: (auto: boolean) => void
  /** Update idle thresholds with validation (min 1s, ascending order) */
  setIdleThresholds: (thresholds: IdleThresholds) => void
  /** Toggle idle indicators on/off */
  setIdleIndicatorsEnabled: (enabled: boolean) => void
  /** Set whether to always confirm before opening URL sessions */
  setUrlConfirmAlways: (always: boolean) => void
  /** Set session count threshold for URL confirmation (clamped 0-50) */
  setUrlConfirmThreshold: (threshold: number) => void
  reset: () => void
}

export type SettingsStore = SettingsState & SettingsActions

const defaultSettings: SettingsState = {
  theme: 'default-dark',
  fontSize: 14,
  fontFamily: 'Menlo, monospace',
  autoOpenTerminal: false,
  idleThresholds: { ...DEFAULT_THRESHOLDS },
  idleIndicatorsEnabled: true,
  urlConfirmAlways: false,
  urlConfirmThreshold: 5,
}

/** Minimum threshold value in milliseconds (1 second) */
const MIN_THRESHOLD_MS = 1000

/**
 * Validate and correct idle thresholds.
 * - Enforces minimum of 1000ms (1 second) for all values
 * - Enforces ascending order: active < recent < short < medium < long
 */
function validateThresholds(thresholds: IdleThresholds): IdleThresholds {
  // Clamp all values to minimum
  let active = Math.max(MIN_THRESHOLD_MS, thresholds.active)
  let recent = Math.max(MIN_THRESHOLD_MS, thresholds.recent)
  let short = Math.max(MIN_THRESHOLD_MS, thresholds.short)
  let medium = Math.max(MIN_THRESHOLD_MS, thresholds.medium)
  let long = Math.max(MIN_THRESHOLD_MS, thresholds.long)

  // Enforce ascending order
  if (recent <= active) recent = active + 1000
  if (short <= recent) short = recent + 1000
  if (medium <= short) medium = short + 1000
  if (long <= medium) long = medium + 1000

  return { active, recent, short, medium, long }
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setTheme: (theme) => set({ theme }),

      setFontSize: (fontSize) => set({ fontSize }),

      setFontFamily: (fontFamily) => set({ fontFamily }),

      setAutoOpenTerminal: (autoOpenTerminal) => set({ autoOpenTerminal }),

      setIdleThresholds: (thresholds) => set({
        idleThresholds: validateThresholds(thresholds),
      }),

      setIdleIndicatorsEnabled: (idleIndicatorsEnabled) => set({ idleIndicatorsEnabled }),

      setUrlConfirmAlways: (urlConfirmAlways) => set({ urlConfirmAlways }),

      setUrlConfirmThreshold: (threshold) => set({
        urlConfirmThreshold: Math.max(0, Math.min(50, threshold)),
      }),

      reset: () => set(defaultSettings),
    }),
    {
      name: 'trex-settings',
      storage: createJSONStorage(() => localStorage),
      // Merge with defaults to handle new fields added in future versions
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<SettingsState>),
        // Ensure idleThresholds has all fields even if persisted state is old
        idleThresholds: {
          ...DEFAULT_THRESHOLDS,
          ...((persisted as Partial<SettingsState>)?.idleThresholds ?? {}),
        },
      }),
    }
  )
)

// Selectors for fine-grained subscriptions
export const selectTheme = (state: SettingsStore) => state.theme
export const selectFontSize = (state: SettingsStore) => state.fontSize
export const selectFontFamily = (state: SettingsStore) => state.fontFamily
export const selectAutoOpenTerminal = (state: SettingsStore) => state.autoOpenTerminal
export const selectIdleThresholds = (state: SettingsStore) => state.idleThresholds
export const selectIdleIndicatorsEnabled = (state: SettingsStore) => state.idleIndicatorsEnabled
export const selectUrlConfirmAlways = (state: SettingsStore) => state.urlConfirmAlways
export const selectUrlConfirmThreshold = (state: SettingsStore) => state.urlConfirmThreshold

// Re-export IdleThresholds type for consumers
export type { IdleThresholds }
