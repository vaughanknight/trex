/**
 * UI Store - Manages UI state for the application.
 *
 * Persists: sidebarCollapsed, sidebarPinned
 * Transient (not persisted): activeSessionId, settingsPanelOpen
 *
 * Per Insight 6 decision: Use partialize to persist only layout preferences,
 * not runtime session state.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface UIState {
  // Transient (not persisted)
  activeSessionId: string | null
  settingsPanelOpen: boolean

  // Persisted
  sidebarCollapsed: boolean
  sidebarPinned: boolean
}

export interface UIActions {
  setActiveSession: (id: string | null) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebarPin: () => void
  setSidebarPinned: (pinned: boolean) => void
  openSettingsPanel: () => void
  closeSettingsPanel: () => void
  toggleSettingsPanel: () => void
}

export type UIStore = UIState & UIActions

const initialState: UIState = {
  activeSessionId: null,
  settingsPanelOpen: false,
  sidebarCollapsed: false,
  sidebarPinned: true,
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      ...initialState,

      setActiveSession: (id) => set({ activeSessionId: id }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      toggleSidebarPin: () =>
        set((state) => ({ sidebarPinned: !state.sidebarPinned })),

      setSidebarPinned: (pinned) => set({ sidebarPinned: pinned }),

      openSettingsPanel: () => set({ settingsPanelOpen: true }),

      closeSettingsPanel: () => set({ settingsPanelOpen: false }),

      toggleSettingsPanel: () =>
        set((state) => ({ settingsPanelOpen: !state.settingsPanelOpen })),
    }),
    {
      name: 'trex-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarPinned: state.sidebarPinned,
      }),
    }
  )
)

// Selectors for fine-grained subscriptions
export const selectActiveSessionId = (state: UIStore) => state.activeSessionId
export const selectSidebarCollapsed = (state: UIStore) => state.sidebarCollapsed
export const selectSidebarPinned = (state: UIStore) => state.sidebarPinned
export const selectSettingsPanelOpen = (state: UIStore) => state.settingsPanelOpen
