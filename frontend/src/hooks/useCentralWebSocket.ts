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
import { useTmuxStore } from '../stores/tmux'

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

// Callback for session creation — includes optional tmux metadata
type SessionCreatedCallback = (sessionId: string, shellType: string, tmuxSessionName?: string, tmuxWindowIndex?: number, cwd?: string) => void

// Shared callback queue for session creation across all hook instances.
// Must be module-level (not per-instance useRef) because the WebSocket is a
// singleton in the Zustand store, but multiple components call createSession().
// The onmessage handler set by the first caller must be able to dequeue
// callbacks pushed by any component.
const pendingSessionCallbacks: SessionCreatedCallback[] = []

interface UseCentralWebSocketReturn {
  connectionState: ConnectionState
  connect: () => void
  disconnect: () => void
  createSession: (onSessionCreated: SessionCreatedCallback, cwd?: string) => void
  createTmuxSession: (tmuxSessionName: string, tmuxWindowIndex: number, onSessionCreated: SessionCreatedCallback) => void
  closeSession: (sessionId: string) => void
  detachSession: (sessionId: string) => void
  sendInput: (sessionId: string, data: string) => void
  sendResize: (sessionId: string, cols: number, rows: number) => void
  registerSession: (sessionId: string, handlers: SessionHandlers) => void
  unregisterSession: (sessionId: string) => void
  requestTmuxSessions: () => void
}

/**
 * Central WebSocket hook for multi-session terminal management.
 * Connects lazily - call connect() or createSession() to establish connection.
 */
export function useCentralWebSocket(): UseCentralWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)

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
    // Already connected or connecting (check local ref)
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      return
    }

    // Also check store's ws — another component instance may have already connected.
    // useCentralWebSocket uses per-instance wsRef, but the WebSocket is a singleton
    // stored in Zustand. Without this check, each component that calls connect()
    // would create a duplicate WebSocket and flash connectionState to 'connecting'.
    const existingWs = useWebSocketStore.getState().ws
    if (existingWs && existingWs.readyState !== WebSocket.CLOSED) {
      wsRef.current = existingWs
      return
    }

    setConnectionState('connecting')
    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws
    setWs(ws)

    ws.onopen = () => {
      setConnectionState('connected')
      // Request initial tmux session list
      const listMsg: ClientMessage = { type: 'list_tmux_sessions' }
      ws.send(JSON.stringify(listMsg))
    }

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data)

        // Handle session_created response
        if (msg.type === 'session_created' && msg.sessionId) {
          // Dequeue the first pending callback (FIFO order matches server responses)
          const callback = pendingSessionCallbacks.shift()
          if (callback) {
            callback(msg.sessionId, msg.shellType || 'sh', msg.tmuxSessionName, msg.tmuxWindowIndex, msg.cwd)
          }
          return
        }

        // Handle tmux_sessions broadcast (before per-session routing)
        if (msg.type === 'tmux_sessions') {
          useTmuxStore.getState().setTmuxSessions(msg.tmuxSessions || [])
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

        // Handle cwd_update from backend
        if (msg.type === 'cwd_update' && msg.sessionId && msg.cwd) {
          useSessionStore.getState().updateCwd(msg.sessionId, msg.cwd)
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
    (onSessionCreated: SessionCreatedCallback, cwd?: string) => {
      // Queue callback for when session_created response arrives (supports rapid creation)
      pendingSessionCallbacks.push(onSessionCreated)

      // Sync local ref from store (may have been created by another component instance)
      if (!wsRef.current) {
        wsRef.current = useWebSocketStore.getState().ws
      }

      // Connect if not already connected
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connect()
        // Wait for connection before sending create message
        const checkConnection = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection)
            const msg: ClientMessage = { type: 'create', ...(cwd ? { cwd } : {}) }
            wsRef.current.send(JSON.stringify(msg))
          }
        }, 50)
        // Timeout after 5 seconds
        setTimeout(() => clearInterval(checkConnection), 5000)
      } else if (wsRef.current.readyState === WebSocket.OPEN) {
        const msg: ClientMessage = { type: 'create', ...(cwd ? { cwd } : {}) }
        wsRef.current.send(JSON.stringify(msg))
      } else if (wsRef.current.readyState === WebSocket.CONNECTING) {
        // WebSocket is connecting (e.g. rapid-fire session creates during URL restore).
        // Poll until OPEN, then send the create message.
        const checkConnection = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection)
            const msg: ClientMessage = { type: 'create', ...(cwd ? { cwd } : {}) }
            wsRef.current.send(JSON.stringify(msg))
          }
        }, 50)
        setTimeout(() => clearInterval(checkConnection), 5000)
      }
    },
    [connect]
  )

  // Send input to specific session
  // Read ws from store imperatively to avoid stale closure when ws ref changes
  const sendInput = useCallback((sessionId: string, data: string) => {
    const currentWs = useWebSocketStore.getState().ws
    if (currentWs?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { sessionId, type: 'input', data }
      currentWs.send(JSON.stringify(msg))
    }
  }, [])

  // Send resize to specific session
  // Read ws from store imperatively to avoid stale closure when ws ref changes
  const sendResize = useCallback((sessionId: string, cols: number, rows: number) => {
    const currentWs = useWebSocketStore.getState().ws
    if (currentWs?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { sessionId, type: 'resize', cols, rows }
      currentWs.send(JSON.stringify(msg))
    }
  }, [])

  // Close a specific session (tells backend to terminate PTY)
  const closeSession = useCallback((sessionId: string) => {
    const currentWs = useWebSocketStore.getState().ws
    if (currentWs?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { sessionId, type: 'close' }
      currentWs.send(JSON.stringify(msg))
    }
    // Also unregister handlers immediately
    unregisterSession(sessionId)
  }, [unregisterSession])

  // Detach a tmux session (tells backend to close PTY; tmux session survives)
  const detachSession = useCallback((sessionId: string) => {
    const currentWs = useWebSocketStore.getState().ws
    if (currentWs?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { sessionId, type: 'detach' }
      currentWs.send(JSON.stringify(msg))
    }
    unregisterSession(sessionId)
  }, [unregisterSession])

  // Create a tmux-attached session via WebSocket
  const createTmuxSession = useCallback(
    (tmuxSessionName: string, tmuxWindowIndex: number, onSessionCreated: SessionCreatedCallback) => {
      pendingSessionCallbacks.push(onSessionCreated)

      if (!wsRef.current) {
        wsRef.current = useWebSocketStore.getState().ws
      }

      const sendCreate = () => {
        const msg: ClientMessage = { type: 'create', tmuxSessionName, tmuxWindowIndex }
        wsRef.current!.send(JSON.stringify(msg))
      }

      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connect()
        const checkConnection = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection)
            sendCreate()
          }
        }, 50)
        setTimeout(() => clearInterval(checkConnection), 5000)
      } else if (wsRef.current.readyState === WebSocket.OPEN) {
        sendCreate()
      } else if (wsRef.current.readyState === WebSocket.CONNECTING) {
        const checkConnection = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnection)
            sendCreate()
          }
        }, 50)
        setTimeout(() => clearInterval(checkConnection), 5000)
      }
    },
    [connect]
  )

  // Request current tmux session list from backend
  const requestTmuxSessions = useCallback(() => {
    const currentWs = useWebSocketStore.getState().ws
    if (currentWs?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'list_tmux_sessions' }
      currentWs.send(JSON.stringify(msg))
    }
  }, [])

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
    createTmuxSession,
    closeSession,
    detachSession,
    sendInput,
    sendResize,
    registerSession,
    unregisterSession,
    requestTmuxSessions,
  }
}
