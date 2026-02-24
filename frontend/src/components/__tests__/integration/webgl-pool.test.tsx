/**
 * @file webgl-pool.test.tsx
 * @description Integration tests for WebGL pool and Terminal component.
 *
 * Test Doc: Validates that Terminal.tsx correctly acquires/releases WebGL
 * from the pool based on isFocused state. Uses fakes per ADR-0004.
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
import { ThemePreviewProvider } from '../../../contexts/ThemePreviewContext'
import type { ReactNode } from 'react'

// Wrapper to provide required context providers for Terminal
function Providers({ children }: { children: ReactNode }) {
  return <ThemePreviewProvider>{children}</ThemePreviewProvider>
}

const renderWithProviders = (ui: React.ReactElement) =>
  render(ui, { wrapper: Providers })

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
      element = document.createElement('div')
      loadAddon = vi.fn()
      open = vi.fn()
      dispose = vi.fn()
      onData = vi.fn().mockReturnValue({ dispose: vi.fn() })
      onTitleChange = vi.fn().mockReturnValue({ dispose: vi.fn() })
      registerLinkProvider = vi.fn().mockReturnValue({ dispose: vi.fn() })
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
      renderWithProviders(<Terminal sessionId={sessionId} isFocused={true} />)

      // Wait for effects to run
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Assert pool has WebGL for this session
      const pool = useWebGLPoolStore.getState()
      expect(pool.hasWebGL(sessionId)).toBe(true)
      expect(pool.getStats().activeCount).toBe(1)
    })

    test('inactive terminal still acquires WebGL (all visible terminals get WebGL)', async () => {
      /**
       * Test Doc:
       * - Why: All visible (mounted) terminals acquire WebGL regardless of focus
       * - Contract: WebGL is acquired on mount, not based on isFocused
       * - Usage Notes: Pool manages capacity; isFocused controls output buffering
       * - Quality Contribution: Documents actual acquire-on-mount behavior
       * - Worked Example: isFocused=false, mounted → pool.hasWebGL === true
       */
      const sessionId = 'test-session-inactive'

      // Render terminal with isActive=false
      renderWithProviders(<Terminal sessionId={sessionId} isFocused={false} />)

      // Wait for effects
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // WebGL is acquired on mount for all visible terminals
      const pool = useWebGLPoolStore.getState()
      expect(pool.hasWebGL(sessionId)).toBe(true)
      expect(pool.getStats().activeCount).toBe(1)
    })
  })

  describe('release on unmount', () => {
    test('terminal retains WebGL when becoming inactive (released on unmount)', async () => {
      /**
       * Test Doc:
       * - Why: WebGL is acquired on mount, retained while mounted
       * - Contract: isFocused change does NOT release WebGL; unmount does
       * - Usage Notes: Pool manages capacity via mount/unmount lifecycle
       * - Quality Contribution: Documents actual release-on-unmount behavior
       * - Worked Example: isFocused true→false → pool.hasWebGL still true
       */
      const sessionId = 'test-session-release'

      // Render active terminal
      const { rerender, unmount } = renderWithProviders(
        <Terminal sessionId={sessionId} isFocused={true} />
      )

      // Wait for acquire
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Verify acquired
      expect(useWebGLPoolStore.getState().hasWebGL(sessionId)).toBe(true)

      // Deactivate terminal — WebGL is retained (acquired on mount, not focus)
      rerender(<Terminal sessionId={sessionId} isFocused={false} />)

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Still has WebGL while mounted
      expect(useWebGLPoolStore.getState().hasWebGL(sessionId)).toBe(true)

      // Unmount releases WebGL
      unmount()
      expect(useWebGLPoolStore.getState().hasWebGL(sessionId)).toBe(false)
      expect(useWebGLPoolStore.getState().getStats().activeCount).toBe(0)
    })
  })

  describe('session switch', () => {
    test('both mounted terminals acquire WebGL from pool', async () => {
      /**
       * Test Doc:
       * - Why: All visible terminals acquire WebGL on mount
       * - Contract: Both mounted terminals get WebGL regardless of focus
       * - Usage Notes: Pool manages capacity; both fit within maxSize
       * - Quality Contribution: Verifies multi-terminal WebGL allocation
       * - Worked Example: A+B mounted → both have WebGL, activeCount=2
       */
      const sessionA = 'session-a'
      const sessionB = 'session-b'

      // Render both terminals
      renderWithProviders(
        <>
          <Terminal sessionId={sessionA} isFocused={true} />
          <Terminal sessionId={sessionB} isFocused={false} />
        </>
      )

      // Wait for acquire
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Both mounted terminals acquire WebGL
      const pool = useWebGLPoolStore.getState()
      expect(pool.hasWebGL(sessionA)).toBe(true)
      expect(pool.hasWebGL(sessionB)).toBe(true)
      expect(pool.getStats().activeCount).toBe(2)
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
      const { unmount } = renderWithProviders(
        <Terminal sessionId={sessionId} isFocused={true} />
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
    test('rapid switching (10x) retains WebGL for both mounted terminals', async () => {
      /**
       * Test Doc:
       * - Why: Rapid focus switching must not corrupt pool state
       * - Contract: Both mounted terminals retain WebGL (acquired on mount)
       * - Usage Notes: Per CD-05, pool is idempotent; focus doesn't affect WebGL
       * - Quality Contribution: Prevents race condition bugs
       * - Worked Example: 10 switches → both sessions still have WebGL
       */
      const sessionA = 'session-rapid-a'
      const sessionB = 'session-rapid-b'

      const { rerender } = renderWithProviders(
        <>
          <Terminal sessionId={sessionA} isFocused={true} />
          <Terminal sessionId={sessionB} isFocused={false} />
        </>
      )

      // Rapid switching 10 times
      for (let i = 0; i < 10; i++) {
        const aActive = i % 2 === 0
        rerender(
          <>
            <Terminal sessionId={sessionA} isFocused={aActive} />
            <Terminal sessionId={sessionB} isFocused={!aActive} />
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

      // Both terminals remain mounted, both retain WebGL
      const pool = useWebGLPoolStore.getState()
      expect(pool.hasWebGL(sessionA)).toBe(true)
      expect(pool.hasWebGL(sessionB)).toBe(true)
      expect(pool.getStats().activeCount).toBe(2)
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
      renderWithProviders(<Terminal sessionId={sessionId} isFocused={true} />)

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
      renderWithProviders(<Terminal sessionId={session1} isFocused={true} />)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })

      // Set pool to size 1 (exhausted with session1)
      useWebGLPoolStore.getState().setMaxSize(1)

      // Render second active terminal (should not get WebGL)
      renderWithProviders(<Terminal sessionId={session2} isFocused={true} />)
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
