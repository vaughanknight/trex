/**
 * Message types for WebSocket terminal protocol.
 */

/** Message types sent from client to server */
export type ClientMessageType = 'input' | 'resize'

/** Message types sent from server to client */
export type ServerMessageType = 'output' | 'error' | 'exit'

/** Message sent from browser to server */
export interface ClientMessage {
  type: ClientMessageType
  data?: string // For input messages
  cols?: number // For resize messages
  rows?: number // For resize messages
}

/** Message sent from server to browser */
export interface ServerMessage {
  type: ServerMessageType
  data?: string // For output messages
  error?: string // For error messages
  code?: number // For exit messages
}

/** Terminal connection state */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'
