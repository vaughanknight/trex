/**
 * TAD Scratch Test: Zustand Partialize (Partial Persist)
 *
 * Exploring: How do we persist only some fields (not all)?
 * This is needed for useUIStore where we persist sidebarCollapsed but not activeSessionId
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FakeStorage } from '../../../test/fakeStorage'

describe('scratch: zustand partialize', () => {
  it('should persist only selected fields', async () => {
    const storage = new FakeStorage()

    interface UIStore {
      activeSessionId: string | null // NOT persisted
      sidebarCollapsed: boolean // Persisted
      settingsPanelOpen: boolean // NOT persisted
      setActiveSession: (id: string | null) => void
      toggleSidebar: () => void
    }

    const useUI = create<UIStore>()(
      persist(
        (set) => ({
          activeSessionId: null,
          sidebarCollapsed: false,
          settingsPanelOpen: false,
          setActiveSession: (id) => set({ activeSessionId: id }),
          toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
        }),
        {
          name: 'test-ui',
          storage: createJSONStorage(() => storage),
          partialize: (state) => ({
            sidebarCollapsed: state.sidebarCollapsed,
          }),
        }
      )
    )

    // Set values
    useUI.getState().setActiveSession('session-123')
    useUI.getState().toggleSidebar()

    await new Promise((r) => setTimeout(r, 0))

    // Check storage - should only have sidebarCollapsed
    const stored = storage.getItemParsed<{
      state: { sidebarCollapsed?: boolean; activeSessionId?: string }
    }>('test-ui')

    expect(stored?.state.sidebarCollapsed).toBe(true)
    expect(stored?.state.activeSessionId).toBeUndefined() // NOT persisted
  })

  it('should restore only partialized fields', async () => {
    const storage = new FakeStorage()

    // Pre-populate with partial state
    storage.setItem(
      'test-ui',
      JSON.stringify({ state: { sidebarCollapsed: true }, version: 0 })
    )

    interface UIStoreLocal {
      activeSessionId: string | null
      sidebarCollapsed: boolean
    }

    const useUI = create<UIStoreLocal>()(
      persist(
        (): UIStoreLocal => ({
          activeSessionId: null,
          sidebarCollapsed: false,
        }),
        {
          name: 'test-ui',
          storage: createJSONStorage(() => storage),
          partialize: (state) => ({
            sidebarCollapsed: state.sidebarCollapsed,
          }),
        }
      )
    )

    await new Promise((r) => setTimeout(r, 0))

    expect(useUI.getState().sidebarCollapsed).toBe(true) // restored
    expect(useUI.getState().activeSessionId).toBe(null) // default (not in storage)
  })

  it('should persist multiple fields with partialize', async () => {
    const storage = new FakeStorage()

    interface UIStoreMulti {
      transientValue: number
      persistedA: string
      persistedB: boolean
    }

    const useUI = create<UIStoreMulti>()(
      persist(
        (): UIStoreMulti => ({
          transientValue: 0,
          persistedA: 'initial',
          persistedB: false,
        }),
        {
          name: 'test-ui',
          storage: createJSONStorage(() => storage),
          partialize: (state) => ({
            persistedA: state.persistedA,
            persistedB: state.persistedB,
          }),
        }
      )
    )

    useUI.setState({ transientValue: 42, persistedA: 'changed', persistedB: true })

    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{ state: Record<string, unknown> }>('test-ui')
    expect(stored?.state.persistedA).toBe('changed')
    expect(stored?.state.persistedB).toBe(true)
    expect(stored?.state.transientValue).toBeUndefined()
  })
})
