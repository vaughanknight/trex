/**
 * FakeWebSocket Tests
 *
 * These tests verify that FakeWebSocket correctly implements the WebSocket
 * interface and provides deterministic testing capabilities.
 */

import { FakeWebSocket, installFakeWebSocket } from './fakeWebSocket'

describe('FakeWebSocket', () => {
  /**
   * Test: WebSocket should start in CONNECTING state
   *
   * Behavior: When created, WebSocket starts in CONNECTING state
   * Fixture: new FakeWebSocket('ws://localhost/ws')
   * Assertion: readyState === FakeWebSocket.CONNECTING
   */
  it('should start in CONNECTING state', () => {
    const ws = new FakeWebSocket('ws://localhost/ws')
    expect(ws.readyState).toBe(FakeWebSocket.CONNECTING)
    expect(ws.url).toBe('ws://localhost/ws')
  })

  /**
   * Test: simulateOpen should trigger onopen and set OPEN state
   *
   * Behavior: Simulating open triggers onopen callback and changes state
   * Fixture: FakeWebSocket with onopen handler
   * Assertion: Handler called, readyState === OPEN
   */
  it('should call onopen when simulateOpen is called', () => {
    const ws = new FakeWebSocket('ws://localhost/ws')
    let openCalled = false

    ws.onopen = () => {
      openCalled = true
    }

    ws.simulateOpen()

    expect(openCalled).toBe(true)
    expect(ws.readyState).toBe(FakeWebSocket.OPEN)
  })

  /**
   * Test: simulateMessage should deliver message via onmessage
   *
   * Behavior: Simulated server messages are delivered to onmessage handler
   * Fixture: FakeWebSocket in OPEN state with onmessage handler
   * Assertion: Handler receives MessageEvent with correct data
   */
  it('should deliver messages via onmessage', () => {
    const ws = new FakeWebSocket('ws://localhost/ws')
    let receivedData: string | null = null

    ws.onmessage = (event) => {
      receivedData = event.data
    }

    ws.simulateOpen()
    ws.simulateMessage({ type: 'output', data: 'hello world' })

    expect(receivedData).toBe('{"type":"output","data":"hello world"}')
  })

  /**
   * Test: send should record messages for later inspection
   *
   * Behavior: Messages sent by client are captured for test assertions
   * Fixture: FakeWebSocket in OPEN state
   * Assertion: getSentMessages returns sent messages
   */
  it('should record sent messages', () => {
    const ws = new FakeWebSocket('ws://localhost/ws')
    ws.simulateOpen()

    ws.send('{"type":"input","data":"ls"}')
    ws.send('{"type":"resize","cols":80,"rows":24}')

    expect(ws.getSentMessages()).toEqual([
      '{"type":"input","data":"ls"}',
      '{"type":"resize","cols":80,"rows":24}',
    ])
    expect(ws.getSentMessageCount()).toBe(2)
  })

  /**
   * Test: send should throw when not OPEN
   *
   * Behavior: Sending before connection open throws InvalidStateError
   * Fixture: FakeWebSocket in CONNECTING state
   * Assertion: Throws DOMException
   */
  it('should throw when sending before open', () => {
    const ws = new FakeWebSocket('ws://localhost/ws')

    expect(() => ws.send('test')).toThrow()
  })

  /**
   * Test: getSentMessagesAsJson should parse messages
   *
   * Behavior: Helper method parses JSON messages for easier assertions
   * Fixture: FakeWebSocket with JSON messages sent
   * Assertion: Returns parsed objects
   */
  it('should parse sent messages as JSON', () => {
    const ws = new FakeWebSocket('ws://localhost/ws')
    ws.simulateOpen()

    ws.send(JSON.stringify({ type: 'input', data: 'hello' }))

    const messages = ws.getSentMessagesAsJson<{ type: string; data: string }>()
    expect(messages).toEqual([{ type: 'input', data: 'hello' }])
  })

  /**
   * Test: simulateClose should trigger onclose
   *
   * Behavior: Simulating close triggers onclose with CloseEvent
   * Fixture: FakeWebSocket in OPEN state with onclose handler
   * Assertion: Handler called, readyState === CLOSED
   */
  it('should call onclose when simulateClose is called', () => {
    const ws = new FakeWebSocket('ws://localhost/ws')
    let closeCode: number | null = null

    ws.onclose = (event) => {
      closeCode = event.code
    }

    ws.simulateOpen()
    ws.simulateClose(1000, 'normal close')

    expect(closeCode).toBe(1000)
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED)
  })

  /**
   * Test: simulateError should trigger onerror
   *
   * Behavior: Simulating error triggers onerror callback
   * Fixture: FakeWebSocket with onerror handler
   * Assertion: Handler called
   */
  it('should call onerror when simulateError is called', () => {
    const ws = new FakeWebSocket('ws://localhost/ws')
    let errorCalled = false

    ws.onerror = () => {
      errorCalled = true
    }

    ws.simulateOpen()
    ws.simulateError()

    expect(errorCalled).toBe(true)
  })

  /**
   * Test: addEventListener should work alongside on* handlers
   *
   * Behavior: Both property handlers and addEventListener work together
   * Fixture: FakeWebSocket with both types of handlers
   * Assertion: Both handlers called
   */
  it('should support addEventListener', () => {
    const ws = new FakeWebSocket('ws://localhost/ws')
    const calls: string[] = []

    ws.onopen = () => calls.push('onopen')
    ws.addEventListener('open', () => calls.push('addEventListener'))

    ws.simulateOpen()

    expect(calls).toEqual(['onopen', 'addEventListener'])
  })

  /**
   * Test: clearSentMessages should reset message buffer
   *
   * Behavior: Clear allows test isolation between assertions
   * Fixture: FakeWebSocket with sent messages
   * Assertion: Messages cleared after call
   */
  it('should clear sent messages', () => {
    const ws = new FakeWebSocket('ws://localhost/ws')
    ws.simulateOpen()
    ws.send('test')

    expect(ws.getSentMessageCount()).toBe(1)

    ws.clearSentMessages()

    expect(ws.getSentMessageCount()).toBe(0)
    expect(ws.getSentMessages()).toEqual([])
  })
})

describe('installFakeWebSocket', () => {
  /**
   * Test: installFakeWebSocket should replace global WebSocket
   *
   * Behavior: Creates instances that are tracked for test assertions
   * Fixture: Install fake, create WebSocket
   * Assertion: Instance captured, can be restored
   */
  it('should replace global WebSocket and track instances', () => {
    const { instances, restore } = installFakeWebSocket()

    try {
      const ws = new WebSocket('ws://localhost/ws')
      expect(instances.length).toBe(1)
      expect(instances[0]).toBe(ws)
      expect(ws).toBeInstanceOf(FakeWebSocket)
    } finally {
      restore()
    }
  })
})
