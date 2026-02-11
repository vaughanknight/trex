/**
 * TAD Scratch: SessionList with sessions
 * Verifying SessionList renders sessions from store
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useSessionStore } from '@/stores/sessions'
import { useWorkspaceStore, selectActiveSessionId } from '@/stores/workspace'
import { SessionList } from '@/components/SessionList'

describe('SessionList with sessions', () => {
  beforeEach(() => {
    useSessionStore.getState().clearSessions()
    useWorkspaceStore.setState({ items: [], activeItemId: null })
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
    // Add to workspace so it appears under "Workspace" section
    useWorkspaceStore.getState().addSessionItem('s1')

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
    // Add both to workspace in order
    useWorkspaceStore.getState().addSessionItem('s1')
    useWorkspaceStore.getState().addSessionItem('s2')

    render(
      <SidebarProvider>
        <SessionList />
      </SidebarProvider>
    )

    const items = screen.getAllByRole('listitem')
    // Workspace items are shown in workspace order (s1 added first, then s2)
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
    // Add to workspace so click handler can find the workspace item
    useWorkspaceStore.getState().addSessionItem('s1')

    render(
      <SidebarProvider>
        <SessionList />
      </SidebarProvider>
    )

    fireEvent.click(screen.getByText('bash-1'))
    expect(selectActiveSessionId(useWorkspaceStore.getState())).toBe('s1')
  })
})
