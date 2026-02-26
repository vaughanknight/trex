/**
 * URL Sync Hook Test Harness
 *
 * Provides test infrastructure for future expansion of URL sync tests.
 * v1 includes only the settings defaults test; the harness factory
 * function is the main deliverable for future inflation scenarios.
 *
 * Per Plan 009: URL Routing (T008)
 */

import { describe, it, expect } from 'vitest'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FakeStorage } from '@/test/fakeStorage'
import type { SettingsState, SettingsActions, TerminalTheme, LayoutIconStyle } from '@/stores/settings'
import type { IdleThresholds } from '@/utils/idleState'
import { DEFAULT_THRESHOLDS } from '@/utils/idleState'

/**
 * Test factory for URL sync scenarios.
 *
 * Creates an isolated test environment with:
 * - FakeStorage for settings persistence
 * - Real Zustand settings store instance
 *
 * Future expansion will add:
 * - Fake window.location and window.history
 * - Real session store instance
 * - Helper to set URL params before test
 * - WebSocket mock for session creation
 */
function createURLSyncTestEnv(options?: {
  initialUrl?: string
  settings?: Partial<SettingsState>
}) {
  const storage = new FakeStorage()

  // Pre-populate settings if provided
  if (options?.settings) {
    storage.setItem(
      'trex-settings',
      JSON.stringify({
        state: options.settings,
        version: 0,
      })
    )
  }

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

  const useSettings = create<SettingsState & SettingsActions>()(
    persist(
      (set) => ({
        ...defaultSettings,
        setTheme: (theme: TerminalTheme) => set({ theme }),
        setFontSize: (fontSize: number) => set({ fontSize }),
        setFontFamily: (fontFamily: string) => set({ fontFamily }),
        setAutoOpenTerminal: (autoOpenTerminal: boolean) => set({ autoOpenTerminal }),
        setIdleThresholds: (thresholds: IdleThresholds) => set({ idleThresholds: thresholds }),
        setIdleIndicatorsEnabled: (enabled: boolean) => set({ idleIndicatorsEnabled: enabled }),
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
      }
    )
  )

  const cleanup = () => {
    storage.clear()
  }

  return { useSettings, storage, cleanup }
}

describe('URL Sync Test Harness', () => {
  it('settings store defaults: urlConfirmAlways === false, urlConfirmThreshold === 5', () => {
    const { useSettings, cleanup } = createURLSyncTestEnv()

    expect(useSettings.getState().urlConfirmAlways).toBe(false)
    expect(useSettings.getState().urlConfirmThreshold).toBe(5)

    cleanup()
  })

  it('test env factory creates isolated store', () => {
    const env1 = createURLSyncTestEnv()
    const env2 = createURLSyncTestEnv()

    env1.useSettings.getState().setUrlConfirmAlways(true)

    // env2 should be unaffected
    expect(env2.useSettings.getState().urlConfirmAlways).toBe(false)

    env1.cleanup()
    env2.cleanup()
  })

  it('test env respects initial settings', async () => {
    const { useSettings, cleanup } = createURLSyncTestEnv({
      settings: { urlConfirmAlways: true, urlConfirmThreshold: 10 },
    })

    await new Promise((r) => setTimeout(r, 0)) // Wait for hydration

    expect(useSettings.getState().urlConfirmAlways).toBe(true)
    expect(useSettings.getState().urlConfirmThreshold).toBe(10)

    cleanup()
  })
})
