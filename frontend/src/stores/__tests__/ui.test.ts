/**
 * UI Store Tests
 *
 * Tests for useUIStore which manages UI state with partial persistence.
 * sidebarCollapsed and sidebarPinned are persisted; activeSessionId
 * and settingsPanelOpen are transient.
 *
 * @see /docs/plans/003-sidebar-settings-sessions/sidebar-settings-sessions-spec.md
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FakeStorage } from '@/test/fakeStorage'
import type { UIState, UIActions } from '../ui'

// Test factory that creates isolated store instances with fake storage
const createTestUIStore = (storage: FakeStorage) =>
  create<UIState & UIActions>()(
    persist(
      (set) => ({
        activeSessionId: null,
        settingsPanelOpen: false,
        sidebarCollapsed: false,
        sidebarPinned: false,
        setActiveSession: (id) => set({ activeSessionId: id }),
        toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
        setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
        toggleSidebarPin: () => set((s) => ({ sidebarPinned: !s.sidebarPinned })),
        setSidebarPinned: (pinned) => set({ sidebarPinned: pinned }),
        openSettingsPanel: () => set({ settingsPanelOpen: true }),
        closeSettingsPanel: () => set({ settingsPanelOpen: false }),
        toggleSettingsPanel: () => set((s) => ({ settingsPanelOpen: !s.settingsPanelOpen })),
      }),
      {
        name: 'trex-ui',
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({
          sidebarCollapsed: state.sidebarCollapsed,
          sidebarPinned: state.sidebarPinned,
        }),
      }
    )
  )

describe('useUIStore', () => {
  let storage: FakeStorage

  beforeEach(() => {
    storage = new FakeStorage()
  })

  /**
   * Test: activeSessionId should NOT be persisted
   *
   * Behavior: activeSessionId is transient state, not written to storage
   * Fixture: Set activeSessionId, check storage
   * Assertion: Storage does not contain activeSessionId
   *
   * Validates: Insight 6 decision - partialize for layout preferences only
   */
  it('should NOT persist activeSessionId', async () => {
    const useUI = createTestUIStore(storage)

    useUI.getState().setActiveSession('session-123')
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { activeSessionId?: string; sidebarCollapsed?: boolean }
    }>('trex-ui')

    expect(stored?.state.activeSessionId).toBeUndefined()
    expect(useUI.getState().activeSessionId).toBe('session-123') // Still in memory
  })

  /**
   * Test: sidebarCollapsed should be persisted
   *
   * Behavior: sidebarCollapsed is a layout preference, written to storage
   * Fixture: Toggle sidebar, check storage
   * Assertion: Storage contains sidebarCollapsed value
   *
   * Validates: Insight 6 decision - persist layout preferences
   */
  it('should persist sidebarCollapsed', async () => {
    const useUI = createTestUIStore(storage)

    useUI.getState().toggleSidebar()
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { sidebarCollapsed: boolean }
    }>('trex-ui')

    expect(stored?.state.sidebarCollapsed).toBe(true)
  })

  /**
   * Test: UI state should restore only persisted fields
   *
   * Behavior: On hydration, only partialized fields are restored
   * Fixture: Pre-populated storage with layout preferences
   * Assertion: Persisted fields restored, transient fields have defaults
   *
   * Validates: Correct hydration behavior with partialize
   */
  it('should restore only persisted fields from storage', async () => {
    storage.setItem(
      'trex-ui',
      JSON.stringify({
        state: { sidebarCollapsed: true, sidebarPinned: true },
        version: 0,
      })
    )

    const useUI = createTestUIStore(storage)
    await new Promise((r) => setTimeout(r, 0))

    // Persisted fields restored
    expect(useUI.getState().sidebarCollapsed).toBe(true)
    expect(useUI.getState().sidebarPinned).toBe(true)

    // Transient fields have defaults
    expect(useUI.getState().activeSessionId).toBe(null)
    expect(useUI.getState().settingsPanelOpen).toBe(false)
  })
})
