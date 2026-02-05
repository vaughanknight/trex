/**
 * Idle State Utilities - Compute and format session idle states.
 *
 * Provides pure functions for calculating idle state from activity timestamps
 * and formatting idle duration for display.
 *
 * Per AC-02: 6 idle states with configurable thresholds
 * Per AC-12: Human-readable duration formatting for tooltips
 */

// ============================================================
// Type Definitions
// ============================================================

/**
 * Idle state categories based on time since last activity.
 * Per spec: active → recent → short → medium → long → dormant
 */
export type IdleState = 'active' | 'recent' | 'short' | 'medium' | 'long' | 'dormant'

/**
 * Configurable thresholds for idle state transitions (in milliseconds).
 * Lower bound is inclusive: at exactly threshold, transition to next state.
 */
export interface IdleThresholds {
  /** Threshold for active → recent transition (default: 5000ms = 5s) */
  active: number
  /** Threshold for recent → short transition (default: 30000ms = 30s) */
  recent: number
  /** Threshold for short → medium transition (default: 300000ms = 5min) */
  short: number
  /** Threshold for medium → long transition (default: 600000ms = 10min) */
  medium: number
  /** Threshold for long → dormant transition (default: 3600000ms = 60min) */
  long: number
}

/**
 * Result of idle state computation.
 */
export interface IdleStateResult {
  /** Current idle state category */
  state: IdleState
  /** Time since last activity in milliseconds */
  idleMs: number
}

/**
 * Default thresholds matching spec requirements.
 * All values in milliseconds.
 */
export const DEFAULT_THRESHOLDS: IdleThresholds = {
  active: 5000,      // 5 seconds
  recent: 30000,     // 30 seconds
  short: 300000,     // 5 minutes
  medium: 600000,    // 10 minutes
  long: 3600000,     // 60 minutes
}

// ============================================================
// Idle State Computation
// ============================================================

/**
 * Compute the idle state for a session based on its last activity timestamp.
 *
 * Pure function - no side effects. Uses current time via Date.now().
 *
 * Boundary behavior: Lower bound inclusive.
 * - idle < 5s → 'active'
 * - 5s <= idle < 30s → 'recent'
 * - 30s <= idle < 5min → 'short'
 * - 5min <= idle < 10min → 'medium'
 * - 10min <= idle < 60min → 'long'
 * - 60min <= idle → 'dormant'
 *
 * @param lastActivityAt - Unix timestamp of last activity (ms), or undefined
 * @param thresholds - Threshold configuration (defaults to DEFAULT_THRESHOLDS)
 * @param now - Current time (defaults to Date.now(), injectable for testing)
 * @returns IdleStateResult with state category and idle duration
 */
export function computeIdleState(
  lastActivityAt: number | undefined,
  thresholds: IdleThresholds = DEFAULT_THRESHOLDS,
  now: number = Date.now()
): IdleStateResult {
  // Handle undefined/missing activity - treat as very old (dormant)
  if (lastActivityAt === undefined) {
    return { state: 'dormant', idleMs: Infinity }
  }

  // Calculate idle duration
  const idleMs = now - lastActivityAt

  // Handle clock skew (future timestamp) - treat as active
  if (idleMs < 0) {
    return { state: 'active', idleMs: 0 }
  }

  // Determine state based on thresholds (lower bound inclusive)
  if (idleMs < thresholds.active) {
    return { state: 'active', idleMs }
  }
  if (idleMs < thresholds.recent) {
    return { state: 'recent', idleMs }
  }
  if (idleMs < thresholds.short) {
    return { state: 'short', idleMs }
  }
  if (idleMs < thresholds.medium) {
    return { state: 'medium', idleMs }
  }
  if (idleMs < thresholds.long) {
    return { state: 'long', idleMs }
  }

  return { state: 'dormant', idleMs }
}

// ============================================================
// Duration Formatting
// ============================================================

/**
 * Format idle duration for human-readable display in tooltips.
 *
 * Per AC-12: Shows "Active" for active sessions, "Idle: X" for others.
 *
 * @param idleMs - Idle duration in milliseconds
 * @param activeThreshold - Threshold below which to show "Active" (default: 5000ms)
 * @returns Formatted string like "Active", "Idle: 5 seconds", "Idle: 2 minutes"
 */
export function formatIdleDuration(
  idleMs: number,
  activeThreshold: number = DEFAULT_THRESHOLDS.active
): string {
  // Active state
  if (idleMs < activeThreshold) {
    return 'Active'
  }

  // Convert to human-readable units
  const seconds = Math.floor(idleMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return hours === 1 ? 'Idle: 1 hour' : `Idle: ${hours} hours`
  }
  if (minutes > 0) {
    return minutes === 1 ? 'Idle: 1 minute' : `Idle: ${minutes} minutes`
  }
  return seconds === 1 ? 'Idle: 1 second' : `Idle: ${seconds} seconds`
}
