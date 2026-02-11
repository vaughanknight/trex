/**
 * Integration test for multi-session terminal workflow.
 *
 * Per Phase 5 T011: Tests create/switch/close workflow.
 * Uses Zustand stores directly since WebSocket is handled by backend.
 *
 * Test Doc:
 * - Why: Validates session management UI state transitions
 * - Contract: Sessions can be added, switched, and removed without data loss
 * - Usage: Store actions trigger correct state transitions
 * - Quality: Catches regressions in session state management
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore, type Session } from '@/stores/sessions'
import { useWorkspaceStore, selectActiveSessionId } from '@/stores/workspace'

/** Helper: add a session to the workspace and make it active */
function activateSession(sessionId: string): string {
  const ws = useWorkspaceStore.getState()
  const itemId = ws.addSessionItem(sessionId)
  ws.setActiveItem(itemId)
  return itemId
}

/** Helper: get the active session ID via the derived selector */
function getActiveSessionId(): string | null {
  return selectActiveSessionId(useWorkspaceStore.getState())
}

describe('Multi-Session Integration', () => {
  // Reset stores before each test
  beforeEach(() => {
    useSessionStore.getState().clearSessions()
    useWorkspaceStore.setState({ items: [], activeItemId: null })
  })

  const createMockSession = (id: string, name: string): Session => ({
    id,
    name,
    originalName: name,
    shellType: 'bash',
    status: 'active',
    createdAt: Date.now(),
    userRenamed: false,
  })

  describe('Given empty session list', () => {
    it('When adding first session Then it should be added to store', () => {
      const session = createMockSession('session-1', 'bash-1')

      useSessionStore.getState().addSession(session)

      expect(useSessionStore.getState().sessions.size).toBe(1)
      expect(useSessionStore.getState().sessions.get('session-1')).toEqual(session)
    })

    it('When adding first session Then it can be set as active', () => {
      const session = createMockSession('session-1', 'bash-1')

      useSessionStore.getState().addSession(session)
      activateSession('session-1')

      expect(getActiveSessionId()).toBe('session-1')
    })
  })

  describe('Given multiple sessions', () => {
    // Track workspace item IDs so we can switch between them
    const itemIds: Record<string, string> = {}

    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        const sid = `session-${i}`
        const names = ['bash-1', 'zsh-1', 'bash-2', 'zsh-2', 'fish-1']
        useSessionStore.getState().addSession(createMockSession(sid, names[i - 1]))
        itemIds[sid] = useWorkspaceStore.getState().addSessionItem(sid)
      }
      useWorkspaceStore.getState().setActiveItem(itemIds['session-1'])
    })

    it('When switching sessions Then active session updates', () => {
      useWorkspaceStore.getState().setActiveItem(itemIds['session-3'])

      expect(getActiveSessionId()).toBe('session-3')
    })

    it('When closing active session Then active auto-selects next', () => {
      useSessionStore.getState().removeSession('session-1')
      // Workspace removeItem auto-selects next item
      useWorkspaceStore.getState().removeItem(itemIds['session-1'])

      // removeItem auto-selects a neighbor, so active should not be null
      // (there are still 4 items)
      expect(getActiveSessionId()).not.toBeNull()
      expect(useSessionStore.getState().sessions.size).toBe(4)
    })

    it('When closing non-active session Then active is preserved', () => {
      useSessionStore.getState().removeSession('session-3')
      useWorkspaceStore.getState().removeItem(itemIds['session-3'])

      expect(getActiveSessionId()).toBe('session-1')
      expect(useSessionStore.getState().sessions.size).toBe(4)
    })

    it('When creating 5+ sessions Then all are tracked', () => {
      expect(useSessionStore.getState().sessions.size).toBe(5)

      // Add more sessions
      useSessionStore.getState().addSession(createMockSession('session-6', 'bash-3'))
      useSessionStore.getState().addSession(createMockSession('session-7', 'zsh-3'))

      expect(useSessionStore.getState().sessions.size).toBe(7)
    })

    it('When switching rapidly Then state remains consistent', () => {
      // Simulate rapid switching
      for (let i = 1; i <= 5; i++) {
        useWorkspaceStore.getState().setActiveItem(itemIds[`session-${i}`])
      }
      for (let i = 5; i >= 1; i--) {
        useWorkspaceStore.getState().setActiveItem(itemIds[`session-${i}`])
      }

      // State should be consistent
      expect(getActiveSessionId()).toBe('session-1')
      expect(useSessionStore.getState().sessions.size).toBe(5)
    })
  })

  describe('Given workflow: create → switch → close', () => {
    it('When executing full workflow Then state transitions correctly', () => {
      // 1. Create first session
      const session1 = createMockSession('ws-1', 'bash-1')
      useSessionStore.getState().addSession(session1)
      const item1 = activateSession('ws-1')
      expect(getActiveSessionId()).toBe('ws-1')

      // 2. Create second session
      const session2 = createMockSession('ws-2', 'zsh-1')
      useSessionStore.getState().addSession(session2)
      const item2 = activateSession('ws-2')
      expect(getActiveSessionId()).toBe('ws-2')

      // 3. Switch back to first
      useWorkspaceStore.getState().setActiveItem(item1)
      expect(getActiveSessionId()).toBe('ws-1')

      // 4. Close second session (non-active)
      useSessionStore.getState().removeSession('ws-2')
      useWorkspaceStore.getState().removeItem(item2)
      expect(useSessionStore.getState().sessions.size).toBe(1)
      expect(getActiveSessionId()).toBe('ws-1')

      // 5. Close first session (active)
      useSessionStore.getState().removeSession('ws-1')
      useWorkspaceStore.getState().removeItem(item1)
      expect(useSessionStore.getState().sessions.size).toBe(0)
      expect(getActiveSessionId()).toBeNull()
    })
  })

  describe('Given session status updates', () => {
    beforeEach(() => {
      useSessionStore.getState().addSession(createMockSession('session-1', 'bash-1'))
    })

    it('When updating status Then session reflects change', () => {
      useSessionStore.getState().updateStatus('session-1', 'paused')

      const session = useSessionStore.getState().sessions.get('session-1')
      expect(session?.status).toBe('paused')
    })

    it('When renaming session Then name updates', () => {
      useSessionStore.getState().updateName('session-1', 'my-terminal')

      const session = useSessionStore.getState().sessions.get('session-1')
      expect(session?.name).toBe('my-terminal')
    })
  })
})
