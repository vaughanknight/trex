/**
 * SessionList Component Tests
 *
 * @test-doc
 * Why: Session list is the primary navigation for multi-session terminal management.
 *      These tests verify the core contract between the component and Zustand store.
 *
 * Contract:
 * - SessionList renders all sessions from useSessionStore
 * - Sessions are sorted by createdAt (oldest first)
 * - Clicking a session sets it as activeSessionId in useUIStore
 * - Empty state shows helpful message when no sessions exist
 *
 * Usage Notes:
 * - Must wrap with SidebarProvider for shadcn sidebar context
 * - Uses useShallow to prevent infinite re-renders when mapping sessions
 *
 * Quality Contribution:
 * - Catches regressions in store-to-component wiring
 * - Validates the useShallow pattern for Zustand array selectors
 * - See High Finding 07 in plan for performance context
 *
 * Worked Example:
 * - Input: 2 sessions in store with createdAt 1000 and 2000
 * - Output: 2 SessionItems rendered, first has createdAt 1000
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useSessionStore } from '@/stores/sessions'
import { useUIStore } from '@/stores/ui'
import { SessionList } from '@/components/SessionList'

describe('SessionList', () => {
  beforeEach(() => {
    useSessionStore.getState().clearSessions()
    useUIStore.setState({ activeSessionId: null })
  })

  describe('given no sessions', () => {
    it('renders empty state message', () => {
      render(
        <SidebarProvider>
          <SessionList />
        </SidebarProvider>
      )

      expect(screen.getByText(/No sessions yet/)).toBeInTheDocument()
      expect(screen.getByText(/Click "New Session" to start/)).toBeInTheDocument()
    })
  })

  describe('given sessions in store', () => {
    it('renders all sessions from store', () => {
      useSessionStore.getState().addSession({
        id: 's1',
        name: 'bash-1',
        shellType: 'bash',
        status: 'active',
        createdAt: Date.now(),
      })

      render(
        <SidebarProvider>
          <SessionList />
        </SidebarProvider>
      )

      expect(screen.getByText('bash-1')).toBeInTheDocument()
      expect(screen.getByText('Sessions (1)')).toBeInTheDocument()
    })

    it('sorts sessions by createdAt (oldest first)', () => {
      const store = useSessionStore.getState()
      store.addSession({
        id: 's2',
        name: 'zsh-later',
        shellType: 'zsh',
        status: 'active',
        createdAt: 2000,
      })
      store.addSession({
        id: 's1',
        name: 'bash-first',
        shellType: 'bash',
        status: 'active',
        createdAt: 1000,
      })

      render(
        <SidebarProvider>
          <SessionList />
        </SidebarProvider>
      )

      const items = screen.getAllByRole('listitem')
      expect(items[0]).toHaveTextContent('bash-first')
      expect(items[1]).toHaveTextContent('zsh-later')
    })

    it('sets activeSessionId when session is clicked', () => {
      useSessionStore.getState().addSession({
        id: 's1',
        name: 'bash-1',
        shellType: 'bash',
        status: 'active',
        createdAt: Date.now(),
      })

      render(
        <SidebarProvider>
          <SessionList />
        </SidebarProvider>
      )

      fireEvent.click(screen.getByText('bash-1'))
      expect(useUIStore.getState().activeSessionId).toBe('s1')
    })
  })
})
