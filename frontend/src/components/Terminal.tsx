import { useCallback, useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useCentralWebSocket, type SessionHandlers } from '../hooks/useCentralWebSocket'
import { useTerminalTheme, getTerminalOptions } from '../hooks/useTerminalTheme'
import { useSettingsStore, selectTheme } from '../stores/settings'
import { getThemeById } from '../themes'
import { useWebGLPoolStore } from '../stores/webglPool'
import { type IWebglAddon } from '../test/fakeWebglAddon'
import { useThemePreview } from '../contexts/ThemePreviewContext'

interface TerminalProps {
  /** Session ID for message routing */
  sessionId: string
  /** Whether this terminal is active/visible */
  isActive?: boolean
  /** Callback when terminal is ready */
  onReady?: (terminal: XTerm) => void
}

/**
 * Terminal component that renders an xterm.js terminal for a specific session.
 *
 * Per Phase 5: Accepts sessionId prop for multi-session support.
 * WebGL is managed by the pool based on isActive state (see stores/webglPool.ts).
 */
export function Terminal({
  sessionId,
  isActive = true,
  onReady,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglAddonRef = useRef<IWebglAddon | null>(null)
  // Per-instance debounce timer for resize events (moved from module-level to fix multi-instance bug)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Capture initial value for onReady (don't change after init)
  const onReadyRef = useRef(onReady)
  // Track active state to prevent sending resize for hidden terminals
  const isActiveRef = useRef(isActive)

  const { sendInput, sendResize, registerSession, unregisterSession, connectionState } =
    useCentralWebSocket()

  // Use refs to avoid re-running effects when these callbacks change
  const sendResizeRef = useRef(sendResize)
  const sendInputRef = useRef(sendInput)
  useEffect(() => {
    sendResizeRef.current = sendResize
    sendInputRef.current = sendInput
  }, [sendResize, sendInput])

  // Keep isActiveRef in sync
  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  // Handle terminal output - write to xterm
  const onOutput = useCallback((data: string) => {
    xtermRef.current?.write(data)
  }, [])

  // Handle errors - display in terminal
  const onError = useCallback((error: string) => {
    xtermRef.current?.writeln(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n`)
  }, [])

  // Handle exit - display message
  const onExit = useCallback((code: number) => {
    xtermRef.current?.writeln(
      `\r\n\x1b[33mProcess exited with code ${code}\x1b[0m\r\n`
    )
  }, [])

  // Register session handlers with central WebSocket
  useEffect(() => {
    const handlers: SessionHandlers = { onOutput, onError, onExit }
    registerSession(sessionId, handlers)

    return () => {
      unregisterSession(sessionId)
    }
  }, [sessionId, onOutput, onError, onExit, registerSession, unregisterSession])

  // Initialize xterm.js
  useEffect(() => {
    if (!containerRef.current) return

    // Get initial settings from store (applied immediately to avoid flash)
    const initialOptions = getTerminalOptions()

    // Create terminal with persisted settings
    const terminal = new XTerm({
      cursorBlink: true,
      ...initialOptions,
    })
    xtermRef.current = terminal

    // Create and load fit addon
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)

    // Open terminal in container
    terminal.open(containerRef.current)

    // Note: WebGL addon is now managed by the WebGL pool based on isActive state
    // See the isActive-based effect below for pool-based WebGL acquisition
    // The pool handles context loss and disposal - Terminal just acquires/releases

    // Initial fit
    fitAddon.fit()

    // Handle resize with debounce (uses per-instance ref to avoid multi-terminal conflicts)
    // Only send resize for active terminals to prevent hidden terminals sending tiny dimensions
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      resizeTimeoutRef.current = setTimeout(() => {
        if (fitAddonRef.current && xtermRef.current && isActiveRef.current) {
          fitAddonRef.current.fit()
          const { cols, rows } = xtermRef.current
          sendResizeRef.current(sessionId, cols, rows)
        }
      }, 50) // 50ms debounce
    }

    window.addEventListener('resize', handleResize)

    // Notify parent that terminal is ready (use ref for stable callback)
    onReadyRef.current?.(terminal)

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      // Note: WebGL addon is released via pool in the isActive effect cleanup
      // Pool owns disposal per Critical Discovery 03
      terminal.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]) // Only recreate terminal when sessionId changes. onReady is initial value only.

  // Apply theme/font/size changes from settings store
  useTerminalTheme(xtermRef.current)

  // Update background color to match theme (use preview if set)
  const committedTheme = useSettingsStore(selectTheme)
  const { previewTheme } = useThemePreview()
  const activeTheme = previewTheme ?? committedTheme

  // Wire up terminal input when connected
  useEffect(() => {
    if (!xtermRef.current) return

    // Send initial resize when connected (only for active terminal to avoid tiny dimensions)
    if (connectionState === 'connected' && fitAddonRef.current && isActiveRef.current) {
      fitAddonRef.current.fit()
      const { cols, rows } = xtermRef.current
      sendResizeRef.current(sessionId, cols, rows)
    }

    // Handle user input - route to specific session
    const disposable = xtermRef.current.onData((data) => {
      if (connectionState === 'connected') {
        sendInputRef.current(sessionId, data)
      }
    })

    return () => {
      disposable.dispose()
    }
  }, [connectionState, sessionId]) // sendInput/sendResize accessed via refs

  // Show connection state on initial render
  useEffect(() => {
    if (!xtermRef.current) return

    if (connectionState === 'connecting') {
      xtermRef.current.write('Connecting to terminal...\r\n')
    } else if (connectionState === 'error') {
      xtermRef.current.writeln('\r\n\x1b[31mConnection failed\x1b[0m')
    } else if (connectionState === 'disconnected') {
      xtermRef.current.writeln('\r\n\x1b[33mDisconnected\x1b[0m')
    }
  }, [connectionState])

  // Focus terminal and refresh rendering when active
  useEffect(() => {
    if (isActive && xtermRef.current) {
      // Small delay to ensure DOM is ready after display:none -> block transition
      // Use requestAnimationFrame for optimal timing with browser paint cycle
      requestAnimationFrame(() => {
        if (xtermRef.current && fitAddonRef.current) {
          // Refresh the terminal to fix WebGL rendering after visibility change
          xtermRef.current.refresh(0, xtermRef.current.rows - 1)
          // Re-fit to ensure proper sizing
          fitAddonRef.current.fit()
          // Send resize to backend with correct dimensions now that we're visible
          const { cols, rows } = xtermRef.current
          sendResizeRef.current(sessionId, cols, rows)
          // Focus the terminal
          xtermRef.current.focus()
        }
      })
    }
  }, [isActive, sessionId])

  // WebGL pool-based acquisition on isActive change
  // Per Critical Discovery 01: Move WebGL management to isActive-based effect
  // Per Critical Discovery 06: Use requestAnimationFrame for flicker prevention
  useEffect(() => {
    const terminal = xtermRef.current
    if (!terminal) return

    if (isActive) {
      // Acquire WebGL from pool when becoming active
      // Use requestAnimationFrame for optimal timing with browser paint cycle
      const frameId = requestAnimationFrame(() => {
        const pool = useWebGLPoolStore.getState()
        const addon = pool.acquire(sessionId, terminal)

        if (addon) {
          // Load addon into terminal
          terminal.loadAddon(addon as Parameters<typeof terminal.loadAddon>[0])
          webglAddonRef.current = addon
          // Refresh to sync rendering
          terminal.refresh(0, terminal.rows - 1)
        }
        // If addon is null (pool exhausted), terminal uses DOM renderer (existing behavior)
      })

      // Cleanup for this effect
      return () => {
        cancelAnimationFrame(frameId)
        // Release WebGL back to pool when becoming inactive or unmounting
        // Per Critical Discovery 03: Pool owns disposal, not Terminal
        const pool = useWebGLPoolStore.getState()
        pool.release(sessionId)
        webglAddonRef.current = null
      }
    }

    // If not active, nothing to acquire - just ensure we're released
    return () => {
      const pool = useWebGLPoolStore.getState()
      pool.release(sessionId)
      webglAddonRef.current = null
    }
  }, [isActive, sessionId])

  // Get background color from current theme
  const currentTheme = getThemeById(activeTheme)

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: currentTheme.background,
      }}
    />
  )
}
