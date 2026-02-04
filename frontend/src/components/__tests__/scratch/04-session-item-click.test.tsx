/**
 * TAD Scratch: Session item click to select
 * Exploring: How to wire session clicks to activeSessionId in UI store
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useUIStore, selectActiveSessionId } from '@/stores/ui'
import { useSessionStore } from '@/stores/sessions'

// Simple session item component - click to select
function SessionItem({ id, name }: { id: string; name: string }) {
  const activeId = useUIStore(selectActiveSessionId)
  const setActive = useUIStore(state => state.setActiveSession)
  const isActive = activeId === id

  return (
    <div
      data-testid={`session-${id}`}
      data-active={isActive}
      onClick={() => setActive(id)}
      style={{ fontWeight: isActive ? 'bold' : 'normal' }}
    >
      {name}
    </div>
  )
}

// Display active session indicator
function ActiveIndicator() {
  const activeId = useUIStore(selectActiveSessionId)
  return <div data-testid="active">{activeId ?? 'none'}</div>
}

describe('Session item click to select', () => {
  beforeEach(() => {
    useUIStore.setState({ activeSessionId: null })
    useSessionStore.getState().clearSessions()
  })

  it('shows no active session initially', () => {
    render(<ActiveIndicator />)
    expect(screen.getByTestId('active')).toHaveTextContent('none')
  })

  it('clicking session item sets it as active', () => {
    render(
      <>
        <SessionItem id="s1" name="bash-1" />
        <ActiveIndicator />
      </>
    )

    fireEvent.click(screen.getByTestId('session-s1'))
    expect(screen.getByTestId('active')).toHaveTextContent('s1')
  })

  it('session item shows active state when selected', () => {
    render(<SessionItem id="s1" name="bash-1" />)

    expect(screen.getByTestId('session-s1')).toHaveAttribute('data-active', 'false')
    fireEvent.click(screen.getByTestId('session-s1'))
    expect(screen.getByTestId('session-s1')).toHaveAttribute('data-active', 'true')
  })

  it('clicking different session changes active', () => {
    render(
      <>
        <SessionItem id="s1" name="bash-1" />
        <SessionItem id="s2" name="zsh-1" />
        <ActiveIndicator />
      </>
    )

    fireEvent.click(screen.getByTestId('session-s1'))
    expect(screen.getByTestId('active')).toHaveTextContent('s1')

    fireEvent.click(screen.getByTestId('session-s2'))
    expect(screen.getByTestId('active')).toHaveTextContent('s2')
  })
})
