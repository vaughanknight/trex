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
        // Mark as user-renamed to prevent automatic title updates
        newMap.set(id, { ...session, name, userRenamed: true })
        return { sessions: newMap }
      }),

    updateTitleFromTerminal: (id: string, title: string) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session) return state
        // Respect user's manual rename
        if (session.userRenamed) return state
        const newMap = new Map(state.sessions)
        // Handle empty title as reset to shellType
        if (!title.trim()) {
          newMap.set(id, { ...session, name: session.shellType })
          return { sessions: newMap }
        }
        newMap.set(id, { ...session, name: title })
        return { sessions: newMap }
      }),

    updateTmuxSessionName: (id: string, name: string | null) =>
      set((state) => {
        const session = state.sessions.get(id)
        if (!session) return state
        const newMap = new Map(state.sessions)
        if (name) {
          const updated = { ...session, tmuxSessionName: name }
          if (!session.userRenamed) updated.name = name
          newMap.set(id, updated)
        } else {
          const updated = { ...session, tmuxSessionName: undefined }
          if (!session.userRenamed && session.originalName) updated.name = session.originalName
          newMap.set(id, updated)
        }
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
      userRenamed: false,
    })

    const session = useSessions.getState().sessions.get('s1')
    expect(session?.name).toBe('bash-1')
    expect(session?.shellType).toBe('bash')
    expect(session?.status).toBe('connecting')
    expect(session?.userRenamed).toBe(false)
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
      userRenamed: false,
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
      userRenamed: false,
    })
    useSessions.getState().addSession({
      id: 's2',
      name: 'zsh-1',
      shellType: 'zsh',
      status: 'active',
      createdAt: now + 100,
      userRenamed: false,
    })
    useSessions.getState().addSession({
      id: 's3',
      name: 'fish-1',
      shellType: 'fish',
      status: 'connecting',
      createdAt: now + 200,
      userRenamed: false,
    })

    expect(useSessions.getState().sessions.size).toBe(3)

    // Update one, others unaffected
    useSessions.getState().updateStatus('s2', 'exited')
    expect(useSessions.getState().sessions.get('s1')?.status).toBe('active')
    expect(useSessions.getState().sessions.get('s2')?.status).toBe('exited')
    expect(useSessions.getState().sessions.get('s3')?.status).toBe('connecting')
  })

  /**
   * Test: Terminal title updates should respect userRenamed flag
   *
   * Behavior: updateTitleFromTerminal updates name only if userRenamed is false
   * Fixture: Session with userRenamed=false, then manually renamed
   * Assertion: Title update works before rename, blocked after
   *
   * Validates: AC-03 - user rename takes precedence over automatic title
   */
  it('should allow title updates when userRenamed is false', () => {
    const useSessions = createTestSessionStore()

    useSessions.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'active',
      createdAt: Date.now(),
      userRenamed: false,
    })

    // Terminal title update should work
    useSessions.getState().updateTitleFromTerminal('s1', 'vim ~/.bashrc')
    expect(useSessions.getState().sessions.get('s1')?.name).toBe('vim ~/.bashrc')
    expect(useSessions.getState().sessions.get('s1')?.userRenamed).toBe(false)
  })

  /**
   * Test: User rename should block subsequent terminal title updates
   *
   * Behavior: After updateName, updateTitleFromTerminal is ignored
   * Fixture: Session renamed by user
   * Assertion: Terminal title update has no effect
   *
   * Validates: AC-03 - user rename takes precedence
   */
  it('should block title updates when userRenamed is true', () => {
    const useSessions = createTestSessionStore()

    useSessions.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'active',
      createdAt: Date.now(),
      userRenamed: false,
    })

    // User manually renames the session
    useSessions.getState().updateName('s1', 'Work')
    expect(useSessions.getState().sessions.get('s1')?.name).toBe('Work')
    expect(useSessions.getState().sessions.get('s1')?.userRenamed).toBe(true)

    // Terminal title update should be blocked
    useSessions.getState().updateTitleFromTerminal('s1', 'vim ~/.bashrc')
    expect(useSessions.getState().sessions.get('s1')?.name).toBe('Work') // unchanged
  })

  /**
   * Test: Empty title should reset to shellType pattern
   *
   * Behavior: Empty OSC title resets name to shellType
   * Fixture: Session with custom terminal title
   * Assertion: Empty title resets to shellType
   *
   * Validates: AC-05 - empty title reset behavior
   */
  it('should reset to shellType when terminal sends empty title', () => {
    const useSessions = createTestSessionStore()

    useSessions.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'active',
      createdAt: Date.now(),
      userRenamed: false,
    })

    // Terminal sets a title
    useSessions.getState().updateTitleFromTerminal('s1', 'vim file.txt')
    expect(useSessions.getState().sessions.get('s1')?.name).toBe('vim file.txt')

    // Terminal sends empty title (reset)
    useSessions.getState().updateTitleFromTerminal('s1', '')
    expect(useSessions.getState().sessions.get('s1')?.name).toBe('bash') // reset to shellType
  })
})
