# Similar Implementations Research

**Version**: 1.0.0
**Research Date**: 2026-02-04
**Status**: COMPLETE

---

## Executive Summary

This document analyzes six major open-source web-based terminal implementations to inform trex's architecture. The research identifies common patterns, best practices, and lessons learned that directly apply to trex's Go backend + xterm.js frontend architecture.

**Key Recommendation**: ttyd's architecture is the most relevant reference for trex, given its C/Go heritage, libwebsockets/websocket approach, and xterm.js frontend. JupyterLab's Terminado provides the cleanest JSON-based WebSocket protocol design.

---

## Findings

### SI-01: xterm.js is the Universal Frontend Standard

**Source**: All six implementations (ttyd, GoTTY, webssh, Wetty, VS Code, JupyterLab)

**Pattern**: Every major web terminal implementation uses xterm.js as the frontend terminal emulator.

**Architecture Details**:
- xterm.js handles terminal rendering, cursor management, escape sequences
- The emulator is "dumb" - it only provides UI and keystroke capture
- All terminal logic (PTY management) happens server-side
- Key addons used: `@xterm/addon-attach` (WebSocket), `@xterm/addon-fit` (responsive sizing), `@xterm/addon-webgl` (performance)

**What to Adopt**:
- Use xterm.js with WebGL renderer for performance (trex requires <50ms latency)
- Implement `addon-fit` for responsive terminal sizing
- Use `addon-attach` pattern for WebSocket communication

**What to Avoid**:
- Don't try to implement terminal emulation in Go backend - let xterm.js handle it
- Don't mix binary and text WebSocket messages inconsistently

**Relevance to trex**: HIGH - trex architecture already specifies xterm.js, this validates the choice

---

### SI-02: Binary Framing with Single-Byte Command Prefix

**Source**: ttyd, GoTTY

**Pattern**: Both ttyd and GoTTY use binary WebSocket frames with a single-byte command prefix to distinguish message types.

**ttyd Protocol** (C implementation):
```
Message Structure: [Command Byte][Payload Data]

Server → Client:
- OUTPUT (terminal data)
- SET_WINDOW_TITLE
- SET_PREFERENCES (JSON config)
- PONG (keepalive)

Client → Server:
- INPUT (keystrokes)
- RESIZE_TERMINAL (JSON: {"columns": N, "rows": N})
- PING (keepalive)
- JSON_DATA (initial connection with auth)
```

**GoTTY Protocol** (Go implementation, v2):
```
Server → Client:
- '1' = Output (terminal data)
- '2' = Pong
- '3' = SetWindowTitle
- '4' = SetPreferences
- '5' = SetReconnect

Client → Server:
- '1' = Input (keystrokes)
- '2' = Ping
- '3' = ResizeTerminal
```

**What to Adopt**:
- Binary framing is efficient for high-throughput terminal I/O
- Single-byte prefix keeps protocol simple and fast to parse
- Separate message types for control (resize, ping) vs data (input/output)

**What to Avoid**:
- GoTTY's protocol versioning complexity (v1 vs v2 with different byte values)
- ttyd's flow control complexity (may be overkill for trex's 10-20 session target)

**Relevance to trex**: HIGH - This is the recommended protocol pattern for terminal I/O

---

### SI-03: JSON-Based Protocol for Cleaner Semantics

**Source**: JupyterLab/Terminado, trex current architecture

**Pattern**: Terminado uses JSON arrays for WebSocket messages, providing clearer semantics at slight overhead cost.

**Terminado Protocol**:
```json
// Client → Server (input)
["stdin", "ls -la\r"]

// Client → Server (resize)
["set_size", 24, 80]

// Server → Client (output)
["stdout", "terminal output here"]
```

**Advantages**:
- Self-documenting protocol
- Easy to debug (human-readable)
- Extensible without breaking changes
- Type-safe parsing

**Disadvantages**:
- Slightly more overhead than binary framing
- JSON parsing cost (minimal for modern systems)

**What to Adopt**:
- JSON is appropriate for trex given its <50ms latency target is achievable
- Current trex architecture already specifies JSON messages - this validates it
- Use JSON for all messages including terminal I/O

**What to Avoid**:
- Don't over-engineer the message schema
- Keep message types minimal (attach, detach, input, resize, output, status, error)

**Relevance to trex**: HIGH - Validates trex's current JSON-based WebSocket design in architecture.md

---

### SI-04: PTY-to-WebSocket Bridge Pattern

**Source**: All implementations

**Pattern**: All implementations follow the same fundamental architecture:

```
Browser (xterm.js) ←→ WebSocket ←→ Server ←→ PTY ←→ Shell/Process
```

**Implementation Variations**:

| Project | Language | PTY Library | WebSocket Library |
|---------|----------|-------------|-------------------|
| ttyd | C | Native PTY | libwebsockets |
| GoTTY | Go | Native PTY | gorilla/websocket |
| Wetty | Node.js | node-pty | socket.io |
| webssh | Python | paramiko (SSH) | tornado |
| VS Code | TypeScript | node-pty | Native WS |
| Terminado | Python | pty module | tornado |

**Key Insight for trex**: The tmax library handles PTY interaction (tmux attach). trex only needs to:
1. Bridge tmax's PTY output to WebSocket
2. Bridge WebSocket input to tmax's PTY input

**What to Adopt**:
- Use gorilla/websocket for Go backend (proven in GoTTY)
- Leverage tmax for all PTY/tmux interaction (don't reinvent)
- Keep the bridge layer thin and focused

**What to Avoid**:
- Don't implement PTY management directly - tmax handles this
- Don't add unnecessary abstraction layers between WebSocket and tmax

**Relevance to trex**: CRITICAL - This defines trex's core architecture

---

### SI-05: Session Management: One Process Per Connection vs Shared

**Source**: GoTTY, ttyd, VS Code

**Pattern**: Different approaches to handling multiple clients:

**One Process Per Connection** (GoTTY default):
- Each WebSocket connection spawns a new process
- Simple but no sharing capability
- Used by GoTTY by default

**Shared Session via Multiplexer** (GoTTY + screen/tmux):
- Multiple WebSocket clients connect to same terminal session
- Requires external multiplexer (screen, tmux)
- GoTTY recommends: `gotty screen -x session-name`

**Native Multi-Session** (VS Code, trex target):
- Server manages multiple PTY sessions
- Each session identified by ID
- Clients can attach/detach to any session

**trex Approach**:
- tmux IS the session multiplexer
- trex discovers existing tmux sessions
- Multiple browser tabs can attach to different sessions
- Same session can have multiple viewers (if needed)

**What to Adopt**:
- Use tmux sessions as the session identifier
- Allow multiple WebSocket connections to same tmux session
- Let tmux handle all session persistence

**What to Avoid**:
- Don't reimplement session multiplexing - tmux does this
- Don't tie WebSocket connections 1:1 with tmux sessions

**Relevance to trex**: HIGH - Validates tmux-centric architecture

---

### SI-06: Flow Control and Backpressure

**Source**: ttyd

**Pattern**: ttyd implements flow control to prevent xterm.js from being overwhelmed with data.

**ttyd's Approach**:
- After receiving data totaling a specific size, xterm.js renders and calls a callback
- Callback increases a "pending" counter and resets data counter
- Server pauses sending when pending count exceeds threshold

**Problem Being Solved**:
- Terminal can output faster than browser can render
- Without flow control, browser memory grows unbounded
- User sees lag as render queue grows

**What to Adopt**:
- Implement basic flow control for production stability
- Monitor xterm.js render performance
- Consider WebSocket backpressure mechanisms

**What to Avoid**:
- Don't over-engineer for v1 (10-20 sessions is manageable)
- Premature optimization - measure first

**Relevance to trex**: MEDIUM - Important for robustness but not critical for v1 MVP

---

### SI-07: Authentication Patterns

**Source**: ttyd, GoTTY, webssh

**Pattern**: Multiple authentication approaches used:

**ttyd**:
- Basic auth via `-c username:password` flag
- Token-based auth via `/auth_token.js` endpoint
- HTTP header auth for reverse proxy integration (`-H` flag)

**GoTTY**:
- Basic auth flag (`-c username:password`)
- TLS client certificates (`--tls-ca-crt`)
- Write permission explicitly enabled (`-w` flag, off by default)

**webssh**:
- SSH authentication (password, public key)
- Known hosts verification to prevent MITM
- Base64 encoded credentials in URL (for automation)

**trex v1 Approach**:
- Localhost only (127.0.0.1 binding)
- No authentication required (local trust model)
- Same privileges as user's terminal

**What to Adopt for v2+**:
- Token-based auth (JWT or similar)
- Consider OAuth for team scenarios
- TLS required when network-exposed

**What to Avoid**:
- Don't add authentication complexity to v1
- Don't store credentials in trex (use existing SSH/tmux auth)

**Relevance to trex**: LOW for v1, HIGH for v2+ (network exposure)

---

### SI-08: Terminal Resize Handling

**Source**: All implementations

**Pattern**: All implementations handle terminal resize as a special message type.

**Common Approach**:
1. Browser detects resize (window resize, container change)
2. xterm.js `addon-fit` calculates new dimensions
3. Client sends resize message with cols/rows
4. Server updates PTY dimensions
5. Shell receives SIGWINCH, redraws

**Message Formats**:
```
// ttyd (binary)
[RESIZE_BYTE][{"columns": 80, "rows": 24}]

// GoTTY (binary)
['3'][cols_bytes][rows_bytes]

// Terminado (JSON)
["set_size", 24, 80]

// trex (current spec)
{ "type": "resize", "cols": 80, "rows": 24 }
```

**What to Adopt**:
- Use xterm.js `addon-fit` for automatic size calculation
- Send resize on window resize AND initial connection
- Handle resize immediately (don't batch/debounce excessively)

**What to Avoid**:
- Don't ignore resize events (causes visual corruption)
- Don't send resize too frequently (debounce rapid changes)

**Relevance to trex**: HIGH - Required for correct terminal behavior

---

## Implementation Recommendations for trex

### Recommended Reference Implementation

**Primary**: ttyd (architecture) + Terminado (protocol)

**Rationale**:
- ttyd's C architecture translates well to Go
- Terminado's JSON protocol matches trex's current spec
- Both are mature, production-tested implementations

### Protocol Recommendation

Adopt JSON-based protocol matching current architecture.md spec:

```typescript
// Client → Server
interface ClientMessage {
  type: 'attach' | 'detach' | 'input' | 'resize';
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

// Server → Client
interface ServerMessage {
  type: 'output' | 'status' | 'error' | 'sessions';
  sessionId?: string;
  data?: string;
  sessions?: Session[];
  error?: string;
}
```

### Technology Stack Validation

| Component | Recommendation | Validation |
|-----------|---------------|------------|
| Frontend Terminal | xterm.js | Used by ALL implementations |
| WebSocket (Go) | gorilla/websocket | Proven in GoTTY |
| PTY Management | tmax library | Unique to trex (tmux integration) |
| Protocol Format | JSON | Matches Terminado, easier debugging |
| Addons | fit, webgl, attach | Standard across implementations |

### Key Differentiator

trex's unique value is the **tmax integration**. Unlike other implementations that spawn new processes or SSH into remote hosts, trex discovers and manages existing tmux sessions. This simplifies the PTY layer significantly.

---

## Sources

- [ttyd - Share your terminal over the web](https://github.com/tsl0922/ttyd)
- [GoTTY - Share your terminal as a web application](https://github.com/yudai/gotty)
- [webssh - Web based SSH client](https://github.com/huashengdun/webssh)
- [Wetty - Terminal in browser over http/https](https://github.com/butlerx/wetty)
- [xterm.js - A terminal for the web](https://github.com/xtermjs/xterm.js)
- [Terminado - Tornado websocket backend for xterm.js](https://github.com/jupyter/terminado)
- [VS Code Terminal Documentation](https://code.visualstudio.com/docs/terminal/advanced)
- [WebSSH2 - Web SSH Client](https://github.com/billchurch/webssh2)

---

## Changelog

### v1.0.0 (2026-02-04)
- Initial research completed
- 8 findings documented (SI-01 through SI-08)
- Recommendations aligned with trex architecture.md
