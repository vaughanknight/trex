/**
 * Auth Store Tests
 *
 * Tests for useAuthStore which manages authentication state.
 * Auth state is NOT persisted - it's derived from httpOnly cookies
 * managed by the backend.
 *
 * @see /docs/plans/010-github-oauth/github-oauth-spec.md
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { create } from 'zustand'
import type { AuthState, AuthActions, AuthUser } from '../auth'

type AuthStore = AuthState & AuthActions

/**
 * Test factory that creates isolated auth store instances.
 * No persistence needed since auth state is transient.
 */
const createTestAuthStore = () => {
  return create<AuthStore>((set, get) => ({
    authEnabled: null,
    user: null,
    loading: true,

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
        // Ignore
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
}

describe('useAuthStore', () => {
  let store: ReturnType<typeof createTestAuthStore>

  beforeEach(() => {
    store = createTestAuthStore()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should start with null user and loading true', () => {
      /**
       * Test Doc:
       * - Why: App starts in loading state until auth check completes
       * - Contract: Initial state has null user, loading=true, authEnabled=null
       */
      const state = store.getState()
      expect(state.user).toBeNull()
      expect(state.loading).toBe(true)
      expect(state.authEnabled).toBeNull()
    })
  })

  describe('setUser', () => {
    it('should store user info after login', () => {
      /**
       * Test Doc:
       * - Why: User state needed for UI display (avatar, username)
       * - Contract: setUser stores username and avatarUrl
       */
      store.getState().setUser({ username: 'alice', avatarUrl: 'https://github.com/alice.png' })

      const state = store.getState()
      expect(state.user?.username).toBe('alice')
      expect(state.user?.avatarUrl).toBe('https://github.com/alice.png')
    })

    it('should clear user when set to null', () => {
      /**
       * Test Doc:
       * - Why: setUser(null) is the primitive for clearing auth state
       * - Contract: setUser(null) → user=null
       */
      store.getState().setUser({ username: 'alice', avatarUrl: 'https://github.com/alice.png' })
      store.getState().setUser(null)

      expect(store.getState().user).toBeNull()
    })
  })

  describe('checkAuthEnabled', () => {
    it('should set authEnabled=true when backend returns enabled', async () => {
      /**
       * Test Doc:
       * - Why: Feature flag gates all auth UI
       * - Contract: Backend returns {enabled: true} → authEnabled=true
       */
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ enabled: true }), { status: 200 })
      )

      const result = await store.getState().checkAuthEnabled()

      expect(result).toBe(true)
      expect(store.getState().authEnabled).toBe(true)
    })

    it('should set authEnabled=false when backend returns disabled', async () => {
      /**
       * Test Doc:
       * - Why: When auth disabled, no login UI should be shown
       * - Contract: Backend returns {enabled: false} → authEnabled=false
       */
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ enabled: false }), { status: 200 })
      )

      const result = await store.getState().checkAuthEnabled()

      expect(result).toBe(false)
      expect(store.getState().authEnabled).toBe(false)
    })

    it('should handle fetch errors gracefully', async () => {
      /**
       * Test Doc:
       * - Why: Network errors should not crash the app
       * - Contract: Fetch error → authEnabled=false
       */
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))

      const result = await store.getState().checkAuthEnabled()

      expect(result).toBe(false)
      expect(store.getState().authEnabled).toBe(false)
    })
  })

  describe('checkAuth', () => {
    it('should set user when authenticated', async () => {
      /**
       * Test Doc:
       * - Why: On app mount, check if user has valid session cookie
       * - Contract: Valid cookie → user set, loading=false
       */
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ enabled: true }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ username: 'alice', avatar_url: 'https://github.com/alice.png' }), { status: 200 })
        )

      await store.getState().checkAuth()

      const state = store.getState()
      expect(state.user?.username).toBe('alice')
      expect(state.user?.avatarUrl).toBe('https://github.com/alice.png')
      expect(state.loading).toBe(false)
    })

    it('should set user=null when auth disabled', async () => {
      /**
       * Test Doc:
       * - Why: When auth disabled, no user check needed
       * - Contract: Auth disabled → user=null, loading=false
       */
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ enabled: false }), { status: 200 })
      )

      await store.getState().checkAuth()

      const state = store.getState()
      expect(state.user).toBeNull()
      expect(state.loading).toBe(false)
    })

    it('should set user=null when /api/auth/me returns 401', async () => {
      /**
       * Test Doc:
       * - Why: Expired or missing cookie should show login UI
       * - Contract: 401 → user=null, loading=false
       */
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ enabled: true }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response('unauthorized', { status: 401 })
        )

      await store.getState().checkAuth()

      const state = store.getState()
      expect(state.user).toBeNull()
      expect(state.loading).toBe(false)
    })
  })

  describe('logout', () => {
    it('should clear user state on logout', async () => {
      /**
       * Test Doc:
       * - Why: Security — logout must clear all auth state
       * - Contract: logout() → POST /auth/logout + user=null
       */
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'logged_out' }), { status: 200 })
      )

      store.getState().setUser({ username: 'alice', avatarUrl: 'https://github.com/alice.png' })
      await store.getState().logout()

      expect(store.getState().user).toBeNull()
      expect(fetchSpy).toHaveBeenCalledWith('/auth/logout', { method: 'POST' })
    })

    it('should clear state even if logout request fails', async () => {
      /**
       * Test Doc:
       * - Why: Client-side state must clear regardless of server response
       * - Contract: Network error → user still cleared
       */
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))

      store.getState().setUser({ username: 'alice', avatarUrl: 'https://github.com/alice.png' })
      await store.getState().logout()

      expect(store.getState().user).toBeNull()
    })
  })

  describe('refreshToken', () => {
    it('should return true on successful refresh', async () => {
      /**
       * Test Doc:
       * - Why: Silent token refresh keeps user authenticated
       * - Contract: POST /auth/refresh success → true
       */
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'refreshed' }), { status: 200 })
      )

      const result = await store.getState().refreshToken()

      expect(result).toBe(true)
    })

    it('should return false on refresh failure', async () => {
      /**
       * Test Doc:
       * - Why: Failed refresh means user needs to re-login
       * - Contract: 401 → false
       */
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('invalid', { status: 401 })
      )

      const result = await store.getState().refreshToken()

      expect(result).toBe(false)
    })

    it('should return false on network error', async () => {
      /**
       * Test Doc:
       * - Why: Network errors should not crash during silent refresh
       * - Contract: Network error → false
       */
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))

      const result = await store.getState().refreshToken()

      expect(result).toBe(false)
    })
  })
})
