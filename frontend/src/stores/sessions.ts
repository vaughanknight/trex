/**
 * Sessions Store - Manages terminal session state.
 *
 * This store is NOT persisted - session state is transient and
 * managed by the backend. On page refresh, sessions must be
 * re-fetched from the backend.
 *
 * Per High Finding 07: Uses selector pattern for isolation to prevent
 * cascading re-renders when updating individual sessions.
 */

import { create } from 'zustand'

export type SessionStatus = 'connecting' | 'active' | 'paused' | 'exited'

export interface Session {
  id: string
  name: string
  shellType: string
  status: SessionStatus
  createdAt: number
}

export interface SessionsState {
  sessions: Map<string, Session>
}

export interface SessionsActions {
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  updateStatus: (id: string, status: SessionStatus) => void
  updateName: (id: string, name: string) => void
  clearSessions: () => void
}

export type SessionsStore = SessionsState & SessionsActions

const initialState: SessionsState = {
  sessions: new Map(),
}

export const useSessionStore = create<SessionsStore>((set) => ({
  ...initialState,

  addSession: (session) =>
    set((state) => {
      const newMap = new Map(state.sessions)
      newMap.set(session.id, session)
      return { sessions: newMap }
    }),

  removeSession: (id) =>
    set((state) => {
      const newMap = new Map(state.sessions)
      newMap.delete(id)
      return { sessions: newMap }
    }),

  updateStatus: (id, status) =>
    set((state) => {
      const session = state.sessions.get(id)
      if (!session) return state
      const newMap = new Map(state.sessions)
      newMap.set(id, { ...session, status })
      return { sessions: newMap }
    }),

  updateName: (id, name) =>
    set((state) => {
      const session = state.sessions.get(id)
      if (!session) return state
      const newMap = new Map(state.sessions)
      newMap.set(id, { ...session, name })
      return { sessions: newMap }
    }),

  clearSessions: () => set({ sessions: new Map() }),
}))

// Selectors for fine-grained subscriptions

/** Select a single session by ID */
export const selectSession = (id: string) => (state: SessionsStore) =>
  state.sessions.get(id)

/** Select all sessions as an array (sorted by createdAt) */
export const selectSessionList = (state: SessionsStore) =>
  Array.from(state.sessions.values()).sort((a, b) => a.createdAt - b.createdAt)

/** Select count of sessions */
export const selectSessionCount = (state: SessionsStore) => state.sessions.size

/** Select count of active sessions */
export const selectActiveSessionCount = (state: SessionsStore) => {
  let count = 0
  for (const session of state.sessions.values()) {
    if (session.status === 'active') count++
  }
  return count
}

/** Select session IDs as array */
export const selectSessionIds = (state: SessionsStore) =>
  Array.from(state.sessions.keys())

/** Check if a session exists */
export const selectHasSession = (id: string) => (state: SessionsStore) =>
  state.sessions.has(id)
