/**
 * TAD Scratch: Session store integration
 * Exploring: How to connect components to useSessionStore
 *
 * DISCOVERY: selectSessionList creates a new array each call, causing infinite re-render.
 * Solution: Use shallow comparison or extract Map directly then convert in render.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useSessionStore, selectSessionCount } from '@/stores/sessions'
import { useShallow } from 'zustand/shallow'

// Simple component that displays session count - use count selector (primitive)
function SessionCount() {
  const count = useSessionStore(selectSessionCount)
  return <div data-testid="count">{count}</div>
}

// Component that displays sessions - use useShallow to prevent infinite loop
function SessionList() {
  const sessions = useSessionStore(useShallow(state =>
    Array.from(state.sessions.values())
  ))
  return (
    <ul>
      {sessions.map(s => <li key={s.id}>{s.name}</li>)}
    </ul>
  )
}

describe('Session store integration', () => {
  beforeEach(() => {
    useSessionStore.getState().clearSessions()
  })

  it('displays 0 when no sessions', () => {
    render(<SessionCount />)
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('displays session count after adding sessions', () => {
    useSessionStore.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'active',
      createdAt: Date.now(),
      userRenamed: false,
    })

    render(<SessionCount />)
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('displays session list with useShallow', () => {
    useSessionStore.getState().addSession({
      id: 's1',
      name: 'bash-1',
      shellType: 'bash',
      status: 'active',
      createdAt: Date.now(),
      userRenamed: false,
    })

    render(<SessionList />)
    expect(screen.getByText('bash-1')).toBeInTheDocument()
  })
})
