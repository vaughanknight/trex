/**
 * Activity Store - Tracks session activity timestamps.
 *
 * This store is SEPARATE from the sessions store to prevent re-render storms
 * when timestamps update frequently (per Critical Finding 05).
 *
 * Activity timestamps are transient - not persisted to localStorage.
 * On page refresh, all activity tracking resets.
 *
 * Per Critical Finding 01: Use primitive selectors to prevent cascading re-renders.
 */

import { create } from 'zustand'

export interface ActivityState {
  /** Map of sessionId to last activity timestamp */
  lastActivityAt: Map<string, number>
}

export interface ActivityActions {
  /** Update activity timestamp for a session */
  updateActivity: (sessionId: string, timestamp: number) => void
  /** Remove activity tracking for a session (cleanup on close) */
  removeActivity: (sessionId: string) => void
  /** Clear all activity data (test isolation) */
  clearActivity: () => void
}

export type ActivityStore = ActivityState & ActivityActions

const initialState: ActivityState = {
  lastActivityAt: new Map(),
}

export const useActivityStore = create<ActivityStore>((set) => ({
  ...initialState,

  updateActivity: (sessionId, timestamp) =>
    set((state) => {
      const newMap = new Map(state.lastActivityAt)
      newMap.set(sessionId, timestamp)
      return { lastActivityAt: newMap }
    }),

  removeActivity: (sessionId) =>
    set((state) => {
      const newMap = new Map(state.lastActivityAt)
      newMap.delete(sessionId)
      return { lastActivityAt: newMap }
    }),

  clearActivity: () => set({ lastActivityAt: new Map() }),
}))

// ============================================================
// Selectors for fine-grained subscriptions
// ============================================================

/**
 * Select the last activity timestamp for a specific session.
 * Returns undefined if session has no recorded activity.
 *
 * Per Critical Finding 01: Returns primitive value (number | undefined)
 * to enable stable reference comparisons and prevent re-render storms.
 */
export const selectLastActivityAt = (sessionId: string) => (state: ActivityStore) =>
  state.lastActivityAt.get(sessionId)
