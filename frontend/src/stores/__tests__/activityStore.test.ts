/**
 * Activity Store Tests
 *
 * TDD tests for the activity tracking store. These tests are written FIRST
 * and will fail until the store is implemented.
 *
 * Per ADR-0004: Uses fakes only, no mocking frameworks.
 * Per Critical Finding 05: Separate store isolates timestamps from session data.
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { useActivityStore } from '../activityStore'

describe('Activity Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useActivityStore.getState().clearActivity()
  })

  // ============================================================
  // Core Operations
  // ============================================================
  describe('updateActivity', () => {
    test('should update lastActivityAt for a session', () => {
      /**
       * Purpose: Proves activity timestamp is stored per session
       * Quality Contribution: Prevents lost activity data
       * Acceptance Criteria: Timestamp stored and retrievable by sessionId
       */
      const now = Date.now()
      useActivityStore.getState().updateActivity('session-1', now)

      expect(useActivityStore.getState().lastActivityAt.get('session-1')).toBe(now)
    })

    test('should track multiple sessions independently', () => {
      /**
       * Purpose: Proves session isolation for activity tracking (AC-07)
       * Quality Contribution: Prevents cross-session contamination
       * Acceptance Criteria: Each session has independent timestamp
       */
      const t1 = Date.now()
      const t2 = t1 + 1000

      useActivityStore.getState().updateActivity('session-1', t1)
      useActivityStore.getState().updateActivity('session-2', t2)

      expect(useActivityStore.getState().lastActivityAt.get('session-1')).toBe(t1)
      expect(useActivityStore.getState().lastActivityAt.get('session-2')).toBe(t2)
    })

    test('should overwrite previous timestamp on update', () => {
      /**
       * Purpose: Proves activity reset behavior (AC-05, AC-06)
       * Quality Contribution: Ensures latest activity is tracked
       * Acceptance Criteria: Latest timestamp replaces previous
       */
      const t1 = Date.now()
      const t2 = t1 + 5000

      useActivityStore.getState().updateActivity('session-1', t1)
      useActivityStore.getState().updateActivity('session-1', t2)

      expect(useActivityStore.getState().lastActivityAt.get('session-1')).toBe(t2)
    })

    test('should handle activity update for non-existent session', () => {
      /**
       * Purpose: Proves store handles new sessions gracefully
       * Quality Contribution: Prevents errors on first activity
       * Acceptance Criteria: New session entry created without error
       */
      const now = Date.now()

      // Should not throw
      expect(() => {
        useActivityStore.getState().updateActivity('new-session', now)
      }).not.toThrow()

      expect(useActivityStore.getState().lastActivityAt.get('new-session')).toBe(now)
    })
  })

  // ============================================================
  // Clear Operations
  // ============================================================
  describe('clearActivity', () => {
    test('should clear all activity data', () => {
      /**
       * Purpose: Proves complete cleanup for test isolation
       * Quality Contribution: Enables clean test state
       * Acceptance Criteria: Empty Map after clear
       */
      useActivityStore.getState().updateActivity('session-1', Date.now())
      useActivityStore.getState().updateActivity('session-2', Date.now())

      useActivityStore.getState().clearActivity()

      expect(useActivityStore.getState().lastActivityAt.size).toBe(0)
    })
  })

  // ============================================================
  // Remove Session Activity
  // ============================================================
  describe('removeActivity', () => {
    test('should remove activity for a specific session', () => {
      /**
       * Purpose: Proves cleanup when session is closed
       * Quality Contribution: Prevents memory leaks from closed sessions
       * Acceptance Criteria: Session entry removed, others preserved
       */
      useActivityStore.getState().updateActivity('session-1', Date.now())
      useActivityStore.getState().updateActivity('session-2', Date.now())

      useActivityStore.getState().removeActivity('session-1')

      expect(useActivityStore.getState().lastActivityAt.has('session-1')).toBe(false)
      expect(useActivityStore.getState().lastActivityAt.has('session-2')).toBe(true)
    })

    test('should handle removing non-existent session gracefully', () => {
      /**
       * Purpose: Proves defensive coding for edge cases
       * Quality Contribution: Prevents crashes from stale references
       * Acceptance Criteria: No error on removing unknown session
       */
      expect(() => {
        useActivityStore.getState().removeActivity('non-existent')
      }).not.toThrow()
    })
  })

  // ============================================================
  // Selectors
  // ============================================================
  describe('selectLastActivityAt', () => {
    test('should return timestamp for existing session', async () => {
      /**
       * Purpose: Proves selector retrieves correct value
       * Quality Contribution: Enables fine-grained subscriptions
       * Acceptance Criteria: Returns stored timestamp
       */
      const now = Date.now()
      useActivityStore.getState().updateActivity('session-1', now)

      // Import and use selector
      const { selectLastActivityAt } = await import('../activityStore')
      const timestamp = selectLastActivityAt('session-1')(useActivityStore.getState())

      expect(timestamp).toBe(now)
    })

    test('should return undefined for non-existent session', async () => {
      /**
       * Purpose: Proves selector handles missing data
       * Quality Contribution: Enables defensive checks in components
       * Acceptance Criteria: Returns undefined, not error
       */
      const { selectLastActivityAt } = await import('../activityStore')
      const timestamp = selectLastActivityAt('unknown')(useActivityStore.getState())

      expect(timestamp).toBeUndefined()
    })
  })
})
