/**
 * SessionSidebar Component Tests
 *
 * @test-doc
 * Why: SessionSidebar is the main navigation shell that integrates multiple
 *      components and demonstrates proper SidebarProvider usage.
 *
 * Contract:
 * - SessionSidebar renders within SidebarProvider context
 * - Includes NewSessionButton for session creation
 * - Includes SessionList for session navigation
 * - Includes Settings button for future settings panel (Phase 4)
 * - Includes Pin button for hover/pin behavior
 *
 * Usage Notes:
 * - SidebarProvider must wrap SessionSidebar for context
 * - Uses variant="floating" and collapsible="icon" for overlay behavior
 *
 * Quality Contribution:
 * - Verifies component structure before App.tsx integration
 * - Catches regressions in sidebar composition
 *
 * Worked Example:
 * - Input: Empty session store
 * - Output: Sidebar with "New Session", "Pin", "Settings" buttons and empty state
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SessionSidebar } from '@/components/SessionSidebar'
import { useSessionStore } from '@/stores/sessions'
import { useUIStore } from '@/stores/ui'

describe('SessionSidebar', () => {
  beforeEach(() => {
    useSessionStore.getState().clearSessions()
    useUIStore.setState({ activeSessionId: null, sidebarPinned: false })
  })

  it('renders within SidebarProvider', () => {
    render(
      <SidebarProvider>
        <SessionSidebar />
      </SidebarProvider>
    )

    expect(screen.getByText('New Session')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Pin')).toBeInTheDocument()
  })

  it('shows empty state message when no sessions', () => {
    render(
      <SidebarProvider>
        <SessionSidebar />
      </SidebarProvider>
    )

    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument()
  })

  it('creates new session when NewSessionButton is clicked', () => {
    render(
      <SidebarProvider>
        <SessionSidebar />
      </SidebarProvider>
    )

    fireEvent.click(screen.getByText('New Session'))

    // Should have added a session and set it as active
    const sessions = useSessionStore.getState().sessions
    expect(sessions.size).toBe(1)

    const activeId = useUIStore.getState().activeSessionId
    expect(activeId).not.toBeNull()
    expect(sessions.has(activeId!)).toBe(true)
  })

  it('toggles pin state when Pin button is clicked', () => {
    render(
      <SidebarProvider>
        <SessionSidebar />
      </SidebarProvider>
    )

    expect(useUIStore.getState().sidebarPinned).toBe(false)

    fireEvent.click(screen.getByText('Pin'))
    expect(useUIStore.getState().sidebarPinned).toBe(true)
    expect(screen.getByText('Unpin')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Unpin'))
    expect(useUIStore.getState().sidebarPinned).toBe(false)
  })
})
