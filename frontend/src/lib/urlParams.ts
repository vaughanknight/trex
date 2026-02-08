/**
 * URL parameter parsing and building for session state.
 *
 * Format: /?s=<sessionCount>&a=<activeIndex>
 * - s: number of sessions to create (must be >= 1)
 * - a: 0-based index of the active session (clamped to valid range)
 *
 * Pure functions with no browser API dependencies.
 */

export interface URLSessionParams {
  /** Number of sessions to create, or null if not specified/invalid */
  sessionCount: number | null
  /** 0-based index of active session, or null if not specified/invalid */
  activeIndex: number | null
}

/**
 * Parse session parameters from a URL search string.
 *
 * Returns null for sessionCount/activeIndex when the param is missing,
 * non-numeric, zero, or negative. Clamps activeIndex to sessionCount - 1
 * when it exceeds the valid range.
 */
export function parseSessionParams(search: string): URLSessionParams {
  const params = new URLSearchParams(search)

  const sRaw = params.get('s')
  const aRaw = params.get('a')

  // Parse session count
  let sessionCount: number | null = null
  if (sRaw !== null) {
    const parsed = parseInt(sRaw, 10)
    if (!isNaN(parsed) && parsed >= 1) {
      sessionCount = parsed
    }
  }

  // Parse active index
  let activeIndex: number | null = null
  if (aRaw !== null) {
    const parsed = parseInt(aRaw, 10)
    if (!isNaN(parsed) && parsed >= 0) {
      activeIndex = parsed
    }
  }

  // Clamp activeIndex to valid range if sessionCount is known
  if (sessionCount !== null && activeIndex !== null) {
    if (activeIndex >= sessionCount) {
      activeIndex = sessionCount - 1
    }
  }

  return { sessionCount, activeIndex }
}

/**
 * Build a URL search string from session parameters.
 *
 * Returns the query string without the leading '?'.
 */
export function buildSessionParams(sessionCount: number, activeIndex: number): string {
  const params = new URLSearchParams()
  params.set('s', String(sessionCount))
  params.set('a', String(activeIndex))
  return params.toString()
}
