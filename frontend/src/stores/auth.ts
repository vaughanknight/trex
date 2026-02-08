/**
 * Auth Store - Manages authentication state for the application.
 *
 * NOT persisted: Auth state is derived from httpOnly cookies managed by the backend.
 * On mount, the app calls checkAuth() which hits /api/auth/me to determine
 * if the user has a valid session cookie.
 *
 * Per I-05: Tokens stored in httpOnly cookies only, never in localStorage/Zustand.
 */

import { create } from 'zustand'

export interface AuthUser {
  username: string
  avatarUrl: string
}

export interface AuthState {
  /** Whether auth is enabled on the backend (feature flag) */
  authEnabled: boolean | null
  /** The currently authenticated user, null if not authenticated */
  user: AuthUser | null
  /** Whether we're currently checking auth status */
  loading: boolean
}

export interface AuthActions {
  /** Check if auth is enabled on the backend */
  checkAuthEnabled: () => Promise<boolean>
  /** Check current auth status by calling /api/auth/me */
  checkAuth: () => Promise<void>
  /** Set user info after successful auth check */
  setUser: (user: AuthUser | null) => void
  /** Logout: clear cookies via backend and reset state */
  logout: () => Promise<void>
  /** Refresh the access token silently */
  refreshToken: () => Promise<boolean>
}

export type AuthStore = AuthState & AuthActions

const initialState: AuthState = {
  authEnabled: null,
  user: null,
  loading: true,
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...initialState,

  checkAuthEnabled: async () => {
    try {
      const res = await fetch('/api/auth/enabled')
      if (!res.ok) return false
      const data = await res.json()
      const enabled = data.enabled === true
      set({ authEnabled: enabled })
      return enabled
    } catch {
      set({ authEnabled: false })
      return false
    }
  },

  checkAuth: async () => {
    set({ loading: true })
    try {
      const enabled = await get().checkAuthEnabled()
      if (!enabled) {
        set({ user: null, loading: false })
        return
      }

      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        set({
          user: { username: data.username, avatarUrl: data.avatar_url },
          loading: false,
        })
      } else {
        set({ user: null, loading: false })
      }
    } catch {
      set({ user: null, loading: false })
    }
  },

  setUser: (user) => set({ user }),

  logout: async () => {
    try {
      await fetch('/auth/logout', { method: 'POST' })
    } catch {
      // Ignore network errors on logout
    }
    set({ user: null })
  },

  refreshToken: async () => {
    try {
      const res = await fetch('/auth/refresh', { method: 'POST' })
      return res.ok
    } catch {
      return false
    }
  },
}))

// Selectors for fine-grained subscriptions
export const selectAuthEnabled = (state: AuthStore) => state.authEnabled
export const selectUser = (state: AuthStore) => state.user
export const selectAuthLoading = (state: AuthStore) => state.loading
export const selectIsAuthenticated = (state: AuthStore) => state.user !== null
