/**
 * TAD Scratch: SidebarProvider renders children
 * Exploring: shadcn SidebarProvider context behavior
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'

describe('SidebarProvider', () => {
  it('renders children', () => {
    render(
      <SidebarProvider>
        <div data-testid="child">Test Child</div>
      </SidebarProvider>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })
})
