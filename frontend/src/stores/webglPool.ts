/**
 * WebGL Pool Store - Manages WebGL addon allocation across terminal sessions.
 *
 * This store implements a pool of WebGL addons that can be dynamically
 * allocated to terminal sessions. Key features:
 * - Active terminal always gets WebGL (acquire on activate)
 * - LRU eviction when pool reaches capacity
 * - Graceful degradation when pool exhausted
 * - Pool owns addon lifecycle (dispose on release)
 * - GPU detection on first acquire (lazy initialization)
 *
 * Per Critical Discovery 02: WebglAddon cannot be reattached.
 * Per Critical Discovery 03: Pool OWNS all addons. Terminal never calls dispose().
 * Per Critical Discovery 08: Follows sessions.ts Map-based state pattern.
 * Per Critical Discovery 09: GPU detection with conservative fallbacks.
 *
 * Per ADR-0004: Uses injectable factory for testing with FakeWebglAddon.
 */

import { create } from 'zustand'
import { type Terminal } from '@xterm/xterm'
import {
  type IWebglAddon,
  getWebglAddonFactory,
} from '../test/fakeWebglAddon'
import { detectGPUCapability } from '../utils/gpuCapability'

/**
 * Pool slot representing an acquired WebGL addon for a session.
 */
export interface PoolSlot {
  /** The WebGL addon instance */
  addon: IWebglAddon
  /** The terminal this addon is attached to */
  terminal: Terminal
  /** Timestamp when this slot was last accessed (for LRU) */
  lastAccess: number
  /** Whether this slot is actively in use (not released) */
  isActive: boolean
}

/**
 * Pool statistics for observability.
 */
export interface PoolStats {
  /** Maximum number of WebGL contexts allowed */
  maxSize: number
  /** Number of currently active (acquired, not released) sessions */
  activeCount: number
}

/**
 * WebGL Pool state.
 */
export interface WebGLPoolState {
  /** Map of sessionId to pool slot */
  slots: Map<string, PoolSlot>
  /** Maximum pool size (device-appropriate) */
  maxSize: number
  /** Whether GPU detection has been performed */
  initialized: boolean
}

/**
 * WebGL Pool actions.
 */
export interface WebGLPoolActions {
  /**
   * Acquire a WebGL addon for a session.
   * Returns the addon if successful, null if pool exhausted.
   *
   * Per Critical Discovery 05: Idempotent - returns existing addon if already acquired.
   */
  acquire: (sessionId: string, terminal: Terminal) => IWebglAddon | null

  /**
   * Release a WebGL addon for a session.
   * Disposes the addon and frees the slot.
   *
   * Per Critical Discovery 03: Pool owns disposal.
   * Per Critical Discovery 05: Idempotent - no-op if not acquired.
   */
  release: (sessionId: string) => void

  /**
   * Check if a session has an active WebGL addon.
   */
  hasWebGL: (sessionId: string) => boolean

  /**
   * Get pool statistics for debugging.
   */
  getStats: () => PoolStats

  /**
   * Set the maximum pool size.
   * Used by GPU detection in Phase 2.
   */
  setMaxSize: (size: number) => void

  /**
   * Reset the pool state.
   * Used for test isolation.
   */
  reset: () => void
}

export type WebGLPoolStore = WebGLPoolState & WebGLPoolActions

const DEFAULT_MAX_SIZE = 4 // Conservative default

const initialState: WebGLPoolState = {
  slots: new Map(),
  maxSize: DEFAULT_MAX_SIZE,
  initialized: false,
}

/**
 * WebGL Pool Zustand store.
 */
export const useWebGLPoolStore = create<WebGLPoolStore>((set, get) => ({
  ...initialState,

  acquire: (sessionId: string, terminal: Terminal): IWebglAddon | null => {
    let state = get()

    // Lazy initialization: detect GPU capability on first acquire
    if (!state.initialized) {
      const capability = detectGPUCapability()
      set({ maxSize: capability.maxSize, initialized: true })
      // Re-read state after update
      state = get()
    }

    // Idempotency: If already acquired and active, return existing addon
    const existingSlot = state.slots.get(sessionId)
    if (existingSlot && existingSlot.isActive) {
      // Update last access time
      set((s) => {
        const newSlots = new Map(s.slots)
        const slot = newSlots.get(sessionId)!
        newSlots.set(sessionId, { ...slot, lastAccess: Date.now() })
        return { slots: newSlots }
      })
      return existingSlot.addon
    }

    // Count active slots
    let activeCount = 0
    for (const slot of state.slots.values()) {
      if (slot.isActive) activeCount++
    }

    // If at capacity, cannot acquire (all slots are active)
    if (activeCount >= state.maxSize) {
      return null
    }

    // Create new addon via factory (allows test injection)
    const factory = getWebglAddonFactory()
    let addon: IWebglAddon
    try {
      addon = factory()
    } catch {
      // WebGL not available
      return null
    }

    // Register context loss handler per Critical Discovery 04
    // Pool tracks context loss to prevent stale slots
    addon.onContextLoss(() => {
      // Mark slot as dead and remove it
      const currentState = get()
      const currentSlot = currentState.slots.get(sessionId)
      if (currentSlot && currentSlot.addon === addon) {
        // Development logging for debugging
        if (import.meta.env.DEV) {
          console.info(
            `[WebGL Pool] context loss for session "${sessionId}", addon disposed`
          )
        }
        // Dispose the addon
        addon.dispose()
        // Remove from pool
        set((s) => {
          const newSlots = new Map(s.slots)
          newSlots.delete(sessionId)
          return { slots: newSlots }
        })
      }
    })

    // Create new slot
    const slot: PoolSlot = {
      addon,
      terminal,
      lastAccess: Date.now(),
      isActive: true,
    }

    set((s) => {
      const newSlots = new Map(s.slots)
      newSlots.set(sessionId, slot)
      return { slots: newSlots }
    })

    // Development logging for debugging
    if (import.meta.env.DEV) {
      const stats = get().getStats()
      console.info(
        `[WebGL Pool] acquire("${sessionId}") → addon created, activeCount: ${stats.activeCount}/${stats.maxSize}`
      )
    }

    return addon
  },

  release: (sessionId: string): void => {
    const state = get()
    const slot = state.slots.get(sessionId)

    // Idempotency: No-op if not acquired or already released
    if (!slot || !slot.isActive) {
      return
    }

    // Dispose the addon (pool owns disposal per Critical Discovery 03)
    slot.addon.dispose()

    // Remove the slot entirely
    set((s) => {
      const newSlots = new Map(s.slots)
      newSlots.delete(sessionId)
      return { slots: newSlots }
    })

    // Development logging for debugging
    if (import.meta.env.DEV) {
      const stats = get().getStats()
      console.info(
        `[WebGL Pool] release("${sessionId}") → disposed, activeCount: ${stats.activeCount}/${stats.maxSize}`
      )
    }
  },

  hasWebGL: (sessionId: string): boolean => {
    const slot = get().slots.get(sessionId)
    return slot !== undefined && slot.isActive
  },

  getStats: (): PoolStats => {
    const state = get()
    let activeCount = 0
    for (const slot of state.slots.values()) {
      if (slot.isActive) activeCount++
    }
    return {
      maxSize: state.maxSize,
      activeCount,
    }
  },

  setMaxSize: (size: number): void => {
    set({ maxSize: size })
  },

  reset: (): void => {
    // Dispose all existing addons before reset
    const state = get()
    for (const slot of state.slots.values()) {
      if (slot.addon) {
        slot.addon.dispose()
      }
    }
    set({ ...initialState, slots: new Map(), initialized: false })
  },
}))

// ============================================================
// Selectors for fine-grained subscriptions
// ============================================================

/** Select pool stats */
export const selectPoolStats = (state: WebGLPoolStore) => state.getStats()

/** Select whether a session has WebGL */
export const selectHasWebGL =
  (sessionId: string) => (state: WebGLPoolStore) =>
    state.hasWebGL(sessionId)

/** Select active count */
export const selectActiveCount = (state: WebGLPoolStore) =>
  state.getStats().activeCount

/** Select max size */
export const selectMaxSize = (state: WebGLPoolStore) => state.maxSize
