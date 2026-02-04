/**
 * TAD Scratch Test: Zustand Selectors
 *
 * Exploring: How do selectors work for fine-grained re-renders?
 * This is critical for High Finding 07 (cascading re-renders)
 */

import { create } from 'zustand'

describe('scratch: zustand selectors', () => {
  interface SessionsStore {
    sessions: Map<string, { id: string; name: string; status: string }>
    addSession: (id: string, name: string) => void
    updateStatus: (id: string, status: string) => void
  }

  it('should allow selecting single session by id', () => {
    const useSessions = create<SessionsStore>((set) => ({
      sessions: new Map(),
      addSession: (id, name) =>
        set((state) => {
          const newMap = new Map(state.sessions)
          newMap.set(id, { id, name, status: 'active' })
          return { sessions: newMap }
        }),
      updateStatus: (id, status) =>
        set((state) => {
          const newMap = new Map(state.sessions)
          const session = newMap.get(id)
          if (session) {
            newMap.set(id, { ...session, status })
          }
          return { sessions: newMap }
        }),
    }))

    // Add sessions
    useSessions.getState().addSession('s1', 'bash-1')
    useSessions.getState().addSession('s2', 'zsh-1')

    // Selector pattern
    const selectSession = (id: string) => (state: SessionsStore) =>
      state.sessions.get(id)

    const s1 = selectSession('s1')(useSessions.getState())
    const s2 = selectSession('s2')(useSessions.getState())

    expect(s1?.name).toBe('bash-1')
    expect(s2?.name).toBe('zsh-1')
  })

  it('should demonstrate selector reference stability', () => {
    const useSessions = create<SessionsStore>((set) => ({
      sessions: new Map([
        ['s1', { id: 's1', name: 'bash-1', status: 'active' }],
        ['s2', { id: 's2', name: 'zsh-1', status: 'active' }],
      ]),
      addSession: () => {},
      updateStatus: (id, status) =>
        set((state) => {
          const newMap = new Map(state.sessions)
          const session = newMap.get(id)
          if (session) {
            newMap.set(id, { ...session, status })
          }
          return { sessions: newMap }
        }),
    }))

    // Get s1 before update
    const s1Before = useSessions.getState().sessions.get('s1')

    // Update s2 (should not affect s1 reference when using proper patterns)
    useSessions.getState().updateStatus('s2', 'exited')

    // This is the naive approach - sessions Map is new, so s1 lookup is different
    const s1After = useSessions.getState().sessions.get('s1')

    // Objects are equal by value but different references due to Map recreation
    expect(s1Before).toEqual(s1After)
    // Note: In React, this would cause re-render without proper selector memoization
  })

  it('should select derived values', () => {
    const useSessions = create<SessionsStore>(() => ({
      sessions: new Map([
        ['s1', { id: 's1', name: 'bash-1', status: 'active' }],
        ['s2', { id: 's2', name: 'zsh-1', status: 'exited' }],
        ['s3', { id: 's3', name: 'fish-1', status: 'active' }],
      ]),
      addSession: () => {},
      updateStatus: () => {},
    }))

    // Selector for active count
    const selectActiveCount = (state: SessionsStore) => {
      let count = 0
      for (const session of state.sessions.values()) {
        if (session.status === 'active') count++
      }
      return count
    }

    expect(selectActiveCount(useSessions.getState())).toBe(2)
  })

  it('should support selecting session list as array', () => {
    const useSessions = create<SessionsStore>(() => ({
      sessions: new Map([
        ['s1', { id: 's1', name: 'bash-1', status: 'active' }],
        ['s2', { id: 's2', name: 'zsh-1', status: 'active' }],
      ]),
      addSession: () => {},
      updateStatus: () => {},
    }))

    const selectSessionList = (state: SessionsStore) =>
      Array.from(state.sessions.values())

    const list = selectSessionList(useSessions.getState())
    expect(list).toHaveLength(2)
    expect(list.map((s) => s.name)).toEqual(['bash-1', 'zsh-1'])
  })
})
