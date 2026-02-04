# WebSocket Terminal Protocols Research

## Research Summary

This document captures findings on WebSocket protocols and patterns for routing terminal I/O in web-based terminal applications, based on analysis of production tools like xterm.js, ttyd, gotty, and Go WebSocket libraries.

---

## WS-01: WebSocket vs HTTP for Terminal I/O

**Finding**: WebSocket is the clear choice for terminal applications requiring bidirectional real-time communication.

**Why WebSocket over HTTP/SSE**:
- **Full-duplex communication**: Both client (keyboard input) and server (terminal output) can send data simultaneously
- **Low latency**: No HTTP request/response overhead for each keystroke or output chunk
- **Real-time updates**: Progress bars, interactive applications, and cursor movements work smoothly
- **Single persistent connection**: Reduces connection overhead vs HTTP polling

**When SSE might suffice**: Read-only terminal output viewing where no user interaction is needed (log streaming)

**Kubernetes example**: WebSocket drives exec, attach, and portforward endpoints - enabling bidirectional tasks like running a shell in a container.

**Source**: [WebSockets vs SSE Comparison](https://websocket.org/comparisons/sse/)

---

## WS-02: Terminal Data Encoding - Binary vs Text

**Finding**: Use binary WebSocket messages with UTF-8 encoding for terminal data.

**Encoding considerations**:
- **Text mode**: Client-to-server input from `term.onData` is always text (needed to distinguish from binary data)
- **Binary mode**: Preferred for terminal output; directly forward bytes when encoding is UTF-8
- **Mixed content**: Never mix byte and string content in the same protocol - stick to one type

**xterm.js behavior**:
```javascript
// Client input (text) vs binary data handling
term.onData(data => ws.send(data));        // Text input
term.onBinary(data => ws.send(data));      // Binary data (escape sequences)
```

**Best practice**: If using binary transport for both directions, implement a protocol layer to distinguish text input from binary data.

**Source**: [xterm.js Binary WebSocket Discussion](https://github.com/xtermjs/xterm.js/discussions/4625)

---

## WS-03: Message Protocol Design (GoTTY Pattern)

**Finding**: Use single-byte command prefixes with type-specific payloads.

**GoTTY Protocol (Production-proven)**:

```
Input Message Types (Client → Server):
'0' = UnknownInput    - Unknown/error
'1' = Input           - User keyboard input
'2' = Ping            - Heartbeat to server
'3' = ResizeTerminal  - Browser window resized

Output Message Types (Server → Client):
'0' = UnknownOutput   - Unknown/error
'1' = Output          - Terminal output data
'2' = Pong            - Heartbeat response
'3' = SetWindowTitle  - Set browser tab title
'4' = SetPreferences  - Terminal settings JSON
'5' = SetReconnect    - Enable/configure reconnection
```

**Message format**:
```
[1 byte: command type][N bytes: payload]

Examples:
Input:  ['1']['h','e','l','l','o']     // User typed "hello"
Resize: ['3']['{"Columns":80,"Rows":24}']  // JSON dimensions
Output: ['1'][terminal data bytes...]   // PTY output
```

**Source**: [GoTTY webtty.go](https://github.com/yudai/gotty/blob/master/webtty/webtty.go)

---

## WS-04: ttyd Protocol (Alternative Pattern)

**Finding**: ttyd uses a similar command-prefix pattern with additional features.

**ttyd Message Types**:
```
SET_WINDOW_TITLE  - "%c%s (%s)" (cmd, command, hostname)
SET_PREFERENCES   - "%c%s" (cmd, preferences JSON)
INPUT             - Terminal input from client
OUTPUT            - Terminal output to client
RESIZE_TERMINAL   - JSON with "columns" and "rows"
PAUSE/RESUME      - Flow control signals
JSON_DATA         - Initial handshake (window size, auth token)
```

**Initial handshake sequence**:
1. Client connects
2. Client sends JSON_DATA with initial window size
3. Server sends SET_WINDOW_TITLE
4. Server sends SET_PREFERENCES
5. Bidirectional I/O begins

**Source**: [ttyd protocol.c](https://github.com/tsl0922/ttyd/blob/main/src/protocol.c)

---

## WS-05: Go WebSocket Library Comparison

**Finding**: Both gorilla/websocket and coder/websocket are viable; choice depends on project needs.

| Feature | gorilla/websocket | coder/websocket (nhooyr) |
|---------|-------------------|--------------------------|
| Maturity | 6+ years, battle-tested | Newer, actively maintained by Coder |
| API Style | Traditional, explicit | Modern, idiomatic Go |
| Context Support | Manual | Built-in context.Context |
| Concurrent Write | Manual synchronization | Thread-safe with internal locks |
| WASM Support | Limited | Full WASM compilation |
| net.Conn Wrapper | No | Yes, eases interop |
| Performance | Direct net.Conn (uses unsafe) | Slightly faster for idiomatic Go |
| Documentation | Extensive | Growing |

**Recommendation for terminal backends**:
- **gorilla/websocket**: If you need extensive documentation and battle-tested stability
- **coder/websocket**: For modern Go projects needing context support and concurrent writing

**coder/websocket concurrency pattern**:
```go
// Reads and writes are independent with separate locks
// Only one writer can be open at a time
ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()

w, err := conn.Writer(ctx, websocket.MessageBinary)
if err != nil { return err }
defer w.Close()

_, err = w.Write(data)
```

**Source**: [coder/websocket](https://github.com/coder/websocket), [gorilla/websocket comparison](https://github.com/gorilla/websocket/pull/543)

---

## WS-06: Terminal Resize Handling (TIOCSWINSZ)

**Finding**: Propagate resize events via WebSocket message, then apply with TIOCSWINSZ ioctl.

**Browser → Server flow**:
1. Browser detects window resize (via xterm.js `onResize` event)
2. Send resize message: `['3']['{"Columns":120,"Rows":40}']`
3. Server parses dimensions
4. Server calls TIOCSWINSZ ioctl on PTY file descriptor
5. Kernel sends SIGWINCH to foreground process group

**Go implementation with creack/pty**:
```go
import "github.com/creack/pty"

// Handle resize message from WebSocket
func handleResize(ptmx *os.File, cols, rows uint16) error {
    return pty.Setsize(ptmx, &pty.Winsize{
        Rows: rows,
        Cols: cols,
        X:    0,  // pixels (optional)
        Y:    0,  // pixels (optional)
    })
}

// SIGWINCH handler for local terminal inheritance
ch := make(chan os.Signal, 1)
signal.Notify(ch, syscall.SIGWINCH)
go func() {
    for range ch {
        if err := pty.InheritSize(os.Stdin, ptmx); err != nil {
            log.Printf("resize error: %s", err)
        }
    }
}()
ch <- syscall.SIGWINCH // Initial resize
```

**xterm.js roundtrip consideration**: For synchronization, XOFF/ACK tokens can ensure PTY has applied new size before continuing output, though this adds latency.

**Source**: [creack/pty](https://pkg.go.dev/github.com/creack/pty), [xterm.js resize roundtrip](https://github.com/xtermjs/xterm.js/issues/1914)

---

## WS-07: Reconnection and Session Persistence

**Finding**: Use terminal multiplexers (tmux/screen) for true session persistence; implement reconnection with exponential backoff.

**Reconnection pattern**:
```javascript
// Client-side reconnection state
const state = {
    isConnected: false,
    isReconnecting: false,
    isManuallyClosed: false,
    reconnectAttempts: 0,
    maxAttempts: 10,
    baseDelay: 1000,
};

function reconnect() {
    if (state.isManuallyClosed) return;

    const delay = Math.min(
        state.baseDelay * Math.pow(2, state.reconnectAttempts),
        30000 // Max 30 seconds
    );

    setTimeout(() => {
        state.reconnectAttempts++;
        connect();
    }, delay);
}
```

**Session persistence with tmux**:
```bash
# Server starts tmux session
ttyd tmux new -A -s session_name bash

# Client reconnects to same session
# tmux handles output buffering and state preservation
```

**Server-side session management**:
1. Assign unique session IDs
2. Associate PTY/tmux sessions with session IDs
3. On reconnect, client sends session ID
4. Server reattaches to existing PTY/tmux session

**ttyd options**:
- `--reconnect, -r <seconds>`: Time to reconnect (default: 10)
- `-t disableReconnect=true`: Disable auto-reconnection

**Source**: [ttyd GitHub](https://github.com/tsl0922/ttyd), [GoTTY](https://github.com/yudai/gotty)

---

## WS-08: Multiplexing Multiple Terminals

**Finding**: Use channel/stream IDs in message protocol for multiplexing over single WebSocket.

**Protocol extension for multiplexing**:
```
[1 byte: command][4 bytes: channel_id][N bytes: payload]

Example:
Create channel:   [CMD_CREATE][0001][{"shell":"/bin/bash"}]
Channel input:    [CMD_INPUT][0001]["ls -la"]
Channel output:   [CMD_OUTPUT][0001][terminal data...]
Channel resize:   [CMD_RESIZE][0001][{"cols":80,"rows":24}]
Close channel:    [CMD_CLOSE][0001][]
```

**Server-side Go structure**:
```go
type TerminalMux struct {
    mu       sync.RWMutex
    channels map[uint32]*TerminalChannel
    nextID   uint32
}

type TerminalChannel struct {
    ID     uint32
    PTY    *os.File
    Cmd    *exec.Cmd
    Input  chan []byte
    Output chan []byte
}

func (m *TerminalMux) HandleMessage(msg []byte) {
    cmd := msg[0]
    channelID := binary.BigEndian.Uint32(msg[1:5])
    payload := msg[5:]

    switch cmd {
    case CMD_INPUT:
        m.channels[channelID].Input <- payload
    case CMD_RESIZE:
        m.handleResize(channelID, payload)
    // ...
    }
}
```

**Alternative: tmux-based multiplexing**:
- Single WebSocket per tmux session
- tmux handles window/pane management internally
- Simpler implementation, proven multiplexing

**RFC reference**: [WebSocket Multiplexing Extension](https://datatracker.ietf.org/doc/html/draft-ietf-hybi-websocket-multiplexing-01) (never finalized but useful design reference)

**Source**: [tmux documentation](https://man7.org/linux/man-pages/man1/tmux.1.html)

---

## WS-09: Flow Control and Backpressure

**Finding**: Implement application-level flow control since WebSocket doesn't provide native backpressure.

**The problem**:
- xterm.js throughput: 5-35 MB/s
- Fast producers (e.g., `cat /dev/urandom`): Can exceed several GB/s
- xterm.js buffer limit: 50MB (data beyond discarded)

**Pattern 1: Pause/Resume with node-pty**:
```javascript
pty.onData(chunk => {
    pty.pause();                    // Stop PTY reads
    term.write(chunk, () => {
        pty.resume();               // Resume after render
    });
});
```

**Pattern 2: High/Low watermarks**:
```javascript
const CALLBACK_BYTE_LIMIT = 100000;  // Callback every 100KB
const HIGH = 5;                       // Pause at 5 pending
const LOW = 2;                        // Resume at 2 pending

let pendingCallbacks = 0;

function handleOutput(data) {
    if (pendingCallbacks >= HIGH) {
        pausePTY();
    }

    term.write(data, () => {
        pendingCallbacks--;
        if (pendingCallbacks <= LOW) {
            resumePTY();
        }
    });
    pendingCallbacks++;
}
```

**Pattern 3: Server-side byte tracking (DomTerm approach)**:
```go
type FlowController struct {
    sentBytes     int64
    confirmedBytes int64
    threshold     int64  // e.g., 8000 bytes
}

func (fc *FlowController) CanSend() bool {
    return (fc.sentBytes - fc.confirmedBytes) < fc.threshold
}

func (fc *FlowController) OnConfirm(confirmed int64) {
    fc.confirmedBytes = confirmed
}
```

Client sends periodic "RECEIVED N" messages; server pauses PTY polling when unconfirmed bytes exceed threshold.

**Source**: [xterm.js Flow Control Guide](https://xtermjs.org/docs/guides/flowcontrol/)

---

## WS-10: Recommended Protocol Design for T-Rex

**Finding**: Synthesized recommendations for the T-Rex terminal WebSocket implementation.

**Message format (Binary WebSocket)**:
```
[1 byte: version][1 byte: command][2 bytes: flags][4 bytes: channel_id][payload...]

Version: 0x01 (protocol version 1)
Flags:   Bit 0: compressed
         Bit 1: fragmented
         Bit 2-15: reserved
```

**Command definitions**:
```go
const (
    // Client → Server
    CmdInput        byte = 0x01  // Terminal input
    CmdResize       byte = 0x02  // Window resize
    CmdPing         byte = 0x03  // Heartbeat
    CmdFlowAck      byte = 0x04  // Bytes received confirmation
    CmdChannelOpen  byte = 0x10  // Open new terminal channel
    CmdChannelClose byte = 0x11  // Close terminal channel

    // Server → Client
    CmdOutput       byte = 0x81  // Terminal output
    CmdPong         byte = 0x83  // Heartbeat response
    CmdTitle        byte = 0x84  // Set window title
    CmdPrefs        byte = 0x85  // Terminal preferences
    CmdError        byte = 0x8F  // Error message
)
```

**Resize message payload**:
```json
{"cols": 120, "rows": 40, "xpixel": 0, "ypixel": 0}
```

**Recommended Go stack**:
```go
import (
    "github.com/coder/websocket"  // Modern, context-aware
    "github.com/creack/pty"        // PTY management
)
```

**Key implementation points**:
1. Use binary messages for all terminal data
2. Single-byte command prefix for fast parsing
3. Channel IDs for future multiplexing support
4. Flow control via periodic ACK messages
5. Reconnection support with session ID
6. tmux integration for session persistence

---

## References

### WebSocket Libraries
- [coder/websocket (Go)](https://github.com/coder/websocket)
- [gorilla/websocket (Go)](https://github.com/gorilla/websocket)

### Terminal Tools
- [xterm.js](https://xtermjs.org/)
- [ttyd](https://github.com/tsl0922/ttyd)
- [GoTTY](https://github.com/yudai/gotty)

### PTY Libraries
- [creack/pty (Go)](https://github.com/creack/pty)

### Specifications
- [WebSocket Multiplexing Draft](https://datatracker.ietf.org/doc/html/draft-ietf-hybi-websocket-multiplexing-01)
- [TIOCSWINSZ man page](https://manpages.ubuntu.com/manpages/plucky/en/man2/TIOCGWINSZ.2const.html)
