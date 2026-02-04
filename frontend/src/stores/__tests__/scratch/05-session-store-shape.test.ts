/**
 * TAD Scratch Test: Session Store Shape
 *
 * Exploring: What's the right shape for the sessions store?
 * Testing Map vs object, session lifecycle, etc.
 */

import { create } from 'zustand'

interface Session {
  id: string
  name: string
  shellType: string
  status: 'connecting' | 'active' | 'paused' | 'exited'
  createdAt: number
}

interface SessionsStore {
  sessions: Map<string, Session>
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  updateStatus: (id: string, status: Session['status']) => void
  updateName: (id: string, name: string) => void
  getSession: (id: string) => Session | undefined
}

describe('scratch: session store shape', () => {
  const createSessionsStore = () =>
    create<SessionsStore>((set, get) => ({
      sessions: new Map(),

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

      getSession: (id) => get().sessions.get(id),
    }))

  it('should add sessions correctly', () => {
    const useSessions = createSessionsStore()

    useSessions.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'connecting',
      createdAt: Date.now(),
    })

    const session = useSessions.getState().getSession('s1')
    expect(session?.name).toBe('bash-1')
    expect(session?.shellType).toBe('bash')
    expect(session?.status).toBe('connecting')
  })

  it('should update session status', () => {
    const useSessions = createSessionsStore()

    useSessions.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'connecting',
      createdAt: Date.now(),
    })

    useSessions.getState().updateStatus('s1', 'active')
    expect(useSessions.getState().getSession('s1')?.status).toBe('active')

    useSessions.getState().updateStatus('s1', 'exited')
    expect(useSessions.getState().getSession('s1')?.status).toBe('exited')
  })

  it('should rename sessions', () => {
    const useSessions = createSessionsStore()

    useSessions.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'active',
      createdAt: Date.now(),
    })

    useSessions.getState().updateName('s1', 'my-shell')
    expect(useSessions.getState().getSession('s1')?.name).toBe('my-shell')
  })

  it('should remove sessions', () => {
    const useSessions = createSessionsStore()

    useSessions.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'active',
      createdAt: Date.now(),
    })

    expect(useSessions.getState().sessions.size).toBe(1)

    useSessions.getState().removeSession('s1')
    expect(useSessions.getState().sessions.size).toBe(0)
    expect(useSessions.getState().getSession('s1')).toBeUndefined()
  })

  it('should handle multiple sessions', () => {
    const useSessions = createSessionsStore()
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
    expect(useSessions.getState().getSession('s1')?.status).toBe('active')
    expect(useSessions.getState().getSession('s2')?.status).toBe('exited')
    expect(useSessions.getState().getSession('s3')?.status).toBe('connecting')
  })
})
