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
 * - Includes Settings button for settings panel
 * - Includes Toggle button for explicit expand/collapse
 *
 * Usage Notes:
 * - SidebarProvider must wrap SessionSidebar for context
 * - Uses variant="floating" and collapsible="icon" for overlay behavior
 * - NewSessionButton requires WebSocket backend (Phase 5)
 *
 * Quality Contribution:
 * - Verifies component structure before App.tsx integration
 * - Catches regressions in sidebar composition
 *
 * Worked Example:
 * - Input: Empty session store
 * - Output: Sidebar with "New Session", "Collapse", "Settings" buttons and empty state
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
    useUIStore.setState({ activeSessionId: null, sidebarCollapsed: false })
  })

  it('renders within SidebarProvider', () => {
    render(
      <SidebarProvider>
        <SessionSidebar />
      </SidebarProvider>
    )

    expect(screen.getByText('New Session')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Collapse')).toBeInTheDocument()
  })

  it('shows empty state message when no sessions', () => {
    render(
      <SidebarProvider>
        <SessionSidebar />
      </SidebarProvider>
    )

    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument()
  })

  it('NewSessionButton is rendered and clickable', () => {
    // Note: Session creation now requires WebSocket backend (Phase 5).
    // This test verifies the button is present and clickable.
    // Full session creation is tested via integration/multi-session.test.tsx
    // which tests the store interactions directly.
    render(
      <SidebarProvider>
        <SessionSidebar />
      </SidebarProvider>
    )

    const button = screen.getByText('New Session')
    expect(button).toBeInTheDocument()

    // Click should not throw (WebSocket will fail silently in test env)
    expect(() => fireEvent.click(button)).not.toThrow()
  })

  it('toggles sidebar collapsed state when Toggle button is clicked', () => {
    render(
      <SidebarProvider>
        <SessionSidebar />
      </SidebarProvider>
    )

    // Initial state: expanded (collapsed = false)
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    expect(screen.getByText('Collapse')).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(screen.getByText('Collapse'))
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    expect(screen.getByText('Expand')).toBeInTheDocument()

    // Click to expand
    fireEvent.click(screen.getByText('Expand'))
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })
})
