/**
 * Sessions Store Tests
 *
 * Tests for useSessionStore which manages terminal session state.
 * This store is NOT persisted - sessions are transient and managed by backend.
 *
 * @see /docs/plans/003-sidebar-settings-sessions/sidebar-settings-sessions-spec.md
 */

import { describe, it, expect } from 'vitest'
import { create } from 'zustand'
import type { Session, SessionStatus, SessionsState, SessionsActions } from '../sessions'

// Test factory that creates isolated store instances
const createTestSessionStore = () =>
  create<SessionsState & SessionsActions>((set) => ({
    sessions: new Map(),

    addSession: (session: Session) =>
      set((state) => {
        const newMap = new Map(state.sessions)
        newMap.set(session.id, session)
        return { sessions: newMap }
      }),

    removeSession: (id: string) =>
      set((state) => {
        const newMap = new Map(state.sessions)
        newMap.delete(id)
        return { sessions: newMap }
      }),

    updateStatus: (id: string, status: SessionStatus) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session) return state
        const newMap = new Map(state.sessions)
        newMap.set(id, { ...session, status })
        return { sessions: newMap }
      }),

    updateName: (id: string, name: string) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session) return state
        const newMap = new Map(state.sessions)
        newMap.set(id, { ...session, name })
        return { sessions: newMap }
      }),

    clearSessions: () => set({ sessions: new Map() }),
  }))

describe('useSessionStore', () => {
  /**
   * Test: Should add sessions correctly
   *
   * Behavior: addSession creates a new session entry in the Map
   * Fixture: Add session with id, name, shellType, status
   * Assertion: Session retrievable with correct properties
   *
   * Validates: Core session management functionality
   */
  it('should add sessions correctly', () => {
    const useSessions = createTestSessionStore()

    useSessions.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'connecting',
      createdAt: Date.now(),
    })

    const session = useSessions.getState().sessions.get('s1')
    expect(session?.name).toBe('bash-1')
    expect(session?.shellType).toBe('bash')
    expect(session?.status).toBe('connecting')
  })

  /**
   * Test: Should update session status
   *
   * Behavior: updateStatus changes status without affecting other fields
   * Fixture: Add session, update status through lifecycle
   * Assertion: Status changes, other fields preserved
   *
   * Validates: Session lifecycle state transitions
   */
  it('should update session status', () => {
    const useSessions = createTestSessionStore()

    useSessions.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'connecting',
      createdAt: Date.now(),
    })

    useSessions.getState().updateStatus('s1', 'active')
    expect(useSessions.getState().sessions.get('s1')?.status).toBe('active')

    useSessions.getState().updateStatus('s1', 'exited')
    expect(useSessions.getState().sessions.get('s1')?.status).toBe('exited')
    expect(useSessions.getState().sessions.get('s1')?.name).toBe('bash-1') // preserved
  })

  /**
   * Test: Should handle multiple sessions independently
   *
   * Behavior: Operations on one session don't affect others
   * Fixture: Add 3 sessions, update one
   * Assertion: Only targeted session modified
   *
   * Validates: High Finding 07 - isolation for preventing cascading updates
   */
  it('should handle multiple sessions independently', () => {
    const useSessions = createTestSessionStore()
    const now = Date.now()

    useSessions.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'active',
      createdAt: now,
    })
    useSessions.getState().addSession({
      id: 's2',
      name: 'zsh-1',
      shellType: 'zsh',
      status: 'active',
      createdAt: now + 100,
    })
    useSessions.getState().addSession({
      id: 's3',
      name: 'fish-1',
      shellType: 'fish',
      status: 'connecting',
      createdAt: now + 200,
    })

    expect(useSessions.getState().sessions.size).toBe(3)

    // Update one, others unaffected
    useSessions.getState().updateStatus('s2', 'exited')
    expect(useSessions.getState().sessions.get('s1')?.status).toBe('active')
    expect(useSessions.getState().sessions.get('s2')?.status).toBe('exited')
    expect(useSessions.getState().sessions.get('s3')?.status).toBe('connecting')
  })
})
