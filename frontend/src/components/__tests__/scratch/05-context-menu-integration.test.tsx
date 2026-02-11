/**
 * TAD Scratch: Context menu integration
 * Exploring: How ContextMenu works with session items
 *
 * Note: Full context menu behavior requires user interaction simulation
 * that's complex in jsdom. This tests the underlying action handlers.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useSessionStore } from '@/stores/sessions'
import { useWorkspaceStore, selectActiveSessionId } from '@/stores/workspace'

// Test the actions that context menu would trigger
describe('Context menu session actions', () => {
  beforeEach(() => {
    useSessionStore.getState().clearSessions()
    useWorkspaceStore.setState({ items: [], activeItemId: null })
  })

  describe('rename session action', () => {
    it('updates session name via store action', () => {
      const store = useSessionStore.getState()
      store.addSession({
        id: 's1',
        name: 'bash-1',
        shellType: 'bash',
        status: 'active',
        createdAt: Date.now(),
        userRenamed: false,
      })

      store.updateName('s1', 'my-terminal')

      const session = useSessionStore.getState().sessions.get('s1')
      expect(session?.name).toBe('my-terminal')
    })
  })

  describe('close session action', () => {
    it('removes session from store', () => {
      const store = useSessionStore.getState()
      store.addSession({
        id: 's1',
        name: 'bash-1',
        shellType: 'bash',
        status: 'active',
        createdAt: Date.now(),
        userRenamed: false,
      })

      expect(useSessionStore.getState().sessions.has('s1')).toBe(true)
      store.removeSession('s1')
      expect(useSessionStore.getState().sessions.has('s1')).toBe(false)
    })

    it('clears active session if closed session was active', () => {
      const sessionStore = useSessionStore.getState()
      sessionStore.addSession({
        id: 's1',
        name: 'bash-1',
        shellType: 'bash',
        status: 'active',
        createdAt: Date.now(),
        userRenamed: false,
      })

      const ws = useWorkspaceStore.getState()
      const itemId = ws.addSessionItem('s1')
      ws.setActiveItem(itemId)
      expect(selectActiveSessionId(useWorkspaceStore.getState())).toBe('s1')

      // In real implementation, closing session should clear active if it matches
      // This tests the pattern we'll use in SessionContextMenu
      const activeSessionId = selectActiveSessionId(useWorkspaceStore.getState())
      if (activeSessionId === 's1') {
        useWorkspaceStore.getState().removeItem(itemId)
      }
      sessionStore.removeSession('s1')

      expect(selectActiveSessionId(useWorkspaceStore.getState())).toBe(null)
    })
  })

  describe('status badge display', () => {
    it('can read session status for badge', () => {
      const store = useSessionStore.getState()
      store.addSession({
        id: 's1',
        name: 'bash-1',
        shellType: 'bash',
        status: 'active',
        createdAt: Date.now(),
        userRenamed: false,
      })

      const session = useSessionStore.getState().sessions.get('s1')
      expect(session?.status).toBe('active')

      store.updateStatus('s1', 'paused')
      const updated = useSessionStore.getState().sessions.get('s1')
      expect(updated?.status).toBe('paused')
    })
  })
})

// Component test: Session item with delete handler
function DeletableSessionItem({
  id,
  name,
  onDelete
}: {
  id: string
  name: string
  onDelete: (id: string) => void
}) {
  return (
    <div data-testid={`session-${id}`}>
      <span>{name}</span>
      <button
        data-testid={`delete-${id}`}
        onClick={() => onDelete(id)}
      >
        ×
      </button>
    </div>
  )
}

describe('Session item with delete callback', () => {
  it('calls onDelete with session id when delete clicked', () => {
    const handleDelete = vi.fn()
    render(<DeletableSessionItem id="s1" name="bash-1" onDelete={handleDelete} />)

    fireEvent.click(screen.getByTestId('delete-s1'))
    expect(handleDelete).toHaveBeenCalledWith('s1')
  })
})
