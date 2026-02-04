/**
 * TAD Scratch Test: UI Store with Partial Persist
 *
 * Exploring: UI store that persists only some fields (sidebarCollapsed, sidebarPinned)
 * while keeping others transient (activeSessionId, settingsPanelOpen)
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FakeStorage } from '../../../test/fakeStorage'

interface UIStore {
  // Transient (not persisted)
  activeSessionId: string | null
  settingsPanelOpen: boolean

  // Persisted
  sidebarCollapsed: boolean
  sidebarPinned: boolean

  // Actions
  setActiveSession: (id: string | null) => void
  toggleSidebar: () => void
  toggleSidebarPin: () => void
  openSettingsPanel: () => void
  closeSettingsPanel: () => void
}

describe('scratch: ui store partial persist', () => {
  const createUIStore = (storage: FakeStorage) =>
    create<UIStore>()(
      persist(
        (set) => ({
          activeSessionId: null,
          settingsPanelOpen: false,
          sidebarCollapsed: false,
          sidebarPinned: false,
          setActiveSession: (id) => set({ activeSessionId: id }),
          toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
          toggleSidebarPin: () => set((s) => ({ sidebarPinned: !s.sidebarPinned })),
          openSettingsPanel: () => set({ settingsPanelOpen: true }),
          closeSettingsPanel: () => set({ settingsPanelOpen: false }),
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

  it('should not persist activeSessionId', async () => {
    const storage = new FakeStorage()
    const useUI = createUIStore(storage)

    useUI.getState().setActiveSession('session-abc')
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { activeSessionId?: string; sidebarCollapsed: boolean }
    }>('trex-ui')

    expect(stored?.state.activeSessionId).toBeUndefined()
    expect(useUI.getState().activeSessionId).toBe('session-abc') // Still in memory
  })

  it('should not persist settingsPanelOpen', async () => {
    const storage = new FakeStorage()
    const useUI = createUIStore(storage)

    useUI.getState().openSettingsPanel()
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { settingsPanelOpen?: boolean }
    }>('trex-ui')

    expect(stored?.state.settingsPanelOpen).toBeUndefined()
    expect(useUI.getState().settingsPanelOpen).toBe(true) // Still in memory
  })

  it('should persist sidebarCollapsed', async () => {
    const storage = new FakeStorage()
    const useUI = createUIStore(storage)

    useUI.getState().toggleSidebar()
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { sidebarCollapsed: boolean }
    }>('trex-ui')

    expect(stored?.state.sidebarCollapsed).toBe(true)
  })

  it('should persist sidebarPinned', async () => {
    const storage = new FakeStorage()
    const useUI = createUIStore(storage)

    useUI.getState().toggleSidebarPin()
    await new Promise((r) => setTimeout(r, 0))

    const stored = storage.getItemParsed<{
      state: { sidebarPinned: boolean }
    }>('trex-ui')

    expect(stored?.state.sidebarPinned).toBe(true)
  })

  it('should restore only persisted fields from storage', async () => {
    const storage = new FakeStorage()

    // Pre-populate with persisted fields only
    storage.setItem(
      'trex-ui',
      JSON.stringify({
        state: { sidebarCollapsed: true, sidebarPinned: true },
        version: 0,
      })
    )

    const useUI = createUIStore(storage)
    await new Promise((r) => setTimeout(r, 0))

    // Persisted fields restored
    expect(useUI.getState().sidebarCollapsed).toBe(true)
    expect(useUI.getState().sidebarPinned).toBe(true)

    // Transient fields have defaults
    expect(useUI.getState().activeSessionId).toBe(null)
    expect(useUI.getState().settingsPanelOpen).toBe(false)
  })
})
