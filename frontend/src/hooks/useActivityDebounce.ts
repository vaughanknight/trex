/**
 * useActivityDebounce Hook - Debounced activity updates for terminal sessions.
 *
 * Provides a fire-and-forget function to update session activity timestamps
 * with debouncing to prevent re-render storms from rapid input/output events.
 *
 * Per Critical Finding 01: Debounce at 150ms to prevent performance degradation.
 * Per Critical Finding 02: Fire-and-forget pattern - no blocking in input path.
 * Per Critical Finding 06: Per-sessionId debounce map with proper cleanup.
 * Per AC-11: Timer cleanup on component unmount to prevent memory leaks.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useActivityStore } from '../stores/activityStore'

/** Debounce interval in milliseconds (per Critical Finding 01) */
export const ACTIVITY_DEBOUNCE_MS = 150

/**
 * Hook that returns a debounced function for updating session activity.
 *
 * Usage:
 * ```tsx
 * const updateActivity = useActivityDebounce()
 *
 * // In event handler (fire-and-forget, non-blocking)
 * onData((data) => {
 *   updateActivity(sessionId)
 *   sendInput(sessionId, data)
 * })
 * ```
 *
 * @returns Stable callback for debounced activity updates
 */
export function useActivityDebounce(): (sessionId: string) => void {
  // Per-session debounce timers (ref to avoid re-renders)
  const debounceMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Get store action (stable reference)
  const updateActivity = useActivityStore((state) => state.updateActivity)

  // Memoized debounced update function
  const updateDebounced = useCallback(
    (sessionId: string) => {
      // Clear existing timer for this session (trailing-edge debounce)
      const existingTimer = debounceMapRef.current.get(sessionId)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      // Set new timer
      const timer = setTimeout(() => {
        updateActivity(sessionId, Date.now())
        debounceMapRef.current.delete(sessionId)
      }, ACTIVITY_DEBOUNCE_MS)

      debounceMapRef.current.set(sessionId, timer)
    },
    [updateActivity]
  )

  // Cleanup all pending timers on unmount (AC-11)
  useEffect(() => {
    return () => {
      for (const timer of debounceMapRef.current.values()) {
        clearTimeout(timer)
      }
      debounceMapRef.current.clear()
    }
  }, [])

  return updateDebounced
}
