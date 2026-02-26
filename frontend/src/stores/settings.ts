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
import type { CustomPattern } from '../lib/linkProvider'
import type { LayoutIconStyle } from '../lib/layoutIconTree'

// Terminal theme IDs matching themes/index.ts
export type TerminalTheme =
  | 'default-dark'
  | 'default-light'
  | 'apple-iie'
  | 'commodore-64'
  | 'dracula'
  | 'nord'
  | 'solarized-dark'
  | 'solarized-light'
  | 'monokai'
  | 'gruvbox-dark'
  | 'gruvbox-light'
  | 'one-dark'
  | 'one-light'
  | 'street-fighter'
  | 'tokyo-night'

// Bundled fonts from @fontsource packages + custom fonts
export const BUNDLED_FONTS = [
  { id: 'apple-iie', name: 'Apple IIe', family: "'Apple IIe', monospace" },
  { id: 'bescii-mono', name: 'BESCII Mono (C64)', family: "'BESCII Mono', monospace" },
  { id: 'press-start-2p', name: 'Press Start 2P (Arcade)', family: "'Press Start 2P', monospace" },
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
  /** tmux polling interval in milliseconds (500-30000, step 500) */
  tmuxPollingInterval: number
  /** Output flush interval for unfocused panes in milliseconds (50-1000) */
  unfocusedOutputInterval: number
  /** Enable/disable clickable link detection in terminal output */
  linksEnabled: boolean
  /** Link activation method: modifier+click (safe default) or single click */
  linkActivation: 'modifier-click' | 'single-click'
  /** User-defined custom link patterns */
  linkCustomPatterns: CustomPattern[]
  /** Master toggle for dynamic layout icons (Plan 019) */
  layoutIconsEnabled: boolean
  /** Icon size in pixels (16/20/24/28/32) */
  layoutIconSize: number
  /** Visual style for pane dividers */
  layoutIconStyle: LayoutIconStyle
  /** Show active/focused pane highlight */
  layoutIconShowActivePane: boolean
  /** Show per-pane idle state colors */
  layoutIconShowActivityColors: boolean
  /** Show pulse animation on active panes */
  layoutIconShowAnimations: boolean
  /** Show opacity variation by idle state */
  layoutIconShowOpacity: boolean
  /** Show tmux sessions section in sidebar (Plan 018) */
  tmuxSidebarEnabled: boolean
  /** Additional tmux socket path for -L/-S flag (Plan 018) */
  tmuxSocketPath: string
  /** Click tmux session focuses existing pane instead of creating duplicate (Plan 018) */
  tmuxClickFocusExisting: boolean
  /** Show retro CRT-style border around terminal (C64 mode) */
  retroBorderEnabled: boolean
  /** Auto-apply retro font and border when a retro theme is selected */
  retroAutoApply: boolean
  /** Enable translucent title bar (overlays terminal content) */
  translucentTitleBar: boolean
  /** Title bar opacity at rest (0-1) */
  titleBarOpacity: number
  /** Title bar opacity on hover (0-1) */
  titleBarHoverOpacity: number
  /** Per-plugin settings (enabled, per-surface toggles) */
  pluginSettings: Record<string, { enabled: boolean; titleBar: boolean; sidebar: boolean; panel: boolean }>
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
  /** Set tmux polling interval in ms (clamped 500-30000) */
  setTmuxPollingInterval: (interval: number) => void
  /** Set unfocused output flush interval in ms (clamped 50-1000) */
  setUnfocusedOutputInterval: (interval: number) => void
  /** Enable/disable link detection */
  setLinksEnabled: (enabled: boolean) => void
  /** Set link activation method */
  setLinkActivation: (activation: 'modifier-click' | 'single-click') => void
  /** Replace all custom patterns */
  setLinkCustomPatterns: (patterns: CustomPattern[]) => void
  /** Add a custom pattern */
  addLinkCustomPattern: (pattern: CustomPattern) => void
  /** Remove a custom pattern by index */
  removeLinkCustomPattern: (index: number) => void
  /** Update a custom pattern at index */
  updateLinkCustomPattern: (index: number, pattern: CustomPattern) => void
  /** Toggle dynamic layout icons on/off */
  setLayoutIconsEnabled: (enabled: boolean) => void
  /** Set icon size (clamped to valid values) */
  setLayoutIconSize: (size: number) => void
  /** Set pane divider style */
  setLayoutIconStyle: (style: LayoutIconStyle) => void
  /** Toggle active pane highlight */
  setLayoutIconShowActivePane: (show: boolean) => void
  /** Toggle activity colors */
  setLayoutIconShowActivityColors: (show: boolean) => void
  /** Toggle pulse animations */
  setLayoutIconShowAnimations: (show: boolean) => void
  /** Toggle opacity variation */
  setLayoutIconShowOpacity: (show: boolean) => void
  /** Toggle tmux sidebar section visibility (Plan 018) */
  setTmuxSidebarEnabled: (enabled: boolean) => void
  /** Set tmux socket path (Plan 018) */
  setTmuxSocketPath: (path: string) => void
  /** Toggle tmux click-focus-existing behavior (Plan 018) */
  setTmuxClickFocusExisting: (enabled: boolean) => void
  /** Toggle retro CRT border */
  setRetroBorderEnabled: (enabled: boolean) => void
  /** Toggle retro auto-apply (font + border on theme select) */
  setRetroAutoApply: (enabled: boolean) => void
  /** Toggle translucent title bar */
  setTranslucentTitleBar: (enabled: boolean) => void
  /** Set title bar opacity at rest (clamped 0.05-1) */
  setTitleBarOpacity: (opacity: number) => void
  /** Set title bar opacity on hover (clamped 0.1-1) */
  setTitleBarHoverOpacity: (opacity: number) => void
  /** Update plugin settings */
  setPluginSetting: (pluginId: string, key: keyof { enabled: boolean; titleBar: boolean; sidebar: boolean; panel: boolean }, value: boolean) => void
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
  tmuxPollingInterval: 2000,
  unfocusedOutputInterval: 50,
  linksEnabled: true,
  linkActivation: 'modifier-click',
  linkCustomPatterns: [],
  layoutIconsEnabled: true,
  layoutIconSize: 24,
  layoutIconStyle: 'lines',
  layoutIconShowActivePane: true,
  layoutIconShowActivityColors: true,
  layoutIconShowAnimations: true,
  layoutIconShowOpacity: true,
  tmuxSidebarEnabled: true,
  tmuxSocketPath: '',
  tmuxClickFocusExisting: true,
  retroBorderEnabled: false,
  retroAutoApply: true,
  translucentTitleBar: false,
  titleBarOpacity: 0.3,
  titleBarHoverOpacity: 0.9,
  pluginSettings: {},
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
    (set, get) => ({
      ...defaultSettings,

      setTheme: (theme) => {
        const state = get()
        const updates: Partial<SettingsState> = { theme }
        const isRetroTheme = theme === 'commodore-64' || theme === 'apple-iie' || theme === 'street-fighter'
        // Auto-apply retro font + border when selecting a retro theme
        if (state.retroAutoApply && isRetroTheme) {
          if (theme === 'commodore-64') {
            updates.fontFamily = "'BESCII Mono', monospace"
            updates.retroBorderEnabled = true
          }
          if (theme === 'apple-iie') {
            updates.fontFamily = "'Apple IIe', monospace"
            updates.retroBorderEnabled = false
          }
          if (theme === 'street-fighter') {
            updates.fontFamily = "'Press Start 2P', monospace"
            updates.retroBorderEnabled = false
          }
        } else if (state.retroAutoApply && !isRetroTheme) {
          updates.retroBorderEnabled = false
        }
        set(updates)
      },

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

      setTmuxPollingInterval: (interval) => set({
        tmuxPollingInterval: Math.max(500, Math.min(30000, interval)),
      }),

      setUnfocusedOutputInterval: (interval) => set({
        unfocusedOutputInterval: Math.max(50, Math.min(1000, interval)),
      }),

      setLinksEnabled: (linksEnabled) => set({ linksEnabled }),

      setLinkActivation: (linkActivation) => set({ linkActivation }),

      setLinkCustomPatterns: (linkCustomPatterns) => set({ linkCustomPatterns }),

      addLinkCustomPattern: (pattern) => set((state) => ({
        linkCustomPatterns: [...state.linkCustomPatterns, pattern],
      })),

      removeLinkCustomPattern: (index) => set((state) => ({
        linkCustomPatterns: state.linkCustomPatterns.filter((_, i) => i !== index),
      })),

      updateLinkCustomPattern: (index, pattern) => set((state) => ({
        linkCustomPatterns: state.linkCustomPatterns.map((p, i) =>
          i === index ? pattern : p
        ),
      })),

      setLayoutIconsEnabled: (layoutIconsEnabled) => set({ layoutIconsEnabled }),

      setLayoutIconSize: (size) => set({
        layoutIconSize: [16, 20, 24, 28, 32].includes(size) ? size : 24,
      }),

      setLayoutIconStyle: (layoutIconStyle) => set({ layoutIconStyle }),

      setLayoutIconShowActivePane: (layoutIconShowActivePane) => set({ layoutIconShowActivePane }),

      setLayoutIconShowActivityColors: (layoutIconShowActivityColors) => set({ layoutIconShowActivityColors }),

      setLayoutIconShowAnimations: (layoutIconShowAnimations) => set({ layoutIconShowAnimations }),

      setLayoutIconShowOpacity: (layoutIconShowOpacity) => set({ layoutIconShowOpacity }),

      setTmuxSidebarEnabled: (tmuxSidebarEnabled) => set({ tmuxSidebarEnabled }),

      setTmuxSocketPath: (tmuxSocketPath) => set({ tmuxSocketPath }),

      setTmuxClickFocusExisting: (tmuxClickFocusExisting) => set({ tmuxClickFocusExisting }),

      setRetroBorderEnabled: (retroBorderEnabled) => set({ retroBorderEnabled }),

      setRetroAutoApply: (retroAutoApply) => set({ retroAutoApply }),

      setTranslucentTitleBar: (translucentTitleBar) => set({ translucentTitleBar }),

      setTitleBarOpacity: (opacity) => set({ titleBarOpacity: Math.max(0.05, Math.min(1, opacity)) }),

      setTitleBarHoverOpacity: (opacity) => set({ titleBarHoverOpacity: Math.max(0.1, Math.min(1, opacity)) }),

      setPluginSetting: (pluginId, key, value) => set((state) => ({
        pluginSettings: {
          ...state.pluginSettings,
          [pluginId]: {
            ...(state.pluginSettings[pluginId] ?? { enabled: true, titleBar: true, sidebar: true, panel: true }),
            [key]: value,
          },
        },
      })),

      reset: () => set(defaultSettings),
    }),
    {
      name: 'trex-settings',
      storage: createJSONStorage(() => localStorage),
      // Merge with defaults to handle new fields added in future versions
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown> | undefined
        // Clean stale keys removed in Plan 016
        if (p) delete p.paneSplittingEnabled
        return {
          ...current,
          ...(p as Partial<SettingsState>),
          // Ensure idleThresholds has all fields even if persisted state is old
          idleThresholds: {
            ...DEFAULT_THRESHOLDS,
            ...((p as Partial<SettingsState>)?.idleThresholds ?? {}),
          },
          // Ensure linkCustomPatterns is always an array (Plan 017)
          linkCustomPatterns:
            (p as Partial<SettingsState>)?.linkCustomPatterns ?? [],
          // Plan 019: Layout icon settings with ?? fallbacks for migration
          layoutIconsEnabled:
            (p as Partial<SettingsState>)?.layoutIconsEnabled ?? defaultSettings.layoutIconsEnabled,
          layoutIconSize:
            (p as Partial<SettingsState>)?.layoutIconSize ?? defaultSettings.layoutIconSize,
          layoutIconStyle:
            (['lines', 'gaps', 'rounded'] as const).includes(
              (p as Partial<SettingsState>)?.layoutIconStyle as LayoutIconStyle
            )
              ? (p as Partial<SettingsState>)!.layoutIconStyle!
              : defaultSettings.layoutIconStyle,
          layoutIconShowActivePane:
            (p as Partial<SettingsState>)?.layoutIconShowActivePane ?? defaultSettings.layoutIconShowActivePane,
          layoutIconShowActivityColors:
            (p as Partial<SettingsState>)?.layoutIconShowActivityColors ?? defaultSettings.layoutIconShowActivityColors,
          layoutIconShowAnimations:
            (p as Partial<SettingsState>)?.layoutIconShowAnimations ?? defaultSettings.layoutIconShowAnimations,
          layoutIconShowOpacity:
            (p as Partial<SettingsState>)?.layoutIconShowOpacity ?? defaultSettings.layoutIconShowOpacity,
          // Plan 018: tmux settings with ?? fallbacks for migration
          tmuxSidebarEnabled:
            (p as Partial<SettingsState>)?.tmuxSidebarEnabled ?? defaultSettings.tmuxSidebarEnabled,
          tmuxSocketPath:
            (p as Partial<SettingsState>)?.tmuxSocketPath ?? defaultSettings.tmuxSocketPath,
          tmuxClickFocusExisting:
            (p as Partial<SettingsState>)?.tmuxClickFocusExisting ?? defaultSettings.tmuxClickFocusExisting,
          // Plan 024: Retro mode settings with ?? fallbacks for migration
          retroBorderEnabled:
            (p as Partial<SettingsState>)?.retroBorderEnabled ?? defaultSettings.retroBorderEnabled,
          retroAutoApply:
            (p as Partial<SettingsState>)?.retroAutoApply ?? defaultSettings.retroAutoApply,
          // Plan 024: Translucent title bar settings
          translucentTitleBar:
            (p as Partial<SettingsState>)?.translucentTitleBar ?? defaultSettings.translucentTitleBar,
          titleBarOpacity:
            (p as Partial<SettingsState>)?.titleBarOpacity ?? defaultSettings.titleBarOpacity,
          titleBarHoverOpacity:
            (p as Partial<SettingsState>)?.titleBarHoverOpacity ?? defaultSettings.titleBarHoverOpacity,
          pluginSettings:
            (p as Partial<SettingsState>)?.pluginSettings ?? defaultSettings.pluginSettings,
        }
      },
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
export const selectTmuxPollingInterval = (state: SettingsStore) => state.tmuxPollingInterval
export const selectUnfocusedOutputInterval = (state: SettingsStore) => state.unfocusedOutputInterval
export const selectLinksEnabled = (state: SettingsStore) => state.linksEnabled
export const selectLinkActivation = (state: SettingsStore) => state.linkActivation
export const selectLinkCustomPatterns = (state: SettingsStore) => state.linkCustomPatterns
export const selectLayoutIconsEnabled = (state: SettingsStore) => state.layoutIconsEnabled
export const selectLayoutIconSize = (state: SettingsStore) => state.layoutIconSize
export const selectLayoutIconStyle = (state: SettingsStore) => state.layoutIconStyle
export const selectLayoutIconShowActivePane = (state: SettingsStore) => state.layoutIconShowActivePane
export const selectLayoutIconShowActivityColors = (state: SettingsStore) => state.layoutIconShowActivityColors
export const selectLayoutIconShowAnimations = (state: SettingsStore) => state.layoutIconShowAnimations
export const selectLayoutIconShowOpacity = (state: SettingsStore) => state.layoutIconShowOpacity
export const selectTmuxSidebarEnabled = (state: SettingsStore) => state.tmuxSidebarEnabled
export const selectTmuxSocketPath = (state: SettingsStore) => state.tmuxSocketPath
export const selectTmuxClickFocusExisting = (state: SettingsStore) => state.tmuxClickFocusExisting
export const selectRetroBorderEnabled = (state: SettingsStore) => state.retroBorderEnabled
export const selectRetroAutoApply = (state: SettingsStore) => state.retroAutoApply
export const selectTranslucentTitleBar = (state: SettingsStore) => state.translucentTitleBar
export const selectTitleBarOpacity = (state: SettingsStore) => state.titleBarOpacity
export const selectTitleBarHoverOpacity = (state: SettingsStore) => state.titleBarHoverOpacity
export const selectPluginSettings = (state: SettingsStore) => state.pluginSettings

// Re-export IdleThresholds type for consumers
export type { IdleThresholds }
// Re-export CustomPattern type for consumers
export type { CustomPattern }
// Re-export LayoutIconStyle for consumers
export type { LayoutIconStyle }
