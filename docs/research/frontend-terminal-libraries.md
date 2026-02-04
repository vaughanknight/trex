# Frontend Terminal Libraries Research

**Version**: 1.0.0
**Research Date**: 2026-02-04
**Status**: COMPLETE

---

## Executive Summary

This document provides comprehensive research on frontend terminal libraries for React, with a specific focus on xterm.js integration for Vite + React + TypeScript projects. The research covers library selection, installation, configuration, theming, performance optimization, and alternative solutions.

**Key Recommendation**: Use `@xterm/xterm` (v5.5.0) with `react-xtermjs` wrapper for the best combination of features, maintenance, and React integration. The `@xterm/addon-fit`, `@xterm/addon-webgl`, and `@xterm/addon-web-links` addons are essential for production-quality terminal experiences.

---

## Findings

### FT-01: xterm.js Current Version and Package Migration

**Source**: [npm @xterm/xterm](https://www.npmjs.com/package/@xterm/xterm), [xterm.js Releases](https://github.com/xtermjs/xterm.js/releases)

**Current Status (2025-2026)**:
- **Latest Stable**: `@xterm/xterm` v5.5.0
- **Beta Available**: v5.6.0-beta.66 (includes ESM export directives)
- **Package Migration**: The old `xterm` package (v5.3.0) is **deprecated**

**Critical Change**: All xterm.js packages have migrated to the `@xterm/*` scope:
```bash
# OLD (deprecated - do not use)
npm install xterm xterm-addon-fit xterm-addon-webgl

# NEW (current - use this)
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-webgl
```

**Package List**:
| Old Package | New Package | Purpose |
|-------------|-------------|---------|
| `xterm` | `@xterm/xterm` | Core terminal |
| `xterm-addon-fit` | `@xterm/addon-fit` | Auto-resize terminal |
| `xterm-addon-webgl` | `@xterm/addon-webgl` | GPU rendering |
| `xterm-addon-attach` | `@xterm/addon-attach` | WebSocket attachment |
| `xterm-addon-web-links` | `@xterm/addon-web-links` | Clickable links |

**Relevance to trex**: HIGH - Must use scoped `@xterm/*` packages for new development

---

### FT-02: React Integration Options Comparison

**Source**: [react-xtermjs](https://github.com/Qovery/react-xtermjs), [xterm-react](https://github.com/PabloLION/xterm-react), [xterm-for-react](https://github.com/robert-harbison/xterm-for-react)

**Available React Wrappers**:

| Package | Version | Last Updated | Hooks Support | Recommendation |
|---------|---------|--------------|---------------|----------------|
| `react-xtermjs` | 1.0.9 | 7 months ago | Yes | **RECOMMENDED** |
| `@pablo-lion/xterm-react` | 1.1.2 | 1 year ago | Yes | Good alternative |
| `xterm-for-react` | 1.0.4 | 5 years ago | No | Deprecated |
| `react-xterm` | 2.0.4 | 8 years ago | No | Deprecated |

**Recommended: react-xtermjs**

Built by Qovery for their cloud platform console. Features:
- Modern React hooks API (`useXTerm`)
- Component-based API (`XTerm`)
- TypeScript support
- Active maintenance
- Production-tested at scale

**Installation**:
```bash
npm install @xterm/xterm react-xtermjs
# or
yarn add @xterm/xterm react-xtermjs
```

**Relevance to trex**: HIGH - `react-xtermjs` provides the cleanest integration path

---

### FT-03: Vite + React + TypeScript Setup

**Source**: [Vite Documentation](https://vite.dev), [react-xtermjs](https://www.qovery.com/blog/react-xtermjs-a-react-library-to-build-terminals)

**Project Setup**:
```bash
# Create new project
npm create vite@latest trex-frontend -- --template react-ts
cd trex-frontend

# Install xterm.js dependencies
npm install @xterm/xterm react-xtermjs
npm install @xterm/addon-fit @xterm/addon-webgl @xterm/addon-web-links
```

**vite.config.ts** (no special configuration required):
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy WebSocket connections to Go backend
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
```

**CSS Import** (required in main.tsx or App.tsx):
```typescript
import '@xterm/xterm/css/xterm.css'
```

**Relevance to trex**: HIGH - Direct setup instructions for trex frontend

---

### FT-04: Basic Terminal Component Implementation

**Source**: [react-xtermjs API](https://github.com/Qovery/react-xtermjs)

**Hook-Based Implementation (Recommended)**:
```typescript
// components/Terminal.tsx
import { useEffect, useRef } from 'react'
import { useXTerm } from 'react-xtermjs'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  sessionId: string
  onData?: (data: string) => void
}

export function Terminal({ sessionId, onData }: TerminalProps) {
  const fitAddonRef = useRef<FitAddon | null>(null)

  const { instance, ref } = useXTerm({
    options: {
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
      },
    },
  })

  // Load addons and handle resize
  useEffect(() => {
    if (!instance) return

    // Load addons
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    instance.loadAddon(fitAddon)

    const webglAddon = new WebglAddon()
    instance.loadAddon(webglAddon)

    const webLinksAddon = new WebLinksAddon()
    instance.loadAddon(webLinksAddon)

    // Initial fit
    fitAddon.fit()

    // Handle window resize
    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    // Handle user input
    const dataDisposable = instance.onData((data) => {
      onData?.(data)
    })

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize)
      dataDisposable.dispose()
      webglAddon.dispose()
    }
  }, [instance, onData])

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1e1e1e',
      }}
    />
  )
}
```

**Component-Based Alternative**:
```typescript
import { XTerm } from 'react-xtermjs'

function MyTerminal() {
  return (
    <XTerm
      options={{ cursorBlink: true }}
      style={{ width: '100%', height: '100%' }}
      listeners={{
        onData: (data) => console.log('Input:', data),
        onResize: (cols, rows) => console.log(`Resized: ${cols}x${rows}`),
      }}
    />
  )
}
```

**Relevance to trex**: CRITICAL - Base terminal component for trex frontend

---

### FT-05: Essential Addons and Their Usage

**Source**: [xterm.js Addons](https://github.com/xtermjs/xterm.js/tree/master/addons), [npm @xterm/addon-attach](https://www.npmjs.com/package/@xterm/addon-attach)

**Core Addons for trex**:

#### @xterm/addon-fit
Auto-sizes terminal to container dimensions:
```typescript
import { FitAddon } from '@xterm/addon-fit'

const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
fitAddon.fit() // Call after container size changes

// Get dimensions for resize message
const dims = fitAddon.proposeDimensions()
// { cols: 80, rows: 24 }
```

#### @xterm/addon-webgl
GPU-accelerated rendering (10x faster for high-throughput):
```typescript
import { WebglAddon } from '@xterm/addon-webgl'

const webglAddon = new WebglAddon()
terminal.loadAddon(webglAddon)

// Handle WebGL context loss (browser may drop contexts)
webglAddon.onContextLoss(() => {
  webglAddon.dispose()
  // Optionally recreate addon or fall back to canvas
})
```

#### @xterm/addon-web-links
Makes URLs clickable:
```typescript
import { WebLinksAddon } from '@xterm/addon-web-links'

const webLinksAddon = new WebLinksAddon((event, uri) => {
  window.open(uri, '_blank')
})
terminal.loadAddon(webLinksAddon)
```

#### @xterm/addon-attach (WebSocket)
Attaches terminal to WebSocket for I/O:
```typescript
import { AttachAddon } from '@xterm/addon-attach'

const socket = new WebSocket('ws://localhost:8080/ws')
const attachAddon = new AttachAddon(socket)
terminal.loadAddon(attachAddon)

// Note: For trex's JSON protocol, custom handling is preferred
// over AttachAddon (see FT-06)
```

#### @xterm/addon-canvas (Fallback)
Canvas renderer when WebGL unavailable:
```typescript
import { CanvasAddon } from '@xterm/addon-canvas'

// Use as fallback when WebGL fails
try {
  terminal.loadAddon(new WebglAddon())
} catch (e) {
  terminal.loadAddon(new CanvasAddon())
}
```

**Relevance to trex**: HIGH - Essential for production terminal quality

---

### FT-06: WebSocket Integration Pattern (Custom Protocol)

**Source**: [ttyd Protocol](https://github.com/tsl0922/ttyd), [trex architecture.md](../adr/architecture.md)

**Custom WebSocket Handler** (for trex JSON protocol):

Since trex uses a JSON-based WebSocket protocol (not raw binary like AttachAddon expects), implement custom handling:

```typescript
// hooks/useTerminalWebSocket.ts
import { useEffect, useRef, useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

interface UseTerminalWebSocketOptions {
  terminal: Terminal | null
  fitAddon: FitAddon | null
  sessionId: string
  wsUrl: string
}

interface ServerMessage {
  type: 'output' | 'status' | 'error' | 'sessions'
  sessionId?: string
  data?: string
  error?: string
}

interface ClientMessage {
  type: 'attach' | 'detach' | 'input' | 'resize'
  sessionId?: string
  data?: string
  cols?: number
  rows?: number
}

export function useTerminalWebSocket({
  terminal,
  fitAddon,
  sessionId,
  wsUrl,
}: UseTerminalWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  useEffect(() => {
    if (!terminal || !fitAddon) return

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      // Attach to session
      const dims = fitAddon.proposeDimensions()
      sendMessage({
        type: 'attach',
        sessionId,
        cols: dims?.cols ?? 80,
        rows: dims?.rows ?? 24,
      })
    }

    ws.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data)

      switch (message.type) {
        case 'output':
          terminal.write(message.data ?? '')
          break
        case 'error':
          console.error('Terminal error:', message.error)
          break
        case 'status':
          // Handle status updates (connected, disconnected, etc.)
          break
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('WebSocket closed')
    }

    // Handle terminal input
    const dataDisposable = terminal.onData((data) => {
      sendMessage({ type: 'input', sessionId, data })
    })

    // Handle terminal resize
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      sendMessage({ type: 'resize', sessionId, cols, rows })
    })

    return () => {
      dataDisposable.dispose()
      resizeDisposable.dispose()
      ws.close()
    }
  }, [terminal, fitAddon, sessionId, wsUrl, sendMessage])

  return { sendMessage }
}
```

**Usage in Terminal Component**:
```typescript
function TerminalWithWebSocket({ sessionId }: { sessionId: string }) {
  const fitAddonRef = useRef<FitAddon | null>(null)
  const { instance, ref } = useXTerm()

  useEffect(() => {
    if (instance) {
      const fitAddon = new FitAddon()
      fitAddonRef.current = fitAddon
      instance.loadAddon(fitAddon)
    }
  }, [instance])

  useTerminalWebSocket({
    terminal: instance,
    fitAddon: fitAddonRef.current,
    sessionId,
    wsUrl: 'ws://localhost:8080/ws',
  })

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />
}
```

**Relevance to trex**: CRITICAL - Matches trex's JSON WebSocket protocol design

---

### FT-07: Theming and Styling

**Source**: [xterm.js ITheme](https://xtermjs.org/docs/api/terminal/interfaces/itheme/), [xterm-theme npm](https://www.npmjs.com/package/xterm-theme)

**ITheme Interface** (29 optional properties):

```typescript
interface ITheme {
  // Basic colors
  foreground?: string
  background?: string

  // Cursor
  cursor?: string
  cursorAccent?: string

  // Selection
  selectionBackground?: string
  selectionForeground?: string
  selectionInactiveBackground?: string

  // Standard ANSI colors (0-7)
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string

  // Bright ANSI colors (8-15)
  brightBlack?: string
  brightRed?: string
  brightGreen?: string
  brightYellow?: string
  brightBlue?: string
  brightMagenta?: string
  brightCyan?: string
  brightWhite?: string

  // Extended ANSI colors (16-255)
  extendedAnsi?: string[]

  // Scrollbar
  scrollbarSliderBackground?: string
  scrollbarSliderHoverBackground?: string
  scrollbarSliderActiveBackground?: string

  // UI
  overviewRulerBorder?: string
}
```

**Pre-built Themes**:

```typescript
// Dark theme (VS Code inspired)
const darkTheme: ITheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
}

// Light theme
const lightTheme: ITheme = {
  background: '#ffffff',
  foreground: '#383a42',
  cursor: '#383a42',
  cursorAccent: '#ffffff',
  selectionBackground: '#bfceff',
  black: '#000000',
  red: '#e45649',
  green: '#50a14f',
  yellow: '#c18401',
  blue: '#4078f2',
  magenta: '#a626a4',
  cyan: '#0184bc',
  white: '#a0a1a7',
  brightBlack: '#5c6370',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#d19a66',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#ffffff',
}
```

**Applying Themes**:
```typescript
// At creation
const terminal = new Terminal({ theme: darkTheme })

// Dynamically
terminal.options.theme = lightTheme
```

**Using xterm-theme (iTerm2 themes)**:
```bash
npm install xterm-theme
```
```typescript
import * as xtermTheme from 'xterm-theme'
terminal.options.theme = xtermTheme.Dracula
```

**Relevance to trex**: MEDIUM - Important for user experience, lower priority than core functionality

---

### FT-08: Performance Optimization

**Source**: [xterm.js WebGL Addon](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl), [Performance Issues](https://github.com/xtermjs/xterm.js/issues/4175)

**Performance Best Practices**:

#### 1. Use WebGL Renderer
```typescript
import { WebglAddon } from '@xterm/addon-webgl'

const webglAddon = new WebglAddon()
terminal.loadAddon(webglAddon)

// Handle context loss gracefully
webglAddon.onContextLoss(() => {
  webglAddon.dispose()
  // Fall back to canvas or recreate
})
```

The WebGL renderer:
- Uploads character atlas to GPU texture
- Uses shaders for fast rendering
- 10x+ faster than DOM renderer for high-throughput
- New texture packing strategy reduces memory usage

#### 2. React Memory Leak Prevention
```typescript
useEffect(() => {
  const terminal = new Terminal()
  terminal.open(containerRef.current!)

  // Load addons
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  return () => {
    // CRITICAL: Always dispose terminal on unmount
    terminal.dispose()
  }
}, [])
```

#### 3. Debounce Resize Events
```typescript
import { useMemo } from 'react'
import debounce from 'lodash/debounce'

const debouncedFit = useMemo(
  () => debounce(() => fitAddon?.fit(), 100),
  [fitAddon]
)

useEffect(() => {
  window.addEventListener('resize', debouncedFit)
  return () => {
    debouncedFit.cancel()
    window.removeEventListener('resize', debouncedFit)
  }
}, [debouncedFit])
```

#### 4. Limit Scrollback Buffer
```typescript
const terminal = new Terminal({
  scrollback: 1000, // Default is 1000, reduce for memory savings
  // For high-throughput, consider lower values
})
```

#### 5. Handle Large Output
```typescript
// Break up large writes to prevent blocking
async function writeLargeOutput(terminal: Terminal, data: string) {
  const chunkSize = 10000
  for (let i = 0; i < data.length; i += chunkSize) {
    terminal.write(data.slice(i, i + chunkSize))
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}
```

**Known Issues**:
- Wide containers (20k+ pixels) can cause performance issues with canvas renderer
- GPU memory leaks fixed in recent versions - always call `dispose()` on addons
- Texture atlas clears itself when full (low cost restart)

**Relevance to trex**: HIGH - Required for smooth terminal experience with tmux sessions

---

### FT-09: Alternative Terminal Libraries

**Source**: [AlternativeTo](https://alternativeto.net/software/xterm/), [npm trends](https://npmtrends.com/terminal-vs-terminal.js-vs-xterm-for-react)

**Comparison of React Terminal Libraries**:

| Library | Weekly Downloads | Use Case | Full Terminal | Recommendation |
|---------|-----------------|----------|---------------|----------------|
| xterm.js | 400k+ | Full PTY emulation | Yes | **Best for trex** |
| react-terminal | 5k | Simple command UI | No | Not suitable |
| react-console-emulator | 2k | Command prompts | No | Not suitable |
| terminal-in-react | 1k | Fake terminal UI | No | Not suitable |

**Why xterm.js is Best for trex**:

1. **Full Terminal Emulation**: Handles escape sequences, cursor positioning, colors
2. **PTY Compatibility**: Works with bash, vim, tmux, htop, etc.
3. **VS Code Proven**: Used by VS Code, Hyper, Theia
4. **Mouse Support**: Full mouse event handling for tmux
5. **Unicode/CJK**: Proper wide character support
6. **Performance**: WebGL renderer for high throughput

**When to Use Alternatives**:

- **react-terminal**: Simple command-response interfaces (not real terminals)
- **react-console-emulator**: Unix-like prompts for documentation
- **terminal-in-react**: Demo/showcase purposes

**trex Requirement**: Full tmux session interaction requires real terminal emulation. Only xterm.js provides this.

**Relevance to trex**: VALIDATED - xterm.js is the only appropriate choice

---

### FT-10: Complete Implementation Example

**Source**: Compiled from all research findings

**Full Terminal Component with All Features**:

```typescript
// components/TrexTerminal.tsx
import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal, ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { CanvasAddon } from '@xterm/addon-canvas'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

// Theme definitions
const darkTheme: ITheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
}

interface TrexTerminalProps {
  sessionId: string
  wsUrl?: string
  theme?: ITheme
  fontSize?: number
  fontFamily?: string
}

interface ServerMessage {
  type: 'output' | 'status' | 'error' | 'sessions'
  sessionId?: string
  data?: string
  error?: string
}

export function TrexTerminal({
  sessionId,
  wsUrl = 'ws://localhost:8080/ws',
  theme = darkTheme,
  fontSize = 14,
  fontFamily = 'Menlo, Monaco, "Courier New", monospace',
}: TrexTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  // Send message helper
  const sendMessage = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily,
      theme,
      scrollback: 5000,
      allowProposedApi: true,
    })

    terminalRef.current = terminal

    // Load FitAddon first (required for dimensions)
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)

    // Load WebGL addon with fallback
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
        terminal.loadAddon(new CanvasAddon())
      })
      terminal.loadAddon(webglAddon)
    } catch {
      terminal.loadAddon(new CanvasAddon())
    }

    // Load WebLinks addon
    const webLinksAddon = new WebLinksAddon((event, uri) => {
      window.open(uri, '_blank')
    })
    terminal.loadAddon(webLinksAddon)

    // Open terminal in container
    terminal.open(containerRef.current)
    fitAddon.fit()

    // Handle window resize with debouncing
    let resizeTimeout: number
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = window.setTimeout(() => {
        fitAddon.fit()
      }, 100)
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      clearTimeout(resizeTimeout)
      window.removeEventListener('resize', handleResize)
      terminal.dispose()
    }
  }, [fontSize, fontFamily, theme])

  // WebSocket connection
  useEffect(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!terminal || !fitAddon) return

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      const dims = fitAddon.proposeDimensions()
      sendMessage({
        type: 'attach',
        sessionId,
        cols: dims?.cols ?? 80,
        rows: dims?.rows ?? 24,
      })
    }

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data)
        switch (message.type) {
          case 'output':
            terminal.write(message.data ?? '')
            break
          case 'error':
            terminal.writeln(`\r\n\x1b[31mError: ${message.error}\x1b[0m`)
            break
          case 'status':
            // Handle status messages
            break
        }
      } catch (e) {
        console.error('Failed to parse message:', e)
      }
    }

    ws.onerror = () => setStatus('disconnected')
    ws.onclose = () => setStatus('disconnected')

    // Handle terminal input
    const dataDisposable = terminal.onData((data) => {
      sendMessage({ type: 'input', sessionId, data })
    })

    // Handle terminal resize
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      sendMessage({ type: 'resize', sessionId, cols, rows })
    })

    return () => {
      dataDisposable.dispose()
      resizeDisposable.dispose()
      ws.close()
    }
  }, [sessionId, wsUrl, sendMessage])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {status !== 'connected' && (
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          padding: '4px 8px',
          background: status === 'connecting' ? '#e5e510' : '#cd3131',
          color: '#1e1e1e',
          borderRadius: 4,
          fontSize: 12,
          zIndex: 10,
        }}>
          {status === 'connecting' ? 'Connecting...' : 'Disconnected'}
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: theme.background,
        }}
      />
    </div>
  )
}

export { darkTheme }
export type { TrexTerminalProps }
```

**Usage**:
```typescript
// App.tsx
import { TrexTerminal } from './components/TrexTerminal'

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <TrexTerminal sessionId="my-tmux-session" />
    </div>
  )
}
```

**Relevance to trex**: CRITICAL - Production-ready component implementation

---

## Installation Summary

```bash
# Create Vite project
npm create vite@latest trex-frontend -- --template react-ts
cd trex-frontend

# Install xterm.js and addons (use scoped packages)
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-canvas @xterm/addon-web-links

# Install React wrapper
npm install react-xtermjs

# Optional: pre-built themes
npm install xterm-theme
```

---

## Sources

- [xterm.js Official](https://xtermjs.org/)
- [@xterm/xterm on npm](https://www.npmjs.com/package/@xterm/xterm)
- [react-xtermjs GitHub](https://github.com/Qovery/react-xtermjs)
- [react-xtermjs Blog Post](https://www.qovery.com/blog/react-xtermjs-a-react-library-to-build-terminals)
- [xterm.js ITheme API](https://xtermjs.org/docs/api/terminal/interfaces/itheme/)
- [xterm.js Releases](https://github.com/xtermjs/xterm.js/releases)
- [@xterm/addon-attach](https://www.npmjs.com/package/@xterm/addon-attach)
- [xterm.js WebGL Addon](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl)
- [Vite React TypeScript Guide](https://blog.logrocket.com/how-to-build-react-typescript-app-vite/)
- [xterm-theme npm](https://www.npmjs.com/package/xterm-theme)

---

## Changelog

### v1.0.0 (2026-02-04)
- Initial research completed
- 10 findings documented (FT-01 through FT-10)
- Complete code examples for Vite + React + TypeScript integration
- Performance and theming recommendations included
