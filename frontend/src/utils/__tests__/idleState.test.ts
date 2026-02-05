/**
 * Idle State Utility Tests
 *
 * TDD tests for computeIdleState() and formatIdleDuration().
 *
 * Per ADR-0004: Uses vi.useFakeTimers(), no mocking frameworks.
 * Per AC-02: Tests all 6 idle states with boundary conditions.
 * Per AC-12: Tests duration formatting for tooltips.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  computeIdleState,
  formatIdleDuration,
  DEFAULT_THRESHOLDS,
  type IdleState,
  type IdleThresholds,
} from '../idleState'

describe('computeIdleState', () => {
  // Use a fixed "now" time for deterministic tests
  const NOW = 1000000000000 // Fixed timestamp

  // ============================================================
  // Active State (< 5 seconds)
  // ============================================================
  describe('active state', () => {
    test('should return "active" when idle < 5 seconds', () => {
      /**
       * Purpose: Proves active threshold works correctly
       * Quality Contribution: Ensures blue indicator shows for recent activity
       * Acceptance Criteria: idle < 5s returns 'active'
       */
      const lastActivity = NOW - 4999 // 4.999 seconds ago

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('active')
      expect(result.idleMs).toBe(4999)
    })

    test('should return "active" when activity just happened', () => {
      /**
       * Purpose: Proves zero idle time is active
       * Quality Contribution: Ensures immediate activity shows as active
       */
      const lastActivity = NOW // Just now

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('active')
      expect(result.idleMs).toBe(0)
    })
  })

  // ============================================================
  // Recent State (5s - 30s)
  // ============================================================
  describe('recent state', () => {
    test('should return "recent" at exactly 5 seconds (lower bound inclusive)', () => {
      /**
       * Purpose: Proves boundary behavior is lower-bound inclusive
       * Quality Contribution: Prevents off-by-one errors at thresholds
       * Acceptance Criteria: At exactly 5s, state transitions to 'recent'
       */
      const lastActivity = NOW - 5000 // Exactly 5 seconds ago

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('recent')
      expect(result.idleMs).toBe(5000)
    })

    test('should return "recent" when idle between 5s and 30s', () => {
      /**
       * Purpose: Proves recent range works correctly
       */
      const lastActivity = NOW - 15000 // 15 seconds ago

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('recent')
      expect(result.idleMs).toBe(15000)
    })
  })

  // ============================================================
  // Short State (30s - 5min)
  // ============================================================
  describe('short state', () => {
    test('should return "short" at exactly 30 seconds', () => {
      /**
       * Purpose: Proves 30s boundary transitions to short
       */
      const lastActivity = NOW - 30000 // Exactly 30 seconds

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('short')
      expect(result.idleMs).toBe(30000)
    })

    test('should return "short" when idle between 30s and 5min', () => {
      /**
       * Purpose: Proves short range works correctly
       */
      const lastActivity = NOW - 120000 // 2 minutes ago

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('short')
      expect(result.idleMs).toBe(120000)
    })
  })

  // ============================================================
  // Medium State (5min - 10min)
  // ============================================================
  describe('medium state', () => {
    test('should return "medium" at exactly 5 minutes', () => {
      /**
       * Purpose: Proves 5min boundary transitions to medium
       */
      const lastActivity = NOW - 300000 // Exactly 5 minutes

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('medium')
      expect(result.idleMs).toBe(300000)
    })

    test('should return "medium" when idle between 5min and 10min', () => {
      /**
       * Purpose: Proves medium range works correctly
       */
      const lastActivity = NOW - 450000 // 7.5 minutes ago

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('medium')
      expect(result.idleMs).toBe(450000)
    })
  })

  // ============================================================
  // Long State (10min - 60min)
  // ============================================================
  describe('long state', () => {
    test('should return "long" at exactly 10 minutes', () => {
      /**
       * Purpose: Proves 10min boundary transitions to long
       */
      const lastActivity = NOW - 600000 // Exactly 10 minutes

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('long')
      expect(result.idleMs).toBe(600000)
    })

    test('should return "long" when idle between 10min and 60min', () => {
      /**
       * Purpose: Proves long range works correctly
       */
      const lastActivity = NOW - 1800000 // 30 minutes ago

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('long')
      expect(result.idleMs).toBe(1800000)
    })
  })

  // ============================================================
  // Dormant State (>= 60min)
  // ============================================================
  describe('dormant state', () => {
    test('should return "dormant" at exactly 60 minutes', () => {
      /**
       * Purpose: Proves 60min boundary transitions to dormant
       */
      const lastActivity = NOW - 3600000 // Exactly 60 minutes

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('dormant')
      expect(result.idleMs).toBe(3600000)
    })

    test('should return "dormant" when idle > 60 minutes', () => {
      /**
       * Purpose: Proves dormant state for very long idle sessions
       */
      const lastActivity = NOW - 7200000 // 2 hours ago

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('dormant')
      expect(result.idleMs).toBe(7200000)
    })
  })

  // ============================================================
  // Edge Cases
  // ============================================================
  describe('edge cases', () => {
    test('should handle undefined lastActivityAt as dormant', () => {
      /**
       * Purpose: Proves undefined activity treated as very old
       * Quality Contribution: Prevents crashes from missing data
       */
      const result = computeIdleState(undefined, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('dormant')
      expect(result.idleMs).toBe(Infinity)
    })

    test('should handle future timestamp (clock skew) as active', () => {
      /**
       * Purpose: Proves clock skew is handled gracefully
       * Quality Contribution: Prevents negative idle times
       */
      const lastActivity = NOW + 5000 // 5 seconds in the future

      const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS, NOW)

      expect(result.state).toBe('active')
      expect(result.idleMs).toBe(0)
    })

    test('should use custom thresholds when provided', () => {
      /**
       * Purpose: Proves custom thresholds work (for Phase 4 settings)
       */
      const customThresholds: IdleThresholds = {
        active: 1000,    // 1 second
        recent: 5000,    // 5 seconds
        short: 10000,    // 10 seconds
        medium: 30000,   // 30 seconds
        long: 60000,     // 1 minute
      }
      const lastActivity = NOW - 1500 // 1.5 seconds ago

      const result = computeIdleState(lastActivity, customThresholds, NOW)

      // With custom thresholds, 1.5s should be 'recent' not 'active'
      expect(result.state).toBe('recent')
    })
  })
})

// ============================================================
// formatIdleDuration Tests
// ============================================================
describe('formatIdleDuration', () => {
  describe('active display', () => {
    test('should return "Active" for 0ms', () => {
      /**
       * Purpose: Proves zero idle shows as active
       */
      expect(formatIdleDuration(0)).toBe('Active')
    })

    test('should return "Active" for < 5 seconds', () => {
      /**
       * Purpose: Proves active threshold respected
       */
      expect(formatIdleDuration(4999)).toBe('Active')
    })
  })

  describe('seconds display', () => {
    test('should return "Idle: 5 seconds" for exactly 5s', () => {
      expect(formatIdleDuration(5000)).toBe('Idle: 5 seconds')
    })

    test('should return "Idle: 1 second" for singular', () => {
      // Use custom threshold to test 1 second display
      expect(formatIdleDuration(1000, 0)).toBe('Idle: 1 second')
    })

    test('should return "Idle: 45 seconds" for 45s', () => {
      expect(formatIdleDuration(45000)).toBe('Idle: 45 seconds')
    })

    test('should return "Idle: 59 seconds" for 59s', () => {
      expect(formatIdleDuration(59000)).toBe('Idle: 59 seconds')
    })
  })

  describe('minutes display', () => {
    test('should return "Idle: 1 minute" for exactly 60s', () => {
      expect(formatIdleDuration(60000)).toBe('Idle: 1 minute')
    })

    test('should return "Idle: 2 minutes" for 2min', () => {
      expect(formatIdleDuration(120000)).toBe('Idle: 2 minutes')
    })

    test('should return "Idle: 5 minutes" for 5min', () => {
      expect(formatIdleDuration(300000)).toBe('Idle: 5 minutes')
    })

    test('should return "Idle: 59 minutes" for 59min', () => {
      expect(formatIdleDuration(59 * 60 * 1000)).toBe('Idle: 59 minutes')
    })
  })

  describe('hours display', () => {
    test('should return "Idle: 1 hour" for exactly 60min', () => {
      expect(formatIdleDuration(60 * 60 * 1000)).toBe('Idle: 1 hour')
    })

    test('should return "Idle: 2 hours" for 2h', () => {
      expect(formatIdleDuration(2 * 60 * 60 * 1000)).toBe('Idle: 2 hours')
    })

    test('should return "Idle: 24 hours" for 24h', () => {
      expect(formatIdleDuration(24 * 60 * 60 * 1000)).toBe('Idle: 24 hours')
    })
  })

  describe('custom active threshold', () => {
    test('should respect custom active threshold', () => {
      // With 10s threshold, 8s should be "Active"
      expect(formatIdleDuration(8000, 10000)).toBe('Active')
      // With 10s threshold, 11s should be "Idle: 11 seconds"
      expect(formatIdleDuration(11000, 10000)).toBe('Idle: 11 seconds')
    })
  })
})
