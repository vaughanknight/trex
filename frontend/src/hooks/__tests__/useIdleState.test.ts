/**
 * useIdleState Hook Tests
 *
 * TDD tests for useIdleComputation and useIdleState hooks.
 *
 * Per ADR-0004: Uses vi.useFakeTimers(), no mocking frameworks.
 * Per Critical Finding 03: Tests interval lifecycle management.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIdleComputation, useIdleState, IDLE_COMPUTATION_INTERVAL_MS } from '../useIdleState'
import { useActivityStore } from '../../stores/activityStore'

describe('useIdleComputation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test('should start interval on mount', () => {
    /**
     * Purpose: Proves interval lifecycle starts correctly
     * Quality Contribution: Ensures idle state updates periodically
     * Acceptance Criteria: setInterval called on mount
     */
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    renderHook(() => useIdleComputation())

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      IDLE_COMPUTATION_INTERVAL_MS
    )
  })

  test('should clear interval on unmount', () => {
    /**
     * Purpose: Proves no timer memory leaks (Critical Finding 03)
     * Quality Contribution: Prevents orphaned intervals
     * Acceptance Criteria: clearInterval called on unmount
     */
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = renderHook(() => useIdleComputation())

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
  })

  test('should not create multiple intervals on re-render', () => {
    /**
     * Purpose: Proves single global interval
     * Quality Contribution: Prevents CPU waste from duplicate intervals
     */
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { rerender } = renderHook(() => useIdleComputation())
    rerender()
    rerender()
    rerender()

    // Should only have created one interval despite re-renders
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  test('should increment tick counter every second', () => {
    /**
     * Purpose: Proves interval triggers state updates
     * Quality Contribution: Ensures re-renders happen for idle recalculation
     */
    const { result } = renderHook(() => useIdleComputation())

    expect(result.current).toBe(0)

    act(() => {
      vi.advanceTimersByTime(IDLE_COMPUTATION_INTERVAL_MS)
    })

    expect(result.current).toBe(1)

    act(() => {
      vi.advanceTimersByTime(IDLE_COMPUTATION_INTERVAL_MS)
    })

    expect(result.current).toBe(2)
  })

  test('should handle rapid mount/unmount cycles', () => {
    /**
     * Purpose: Proves cleanup handles edge cases
     * Quality Contribution: Prevents race conditions
     */
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    for (let i = 0; i < 5; i++) {
      const { unmount } = renderHook(() => useIdleComputation())
      unmount()
    }

    expect(clearIntervalSpy).toHaveBeenCalledTimes(5)
  })
})

describe('useIdleState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useActivityStore.getState().clearActivity()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test('should return dormant for session with no activity', () => {
    /**
     * Purpose: Proves undefined activity handled correctly
     * Quality Contribution: Prevents crashes for new sessions
     */
    const { result } = renderHook(() => useIdleState('unknown-session'))

    expect(result.current.state).toBe('dormant')
  })

  test('should return active for session with recent activity', () => {
    /**
     * Purpose: Proves active state computed correctly
     */
    const now = Date.now()
    vi.setSystemTime(now)
    useActivityStore.getState().updateActivity('session-1', now - 1000) // 1 second ago

    const { result } = renderHook(() => useIdleState('session-1'))

    expect(result.current.state).toBe('active')
    expect(result.current.idleMs).toBe(1000)
  })

  test('should update idle state when time advances', () => {
    /**
     * Purpose: Proves idle state recalculates on interval tick
     * Quality Contribution: Ensures real-time idle tracking
     */
    const now = 1000000000000
    vi.setSystemTime(now)
    useActivityStore.getState().updateActivity('session-1', now) // Just now

    const { result } = renderHook(() => useIdleState('session-1'))

    // Initially active
    expect(result.current.state).toBe('active')

    // Advance time by 6 seconds (past active threshold)
    act(() => {
      vi.advanceTimersByTime(6000)
    })

    // Should now be recent
    expect(result.current.state).toBe('recent')
    expect(result.current.idleMs).toBe(6000)
  })

  test('should track different sessions independently', () => {
    /**
     * Purpose: Proves session isolation (AC-07)
     */
    const now = Date.now()
    vi.setSystemTime(now)

    // Session 1: active (1s ago)
    useActivityStore.getState().updateActivity('session-1', now - 1000)
    // Session 2: recent (10s ago)
    useActivityStore.getState().updateActivity('session-2', now - 10000)

    const { result: result1 } = renderHook(() => useIdleState('session-1'))
    const { result: result2 } = renderHook(() => useIdleState('session-2'))

    expect(result1.current.state).toBe('active')
    expect(result2.current.state).toBe('recent')
  })

  test('should react to activity updates', () => {
    /**
     * Purpose: Proves activity reset detected
     */
    const now = 1000000000000
    vi.setSystemTime(now)
    useActivityStore.getState().updateActivity('session-1', now - 60000) // 1 minute ago

    const { result } = renderHook(() => useIdleState('session-1'))

    // Initially short idle
    expect(result.current.state).toBe('short')

    // Update activity to now
    act(() => {
      useActivityStore.getState().updateActivity('session-1', now)
    })

    // Should now be active
    expect(result.current.state).toBe('active')
  })
})
