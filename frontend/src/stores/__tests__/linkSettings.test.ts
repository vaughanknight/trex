/**
 * Link Settings Tests (TDD — written before implementation)
 *
 * Tests for link-related settings fields in the settings store:
 * linksEnabled, linkActivation, linkCustomPatterns[].
 *
 * Follows established patterns from settings.test.ts:
 * - FakeStorage for persistence testing
 * - Factory function for isolated store instances
 * - Backwards compatibility with old storage format
 *
 * @see /docs/plans/017-clickable-terminal-links/clickable-terminal-links-plan.md Phase 1
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FakeStorage } from '@/test/fakeStorage'
import type { SettingsState, SettingsActions, TerminalTheme, IdleThresholds, LayoutIconStyle } from '../settings'
import { DEFAULT_THRESHOLDS } from '@/utils/idleState'
import type { CustomPattern } from '@/lib/linkProvider'

// Extended type for link-aware settings (matches what we'll add to settings.ts)
interface LinkSettingsState extends SettingsState {
  linksEnabled: boolean
  linkActivation: 'modifier-click' | 'single-click'
  linkCustomPatterns: CustomPattern[]
}

interface LinkSettingsActions extends SettingsActions {
  setLinksEnabled: (enabled: boolean) => void
  setLinkActivation: (activation: 'modifier-click' | 'single-click') => void
  setLinkCustomPatterns: (patterns: CustomPattern[]) => void
  addLinkCustomPattern: (pattern: CustomPattern) => void
  removeLinkCustomPattern: (index: number) => void
  updateLinkCustomPattern: (index: number, pattern: CustomPattern) => void
}

// Factory matching the existing settings.test.ts pattern
function createTestLinkSettingsStore(storage: FakeStorage) {
  const defaultSettings: LinkSettingsState = {
    theme: 'default-dark' as TerminalTheme,
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

  return create<LinkSettingsState & LinkSettingsActions>()(
    persist(
      (set) => ({
        ...defaultSettings,
        setTheme: (theme: TerminalTheme) => set({ theme }),
        setFontSize: (fontSize: number) => set({ fontSize }),
        setFontFamily: (fontFamily: string) => set({ fontFamily }),
        setAutoOpenTerminal: (autoOpenTerminal: boolean) => set({ autoOpenTerminal }),
        setIdleThresholds: (thresholds: IdleThresholds) => set({ idleThresholds: thresholds }),
        setIdleIndicatorsEnabled: (enabled: boolean) => set({ idleIndicatorsEnabled: enabled }),
        setUrlConfirmAlways: (always: boolean) => set({ urlConfirmAlways: always }),
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
        setLinkActivation: (linkActivation: 'modifier-click' | 'single-click') =>
          set({ linkActivation }),
        setLinkCustomPatterns: (linkCustomPatterns: CustomPattern[]) =>
          set({ linkCustomPatterns }),
        addLinkCustomPattern: (pattern: CustomPattern) =>
          set((state) => ({
            linkCustomPatterns: [...state.linkCustomPatterns, pattern],
          })),
        removeLinkCustomPattern: (index: number) =>
          set((state) => ({
            linkCustomPatterns: state.linkCustomPatterns.filter((_, i) => i !== index),
          })),
        updateLinkCustomPattern: (index: number, pattern: CustomPattern) =>
          set((state) => ({
            linkCustomPatterns: state.linkCustomPatterns.map((p, i) =>
              i === index ? pattern : p
            ),
          })),
        setLayoutIconsEnabled: (layoutIconsEnabled: boolean) => set({ layoutIconsEnabled }),
        setLayoutIconSize: (size: number) => set({
          layoutIconSize: [16, 20, 24, 28, 32].includes(size) ? size : 24,
        }),
        setLayoutIconStyle: (layoutIconStyle: LayoutIconStyle) => set({ layoutIconStyle }),
        setLayoutIconShowActivePane: (v: boolean) => set({ layoutIconShowActivePane: v }),
        setLayoutIconShowActivityColors: (v: boolean) => set({ layoutIconShowActivityColors: v }),
        setLayoutIconShowAnimations: (v: boolean) => set({ layoutIconShowAnimations: v }),
        setLayoutIconShowOpacity: (v: boolean) => set({ layoutIconShowOpacity: v }),
        setTmuxSidebarEnabled: (v: boolean) => set({ tmuxSidebarEnabled: v }),
        setTmuxSocketPath: (v: string) => set({ tmuxSocketPath: v }),
        setTmuxClickFocusExisting: (v: boolean) => set({ tmuxClickFocusExisting: v }),
        setRetroBorderEnabled: (v: boolean) => set({ retroBorderEnabled: v }),
        setRetroAutoApply: (v: boolean) => set({ retroAutoApply: v }),
        reset: () => set(defaultSettings),
      }),
      {
        name: 'trex-settings',
        storage: createJSONStorage(() => storage),
        merge: (persisted, current) => {
          const p = persisted as Record<string, unknown> | undefined
          if (p) delete p.paneSplittingEnabled
          return {
            ...current,
            ...(p as Partial<LinkSettingsState>),
            idleThresholds: {
              ...DEFAULT_THRESHOLDS,
              ...((p as Partial<LinkSettingsState>)?.idleThresholds ?? {}),
            },
            linkCustomPatterns:
              (p as Partial<LinkSettingsState>)?.linkCustomPatterns ?? [],
          }
        },
      }
    )
  )
}

describe('Link Settings', () => {
  let storage: FakeStorage

  beforeEach(() => {
    storage = new FakeStorage()
  })

  // ============================================================
  // Default Values
  // ============================================================

  /**
   * Test Doc:
   * - Why: Links should be enabled by default for new users
   * - Contract: linksEnabled defaults to true
   * - Quality Contribution: Ensures feature is discoverable without configuration
   */
  it('should default linksEnabled to true', () => {
    const store = createTestLinkSettingsStore(storage)
    expect(store.getState().linksEnabled).toBe(true)
  })

  /**
   * Test Doc:
   * - Why: Modifier+click is the safe default (prevents accidental link clicks)
   * - Contract: linkActivation defaults to 'modifier-click'
   * - Quality Contribution: Prevents accidental navigation from terminal
   */
  it('should default linkActivation to modifier-click', () => {
    const store = createTestLinkSettingsStore(storage)
    expect(store.getState().linkActivation).toBe('modifier-click')
  })

  /**
   * Test Doc:
   * - Why: No custom patterns configured by default
   * - Contract: linkCustomPatterns defaults to empty array
   * - Quality Contribution: Clean initial state
   */
  it('should default linkCustomPatterns to empty array', () => {
    const store = createTestLinkSettingsStore(storage)
    expect(store.getState().linkCustomPatterns).toEqual([])
  })

  // ============================================================
  // Persistence
  // ============================================================

  /**
   * Test Doc:
   * - Why: Link settings must survive browser refresh
   * - Contract: linksEnabled persists to localStorage
   * - Worked Example: Set linksEnabled=false → persist → stored value is false
   */
  it('should persist linksEnabled to localStorage', async () => {
    const store = createTestLinkSettingsStore(storage)

    store.getState().setLinksEnabled(false)
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { linksEnabled: boolean }
    }>('trex-settings')

    expect(stored?.state.linksEnabled).toBe(false)
  })

  it('should persist linkActivation to localStorage', async () => {
    const store = createTestLinkSettingsStore(storage)

    store.getState().setLinkActivation('single-click')
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { linkActivation: string }
    }>('trex-settings')

    expect(stored?.state.linkActivation).toBe('single-click')
  })

  it('should persist linkCustomPatterns to localStorage', async () => {
    const store = createTestLinkSettingsStore(storage)

    const pattern: CustomPattern = {
      name: 'JIRA',
      regex: 'JIRA-\\d+',
      urlTemplate: 'https://jira.example.com/browse/$0',
      enabled: true,
    }

    store.getState().addLinkCustomPattern(pattern)
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { linkCustomPatterns: CustomPattern[] }
    }>('trex-settings')

    expect(stored?.state.linkCustomPatterns).toHaveLength(1)
    expect(stored?.state.linkCustomPatterns[0].name).toBe('JIRA')
  })

  // ============================================================
  // Restoration
  // ============================================================

  it('should restore link settings from localStorage', async () => {
    storage.setItem(
      'trex-settings',
      JSON.stringify({
        state: {
          theme: 'default-dark',
          fontSize: 14,
          fontFamily: 'Menlo, monospace',
          autoOpenTerminal: false,
          linksEnabled: false,
          linkActivation: 'single-click',
          linkCustomPatterns: [
            {
              name: 'GH Issue',
              regex: '#\\d+',
              urlTemplate: 'https://github.com/org/repo/issues/$0',
              enabled: true,
            },
          ],
        },
        version: 0,
      })
    )

    const store = createTestLinkSettingsStore(storage)
    await new Promise((r) => setTimeout(r, 0))

    expect(store.getState().linksEnabled).toBe(false)
    expect(store.getState().linkActivation).toBe('single-click')
    expect(store.getState().linkCustomPatterns).toHaveLength(1)
    expect(store.getState().linkCustomPatterns[0].name).toBe('GH Issue')
  })

  // ============================================================
  // Backwards Compatibility
  // ============================================================

  /**
   * Test Doc:
   * - Why: Existing users won't have link fields in localStorage
   * - Contract: Old storage format without link fields gets merged with defaults
   * - Quality Contribution: Prevents crashes on upgrade for existing users
   */
  it('should merge defaults when rehydrating old storage without link fields', async () => {
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

    const store = createTestLinkSettingsStore(storage)
    await new Promise((r) => setTimeout(r, 0))

    // Old values preserved
    expect(store.getState().theme).toBe('dracula')
    expect(store.getState().fontSize).toBe(16)

    // New link fields get defaults
    expect(store.getState().linksEnabled).toBe(true)
    expect(store.getState().linkActivation).toBe('modifier-click')
    expect(store.getState().linkCustomPatterns).toEqual([])
  })

  // ============================================================
  // Custom Pattern CRUD
  // ============================================================

  it('should add a custom pattern', () => {
    const store = createTestLinkSettingsStore(storage)

    store.getState().addLinkCustomPattern({
      name: 'Test',
      regex: 'TEST-\\d+',
      urlTemplate: 'https://test.com/$0',
      enabled: true,
    })

    expect(store.getState().linkCustomPatterns).toHaveLength(1)
    expect(store.getState().linkCustomPatterns[0].name).toBe('Test')
  })

  it('should remove a custom pattern by index', () => {
    const store = createTestLinkSettingsStore(storage)

    store.getState().addLinkCustomPattern({
      name: 'First',
      regex: 'A-\\d+',
      urlTemplate: 'https://a.com/$0',
      enabled: true,
    })
    store.getState().addLinkCustomPattern({
      name: 'Second',
      regex: 'B-\\d+',
      urlTemplate: 'https://b.com/$0',
      enabled: true,
    })

    expect(store.getState().linkCustomPatterns).toHaveLength(2)

    store.getState().removeLinkCustomPattern(0)

    expect(store.getState().linkCustomPatterns).toHaveLength(1)
    expect(store.getState().linkCustomPatterns[0].name).toBe('Second')
  })

  it('should update a custom pattern at index', () => {
    const store = createTestLinkSettingsStore(storage)

    store.getState().addLinkCustomPattern({
      name: 'Original',
      regex: 'OLD-\\d+',
      urlTemplate: 'https://old.com/$0',
      enabled: true,
    })

    store.getState().updateLinkCustomPattern(0, {
      name: 'Updated',
      regex: 'NEW-\\d+',
      urlTemplate: 'https://new.com/$0',
      enabled: false,
    })

    expect(store.getState().linkCustomPatterns[0].name).toBe('Updated')
    expect(store.getState().linkCustomPatterns[0].regex).toBe('NEW-\\d+')
    expect(store.getState().linkCustomPatterns[0].enabled).toBe(false)
  })

  it('should replace all custom patterns at once', () => {
    const store = createTestLinkSettingsStore(storage)

    store.getState().addLinkCustomPattern({
      name: 'First',
      regex: 'A-\\d+',
      urlTemplate: 'https://a.com/$0',
      enabled: true,
    })

    const newPatterns: CustomPattern[] = [
      {
        name: 'Replaced 1',
        regex: 'X-\\d+',
        urlTemplate: 'https://x.com/$0',
        enabled: true,
      },
      {
        name: 'Replaced 2',
        regex: 'Y-\\d+',
        urlTemplate: 'https://y.com/$0',
        enabled: true,
      },
    ]

    store.getState().setLinkCustomPatterns(newPatterns)

    expect(store.getState().linkCustomPatterns).toHaveLength(2)
    expect(store.getState().linkCustomPatterns[0].name).toBe('Replaced 1')
    expect(store.getState().linkCustomPatterns[1].name).toBe('Replaced 2')
  })

  // ============================================================
  // Reset
  // ============================================================

  it('should reset link settings to defaults', () => {
    const store = createTestLinkSettingsStore(storage)

    store.getState().setLinksEnabled(false)
    store.getState().setLinkActivation('single-click')
    store.getState().addLinkCustomPattern({
      name: 'Test',
      regex: 'T-\\d+',
      urlTemplate: 'https://t.com/$0',
      enabled: true,
    })

    store.getState().reset()

    expect(store.getState().linksEnabled).toBe(true)
    expect(store.getState().linkActivation).toBe('modifier-click')
    expect(store.getState().linkCustomPatterns).toEqual([])
  })
})
