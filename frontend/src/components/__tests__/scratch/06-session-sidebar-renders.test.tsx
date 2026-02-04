/**
 * TAD Scratch: SessionSidebar component renders
 * Verifying basic sidebar structure
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SessionSidebar } from '@/components/SessionSidebar'

describe('SessionSidebar', () => {
  it('renders within SidebarProvider', () => {
    render(
      <SidebarProvider>
        <SessionSidebar />
      </SidebarProvider>
    )
    // The sidebar should render with floating variant
    expect(screen.getByText('New Session')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows empty state message when no sessions', () => {
    render(
      <SidebarProvider>
        <SessionSidebar />
      </SidebarProvider>
    )
    // The SessionList shows a different message now
    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument()
    expect(screen.getByText(/Click "New Session" to start/)).toBeInTheDocument()
  })
})
