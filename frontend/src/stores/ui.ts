/**
 * UI Store - Manages UI state for the application.
 *
 * Persists: sidebarCollapsed, sidebarPinned
 * Transient (not persisted): settingsPanelOpen
 *
 * Note: activeSessionId has been migrated to workspace store (Plan 016).
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface UIState {
  // Transient (not persisted)
  settingsPanelOpen: boolean

  // Persisted
  sidebarCollapsed: boolean
  sidebarPinned: boolean
}

export interface UIActions {
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
  settingsPanelOpen: false,
  sidebarCollapsed: false,
  sidebarPinned: true,
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      ...initialState,

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
export const selectSidebarCollapsed = (state: UIStore) => state.sidebarCollapsed
export const selectSidebarPinned = (state: UIStore) => state.sidebarPinned
export const selectSettingsPanelOpen = (state: UIStore) => state.settingsPanelOpen
