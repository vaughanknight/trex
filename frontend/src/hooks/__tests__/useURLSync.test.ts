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
import type { SettingsState, SettingsActions, TerminalTheme } from '@/stores/settings'
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
