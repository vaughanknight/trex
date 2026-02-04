/**
 * TAD Scratch: UI Store sidebar state
 * Exploring: How to connect sidebar components to useUIStore
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useUIStore, selectSidebarCollapsed, selectSidebarPinned } from '@/stores/ui'

// Component that displays and toggles sidebar collapsed state
function SidebarToggle() {
  const collapsed = useUIStore(selectSidebarCollapsed)
  const toggleSidebar = useUIStore(state => state.toggleSidebar)

  return (
    <button
      data-testid="toggle"
      onClick={toggleSidebar}
    >
      {collapsed ? 'Expand' : 'Collapse'}
    </button>
  )
}

// Component that displays and toggles pinned state
function SidebarPin() {
  const pinned = useUIStore(selectSidebarPinned)
  const togglePin = useUIStore(state => state.toggleSidebarPin)

  return (
    <button
      data-testid="pin"
      onClick={togglePin}
    >
      {pinned ? 'Unpin' : 'Pin'}
    </button>
  )
}

describe('UI Store sidebar state', () => {
  beforeEach(() => {
    // Reset to initial state
    useUIStore.setState({
      sidebarCollapsed: false,
      sidebarPinned: false,
    })
  })

  it('displays Collapse when sidebar is expanded', () => {
    render(<SidebarToggle />)
    expect(screen.getByTestId('toggle')).toHaveTextContent('Collapse')
  })

  it('displays Expand after clicking toggle', () => {
    render(<SidebarToggle />)
    fireEvent.click(screen.getByTestId('toggle'))
    expect(screen.getByTestId('toggle')).toHaveTextContent('Expand')
  })

  it('displays Pin when sidebar is not pinned', () => {
    render(<SidebarPin />)
    expect(screen.getByTestId('pin')).toHaveTextContent('Pin')
  })

  it('displays Unpin after clicking pin', () => {
    render(<SidebarPin />)
    fireEvent.click(screen.getByTestId('pin'))
    expect(screen.getByTestId('pin')).toHaveTextContent('Unpin')
  })
})
