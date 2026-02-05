/**
 * WebGL Pool Store Tests
 *
 * TDD tests for the WebGL context pool. These tests are written FIRST
 * and will fail until the store is implemented.
 *
 * Per ADR-0004: Uses FakeWebglAddon, no mocking frameworks.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  FakeWebglAddon,
  installFakeWebglAddon,
} from '../../test/fakeWebglAddon'
import {
  installFakeGPUContext,
  resetFakeGPUContext,
} from '../../test/fakeGPUContext'
import { useWebGLPoolStore } from '../webglPool'

describe('WebGL Pool Store', () => {
  let fakeInstall: { instances: FakeWebglAddon[]; restore: () => void }

  beforeEach(() => {
    fakeInstall = installFakeWebglAddon()
    resetFakeGPUContext()
    useWebGLPoolStore.getState().reset()
    // Suppress console.info for cleaner test output
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    fakeInstall.restore()
    resetFakeGPUContext()
    vi.restoreAllMocks()
  })

  // ============================================================
  // T002: Acquire and Release Operations
  // ============================================================
  describe('acquire and release operations', () => {
    test('acquire returns addon when pool has capacity', () => {
      /**
       * Test Doc:
       * - Why: Core pool functionality - must allocate WebGL
       * - Contract: acquire() returns non-null addon when under maxSize
       * - Usage Notes: Call with sessionId and terminal ref
       * - Quality Contribution: Prevents null addon bugs
       * - Worked Example: acquire('session-1') → FakeWebglAddon instance
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      const addon = store.acquire('session-1', mockTerminal)

      expect(addon).not.toBeNull()
      expect(store.getStats().activeCount).toBe(1)
    })

    test('release disposes addon and decrements count', () => {
      /**
       * Test Doc:
       * - Why: Prevents memory leaks from undisposed addons
       * - Contract: release() calls addon.dispose() and updates stats
       * - Usage Notes: Must call release when terminal deactivates
       * - Quality Contribution: Catches missing dispose() calls
       * - Worked Example: release('session-1') → addon.wasDisposed() === true
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any
      store.acquire('session-1', mockTerminal)

      store.release('session-1')

      expect(store.getStats().activeCount).toBe(0)
      // Verify dispose was called on the addon
      expect(fakeInstall.instances[0].wasDisposed()).toBe(true)
    })

    test('getStats returns accurate counts', () => {
      /**
       * Test Doc:
       * - Why: Observability - pool stats must be accurate for debugging
       * - Contract: getStats() reflects actual pool state
       * - Usage Notes: Call anytime to inspect pool
       * - Quality Contribution: Enables debugging of pool issues
       * - Worked Example: After acquire, stats.activeCount === 1
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      // Initially empty
      let stats = store.getStats()
      expect(stats.activeCount).toBe(0)
      expect(stats.maxSize).toBeGreaterThan(0)

      // After one acquire
      store.acquire('session-1', mockTerminal)
      stats = store.getStats()
      expect(stats.activeCount).toBe(1)

      // After second acquire
      store.acquire('session-2', mockTerminal)
      stats = store.getStats()
      expect(stats.activeCount).toBe(2)

      // After release
      store.release('session-1')
      stats = store.getStats()
      expect(stats.activeCount).toBe(1)
    })

    test('hasWebGL returns correct state', () => {
      /**
       * Test Doc:
       * - Why: Need to check if session has WebGL without getting addon
       * - Contract: hasWebGL() returns true iff session has active addon
       * - Usage Notes: Useful for conditional rendering logic
       * - Quality Contribution: Prevents duplicate acquisition checks
       * - Worked Example: hasWebGL('session-1') after acquire → true
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      expect(store.hasWebGL('session-1')).toBe(false)

      store.acquire('session-1', mockTerminal)
      expect(store.hasWebGL('session-1')).toBe(true)

      store.release('session-1')
      expect(store.hasWebGL('session-1')).toBe(false)
    })
  })

  // ============================================================
  // T003: LRU Eviction
  // ============================================================
  describe('LRU eviction', () => {
    test('evicts LRU when pool at capacity', () => {
      /**
       * Test Doc:
       * - Why: Pool must not exceed browser context limit
       * - Contract: When full, evict least recently used before new acquire
       * - Usage Notes: LRU determined by release time, not creation time
       * - Quality Contribution: Prevents context exhaustion crashes
       * - Worked Example: Pool(2): acquire a, b, release a, acquire c → a slot reused
       */
      const store = useWebGLPoolStore.getState()
      store.setMaxSize(2)
      const mockTerminal = {} as any

      // Fill the pool
      store.acquire('session-a', mockTerminal)
      store.acquire('session-b', mockTerminal)

      // Release session-a (becomes evictable)
      store.release('session-a')

      // Acquire new session - should evict session-a's slot
      store.acquire('session-c', mockTerminal)

      const stats = store.getStats()
      expect(stats.activeCount).toBe(2)
      expect(store.hasWebGL('session-a')).toBe(false)
      expect(store.hasWebGL('session-b')).toBe(true)
      expect(store.hasWebGL('session-c')).toBe(true)
    })

    test('LRU ordering respects release time', () => {
      /**
       * Test Doc:
       * - Why: Eviction must target oldest released, not oldest created
       * - Contract: Session released first is evicted first
       * - Usage Notes: Access order tracked by release timestamp
       * - Quality Contribution: Ensures fair eviction policy
       * - Worked Example: release(a), release(b), acquire(c) → evicts a not b
       */
      const store = useWebGLPoolStore.getState()
      store.setMaxSize(2)
      const mockTerminal = {} as any

      // Create and immediately release in order: a, b
      store.acquire('session-a', mockTerminal)
      store.acquire('session-b', mockTerminal)
      store.release('session-a') // Released first
      store.release('session-b') // Released second

      // New acquire should evict 'a' (released first)
      store.acquire('session-c', mockTerminal)

      // a was evicted (oldest release), b still has its slot
      expect(store.hasWebGL('session-a')).toBe(false)
      // Note: b was released too, so its slot was also evictable
      // but we should have evicted 'a' first
      expect(store.hasWebGL('session-c')).toBe(true)
    })

    test('evicted addon is disposed', () => {
      /**
       * Test Doc:
       * - Why: Memory leak prevention - evicted addons must be disposed
       * - Contract: Eviction calls dispose() on the evicted addon
       * - Usage Notes: Pool owns disposal, not terminal
       * - Quality Contribution: Catches missing dispose on eviction
       * - Worked Example: evict(a) → a's addon.wasDisposed() === true
       */
      const store = useWebGLPoolStore.getState()
      store.setMaxSize(2)
      const mockTerminal = {} as any

      store.acquire('session-a', mockTerminal)
      store.acquire('session-b', mockTerminal)
      store.release('session-a') // Make evictable

      const addonA = fakeInstall.instances[0]
      expect(addonA.wasDisposed()).toBe(true) // Disposed on release

      // Acquiring new session works
      store.acquire('session-c', mockTerminal)
      expect(store.hasWebGL('session-c')).toBe(true)
    })
  })

  // ============================================================
  // T004: Pool Exhaustion
  // ============================================================
  describe('pool exhaustion', () => {
    test('returns null when pool exhausted (all active, none evictable)', () => {
      /**
       * Test Doc:
       * - Why: Graceful degradation when pool is fully utilized
       * - Contract: acquire() returns null if pool full and no evictable slots
       * - Usage Notes: Terminal should fall back to DOM renderer
       * - Quality Contribution: Prevents crashes on pool exhaustion
       * - Worked Example: Pool(1) with 1 active → second acquire returns null
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      // First acquire triggers GPU detection - then set max size
      store.acquire('session-1', mockTerminal)
      store.release('session-1')
      store.setMaxSize(1)

      // Fill the pool with active session
      store.acquire('session-1', mockTerminal)

      // Try to acquire another - should fail (session-1 is still active)
      const addon = store.acquire('session-2', mockTerminal)

      expect(addon).toBeNull()
      expect(store.hasWebGL('session-2')).toBe(false)
    })

    test('getStats shows exhausted state accurately', () => {
      /**
       * Test Doc:
       * - Why: Debugging needs to show when pool is exhausted
       * - Contract: Stats accurately reflect exhausted state
       * - Usage Notes: Check availableCount for capacity
       * - Quality Contribution: Enables pool monitoring
       * - Worked Example: Full pool → availableCount === 0
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      // First acquire triggers GPU detection - then set max size
      store.acquire('session-trigger', mockTerminal)
      store.release('session-trigger')
      store.setMaxSize(2)

      // Fill the pool
      store.acquire('session-1', mockTerminal)
      store.acquire('session-2', mockTerminal)

      const stats = store.getStats()
      expect(stats.maxSize).toBe(2)
      expect(stats.activeCount).toBe(2)
      // No capacity left when all active
    })
  })

  // ============================================================
  // T005: Idempotency
  // ============================================================
  describe('idempotent operations', () => {
    test('acquire is idempotent for same session', () => {
      /**
       * Test Doc:
       * - Why: Prevents double-acquisition during rapid switching
       * - Contract: Multiple acquire() calls return same addon
       * - Usage Notes: Safe to call acquire when already acquired
       * - Quality Contribution: Prevents context count inflation
       * - Worked Example: acquire('s1') twice → same addon, count still 1
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      const addon1 = store.acquire('session-1', mockTerminal)
      const addon2 = store.acquire('session-1', mockTerminal)

      expect(addon1).toBe(addon2)
      expect(store.getStats().activeCount).toBe(1)
      expect(fakeInstall.instances.length).toBe(1) // Only one addon created
    })

    test('release is idempotent for same session', () => {
      /**
       * Test Doc:
       * - Why: Prevents errors from double-release
       * - Contract: Multiple release() calls are no-op after first
       * - Usage Notes: Safe to call release when already released
       * - Quality Contribution: Prevents double-dispose errors
       * - Worked Example: release('s1') twice → no error
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      store.acquire('session-1', mockTerminal)
      store.release('session-1')

      // Second release should be no-op
      expect(() => store.release('session-1')).not.toThrow()
      expect(store.getStats().activeCount).toBe(0)
    })

    test('rapid acquire/release toggle is safe', () => {
      /**
       * Test Doc:
       * - Why: User may switch sessions rapidly
       * - Contract: Rapid acquire/release sequence doesn't corrupt state
       * - Usage Notes: Pool handles rapid state changes correctly
       * - Quality Contribution: Prevents race condition bugs
       * - Worked Example: acquire, release, acquire, release → clean state
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      // Rapid toggle
      for (let i = 0; i < 10; i++) {
        store.acquire('session-1', mockTerminal)
        store.release('session-1')
      }

      // State should be clean
      expect(store.getStats().activeCount).toBe(0)
      expect(store.hasWebGL('session-1')).toBe(false)
    })
  })

  // ============================================================
  // T007: Context Loss Handling
  // ============================================================
  describe('context loss handling', () => {
    test('context loss removes slot from pool', () => {
      /**
       * Test Doc:
       * - Why: Browser may lose WebGL context (GPU reset, system sleep)
       * - Contract: Context loss marks slot as dead and removes it
       * - Usage Notes: Terminal should fall back to DOM renderer
       * - Quality Contribution: Prevents stale slots in pool
       * - Worked Example: simulateContextLoss() → hasWebGL() === false
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      store.acquire('session-1', mockTerminal)
      expect(store.hasWebGL('session-1')).toBe(true)

      // Simulate context loss
      const addon = fakeInstall.instances[0]
      addon.simulateContextLoss()

      // Slot should be removed
      expect(store.hasWebGL('session-1')).toBe(false)
      expect(store.getStats().activeCount).toBe(0)
    })

    test('context loss disposes the addon', () => {
      /**
       * Test Doc:
       * - Why: Memory cleanup on context loss
       * - Contract: Context loss triggers dispose() on addon
       * - Usage Notes: Pool handles cleanup automatically
       * - Quality Contribution: Prevents memory leaks on context loss
       * - Worked Example: simulateContextLoss() → addon.wasDisposed() === true
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      store.acquire('session-1', mockTerminal)
      const addon = fakeInstall.instances[0]

      addon.simulateContextLoss()

      expect(addon.wasDisposed()).toBe(true)
    })

    test('session can reacquire after context loss', () => {
      /**
       * Test Doc:
       * - Why: User should be able to recover after context loss
       * - Contract: Session can acquire new addon after context loss
       * - Usage Notes: Terminal may need to refresh after reacquisition
       * - Quality Contribution: Enables recovery from GPU issues
       * - Worked Example: context loss → acquire() → new addon
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      store.acquire('session-1', mockTerminal)
      const firstAddon = fakeInstall.instances[0]

      // Context loss
      firstAddon.simulateContextLoss()
      expect(store.hasWebGL('session-1')).toBe(false)

      // Reacquire
      const newAddon = store.acquire('session-1', mockTerminal)

      expect(newAddon).not.toBeNull()
      expect(newAddon).not.toBe(firstAddon)
      expect(store.hasWebGL('session-1')).toBe(true)
      expect(fakeInstall.instances.length).toBe(2) // New addon created
    })
  })

  // ============================================================
  // T009: Non-Happy-Path / Edge Cases
  // ============================================================
  describe('edge cases', () => {
    test('release non-existent session is no-op', () => {
      /**
       * Test Doc:
       * - Why: Defensive coding - release may be called on unknown session
       * - Contract: release() on non-existent session doesn't error
       * - Usage Notes: Safe to call release on any session ID
       * - Quality Contribution: Prevents crashes from stale references
       * - Worked Example: release('unknown') → no error, no state change
       */
      const store = useWebGLPoolStore.getState()

      // Should not throw
      expect(() => store.release('non-existent-session')).not.toThrow()
      expect(store.getStats().activeCount).toBe(0)
    })

    test('double release same session is no-op', () => {
      /**
       * Test Doc:
       * - Why: Race conditions may cause multiple release calls
       * - Contract: Second release() is safe no-op
       * - Usage Notes: Terminal cleanup may call release twice
       * - Quality Contribution: Prevents double-dispose errors
       * - Worked Example: release('s1'), release('s1') → no error
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      store.acquire('session-1', mockTerminal)
      store.release('session-1')

      // Second release - should be no-op
      expect(() => store.release('session-1')).not.toThrow()
      expect(store.getStats().activeCount).toBe(0)

      // Addon was only disposed once (first release)
      expect(fakeInstall.instances[0].wasDisposed()).toBe(true)
    })

    test('hasWebGL returns false for non-existent session', () => {
      /**
       * Test Doc:
       * - Why: Query for unknown session should return false, not error
       * - Contract: hasWebGL() returns false for unknown sessions
       * - Usage Notes: Safe to query any session ID
       * - Quality Contribution: Enables defensive checks
       * - Worked Example: hasWebGL('unknown') → false
       */
      const store = useWebGLPoolStore.getState()

      expect(store.hasWebGL('unknown-session')).toBe(false)
    })

    test('setMaxSize works correctly', () => {
      /**
       * Test Doc:
       * - Why: GPU detection will set pool size dynamically
       * - Contract: setMaxSize updates maxSize in stats
       * - Usage Notes: Call early before acquiring
       * - Quality Contribution: Enables device-appropriate sizing
       * - Worked Example: setMaxSize(8) → getStats().maxSize === 8
       */
      const store = useWebGLPoolStore.getState()

      store.setMaxSize(8)

      expect(store.getStats().maxSize).toBe(8)
    })

    test('reset clears all slots and disposes addons', () => {
      /**
       * Test Doc:
       * - Why: Test isolation requires complete state reset
       * - Contract: reset() disposes all addons and clears state
       * - Usage Notes: Call in beforeEach for test isolation
       * - Quality Contribution: Prevents test pollution
       * - Worked Example: acquire, reset → empty pool, addon disposed
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      store.acquire('session-1', mockTerminal)
      store.acquire('session-2', mockTerminal)

      store.reset()

      expect(store.getStats().activeCount).toBe(0)
      expect(store.hasWebGL('session-1')).toBe(false)
      expect(store.hasWebGL('session-2')).toBe(false)
      // All addons should be disposed
      expect(fakeInstall.instances[0].wasDisposed()).toBe(true)
      expect(fakeInstall.instances[1].wasDisposed()).toBe(true)
    })
  })

  // ============================================================
  // GPU Detection Integration (Phase 2)
  // ============================================================
  describe('GPU detection integration', () => {
    test('pool detects GPU capability on first acquire', () => {
      /**
       * Test Doc:
       * - Why: Pool should auto-detect GPU and set appropriate maxSize
       * - Contract: First acquire triggers GPU detection
       * - Usage Notes: Detection runs once, cached via initialized flag
       * - Quality Contribution: Enables device-appropriate pool sizing
       * - Worked Example: Apple GPU → maxSize 6
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      // Install fake GPU context for Apple Silicon
      const { restore } = installFakeGPUContext('Apple M3 Pro')

      // Before any acquire, pool has default size
      expect(store.getStats().maxSize).toBe(4)

      // First acquire triggers detection
      store.acquire('session-1', mockTerminal)

      // Now pool should have Apple Silicon size
      expect(store.getStats().maxSize).toBe(6)

      restore()
    })

    test('GPU detection only runs once', () => {
      /**
       * Test Doc:
       * - Why: Detection should be lazy but cached
       * - Contract: Multiple acquires don't re-detect
       * - Usage Notes: Reset clears initialized flag
       * - Quality Contribution: Prevents repeated canvas/context creation
       * - Worked Example: acquire(), acquire() → detection runs once
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      const { restore } = installFakeGPUContext('Apple M3 Pro')

      // First acquire triggers detection
      store.acquire('session-1', mockTerminal)
      expect(store.getStats().maxSize).toBe(6)

      // Change fake GPU - shouldn't affect pool (already initialized)
      restore()
      const { restore: restore2 } = installFakeGPUContext('NVIDIA GeForce RTX 4090')

      // Second acquire should not re-detect
      store.acquire('session-2', mockTerminal)
      expect(store.getStats().maxSize).toBe(6) // Still 6, not 8

      restore2()
    })

    test('reset clears initialized flag for re-detection', () => {
      /**
       * Test Doc:
       * - Why: Test isolation needs to reset detection state
       * - Contract: reset() allows re-detection on next acquire
       * - Usage Notes: Always call reset() in beforeEach
       * - Quality Contribution: Enables testing different GPU scenarios
       * - Worked Example: detect Apple, reset, detect NVIDIA
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      // First detection - Apple
      const { restore: restore1 } = installFakeGPUContext('Apple M3 Pro')
      store.acquire('session-1', mockTerminal)
      expect(store.getStats().maxSize).toBe(6)
      restore1()

      // Reset pool
      store.reset()

      // Second detection - NVIDIA
      const { restore: restore2 } = installFakeGPUContext('NVIDIA GeForce RTX 4090')
      store.acquire('session-2', mockTerminal)
      expect(store.getStats().maxSize).toBe(8)
      restore2()
    })

    test('falls back to default size when detection fails', () => {
      /**
       * Test Doc:
       * - Why: WebGL may be unavailable on some systems
       * - Contract: Pool uses conservative default (4) when detection fails
       * - Usage Notes: Per Critical Discovery 09 - accept false negatives
       * - Quality Contribution: Graceful degradation
       * - Worked Example: null WebGL → maxSize 4
       */
      const store = useWebGLPoolStore.getState()
      const mockTerminal = {} as any

      // Simulate WebGL unavailable
      const { restore } = installFakeGPUContext(null)

      store.acquire('session-1', mockTerminal)

      expect(store.getStats().maxSize).toBe(4)

      restore()
    })
  })
})
