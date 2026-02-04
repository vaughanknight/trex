import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ClientMessage,
  ServerMessage,
  ConnectionState,
} from '../types/terminal'

interface UseTerminalSocketOptions {
  onOutput: (data: string) => void
  onError: (error: string) => void
  onExit: (code: number) => void
}

interface UseTerminalSocketReturn {
  connectionState: ConnectionState
  sendInput: (data: string) => void
  sendResize: (cols: number, rows: number) => void
}

/**
 * Hook for managing WebSocket connection to terminal backend.
 */
export function useTerminalSocket(
  options: UseTerminalSocketOptions
): UseTerminalSocketReturn {
  const { onOutput, onError, onExit } = options
  const wsRef = useRef<WebSocket | null>(null)
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting')

  // Connect to WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnectionState('connected')
    }

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data)
        switch (msg.type) {
          case 'output':
            if (msg.data) {
              onOutput(msg.data)
            }
            break
          case 'error':
            if (msg.error) {
              onError(msg.error)
            }
            break
          case 'exit':
            onExit(msg.code ?? 0)
            break
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    ws.onerror = () => {
      setConnectionState('error')
      onError('WebSocket connection error')
    }

    ws.onclose = () => {
      setConnectionState('disconnected')
    }

    return () => {
      ws.close()
    }
  }, [onOutput, onError, onExit])

  // Send input to terminal
  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'input', data }
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  // Send resize to terminal
  const sendResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'resize', cols, rows }
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return {
    connectionState,
    sendInput,
    sendResize,
  }
}
