/**
 * pluginStore.ts — Factory for creating isolated Zustand stores per plugin.
 *
 * Each plugin gets its own store to prevent cross-plugin re-render storms.
 * Follows the activityStore isolation pattern.
 *
 * @see /docs/plans/025-visualisation-plugins/visualisation-plugins-plan.md
 */

import { create } from 'zustand'
import type { PluginDataState } from './pluginRegistry'

/**
 * Create an isolated Zustand store for a plugin.
 * The store manages per-session plugin data via a Map.
 */
export function createPluginStore() {
  return create<PluginDataState>((set) => ({
    data: new Map(),

    updateData: (sessionId, newData) =>
      set((state) => {
        const newMap = new Map(state.data)
        newMap.set(sessionId, newData)
        return { data: newMap }
      }),

    clearData: (sessionId) =>
      set((state) => {
        const newMap = new Map(state.data)
        newMap.delete(sessionId)
        return { data: newMap }
      }),

    clearAll: () => set({ data: new Map() }),
  }))
}

/** Selector factory: get plugin data for a specific session */
export const selectPluginData = (sessionId: string) =>
  (state: PluginDataState) => state.data.get(sessionId)
