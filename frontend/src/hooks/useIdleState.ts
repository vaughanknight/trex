/**
 * useIdleState Hooks - Compute and provide session idle states.
 *
 * Provides hooks for consuming idle state in components:
 * - useIdleComputation: Global interval for periodic recalculation
 * - useIdleState: Per-session idle state computation
 *
 * Per Critical Finding 03: Single global interval with proper lifecycle management.
 * Per AC-02: Computes idle state from activity timestamps and thresholds.
 */

import { useState, useEffect } from 'react'
import { useActivityStore, selectLastActivityAt } from '../stores/activityStore'
import {
  computeIdleState,
  DEFAULT_THRESHOLDS,
  type IdleStateResult,
  type IdleThresholds,
} from '../utils/idleState'

/** Interval for idle state recalculation (1 second per spec) */
export const IDLE_COMPUTATION_INTERVAL_MS = 1000

/**
 * Hook that manages a global interval for idle state recalculation.
 *
 * Returns a tick counter that increments every second, triggering re-renders
 * in consuming components to recalculate idle states.
 *
 * Per Critical Finding 03: Uses useEffect cleanup to prevent timer leaks.
 *
 * @returns Current tick count (increments every second)
 */
export function useIdleComputation(): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, IDLE_COMPUTATION_INTERVAL_MS)

    return () => {
      clearInterval(interval)
    }
  }, [])

  return tick
}

/**
 * Hook that provides the computed idle state for a specific session.
 *
 * Combines activity timestamp from the store with periodic recalculation
 * to provide up-to-date idle state for the session.
 *
 * @param sessionId - The session to compute idle state for
 * @param thresholds - Optional custom thresholds (defaults to DEFAULT_THRESHOLDS)
 * @returns IdleStateResult with current state and idle duration
 */
export function useIdleState(
  sessionId: string,
  thresholds: IdleThresholds = DEFAULT_THRESHOLDS
): IdleStateResult {
  // Subscribe to the global tick for periodic recalculation
  const tick = useIdleComputation()

  // Get the last activity timestamp for this session
  const lastActivityAt = useActivityStore(selectLastActivityAt(sessionId))

  // Compute idle state (recalculates when tick changes or activity updates)
  // The tick dependency ensures this recalculates every second
  const idleState = computeIdleState(lastActivityAt, thresholds)

  return idleState
}
