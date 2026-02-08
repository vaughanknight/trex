/**
 * useActivityDebounce Hook Tests
 *
 * TDD tests for the activity debounce hook. These tests are written FIRST
 * and will fail until the hook is implemented.
 *
 * Per ADR-0004: Uses vi.useFakeTimers(), no mocking frameworks.
 * Per Critical Finding 01: Debounce at 150ms to prevent re-render storms.
 * Per Critical Finding 06: Per-sessionId debounce map with timer cleanup.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useActivityDebounce, ACTIVITY_DEBOUNCE_MS } from '../useActivityDebounce'
import { useActivityStore } from '../../stores/activityStore'

describe('useActivityDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useActivityStore.getState().clearActivity()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // ============================================================
  // Core Debounce Behavior
  // ============================================================
  describe('debounce timing', () => {
    test('should debounce rapid updates to 150ms', () => {
      /**
       * Purpose: Proves debounce prevents excessive store updates (Critical Finding 01)
       * Quality Contribution: Prevents re-render storms from rapid input
       * Acceptance Criteria: Multiple rapid calls result in single store update
       */
      const { result } = renderHook(() => useActivityDebounce())

      // Rapid updates (simulating fast typing)
      act(() => {
        result.current('session-1')
        result.current('session-1')
        result.current('session-1')
      })

      // Before debounce expires, no update should have occurred
      expect(useActivityStore.getState().lastActivityAt.get('session-1')).toBeUndefined()

      // Advance past debounce window
      act(() => {
        vi.advanceTimersByTime(ACTIVITY_DEBOUNCE_MS)
      })

      // Now the update should have occurred
      expect(useActivityStore.getState().lastActivityAt.get('session-1')).toBeDefined()
    })

    test('should update immediately after debounce expires', () => {
      /**
       * Purpose: Proves activity is recorded after debounce window
       * Quality Contribution: Ensures accurate activity tracking
       * Acceptance Criteria: Store updated after 150ms
       */
      const { result } = renderHook(() => useActivityDebounce())

      act(() => {
        result.current('session-1')
      })

      // Advance exactly to debounce time
      act(() => {
        vi.advanceTimersByTime(ACTIVITY_DEBOUNCE_MS)
      })

      const timestamp = useActivityStore.getState().lastActivityAt.get('session-1')
      expect(timestamp).toBeDefined()
      expect(typeof timestamp).toBe('number')
    })

    test('should reset debounce timer on each call', () => {
      /**
       * Purpose: Proves trailing-edge debounce behavior
       * Quality Contribution: Ensures latest activity time is captured
       * Acceptance Criteria: Timer resets on each call, only last call triggers update
       */
      const { result } = renderHook(() => useActivityDebounce())

      // First call
      act(() => {
        result.current('session-1')
      })

      // Advance 100ms (not yet at 150ms)
      act(() => {
        vi.advanceTimersByTime(100)
      })

      // Second call - should reset the timer
      act(() => {
        result.current('session-1')
      })

      // Advance another 100ms (200ms total, but only 100ms since last call)
      act(() => {
        vi.advanceTimersByTime(100)
      })

      // Should not have updated yet (only 100ms since last call)
      expect(useActivityStore.getState().lastActivityAt.get('session-1')).toBeUndefined()

      // Advance remaining 50ms to complete debounce
      act(() => {
        vi.advanceTimersByTime(50)
      })

      // Now should be updated
      expect(useActivityStore.getState().lastActivityAt.get('session-1')).toBeDefined()
    })
  })

  // ============================================================
  // Multi-Session Isolation (AC-07)
  // ============================================================
  describe('per-session isolation', () => {
    test('should isolate debounce timers per session', () => {
      /**
       * Purpose: Proves sessions have independent debounce (AC-07)
       * Quality Contribution: Prevents cross-session interference
       * Acceptance Criteria: Each session has its own debounce timer
       */
      const { result } = renderHook(() => useActivityDebounce())

      // Update session-1
      act(() => {
        result.current('session-1')
      })

      // Advance 100ms
      act(() => {
        vi.advanceTimersByTime(100)
      })

      // Update session-2 (should have its own timer)
      act(() => {
        result.current('session-2')
      })

      // Advance 50ms (session-1 should fire, session-2 should not)
      act(() => {
        vi.advanceTimersByTime(50)
      })

      expect(useActivityStore.getState().lastActivityAt.get('session-1')).toBeDefined()
      expect(useActivityStore.getState().lastActivityAt.get('session-2')).toBeUndefined()

      // Advance remaining 100ms for session-2
      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(useActivityStore.getState().lastActivityAt.get('session-2')).toBeDefined()
    })

    test('should not affect other sessions when one updates', () => {
      /**
       * Purpose: Proves session independence (AC-07)
       * Quality Contribution: Ensures accurate per-session tracking
       * Acceptance Criteria: Updating one session doesn't touch others
       */
      const { result } = renderHook(() => useActivityDebounce())

      // Set up session-1 with a known timestamp
      useActivityStore.getState().updateActivity('session-1', 1000)

      // Update session-2
      act(() => {
        result.current('session-2')
        vi.advanceTimersByTime(ACTIVITY_DEBOUNCE_MS)
      })

      // session-1 should be unchanged
      expect(useActivityStore.getState().lastActivityAt.get('session-1')).toBe(1000)
      // session-2 should have new timestamp
      expect(useActivityStore.getState().lastActivityAt.get('session-2')).toBeDefined()
    })
  })

  // ============================================================
  // Timer Cleanup (AC-11)
  // ============================================================
  describe('timer cleanup', () => {
    test('should cleanup all timers on unmount', () => {
      /**
       * Purpose: Proves no memory leaks from pending timers (AC-11)
       * Quality Contribution: Prevents timer leaks and stale callbacks
       * Acceptance Criteria: No pending timers after unmount
       */
      const { result, unmount } = renderHook(() => useActivityDebounce())

      // Create pending timers for multiple sessions
      act(() => {
        result.current('session-1')
        result.current('session-2')
        result.current('session-3')
      })

      // Unmount before timers fire
      unmount()

      // Advance time - no updates should occur (timers were cleared)
      act(() => {
        vi.advanceTimersByTime(ACTIVITY_DEBOUNCE_MS * 2)
      })

      // Store should be empty (no timers fired after unmount)
      expect(useActivityStore.getState().lastActivityAt.size).toBe(0)
    })

    test('should handle remount correctly', () => {
      /**
       * Purpose: Proves clean state after remount
       * Quality Contribution: Enables component lifecycle correctness
       * Acceptance Criteria: New hook instance works correctly after remount
       */
      const { result, unmount } = renderHook(() => useActivityDebounce())

      // First usage
      act(() => {
        result.current('session-1')
        vi.advanceTimersByTime(ACTIVITY_DEBOUNCE_MS)
      })

      expect(useActivityStore.getState().lastActivityAt.get('session-1')).toBeDefined()

      // Clear and unmount
      useActivityStore.getState().clearActivity()
      unmount()

      // Remount
      const { result: newResult } = renderHook(() => useActivityDebounce())

      // Should work correctly with fresh state
      act(() => {
        newResult.current('session-2')
        vi.advanceTimersByTime(ACTIVITY_DEBOUNCE_MS)
      })

      expect(useActivityStore.getState().lastActivityAt.get('session-2')).toBeDefined()
    })
  })

  // ============================================================
  // Edge Cases
  // ============================================================
  describe('edge cases', () => {
    test('should handle empty sessionId gracefully', () => {
      /**
       * Purpose: Defensive coding for edge cases
       * Quality Contribution: Prevents crashes from bad input
       * Acceptance Criteria: No error with empty sessionId
       */
      const { result } = renderHook(() => useActivityDebounce())

      expect(() => {
        act(() => {
          result.current('')
          vi.advanceTimersByTime(ACTIVITY_DEBOUNCE_MS)
        })
      }).not.toThrow()
    })

    test('should use current time for timestamp', () => {
      /**
       * Purpose: Proves timestamps are accurate to call time
       * Quality Contribution: Ensures idle calculation accuracy
       * Acceptance Criteria: Timestamp reflects when debounce fires
       */
      const { result } = renderHook(() => useActivityDebounce())

      // Set fake system time
      const fakeNow = 1700000000000
      vi.setSystemTime(fakeNow)

      act(() => {
        result.current('session-1')
      })

      // Advance time before checking
      vi.advanceTimersByTime(ACTIVITY_DEBOUNCE_MS)

      const timestamp = useActivityStore.getState().lastActivityAt.get('session-1')
      // Timestamp should be after the debounce delay
      expect(timestamp).toBe(fakeNow + ACTIVITY_DEBOUNCE_MS)
    })
  })

  // ============================================================
  // Performance (AC-10)
  // ============================================================
  describe('performance', () => {
    test('should return stable callback reference', () => {
      /**
       * Purpose: Proves callback doesn't cause re-renders
       * Quality Contribution: Enables use in useEffect dependencies
       * Acceptance Criteria: Same function reference across renders
       */
      const { result, rerender } = renderHook(() => useActivityDebounce())

      const firstCallback = result.current
      rerender()
      const secondCallback = result.current

      expect(firstCallback).toBe(secondCallback)
    })
  })
})
