import { useCallback, useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useCentralWebSocket, type SessionHandlers } from '../hooks/useCentralWebSocket'
import { useActivityDebounce } from '../hooks/useActivityDebounce'
import { useTerminalTheme, getTerminalOptions } from '../hooks/useTerminalTheme'
import { useSettingsStore, selectTheme } from '../stores/settings'
import { useSessionStore } from '../stores/sessions'
import { getThemeById } from '../themes'
import { useWebGLPoolStore } from '../stores/webglPool'
import { type IWebglAddon } from '../test/fakeWebglAddon'
import { useThemePreview } from '../contexts/ThemePreviewContext'

interface TerminalProps {
  /** Session ID for message routing */
  sessionId: string
  /** Controls WebGL acquisition and resize event sending. Does NOT control visibility. */
  isFocused?: boolean
  /** Callback when terminal is ready */
  onReady?: (terminal: XTerm) => void
  /** Callback when the session process exits (for SessionEndedOverlay in split panes) */
  onSessionExit?: (exitCode: number) => void
}

/**
 * Terminal component that renders an xterm.js terminal for a specific session.
 *
 * Per Phase 5: Accepts sessionId prop for multi-session support.
 * WebGL is managed by the pool based on isFocused state (see stores/webglPool.ts).
 */
export function Terminal({
  sessionId,
  isFocused = true,
  onReady,
  onSessionExit,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglAddonRef = useRef<IWebglAddon | null>(null)
  // Per-instance debounce timer for resize events (moved from module-level to fix multi-instance bug)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache container dimensions to skip fit() when size hasn't changed
  const lastContainerSizeRef = useRef<{ w: number; h: number } | null>(null)
  // Cache terminal cols/rows to skip sendResize when dimensions haven't changed
  const lastDimsRef = useRef<{ cols: number; rows: number } | null>(null)
  // Capture initial value for onReady (don't change after init)
  const onReadyRef = useRef(onReady)
  // Track active state to prevent sending resize for hidden terminals
  const isFocusedRef = useRef(isFocused)

  const { sendInput, sendResize, registerSession, unregisterSession, connectionState } =
    useCentralWebSocket()

  // Activity tracking for idle indicators (per Phase 1 of plan 007)
  const updateActivityDebounced = useActivityDebounce()

  // Use refs to avoid re-running effects when these callbacks change
  const sendResizeRef = useRef(sendResize)
  const sendInputRef = useRef(sendInput)
  useEffect(() => {
    sendResizeRef.current = sendResize
    sendInputRef.current = sendInput
  }, [sendResize, sendInput])

  // Keep isFocusedRef in sync
  useEffect(() => {
    isFocusedRef.current = isFocused
  }, [isFocused])

  // Output throttle for unfocused panes (DYK-02)
  // When unfocused, buffer output and flush at ~200ms intervals to reduce DOM rendering overhead
  const outputBufferRef = useRef<string[]>([])
  const throttleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Flush buffered output to terminal
  const flushOutputBuffer = useCallback(() => {
    if (outputBufferRef.current.length === 0) return
    const buffered = outputBufferRef.current.join('')
    outputBufferRef.current = []
    xtermRef.current?.write(buffered)
  }, [])

  // Start/stop throttle timer based on focus state
  useEffect(() => {
    if (!isFocused) {
      // Start periodic flush for unfocused pane
      throttleTimerRef.current = setInterval(flushOutputBuffer, 200)
    } else {
      // Focused: flush immediately and stop timer
      if (throttleTimerRef.current) {
        clearInterval(throttleTimerRef.current)
        throttleTimerRef.current = null
      }
      flushOutputBuffer()
    }
    return () => {
      if (throttleTimerRef.current) {
        clearInterval(throttleTimerRef.current)
        throttleTimerRef.current = null
      }
    }
  }, [isFocused, flushOutputBuffer])

  // Handle terminal output - write to xterm (throttled when unfocused)
  const onOutput = useCallback((data: string) => {
    if (isFocusedRef.current) {
      xtermRef.current?.write(data)
    } else {
      outputBufferRef.current.push(data)
    }
  }, [])

  // Handle errors - display in terminal
  const onError = useCallback((error: string) => {
    xtermRef.current?.writeln(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n`)
  }, [])

  // Ref for onSessionExit callback (stable across renders)
  const onSessionExitRef = useRef(onSessionExit)
  onSessionExitRef.current = onSessionExit

  // Handle exit - display message and notify parent
  const onExit = useCallback((code: number) => {
    xtermRef.current?.writeln(
      `\r\n\x1b[33mProcess exited with code ${code}\x1b[0m\r\n`
    )
    onSessionExitRef.current?.(code)
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

    // Acquire WebGL from pool for GPU-accelerated rendering (all visible terminals)
    // Pool handles capacity limits — up to maxSize terminals get WebGL, rest use DOM renderer
    const pool = useWebGLPoolStore.getState()
    const webglAddon = pool.acquire(sessionId, terminal)
    if (webglAddon) {
      terminal.loadAddon(webglAddon as unknown as Parameters<typeof terminal.loadAddon>[0])
      webglAddonRef.current = webglAddon
    }

    // Initial fit
    fitAddon.fit()

    // Handle resize with debounce (uses per-instance ref to avoid multi-terminal conflicts)
    // Each terminal observes its own container — no global window.resize broadcast needed
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      resizeTimeoutRef.current = setTimeout(() => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit()
          const { cols, rows } = xtermRef.current
          // Only send resize to backend when dimensions actually changed
          const last = lastDimsRef.current
          if (!last || last.cols !== cols || last.rows !== rows) {
            lastDimsRef.current = { cols, rows }
            sendResizeRef.current(sessionId, cols, rows)
          }
        }
      }, 50) // 50ms debounce
    }

    // ResizeObserver on own container detects both browser window resize and panel drag resize
    // Use contentRect to skip entirely when container dimensions haven't changed
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      const prev = lastContainerSizeRef.current
      if (prev && prev.w === Math.round(width) && prev.h === Math.round(height)) return
      lastContainerSizeRef.current = { w: Math.round(width), h: Math.round(height) }
      handleResize()
    })
    resizeObserver.observe(containerRef.current)

    // Notify parent that terminal is ready (use ref for stable callback)
    onReadyRef.current?.(terminal)

    // Cleanup
    return () => {
      resizeObserver.disconnect()
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      // Release WebGL back to pool before disposing terminal
      // Pool owns disposal per Critical Discovery 03
      const pool = useWebGLPoolStore.getState()
      pool.release(sessionId)
      webglAddonRef.current = null
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

    // Send initial resize when connected — all visible terminals need correct dimensions
    if (connectionState === 'connected' && fitAddonRef.current) {
      fitAddonRef.current.fit()
      const { cols, rows } = xtermRef.current
      const last = lastDimsRef.current
      if (!last || last.cols !== cols || last.rows !== rows) {
        lastDimsRef.current = { cols, rows }
        sendResizeRef.current(sessionId, cols, rows)
      }
    }

    // Handle user input - route to specific session
    // Per Critical Finding 02: Fire-and-forget activity update (non-blocking)
    const disposable = xtermRef.current.onData((data) => {
      // Update activity timestamp (debounced, fire-and-forget)
      updateActivityDebounced(sessionId)
      if (connectionState === 'connected') {
        sendInputRef.current(sessionId, data)
      }
    })

    return () => {
      disposable.dispose()
    }
  }, [connectionState, sessionId, updateActivityDebounced]) // sendInput/sendResize accessed via refs

  // Get title update function from session store
  const updateTitleFromTerminal = useSessionStore((state) => state.updateTitleFromTerminal)

  // Wire up terminal title change events (OSC 0 and OSC 2 escape sequences)
  // Per Plan 008: Dynamic session titles from shell/vim/tmux title updates
  useEffect(() => {
    if (!xtermRef.current) return

    const disposable = xtermRef.current.onTitleChange((title) => {
      updateTitleFromTerminal(sessionId, title)
    })

    return () => {
      disposable.dispose()
    }
  }, [sessionId, updateTitleFromTerminal])

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
    if (isFocused && xtermRef.current) {
      // Small delay to ensure DOM is ready after display:none -> block transition
      // Use requestAnimationFrame for optimal timing with browser paint cycle
      requestAnimationFrame(() => {
        if (xtermRef.current && fitAddonRef.current) {
          // Refresh the terminal to fix WebGL rendering after visibility change
          xtermRef.current.refresh(0, xtermRef.current.rows - 1)
          // Re-fit to ensure proper sizing
          fitAddonRef.current.fit()
          // Send resize to backend only if dimensions changed
          const { cols, rows } = xtermRef.current
          const last = lastDimsRef.current
          if (!last || last.cols !== cols || last.rows !== rows) {
            lastDimsRef.current = { cols, rows }
            sendResizeRef.current(sessionId, cols, rows)
          }
          // Focus the terminal
          xtermRef.current.focus()
        }
      })
    }
  }, [isFocused, sessionId])

  // WebGL is now acquired on mount in the init effect above.
  // All visible terminals get WebGL (pool handles capacity limits).

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
