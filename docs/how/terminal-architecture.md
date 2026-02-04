# Terminal Architecture

**Version**: 1.0.0
**Status**: CURRENT
**Last Updated**: 2026-02-04

---

## Overview

This document describes how the terminal system works in trex, covering the full pipeline from PTY to browser rendering.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                              Browser                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    React Application                          │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │                 Terminal Component                       │ │   │
│  │  │  ┌─────────────────┐    ┌──────────────────────────┐   │ │   │
│  │  │  │  xterm.js       │    │  useTerminalSocket       │   │ │   │
│  │  │  │  - Rendering    │◄───│  - WebSocket connection  │   │ │   │
│  │  │  │  - Input capture│    │  - Message serialization │   │ │   │
│  │  │  │  - FitAddon     │    │  - State management      │   │ │   │
│  │  │  │  - WebglAddon   │    └──────────────────────────┘   │ │   │
│  │  │  └─────────────────┘                                    │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket (ws://localhost:3000/ws)
                                    │ JSON messages
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           Go Backend                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  HTTP Server (net/http)                       │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │              WebSocket Handler (/ws)                     │ │   │
│  │  │  - Upgrade HTTP to WebSocket (gorilla/websocket)        │ │   │
│  │  │  - Create PTY + Session                                  │ │   │
│  │  │  - Handle message routing                                │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  │                            │                                    │   │
│  │  ┌─────────────────────────▼───────────────────────────────┐ │   │
│  │  │                    Session                               │ │   │
│  │  │  - Bridges PTY ↔ WebSocket                              │ │   │
│  │  │  - Handles input/output/resize messages                 │ │   │
│  │  │  - Manages lifecycle (context cancellation)             │ │   │
│  │  └─────────────────────────┬───────────────────────────────┘ │   │
│  │                            │                                    │   │
│  │  ┌─────────────────────────▼───────────────────────────────┐ │   │
│  │  │                    RealPTY                               │ │   │
│  │  │  - Spawns shell via creack/pty                          │ │   │
│  │  │  - Reads/writes terminal I/O                            │ │   │
│  │  │  - Handles resize (TIOCSWINSZ)                          │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ PTY file descriptor
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                              Shell                                   │
│  - User's configured shell ($SHELL or /bin/bash)                    │
│  - Receives SIGWINCH on resize                                      │
│  - Full terminal emulation via PTY                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### Frontend

#### Terminal Component (`src/components/Terminal.tsx`)

The main React component that:
- Initializes xterm.js terminal instance
- Loads FitAddon for responsive sizing
- Loads WebglAddon for GPU-accelerated rendering
- Connects input/output to WebSocket hook
- Handles resize events with debouncing

#### useTerminalSocket Hook (`src/hooks/useTerminalSocket.ts`)

Custom React hook that:
- Manages WebSocket connection lifecycle
- Serializes/deserializes JSON messages
- Provides callbacks for output, error, exit events
- Exposes `sendInput` and `sendResize` functions

### Backend

#### WebSocket Handler (`internal/server/terminal.go`)

HTTP handler that:
- Upgrades HTTP connections to WebSocket
- Creates PTY for each connection
- Creates Session to bridge PTY and WebSocket
- Logs session lifecycle events

#### Session (`internal/terminal/session.go`)

Core bridging logic that:
- Runs two goroutines for bidirectional I/O
- Reads from PTY, sends to WebSocket (output)
- Reads from WebSocket, writes to PTY (input)
- Handles resize messages
- Manages graceful shutdown via context

#### RealPTY (`internal/terminal/real_pty.go`)

PTY wrapper using creack/pty that:
- Spawns shell with TERM=xterm-256color
- Implements PTY interface for testing
- Handles resize via pty.Setsize()

## Message Protocol

### Client → Server

```typescript
interface ClientMessage {
  type: 'input' | 'resize'
  data?: string    // For input
  cols?: number    // For resize
  rows?: number    // For resize
}
```

### Server → Client

```typescript
interface ServerMessage {
  type: 'output' | 'error' | 'exit'
  data?: string    // For output
  error?: string   // For error
  code?: number    // For exit
}
```

## Data Flow

### Input (Keystroke)

1. User types in browser
2. xterm.js captures keystroke via `onData`
3. useTerminalSocket sends JSON: `{"type":"input","data":"a"}`
4. WebSocket handler receives message
5. Session parses message, writes to PTY
6. Shell processes input

### Output (Terminal Display)

1. Shell writes output
2. PTY makes data available
3. Session reads from PTY
4. Session sends JSON: `{"type":"output","data":"..."}`
5. WebSocket delivers to browser
6. useTerminalSocket parses message
7. xterm.js renders via `write()`

### Resize

1. Browser window resizes
2. FitAddon calculates new dimensions
3. Debounce timer fires (100ms)
4. Send resize: `{"type":"resize","cols":120,"rows":40}`
5. Session calls PTY.Resize()
6. creack/pty calls TIOCSWINSZ
7. Kernel sends SIGWINCH to shell
8. Shell redraws at new size

## Testing Strategy

### Unit Tests (Fakes)

- `FakePTY`: Captures writes, emits canned output
- `FakeWebSocket`: Queues messages, records writes

### Integration Tests (Real)

- `TestHandleTerminal_EchoCommand`: Full pipeline test
- Real PTY, real WebSocket, verifies echo works

## Security Considerations

- **Localhost binding only**: Server binds to 127.0.0.1, not 0.0.0.0
- **No authentication** in v1 (local trust model)
- **Shell access**: Same privileges as user running trex

## Performance

- **WebGL rendering**: Optional GPU acceleration for fast output
- **Debounced resize**: Prevents flood of resize messages
- **Target latency**: <50ms round-trip for imperceptible input delay

## Related Documentation

- [Terminal Development Guide](./terminal-development.md)
- [WebSocket Protocol Research](../research/websocket-terminal-protocols.md)
- [Frontend Libraries Research](../research/frontend-terminal-libraries.md)
