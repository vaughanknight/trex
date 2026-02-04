/**
 * FakeWebSocket - A deterministic WebSocket implementation for testing.
 *
 * This fake implements the WebSocket interface and provides methods to
 * control message flow deterministically. Per ADR-0004, we use fakes
 * instead of mocking frameworks.
 *
 * Usage:
 * ```ts
 * const fake = new FakeWebSocket('ws://localhost/ws')
 * // Simulate server opening connection
 * fake.simulateOpen()
 * // Simulate server sending a message
 * fake.simulateMessage({ type: 'output', data: 'hello' })
 * // Get messages sent by client
 * const sent = fake.getSentMessages()
 * ```
 */

type WebSocketEventHandler<T extends Event> = ((event: T) => void) | null

export class FakeWebSocket implements WebSocket {
  // WebSocket constants
  static readonly CONNECTING = 0 as const
  static readonly OPEN = 1 as const
  static readonly CLOSING = 2 as const
  static readonly CLOSED = 3 as const

  readonly CONNECTING = FakeWebSocket.CONNECTING
  readonly OPEN = FakeWebSocket.OPEN
  readonly CLOSING = FakeWebSocket.CLOSING
  readonly CLOSED = FakeWebSocket.CLOSED

  // WebSocket properties
  readonly url: string
  readonly protocol: string = ''
  readonly extensions: string = ''
  binaryType: BinaryType = 'blob'
  bufferedAmount: number = 0

  // State
  readyState: number = FakeWebSocket.CONNECTING

  // Event handlers
  onopen: WebSocketEventHandler<Event> = null
  onmessage: WebSocketEventHandler<MessageEvent> = null
  onerror: WebSocketEventHandler<Event> = null
  onclose: WebSocketEventHandler<CloseEvent> = null

  // Internal storage for testing
  private sentMessages: string[] = []
  private eventListeners: Map<string, Set<EventListenerOrEventListenerObject>> =
    new Map()

  constructor(url: string | URL, _protocols?: string | string[]) {
    this.url = url.toString()
  }

  // WebSocket methods
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new DOMException(
        "Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.",
        'InvalidStateError'
      )
    }
    if (typeof data === 'string') {
      this.sentMessages.push(data)
    } else {
      throw new Error('FakeWebSocket only supports string messages')
    }
  }

  close(code?: number, reason?: string): void {
    if (
      this.readyState === FakeWebSocket.CLOSING ||
      this.readyState === FakeWebSocket.CLOSED
    ) {
      return
    }
    this.readyState = FakeWebSocket.CLOSING
    // Simulate async close
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.CLOSED
      const event = new CloseEvent('close', {
        code: code ?? 1000,
        reason: reason ?? '',
        wasClean: true,
      })
      this.dispatchEvent(event)
    })
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | AddEventListenerOptions
  ): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set())
    }
    this.eventListeners.get(type)!.add(listener)
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions
  ): void {
    this.eventListeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: Event): boolean {
    // Call property handler
    const handler = this[`on${event.type}` as keyof this]
    if (typeof handler === 'function') {
      ;(handler as (event: Event) => void)(event)
    }

    // Call addEventListener handlers
    const listeners = this.eventListeners.get(event.type)
    if (listeners) {
      for (const listener of listeners) {
        if (typeof listener === 'function') {
          listener(event)
        } else {
          listener.handleEvent(event)
        }
      }
    }

    return !event.defaultPrevented
  }

  // ==================
  // Test helper methods
  // ==================

  /**
   * Simulate the server opening the connection.
   */
  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN
    const event = new Event('open')
    this.dispatchEvent(event)
  }

  /**
   * Simulate the server sending a message.
   * Accepts either a raw string or an object that will be JSON-stringified.
   */
  simulateMessage(data: string | object): void {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error('Cannot receive message when not OPEN')
    }
    const messageData = typeof data === 'string' ? data : JSON.stringify(data)
    const event = new MessageEvent('message', { data: messageData })
    this.dispatchEvent(event)
  }

  /**
   * Simulate a connection error.
   */
  simulateError(): void {
    const event = new Event('error')
    this.dispatchEvent(event)
  }

  /**
   * Simulate the server closing the connection.
   */
  simulateClose(code: number = 1000, reason: string = ''): void {
    this.readyState = FakeWebSocket.CLOSED
    const event = new CloseEvent('close', {
      code,
      reason,
      wasClean: code === 1000,
    })
    this.dispatchEvent(event)
  }

  /**
   * Get all messages sent by the client.
   */
  getSentMessages(): string[] {
    return [...this.sentMessages]
  }

  /**
   * Get all messages sent by the client, parsed as JSON.
   */
  getSentMessagesAsJson<T = unknown>(): T[] {
    return this.sentMessages.map((m) => JSON.parse(m) as T)
  }

  /**
   * Clear the sent messages buffer.
   */
  clearSentMessages(): void {
    this.sentMessages = []
  }

  /**
   * Get the number of messages sent.
   */
  getSentMessageCount(): number {
    return this.sentMessages.length
  }
}

/**
 * Install FakeWebSocket as the global WebSocket for tests.
 * Returns a cleanup function to restore the original.
 */
export function installFakeWebSocket(): {
  instances: FakeWebSocket[]
  restore: () => void
} {
  const originalWebSocket = globalThis.WebSocket
  const instances: FakeWebSocket[] = []

  // Replace global WebSocket with our fake
  globalThis.WebSocket = class extends FakeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      instances.push(this)
    }
  }

  return {
    instances,
    restore: () => {
      globalThis.WebSocket = originalWebSocket
    },
  }
}
