import { useCallback, useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useTerminalSocket } from '../hooks/useTerminalSocket'
import { useTerminalTheme, getTerminalOptions } from '../hooks/useTerminalTheme'
import { useSettingsStore, selectTheme } from '../stores/settings'
import { getThemeById } from '../themes'

/**
 * Terminal component that renders an xterm.js terminal connected to the backend.
 */
export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sendResizeRef = useRef<((cols: number, rows: number) => void) | null>(
    null
  )
  // Per-instance debounce timer for resize events (moved from module-level to fix multi-instance bug)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Handle terminal output
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

  // Connect to WebSocket
  const { connectionState, sendInput, sendResize } = useTerminalSocket({
    onOutput,
    onError,
    onExit,
  })

  // Store sendResize in ref for resize handler
  sendResizeRef.current = sendResize

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

    // Try to load WebGL addon for performance
    try {
      const webglAddon = new WebglAddon()
      terminal.loadAddon(webglAddon)
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
      })
    } catch (e) {
      console.warn('WebGL addon not available, using default renderer')
    }

    // Initial fit
    fitAddon.fit()

    // Handle resize with debounce (uses per-instance ref to avoid multi-terminal conflicts)
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      resizeTimeoutRef.current = setTimeout(() => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit()
          const { cols, rows } = xtermRef.current
          sendResizeRef.current?.(cols, rows)
        }
      }, 100) // 100ms debounce
    }

    window.addEventListener('resize', handleResize)

    // Focus terminal
    terminal.focus()

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      terminal.dispose()
    }
  }, [])

  // Apply theme/font/size changes from settings store
  useTerminalTheme(xtermRef.current)

  // Update background color to match theme
  const theme = useSettingsStore(selectTheme)

  // Wire up terminal input when connected
  useEffect(() => {
    if (!xtermRef.current) return

    // Send initial resize
    if (connectionState === 'connected' && fitAddonRef.current) {
      fitAddonRef.current.fit()
      const { cols, rows } = xtermRef.current
      sendResize(cols, rows)
    }

    // Handle user input
    const disposable = xtermRef.current.onData((data) => {
      if (connectionState === 'connected') {
        sendInput(data)
      }
    })

    return () => {
      disposable.dispose()
    }
  }, [connectionState, sendInput, sendResize])

  // Show connection state
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

  // Get background color from current theme
  const currentTheme = getThemeById(theme)

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
