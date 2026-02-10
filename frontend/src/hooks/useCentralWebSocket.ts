/**
 * Central WebSocket hook for multi-session terminal management.
 *
 * Provides a singleton WebSocket connection that:
 * - Connects LAZILY on first session creation (not on app mount)
 * - Routes messages by sessionId to per-session handlers
 * - Handles session creation via 'create' message type
 * - Maintains connection state
 * - Batches high-frequency output (50ms window) for performance
 *
 * Per Insight 2: WebSocket connects lazily on first session creation.
 * Per High Finding 04: All messages include sessionId for routing.
 * Per Phase 5 T009: Output batching for high-frequency terminal output.
 */

import { useCallback, useEffect, useRef } from 'react'
import { create } from 'zustand'
import type { ClientMessage, ServerMessage, ConnectionState } from '../types/terminal'
import { useActivityStore } from '../stores/activityStore'
import { useSessionStore } from '../stores/sessions'

// Session-specific message handlers
export interface SessionHandlers {
  onOutput: (data: string) => void
  onError: (error: string) => void
  onExit: (code: number) => void
}

// Output batching configuration
// 16ms = ~60fps, good balance between latency and CPU usage
const OUTPUT_BATCH_INTERVAL_MS = 16

// Output buffer for batching high-frequency terminal output
interface OutputBuffer {
  data: string
  timeout: ReturnType<typeof setTimeout> | null
}

// Central WebSocket store for singleton state
interface WebSocketState {
  ws: WebSocket | null
  connectionState: ConnectionState
  sessionHandlers: Map<string, SessionHandlers>
  outputBuffers: Map<string, OutputBuffer>
  setWs: (ws: WebSocket | null) => void
  setConnectionState: (state: ConnectionState) => void
  registerSession: (sessionId: string, handlers: SessionHandlers) => void
  unregisterSession: (sessionId: string) => void
  getHandler: (sessionId: string) => SessionHandlers | undefined
  bufferOutput: (sessionId: string, data: string) => void
  flushOutput: (sessionId: string) => void
}

export const useWebSocketStore = create<WebSocketState>((set, get) => ({
  ws: null,
  connectionState: 'disconnected',
  sessionHandlers: new Map(),
  outputBuffers: new Map(),
  setWs: (ws) => set({ ws }),
  setConnectionState: (state) => set({ connectionState: state }),
  registerSession: (sessionId, handlers) =>
    set((state) => {
      const newMap = new Map(state.sessionHandlers)
      newMap.set(sessionId, handlers)
      return { sessionHandlers: newMap }
    }),
  unregisterSession: (sessionId) =>
    set((state) => {
      // Clear any pending output buffer
      const buffer = state.outputBuffers.get(sessionId)
      if (buffer?.timeout) {
        clearTimeout(buffer.timeout)
      }
      const newHandlers = new Map(state.sessionHandlers)
      newHandlers.delete(sessionId)
      const newBuffers = new Map(state.outputBuffers)
      newBuffers.delete(sessionId)
      return { sessionHandlers: newHandlers, outputBuffers: newBuffers }
    }),
  getHandler: (sessionId) => get().sessionHandlers.get(sessionId),

  // Buffer output for batching - accumulates data and flushes after interval
  // Per Critical Finding 04: Activity updates aligned with 16ms output batching
  bufferOutput: (sessionId, data) => {
    // Update activity timestamp on output receipt (per AC-06)
    useActivityStore.getState().updateActivity(sessionId, Date.now())

    const state = get()
    const existing = state.outputBuffers.get(sessionId) || { data: '', timeout: null }

    // Accumulate data
    const newData = existing.data + data

    // If no pending flush, schedule one
    if (!existing.timeout) {
      const timeout = setTimeout(() => {
        get().flushOutput(sessionId)
      }, OUTPUT_BATCH_INTERVAL_MS)

      set((s) => {
        const newBuffers = new Map(s.outputBuffers)
        newBuffers.set(sessionId, { data: newData, timeout })
        return { outputBuffers: newBuffers }
      })
    } else {
      // Just update the accumulated data
      set((s) => {
        const newBuffers = new Map(s.outputBuffers)
        newBuffers.set(sessionId, { data: newData, timeout: existing.timeout })
        return { outputBuffers: newBuffers }
      })
    }
  },

  // Flush buffered output to handler
  flushOutput: (sessionId) => {
    const state = get()
    const buffer = state.outputBuffers.get(sessionId)
    if (!buffer || !buffer.data) return

    // Get handler and send accumulated output
    const handlers = state.sessionHandlers.get(sessionId)
    if (handlers && buffer.data) {
      handlers.onOutput(buffer.data)
    }

    // Clear buffer
    set((s) => {
      const newBuffers = new Map(s.outputBuffers)
      newBuffers.set(sessionId, { data: '', timeout: null })
      return { outputBuffers: newBuffers }
    })
  },
}))

// Callback for session creation
type SessionCreatedCallback = (sessionId: string, shellType: string) => void

interface UseCentralWebSocketReturn {
  connectionState: ConnectionState
  connect: () => void
  disconnect: () => void
  createSession: (onSessionCreated: SessionCreatedCallback) => void
  closeSession: (sessionId: string) => void
  sendInput: (sessionId: string, data: string) => void
  sendResize: (sessionId: string, cols: number, rows: number) => void
  registerSession: (sessionId: string, handlers: SessionHandlers) => void
  unregisterSession: (sessionId: string) => void
}

/**
 * Central WebSocket hook for multi-session terminal management.
 * Connects lazily - call connect() or createSession() to establish connection.
 */
export function useCentralWebSocket(): UseCentralWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  // Use a queue instead of single ref to handle rapid session creation (spam clicking)
  const pendingSessionCallbacksRef = useRef<SessionCreatedCallback[]>([])

  // Use individual selectors for stable references (prevents infinite re-renders)
  const connectionState = useWebSocketStore((state) => state.connectionState)
  const setWs = useWebSocketStore((state) => state.setWs)
  const setConnectionState = useWebSocketStore((state) => state.setConnectionState)
  const registerSession = useWebSocketStore((state) => state.registerSession)
  const unregisterSession = useWebSocketStore((state) => state.unregisterSession)
  const getHandler = useWebSocketStore((state) => state.getHandler)
  const bufferOutput = useWebSocketStore((state) => state.bufferOutput)

  // Build WebSocket URL
  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws`
  }, [])

  // Connect to WebSocket (lazy - called explicitly)
  const connect = useCallback(() => {
    // Already connected or connecting
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      return
    }

    setConnectionState('connecting')
    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws
    setWs(ws)

    ws.onopen = () => {
      setConnectionState('connected')
    }

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data)

        // Handle session_created response
        if (msg.type === 'session_created' && msg.sessionId) {
          // Dequeue the first pending callback (FIFO order matches server responses)
          const callback = pendingSessionCallbacksRef.current.shift()
          if (callback) {
            callback(msg.sessionId, msg.shellType || 'sh')
          }
          return
        }

        // Handle tmux_status broadcast (before per-session routing)
        if (msg.type === 'tmux_status' && msg.tmuxUpdates) {
          const store = useSessionStore.getState()
          for (const [sessionId, tmuxName] of Object.entries(msg.tmuxUpdates)) {
            store.updateTmuxSessionName(sessionId, tmuxName || null)
          }
          return
        }

        // Route to session-specific handler
        if (msg.sessionId) {
          const handlers = getHandler(msg.sessionId)
          if (handlers) {
            switch (msg.type) {
              case 'output':
                // Buffer output for batching (50ms window)
                if (msg.data) {
                  bufferOutput(msg.sessionId, msg.data)
                }
                break
              case 'error':
                if (msg.error) handlers.onError(msg.error)
                break
              case 'exit':
                handlers.onExit(msg.code ?? 0)
                break
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    ws.onerror = () => {
      setConnectionState('error')
    }

    ws.onclose = () => {
      setConnectionState('disconnected')
      wsRef.current = null
      setWs(null)
    }
  }, [getWsUrl, setWs, setConnectionState, getHandler, bufferOutput])

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
      setWs(null)
    }
  }, [setWs])

  // Create a new session via WebSocket
  const createSession = useCallback(
    (onSessionCreated: SessionCreatedCallback) => {
      // Queue callback for when session_created response arrives (supports rapid creation)
      pendingSessionCallbacksRef.current.push(onSessionCreated)

      // Connect if not already connected
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connect()
        // Wait for connection before sending create message
        const checkConnection = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection)
            const msg: ClientMessage = { type: 'create' }
            wsRef.current.send(JSON.stringify(msg))
          }
        }, 50)
        // Timeout after 5 seconds
        setTimeout(() => clearInterval(checkConnection), 5000)
      } else if (wsRef.current.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = { type: 'create' }
        wsRef.current.send(JSON.stringify(msg))
      }
    },
    [connect]
  )

  // Get WebSocket from store (shared across all components)
  const ws = useWebSocketStore((state) => state.ws)

  // Send input to specific session
  const sendInput = useCallback((sessionId: string, data: string) => {
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { sessionId, type: 'input', data }
      ws.send(JSON.stringify(msg))
    }
  }, [ws])

  // Send resize to specific session
  const sendResize = useCallback((sessionId: string, cols: number, rows: number) => {
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { sessionId, type: 'resize', cols, rows }
      ws.send(JSON.stringify(msg))
    }
  }, [ws])

  // Close a specific session (tells backend to terminate PTY)
  const closeSession = useCallback((sessionId: string) => {
    if (ws?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { sessionId, type: 'close' }
      ws.send(JSON.stringify(msg))
    }
    // Also unregister handlers immediately
    unregisterSession(sessionId)
  }, [ws, unregisterSession])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't disconnect on unmount - WebSocket is shared
      // Individual sessions unregister their handlers
    }
  }, [])

  return {
    connectionState,
    connect,
    disconnect,
    createSession,
    closeSession,
    sendInput,
    sendResize,
    registerSession,
    unregisterSession,
  }
}
