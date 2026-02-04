import { useCallback, useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useTerminalSocket } from '../hooks/useTerminalSocket'

// Debounce timer for resize events
let resizeTimeout: ReturnType<typeof setTimeout> | null = null

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

    // Create terminal
    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
      },
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

    // Handle resize with debounce
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      resizeTimeout = setTimeout(() => {
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
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      terminal.dispose()
    }
  }, [])

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

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1e1e1e',
      }}
    />
  )
}
