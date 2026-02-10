/**
 * Message types for WebSocket terminal protocol.
 */

/** Message types sent from client to server */
export type ClientMessageType = 'input' | 'resize' | 'create' | 'close' | 'tmux_config'

/** Message types sent from server to client */
export type ServerMessageType = 'output' | 'error' | 'exit' | 'session_created' | 'tmux_status'

/** Message sent from browser to server */
export interface ClientMessage {
  sessionId?: string // Session ID for multi-session routing
  type: ClientMessageType
  data?: string // For input messages
  cols?: number // For resize messages
  rows?: number // For resize messages
  interval?: number // Polling interval in ms (for tmux_config)
}

/** Message sent from server to browser */
export interface ServerMessage {
  sessionId?: string // Session ID for multi-session routing
  shellType?: string // Shell type (e.g., "bash", "zsh") for session naming
  type: ServerMessageType
  data?: string // For output messages
  error?: string // For error messages
  code?: number // For exit messages
  tmuxUpdates?: Record<string, string> // sessionId → tmux session name (empty = detached)
}

/** Terminal connection state */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'
