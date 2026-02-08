/**
 * Auth initialization hook — runs on app mount.
 *
 * 1. Checks if auth is enabled (GET /api/auth/enabled)
 * 2. If enabled, checks current user (GET /api/auth/me)
 * 3. Sets up silent token refresh interval (every 12 minutes, per R-08)
 *
 * Per I-05: Tokens live in httpOnly cookies only.
 * Per R-08: Silent refresh before 15-minute access token expiry.
 */

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth'

/** Refresh interval: 12 minutes (tokens expire at 15 min) */
const REFRESH_INTERVAL_MS = 12 * 60 * 1000

export function useAuthInit() {
  const checkAuth = useAuthStore(state => state.checkAuth)
  const refreshToken = useAuthStore(state => state.refreshToken)
  const authEnabled = useAuthStore(state => state.authEnabled)
  const user = useAuthStore(state => state.user)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Set up token refresh when authenticated
  useEffect(() => {
    if (authEnabled && user) {
      intervalRef.current = setInterval(async () => {
        const success = await refreshToken()
        if (!success) {
          // Refresh failed — token expired, trigger re-check
          useAuthStore.getState().checkAuth()
        }
      }, REFRESH_INTERVAL_MS)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [authEnabled, user, refreshToken])
}
