/**
 * Settings Store Tests
 *
 * Tests for useSettingsStore which manages user preferences
 * with full localStorage persistence.
 *
 * @see /docs/plans/003-sidebar-settings-sessions/sidebar-settings-sessions-spec.md
 * @see /docs/plans/007-session-idle-indicators/ (Phase 4 tests)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FakeStorage } from '@/test/fakeStorage'
import type { SettingsState, SettingsActions, TerminalTheme, IdleThresholds, LayoutIconStyle } from '../settings'
import { DEFAULT_THRESHOLDS } from '@/utils/idleState'

/** Minimum threshold value in milliseconds (1 second) - matches settings.ts */
const MIN_THRESHOLD_MS = 1000

/**
 * Validate and correct idle thresholds (duplicated from settings.ts for testing)
 */
function validateThresholds(thresholds: IdleThresholds): IdleThresholds {
  let active = Math.max(MIN_THRESHOLD_MS, thresholds.active)
  let recent = Math.max(MIN_THRESHOLD_MS, thresholds.recent)
  let short = Math.max(MIN_THRESHOLD_MS, thresholds.short)
  let medium = Math.max(MIN_THRESHOLD_MS, thresholds.medium)
  let long = Math.max(MIN_THRESHOLD_MS, thresholds.long)

  if (recent <= active) recent = active + 1000
  if (short <= recent) short = recent + 1000
  if (medium <= short) medium = short + 1000
  if (long <= medium) long = medium + 1000

  return { active, recent, short, medium, long }
}

// Test factory that creates isolated store instances with fake storage
const createTestSettingsStore = (storage: FakeStorage) => {
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
    layoutIconStyle: 'lines' as LayoutIconStyle,
    layoutIconShowActivePane: true,
    layoutIconShowActivityColors: true,
    layoutIconShowAnimations: true,
    layoutIconShowOpacity: true,
    tmuxSidebarEnabled: true,
    tmuxSocketPath: '',
    tmuxClickFocusExisting: true,
    retroBorderEnabled: false,
    retroAutoApply: true,
  }

  return create<SettingsState & SettingsActions>()(
    persist(
      (set) => ({
        ...defaultSettings,
        setTheme: (theme: TerminalTheme) => set({ theme }),
        setFontSize: (fontSize: number) => set({ fontSize }),
        setFontFamily: (fontFamily: string) => set({ fontFamily }),
        setAutoOpenTerminal: (autoOpenTerminal: boolean) => set({ autoOpenTerminal }),
        setIdleThresholds: (thresholds: IdleThresholds) => set({
          idleThresholds: validateThresholds(thresholds),
        }),
        setIdleIndicatorsEnabled: (idleIndicatorsEnabled: boolean) => set({ idleIndicatorsEnabled }),
        setUrlConfirmAlways: (urlConfirmAlways: boolean) => set({ urlConfirmAlways }),
        setUrlConfirmThreshold: (threshold: number) => set({
          urlConfirmThreshold: Math.max(0, Math.min(50, threshold)),
        }),
        setTmuxPollingInterval: (interval: number) => set({
          tmuxPollingInterval: Math.max(500, Math.min(30000, interval)),
        }),
        setUnfocusedOutputInterval: (interval: number) => set({
          unfocusedOutputInterval: Math.max(50, Math.min(1000, interval)),
        }),
        setLinksEnabled: (linksEnabled: boolean) => set({ linksEnabled }),
        setLinkActivation: (linkActivation: 'modifier-click' | 'single-click') => set({ linkActivation }),
        setLinkCustomPatterns: (linkCustomPatterns) => set({ linkCustomPatterns }),
        addLinkCustomPattern: (pattern) => set((state) => ({
          linkCustomPatterns: [...state.linkCustomPatterns, pattern],
        })),
        removeLinkCustomPattern: (index: number) => set((state) => ({
          linkCustomPatterns: state.linkCustomPatterns.filter((_, i) => i !== index),
        })),
        updateLinkCustomPattern: (index: number, pattern) => set((state) => ({
          linkCustomPatterns: state.linkCustomPatterns.map((p, i) => i === index ? pattern : p),
        })),
        setLayoutIconsEnabled: (layoutIconsEnabled: boolean) => set({ layoutIconsEnabled }),
        setLayoutIconSize: (size: number) => set({
          layoutIconSize: [16, 20, 24, 28, 32].includes(size) ? size : 24,
        }),
        setLayoutIconStyle: (layoutIconStyle: LayoutIconStyle) => set({ layoutIconStyle }),
        setLayoutIconShowActivePane: (layoutIconShowActivePane: boolean) => set({ layoutIconShowActivePane }),
        setLayoutIconShowActivityColors: (layoutIconShowActivityColors: boolean) => set({ layoutIconShowActivityColors }),
        setLayoutIconShowAnimations: (layoutIconShowAnimations: boolean) => set({ layoutIconShowAnimations }),
        setLayoutIconShowOpacity: (layoutIconShowOpacity: boolean) => set({ layoutIconShowOpacity }),
        setTmuxSidebarEnabled: (tmuxSidebarEnabled: boolean) => set({ tmuxSidebarEnabled }),
        setTmuxSocketPath: (tmuxSocketPath: string) => set({ tmuxSocketPath }),
        setTmuxClickFocusExisting: (tmuxClickFocusExisting: boolean) => set({ tmuxClickFocusExisting }),
        setRetroBorderEnabled: (retroBorderEnabled: boolean) => set({ retroBorderEnabled }),
        setRetroAutoApply: (retroAutoApply: boolean) => set({ retroAutoApply }),
        reset: () => set(defaultSettings),
      }),
      {
        name: 'trex-settings',
        storage: createJSONStorage(() => storage),
        merge: (persisted, current) => {
          const p = persisted as Partial<SettingsState> | undefined
          return {
            ...current,
            ...(p as Partial<SettingsState>),
            idleThresholds: {
              ...DEFAULT_THRESHOLDS,
              ...(p?.idleThresholds ?? {}),
            },
            linkCustomPatterns: p?.linkCustomPatterns ?? [],
            layoutIconsEnabled: p?.layoutIconsEnabled ?? defaultSettings.layoutIconsEnabled,
            layoutIconSize: p?.layoutIconSize ?? defaultSettings.layoutIconSize,
            layoutIconStyle:
              (['lines', 'gaps', 'rounded'] as const).includes(p?.layoutIconStyle as LayoutIconStyle)
                ? p!.layoutIconStyle!
                : defaultSettings.layoutIconStyle,
            layoutIconShowActivePane: p?.layoutIconShowActivePane ?? defaultSettings.layoutIconShowActivePane,
            layoutIconShowActivityColors: p?.layoutIconShowActivityColors ?? defaultSettings.layoutIconShowActivityColors,
            layoutIconShowAnimations: p?.layoutIconShowAnimations ?? defaultSettings.layoutIconShowAnimations,
            layoutIconShowOpacity: p?.layoutIconShowOpacity ?? defaultSettings.layoutIconShowOpacity,
          }
        },
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

  // ============================================================
  // Phase 4: Idle Indicator Settings Tests
  // ============================================================

  /**
   * Test: Should initialize with DEFAULT_THRESHOLDS
   *
   * Behavior: Fresh store should have idle thresholds matching Phase 2 defaults
   * Fixture: Fresh store with no persisted data
   * Assertion: All 5 thresholds equal DEFAULT_THRESHOLDS values
   *
   * Validates: Phase 4 T001 - idle thresholds default to Phase 2 constants
   */
  it('should initialize with DEFAULT_THRESHOLDS', () => {
    const useSettings = createTestSettingsStore(storage)

    const thresholds = useSettings.getState().idleThresholds
    expect(thresholds.active).toBe(DEFAULT_THRESHOLDS.active)
    expect(thresholds.recent).toBe(DEFAULT_THRESHOLDS.recent)
    expect(thresholds.short).toBe(DEFAULT_THRESHOLDS.short)
    expect(thresholds.medium).toBe(DEFAULT_THRESHOLDS.medium)
    expect(thresholds.long).toBe(DEFAULT_THRESHOLDS.long)
  })

  /**
   * Test: Should default idleIndicatorsEnabled to true
   *
   * Behavior: Feature flag enabled by default
   * Fixture: Fresh store with no persisted data
   * Assertion: idleIndicatorsEnabled is true
   *
   * Validates: Phase 4 T003 - feature flag default value
   */
  it('should default idleIndicatorsEnabled to true', () => {
    const useSettings = createTestSettingsStore(storage)

    expect(useSettings.getState().idleIndicatorsEnabled).toBe(true)
  })

  /**
   * Test: Should persist idle thresholds to localStorage (AC-06)
   *
   * Behavior: When thresholds change, persisted to localStorage
   * Fixture: Fresh FakeStorage, setIdleThresholds with custom values
   * Assertion: Storage contains persisted threshold values
   *
   * Validates: Phase 4 AC-06 - settings persistence
   */
  it('should persist idle thresholds to localStorage', async () => {
    const useSettings = createTestSettingsStore(storage)

    const customThresholds: IdleThresholds = {
      active: 3000,
      recent: 15000,
      short: 120000,
      medium: 300000,
      long: 1800000,
    }

    useSettings.getState().setIdleThresholds(customThresholds)
    await new Promise((r) => setTimeout(r, 0)) // Wait for persist

    const stored = storage.getItemParsed<{
      state: { idleThresholds: IdleThresholds }
    }>('trex-settings')

    expect(stored?.state.idleThresholds.active).toBe(3000)
    expect(stored?.state.idleThresholds.recent).toBe(15000)
    expect(stored?.state.idleThresholds.short).toBe(120000)
    expect(stored?.state.idleThresholds.medium).toBe(300000)
    expect(stored?.state.idleThresholds.long).toBe(1800000)
  })

  /**
   * Test: Should rehydrate idle thresholds from localStorage (AC-06)
   *
   * Behavior: Store restores persisted thresholds on creation
   * Fixture: Pre-populated FakeStorage with custom thresholds
   * Assertion: Store state matches persisted values
   *
   * Validates: Phase 4 AC-06 - settings restoration
   */
  it('should rehydrate idle thresholds from localStorage', async () => {
    storage.setItem(
      'trex-settings',
      JSON.stringify({
        state: {
          theme: 'default-dark',
          fontSize: 14,
          fontFamily: 'Menlo, monospace',
          autoOpenTerminal: false,
          idleThresholds: {
            active: 2000,
            recent: 10000,
            short: 60000,
            medium: 180000,
            long: 600000,
          },
          idleIndicatorsEnabled: false,
        },
        version: 0,
      })
    )

    const useSettings = createTestSettingsStore(storage)
    await new Promise((r) => setTimeout(r, 0)) // Wait for hydration

    const thresholds = useSettings.getState().idleThresholds
    expect(thresholds.active).toBe(2000)
    expect(thresholds.recent).toBe(10000)
    expect(thresholds.short).toBe(60000)
    expect(thresholds.medium).toBe(180000)
    expect(thresholds.long).toBe(600000)
    expect(useSettings.getState().idleIndicatorsEnabled).toBe(false)
  })

  /**
   * Test: Should validate minimum threshold of 1 second (AC-14)
   *
   * Behavior: Values below 1000ms are clamped to 1000ms
   * Fixture: Set threshold with value < 1000
   * Assertion: Stored value is at least 1000
   *
   * Validates: Phase 4 AC-14 - threshold validation
   */
  it('should validate minimum threshold (1s)', () => {
    const useSettings = createTestSettingsStore(storage)

    useSettings.getState().setIdleThresholds({
      active: 500, // Below minimum
      recent: 30000,
      short: 300000,
      medium: 600000,
      long: 3600000,
    })

    expect(useSettings.getState().idleThresholds.active).toBe(1000)
  })

  /**
   * Test: Should enforce ascending order of thresholds (AC-14)
   *
   * Behavior: Thresholds must be in ascending order; corrected if not
   * Fixture: Set recent <= active
   * Assertion: recent is corrected to be > active
   *
   * Validates: Phase 4 AC-14 - ascending order validation
   */
  it('should enforce ascending order of thresholds', () => {
    const useSettings = createTestSettingsStore(storage)

    useSettings.getState().setIdleThresholds({
      active: 10000,
      recent: 5000, // Less than active - should be corrected
      short: 300000,
      medium: 600000,
      long: 3600000,
    })

    const thresholds = useSettings.getState().idleThresholds
    expect(thresholds.recent).toBeGreaterThan(thresholds.active)
  })

  /**
   * Test: Should toggle idleIndicatorsEnabled (AC-13)
   *
   * Behavior: Feature flag can be toggled on/off
   * Fixture: Toggle from true to false
   * Assertion: Value changes accordingly
   *
   * Validates: Phase 4 AC-13 - feature flag toggle
   */
  it('should toggle idleIndicatorsEnabled', () => {
    const useSettings = createTestSettingsStore(storage)

    expect(useSettings.getState().idleIndicatorsEnabled).toBe(true)

    useSettings.getState().setIdleIndicatorsEnabled(false)
    expect(useSettings.getState().idleIndicatorsEnabled).toBe(false)

    useSettings.getState().setIdleIndicatorsEnabled(true)
    expect(useSettings.getState().idleIndicatorsEnabled).toBe(true)
  })

  /**
   * Test: Should merge with defaults when rehydrating old storage format
   *
   * Behavior: Old persisted data without idle fields gets merged with defaults
   * Fixture: Pre-populated storage without idleThresholds field
   * Assertion: Store has both old values and default idle settings
   *
   * Validates: Backwards compatibility with pre-Phase 4 storage
   */
  it('should merge with defaults when rehydrating old storage format', async () => {
    // Pre-Phase 4 storage format without idle fields
    storage.setItem(
      'trex-settings',
      JSON.stringify({
        state: {
          theme: 'dracula',
          fontSize: 16,
          fontFamily: 'Fira Code',
          autoOpenTerminal: false,
        },
        version: 0,
      })
    )

    const useSettings = createTestSettingsStore(storage)
    await new Promise((r) => setTimeout(r, 0)) // Wait for hydration

    // Old values preserved
    expect(useSettings.getState().theme).toBe('dracula')
    expect(useSettings.getState().fontSize).toBe(16)

    // New fields get defaults
    const thresholds = useSettings.getState().idleThresholds
    expect(thresholds.active).toBe(DEFAULT_THRESHOLDS.active)
    expect(thresholds.recent).toBe(DEFAULT_THRESHOLDS.recent)
  })

  // ============================================================
  // Plan 019: Layout Icon Settings Tests
  // ============================================================

  /**
   * Test: Should default layout icon settings correctly
   *
   * Behavior: All 7 layout icon fields initialize to plan-specified defaults
   * Fixture: Fresh store with no persisted data
   * Assertion: All defaults match plan spec
   *
   * Validates: Plan 019 T003 defaults
   */
  it('should default layout icon settings correctly', () => {
    const useSettings = createTestSettingsStore(storage)
    const s = useSettings.getState()

    expect(s.layoutIconsEnabled).toBe(true)
    expect(s.layoutIconSize).toBe(24)
    expect(s.layoutIconStyle).toBe('lines')
    expect(s.layoutIconShowActivePane).toBe(true)
    expect(s.layoutIconShowActivityColors).toBe(true)
    expect(s.layoutIconShowAnimations).toBe(true)
    expect(s.layoutIconShowOpacity).toBe(true)
  })

  /**
   * Test: Should merge layout icon defaults when rehydrating pre-019 storage
   *
   * Behavior: Old storage without layout icon fields gets defaults from merge
   * Fixture: Pre-019 storage with only theme and fontSize
   * Assertion: Old fields preserved, layout icon fields get defaults
   *
   * Validates: Plan 019 T004 backwards compatibility
   */
  it('should merge layout icon defaults when rehydrating pre-019 storage', async () => {
    storage.setItem(
      'trex-settings',
      JSON.stringify({
        state: {
          theme: 'nord',
          fontSize: 18,
          fontFamily: 'JetBrains Mono',
          autoOpenTerminal: false,
        },
        version: 0,
      })
    )

    const useSettings = createTestSettingsStore(storage)
    await new Promise((r) => setTimeout(r, 0))

    // Old values preserved
    expect(useSettings.getState().theme).toBe('nord')
    expect(useSettings.getState().fontSize).toBe(18)

    // Layout icon fields get defaults
    expect(useSettings.getState().layoutIconsEnabled).toBe(true)
    expect(useSettings.getState().layoutIconSize).toBe(24)
    expect(useSettings.getState().layoutIconStyle).toBe('lines')
    expect(useSettings.getState().layoutIconShowActivePane).toBe(true)
    expect(useSettings.getState().layoutIconShowActivityColors).toBe(true)
    expect(useSettings.getState().layoutIconShowAnimations).toBe(true)
    expect(useSettings.getState().layoutIconShowOpacity).toBe(true)
  })

  /**
   * Test: Should fall back to default for invalid layoutIconStyle enum
   *
   * Behavior: Invalid persisted enum value falls back to 'lines'
   * Fixture: Storage with layoutIconStyle set to an invalid string
   * Assertion: layoutIconStyle is 'lines' (default) after hydration
   *
   * Validates: Plan 019 T004 enum validation in merge
   */
  it('should fall back to default for invalid layoutIconStyle enum', async () => {
    storage.setItem(
      'trex-settings',
      JSON.stringify({
        state: {
          theme: 'default-dark',
          fontSize: 14,
          layoutIconStyle: 'invalid-style',
        },
        version: 0,
      })
    )

    const useSettings = createTestSettingsStore(storage)
    await new Promise((r) => setTimeout(r, 0))

    expect(useSettings.getState().layoutIconStyle).toBe('lines')
  })

  /**
   * Test: Should clamp invalid layoutIconSize to default
   *
   * Behavior: setLayoutIconSize rejects values not in [16,20,24,28,32]
   * Fixture: Set size to 22 (not in allowed list)
   * Assertion: Size falls back to 24
   */
  it('should clamp invalid layoutIconSize to default', () => {
    const useSettings = createTestSettingsStore(storage)

    useSettings.getState().setLayoutIconSize(22)
    expect(useSettings.getState().layoutIconSize).toBe(24)

    useSettings.getState().setLayoutIconSize(32)
    expect(useSettings.getState().layoutIconSize).toBe(32)
  })

})
