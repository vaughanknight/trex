# Terminal Development Guide

**Version**: 1.0.0
**Status**: CURRENT
**Last Updated**: 2026-02-04

---

## Overview

This guide explains how to extend and modify the terminal functionality in trex.

## Project Structure

```
backend/
├── internal/
│   ├── terminal/           # Terminal package
│   │   ├── pty.go          # PTY interface definition
│   │   ├── real_pty.go     # Production PTY (creack/pty)
│   │   ├── fake_pty.go     # Test double for PTY
│   │   ├── websocket.go    # WebSocket connection interface
│   │   ├── fake_websocket.go # Test double for WebSocket
│   │   ├── messages.go     # Protocol message types
│   │   ├── session.go      # PTY ↔ WebSocket bridge
│   │   └── *_test.go       # Unit tests
│   └── server/
│       └── terminal.go     # WebSocket HTTP handler

frontend/
├── src/
│   ├── components/
│   │   └── Terminal.tsx    # Terminal React component
│   ├── hooks/
│   │   └── useTerminalSocket.ts  # WebSocket hook
│   └── types/
│       └── terminal.ts     # TypeScript interfaces
```

## Adding New Message Types

### 1. Update Go Types

Edit `backend/internal/terminal/messages.go`:

```go
// Add to ClientMessage for client → server
type ClientMessage struct {
    Type string `json:"type"` // Add your type to comment
    Data string `json:"data,omitempty"`
    // Add new fields
    NewField string `json:"newField,omitempty"`
}

// Add constant
const MsgTypeNewType = "newtype"
```

### 2. Update TypeScript Types

Edit `frontend/src/types/terminal.ts`:

```typescript
export type ClientMessageType = 'input' | 'resize' | 'newtype'

export interface ClientMessage {
  type: ClientMessageType
  // Add new fields
  newField?: string
}
```

### 3. Handle in Session

Edit `backend/internal/terminal/session.go`:

```go
switch msg.Type {
case MsgTypeNewType:
    // Handle new message type
    log.Printf("Received new type: %s", msg.NewField)
}
```

### 4. Add to Hook

Edit `frontend/src/hooks/useTerminalSocket.ts`:

```typescript
const sendNewType = useCallback((field: string) => {
  if (wsRef.current?.readyState === WebSocket.OPEN) {
    const msg: ClientMessage = { type: 'newtype', newField: field }
    wsRef.current.send(JSON.stringify(msg))
  }
}, [])

return { sendNewType, /* ... */ }
```

## Testing

### Writing Unit Tests

Use fakes for unit testing:

```go
func TestSession_NewFeature(t *testing.T) {
    // Test Doc:
    // - Why: Verify new feature works correctly
    // - Contract: New message type is processed and triggers expected behavior
    // - Usage Notes: Requires FakePTY and FakeWebSocket
    // - Quality Contribution: Catches regressions in message handling
    // - Worked Example: Send newtype message → verify PTY receives expected data

    fakePTY := NewFakePTY()
    fakeWS := NewFakeWebSocket()

    // Queue message
    msg := ClientMessage{Type: MsgTypeNewType, NewField: "test"}
    msgBytes, _ := json.Marshal(msg)
    fakeWS.QueueMessage(websocket.TextMessage, msgBytes)

    // ... run session and assert
}
```

### Running Tests

```bash
# Backend tests
cd backend && go test ./... -v

# Specific package
cd backend && go test ./internal/terminal/... -v

# With coverage
cd backend && go test ./... -cover
```

## Debugging

### Backend Logging

The session logs key events:

```go
log.Printf("Terminal session started")
log.Printf("PTY read error: %v", err)
log.Printf("WebSocket read error: %v", err)
log.Printf("Terminal session ended")
```

### Frontend Debugging

Open browser DevTools:

1. **Network tab**: Filter by "WS" to see WebSocket messages
2. **Console**: Hook logs parse errors
3. **React DevTools**: Inspect Terminal component state

### Common Issues

#### WebSocket won't connect

- Check server is running: `curl http://localhost:3000/api/health`
- Check for CORS errors in browser console
- Verify WebSocket URL: `ws://localhost:3000/ws`

#### Terminal not resizing

- Check FitAddon is loaded
- Verify resize messages in Network tab
- Check debounce timer isn't suppressing

#### PTY not spawning

- Check $SHELL environment variable
- Verify shell exists: `which $SHELL`
- Check error logs for PTY creation errors

## Performance Optimization

### WebGL Rendering

The WebglAddon provides GPU acceleration:

```typescript
try {
  const webglAddon = new WebglAddon()
  terminal.loadAddon(webglAddon)
} catch (e) {
  // Falls back to canvas renderer
}
```

### Resize Debouncing

Rapid resizes are debounced to prevent flooding:

```typescript
const handleResize = () => {
  clearTimeout(resizeTimeout)
  resizeTimeout = setTimeout(() => {
    fitAddon.fit()
    sendResize(cols, rows)
  }, 100) // 100ms debounce
}
```

## Future Enhancements

### Flow Control (v2)

For high-throughput scenarios:

1. Track bytes sent
2. Wait for ACK from client
3. Pause PTY reads when unconfirmed > threshold

### Multiple Terminals (v2)

Channel multiplexing pattern:

```typescript
interface ClientMessage {
  channelId: string  // Add channel identifier
  type: string
  // ...
}
```

### tmux Integration

The next phase will:

1. Import tmax library
2. Replace RealPTY with tmux attach
3. Add session discovery
4. Enable multi-session management

## Related Documentation

- [Terminal Architecture](./terminal-architecture.md)
- [ADR-0004: Fakes Only Testing](../adr/0004-fakes-only-testing-no-mocks.md)
- [Constitution: Testing Philosophy](../project-rules/constitution.md#testing-philosophy)
