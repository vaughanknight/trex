/**
 * @file webgl-pool.test.tsx
 * @description Integration tests for WebGL pool and Terminal component.
 *
 * Test Doc: Validates that Terminal.tsx correctly acquires/releases WebGL
 * from the pool based on isActive state. Uses fakes per ADR-0004.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useWebGLPoolStore } from '../../../stores/webglPool'
import {
  installFakeWebglAddon,
  FakeWebglAddon,
} from '../../../test/fakeWebglAddon'
import {
  installFakeGPUContext,
  resetFakeGPUContext,
} from '../../../test/fakeGPUContext'
import { Terminal } from '../../Terminal'

// Mock useCentralWebSocket to avoid real WebSocket connections
vi.mock('../../../hooks/useCentralWebSocket', () => ({
  useCentralWebSocket: () => ({
    sendInput: vi.fn(),
    sendResize: vi.fn(),
    registerSession: vi.fn(),
    unregisterSession: vi.fn(),
    connectionState: 'connected',
  }),
}))

// Mock xterm.js modules - use factory functions to avoid hoisting issues
vi.mock('@xterm/xterm', () => {
  return {
    Terminal: class MockXTerm {
      rows = 24
      cols = 80
      options = {}
      loadAddon = vi.fn()
      open = vi.fn()
      dispose = vi.fn()
      onData = vi.fn().mockReturnValue({ dispose: vi.fn() })
      write = vi.fn()
      writeln = vi.fn()
      refresh = vi.fn()
      focus = vi.fn()
    },
  }
})

vi.mock('@xterm/addon-fit', () => {
  return {
    FitAddon: class MockFitAddon {
      fit = vi.fn()
      dispose = vi.fn()
    },
  }
})

// Mock WebglAddon - we want pool to manage this, but Terminal still imports it
vi.mock('@xterm/addon-webgl', () => {
  return {
    WebglAddon: class MockWebglAddon {
      dispose = vi.fn()
      onContextLoss = vi.fn().mockReturnValue({ dispose: vi.fn() })
    },
  }
})

describe('WebGL Pool Integration', () => {
  let fakeWebGL: { instances: FakeWebglAddon[]; restore: () => void }
  let fakeGPU: { restore: () => void }

  beforeEach(() => {
    // Install fakes per ADR-0004
    fakeWebGL = installFakeWebglAddon()
    fakeGPU = installFakeGPUContext('Apple M3 Pro') // maxSize = 6

    // Reset pool state
    useWebGLPoolStore.getState().reset()

    // Suppress console output for cleaner test output
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    fakeWebGL.restore()
    fakeGPU.restore()
    resetFakeGPUContext()
    vi.restoreAllMocks()
  })

  describe('acquire on activate', () => {
    test('active terminal acquires WebGL from pool', async () => {
      /**
       * Test Doc:
       * - Why: Core feature - active terminal must get GPU rendering
       * - Contract: When isActive=true, terminal acquires WebGL from pool
       * - Usage Notes: Pool auto-detects GPU and sets maxSize
       * - Quality Contribution: Verifies pool-terminal integration
       * - Worked Example: isActive=true → pool.hasWebGL(sessionId) === true
       */
      const sessionId = 'test-session-1'

      // Render terminal with isActive=true
      render(<Terminal sessionId={sessionId} isActive={true} />)

      // Wait for effects to run
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Assert pool has WebGL for this session
      const pool = useWebGLPoolStore.getState()
      expect(pool.hasWebGL(sessionId)).toBe(true)
      expect(pool.getStats().activeCount).toBe(1)
    })

    test('inactive terminal does not acquire WebGL', async () => {
      /**
       * Test Doc:
       * - Why: Inactive terminals should not consume pool capacity
       * - Contract: When isActive=false, terminal does NOT acquire
       * - Usage Notes: Terminal renders but without WebGL
       * - Quality Contribution: Prevents unnecessary pool consumption
       * - Worked Example: isActive=false → pool.hasWebGL === false
       */
      const sessionId = 'test-session-inactive'

      // Render terminal with isActive=false
      render(<Terminal sessionId={sessionId} isActive={false} />)

      // Wait for effects
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Assert pool does NOT have WebGL for this session
      const pool = useWebGLPoolStore.getState()
      expect(pool.hasWebGL(sessionId)).toBe(false)
      expect(pool.getStats().activeCount).toBe(0)
    })
  })

  describe('release on deactivate', () => {
    test('terminal releases WebGL when becoming inactive', async () => {
      /**
       * Test Doc:
       * - Why: Inactive terminals must release pool resources
       * - Contract: When isActive changes false→true, terminal releases
       * - Usage Notes: Pool disposes addon, Terminal uses DOM renderer
       * - Quality Contribution: Prevents pool exhaustion
       * - Worked Example: isActive true→false → pool.hasWebGL === false
       */
      const sessionId = 'test-session-release'

      // Render active terminal
      const { rerender } = render(
        <Terminal sessionId={sessionId} isActive={true} />
      )

      // Wait for acquire
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Verify acquired
      expect(useWebGLPoolStore.getState().hasWebGL(sessionId)).toBe(true)

      // Deactivate terminal
      rerender(<Terminal sessionId={sessionId} isActive={false} />)

      // Wait for release
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Assert released
      const pool = useWebGLPoolStore.getState()
      expect(pool.hasWebGL(sessionId)).toBe(false)
      expect(pool.getStats().activeCount).toBe(0)
    })
  })

  describe('session switch', () => {
    test('session switch releases old and acquires new', async () => {
      /**
       * Test Doc:
       * - Why: Session switching must transfer WebGL correctly
       * - Contract: Old session releases, new session acquires
       * - Usage Notes: Sequence matters for flicker prevention
       * - Quality Contribution: Verifies no WebGL leak on switch
       * - Worked Example: Switch A→B → A released, B acquired
       */
      const sessionA = 'session-a'
      const sessionB = 'session-b'

      // Render Terminal A as active
      const { rerender } = render(
        <>
          <Terminal sessionId={sessionA} isActive={true} />
          <Terminal sessionId={sessionB} isActive={false} />
        </>
      )

      // Wait for A to acquire
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      expect(useWebGLPoolStore.getState().hasWebGL(sessionA)).toBe(true)
      expect(useWebGLPoolStore.getState().hasWebGL(sessionB)).toBe(false)

      // Switch to B
      rerender(
        <>
          <Terminal sessionId={sessionA} isActive={false} />
          <Terminal sessionId={sessionB} isActive={true} />
        </>
      )

      // Wait for switch
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Assert A released, B acquired
      const pool = useWebGLPoolStore.getState()
      expect(pool.hasWebGL(sessionA)).toBe(false)
      expect(pool.hasWebGL(sessionB)).toBe(true)
      expect(pool.getStats().activeCount).toBe(1)
    })
  })

  describe('cleanup on unmount', () => {
    test('unmount calls pool.release()', async () => {
      /**
       * Test Doc:
       * - Why: Component unmount must release pool resources
       * - Contract: Cleanup effect calls pool.release()
       * - Usage Notes: Per CD-03, pool owns disposal
       * - Quality Contribution: Prevents memory leaks
       * - Worked Example: Unmount → addon.wasDisposed() === true
       */
      const sessionId = 'test-session-unmount'

      // Render active terminal
      const { unmount } = render(
        <Terminal sessionId={sessionId} isActive={true} />
      )

      // Wait for acquire
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Verify acquired
      expect(useWebGLPoolStore.getState().hasWebGL(sessionId)).toBe(true)
      expect(fakeWebGL.instances.length).toBeGreaterThan(0)

      // Unmount
      unmount()

      // Assert released
      expect(useWebGLPoolStore.getState().hasWebGL(sessionId)).toBe(false)
      // Pool should have disposed the addon
      const addon = fakeWebGL.instances[0]
      if (addon) {
        expect(addon.wasDisposed()).toBe(true)
      }
    })
  })

  describe('stress tests', () => {
    test('rapid switching (10x) ends with correct state', async () => {
      /**
       * Test Doc:
       * - Why: Rapid session switching must not corrupt pool state
       * - Contract: Final session has WebGL, others don't
       * - Usage Notes: Per CD-05, pool is idempotent
       * - Quality Contribution: Prevents race condition bugs
       * - Worked Example: 10 switches → final session has WebGL
       */
      const sessionA = 'session-rapid-a'
      const sessionB = 'session-rapid-b'

      const { rerender } = render(
        <>
          <Terminal sessionId={sessionA} isActive={true} />
          <Terminal sessionId={sessionB} isActive={false} />
        </>
      )

      // Rapid switching 10 times
      for (let i = 0; i < 10; i++) {
        const aActive = i % 2 === 0
        rerender(
          <>
            <Terminal sessionId={sessionA} isActive={aActive} />
            <Terminal sessionId={sessionB} isActive={!aActive} />
          </>
        )
        // Small delay to allow effects to process
        await act(async () => {
          await new Promise((r) => setTimeout(r, 10))
        })
      }

      // Final wait for settling
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100))
      })

      // After 10 switches (0-9), i=9 is odd, so A is inactive, B is active
      const pool = useWebGLPoolStore.getState()
      expect(pool.hasWebGL(sessionA)).toBe(false)
      expect(pool.hasWebGL(sessionB)).toBe(true)
      expect(pool.getStats().activeCount).toBe(1)
    })
  })

  describe('context loss', () => {
    test('context loss handled gracefully', async () => {
      /**
       * Test Doc:
       * - Why: GPU context loss must not crash terminal
       * - Contract: Pool handles loss, terminal continues with DOM renderer
       * - Usage Notes: Per CD-04, pool registers onContextLoss
       * - Quality Contribution: Graceful degradation under GPU stress
       * - Worked Example: simulateContextLoss() → terminal continues working
       */
      const sessionId = 'test-session-context-loss'

      // Render active terminal
      render(<Terminal sessionId={sessionId} isActive={true} />)

      // Wait for acquire
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Verify acquired
      expect(useWebGLPoolStore.getState().hasWebGL(sessionId)).toBe(true)
      expect(fakeWebGL.instances.length).toBeGreaterThan(0)

      // Simulate context loss
      const addon = fakeWebGL.instances[0]
      addon.simulateContextLoss()

      // Pool should have removed the slot
      expect(useWebGLPoolStore.getState().hasWebGL(sessionId)).toBe(false)
      expect(addon.wasDisposed()).toBe(true)

      // Terminal should still be rendered (just without WebGL)
      // This is verified by no errors being thrown
    })
  })

  describe('pool exhaustion', () => {
    test('pool exhaustion uses DOM renderer gracefully', async () => {
      /**
       * Test Doc:
       * - Why: When pool is full, terminal should degrade gracefully
       * - Contract: Pool returns null, terminal uses DOM renderer
       * - Usage Notes: No crash, no error - just no WebGL
       * - Quality Contribution: Graceful degradation
       * - Worked Example: Pool(1) full → second terminal works without WebGL
       */
      const session1 = 'session-exhaust-1'
      const session2 = 'session-exhaust-2'

      // First acquire to trigger detection
      render(<Terminal sessionId={session1} isActive={true} />)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Set pool to size 1 (exhausted with session1)
      useWebGLPoolStore.getState().setMaxSize(1)

      // Render second active terminal (should not get WebGL)
      render(<Terminal sessionId={session2} isActive={true} />)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Session 1 has WebGL, Session 2 does not (pool exhausted)
      const pool = useWebGLPoolStore.getState()
      expect(pool.hasWebGL(session1)).toBe(true)
      expect(pool.hasWebGL(session2)).toBe(false)
      expect(pool.getStats().activeCount).toBe(1)
      expect(pool.getStats().maxSize).toBe(1)
    })
  })
})
