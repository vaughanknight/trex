/**
 * TAD Scratch: SessionList with sessions
 * Verifying SessionList renders sessions from store
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useSessionStore } from '@/stores/sessions'
import { useUIStore } from '@/stores/ui'
import { SessionList } from '@/components/SessionList'

describe('SessionList with sessions', () => {
  beforeEach(() => {
    useSessionStore.getState().clearSessions()
    useUIStore.setState({ activeSessionId: null })
  })

  it('renders session items from store', () => {
    useSessionStore.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'active',
      createdAt: Date.now(),
      userRenamed: false,
    })

    render(
      <SidebarProvider>
        <SessionList />
      </SidebarProvider>
    )

    expect(screen.getByText('bash-1')).toBeInTheDocument()
    expect(screen.getByText('Sessions (1)')).toBeInTheDocument()
  })

  it('renders multiple sessions sorted by createdAt', () => {
    const store = useSessionStore.getState()
    store.addSession({
      id: 's2',
      name: 'zsh-later',
      shellType: 'zsh',
      status: 'active',
      createdAt: 2000,
      userRenamed: false,
    })
    store.addSession({
      id: 's1',
      name: 'bash-first',
      shellType: 'bash',
      status: 'active',
      createdAt: 1000,
      userRenamed: false,
    })

    render(
      <SidebarProvider>
        <SessionList />
      </SidebarProvider>
    )

    const items = screen.getAllByRole('listitem')
    // First item should be bash-first (earlier createdAt)
    expect(items[0]).toHaveTextContent('bash-first')
    expect(items[1]).toHaveTextContent('zsh-later')
  })

  it('clicking session sets it as active', () => {
    useSessionStore.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'active',
      createdAt: Date.now(),
      userRenamed: false,
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
