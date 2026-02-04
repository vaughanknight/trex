# React State Management for Terminal Applications

**Research Date**: 2026-02-04
**Query**: State management comparison for 30+ session terminal app

---

## Executive Summary

**Recommendation: Zustand** for trex terminal application

| Solution | Bundle Size | Update Time (1000 components) | Learning Curve |
|----------|-------------|------------------------------|----------------|
| Context API | 0 KB | 350ms | Low |
| Redux Toolkit | 15 KB | 65ms | High |
| **Zustand** | 1.1 KB | 35ms | Medium |
| Jotai | 2.9 KB | 25ms | Medium-High |

Zustand provides the best balance of simplicity, performance, and bundle size for terminal session management.

---

## Why Not Context API?

Context API causes **cascading re-renders**:
- When context state changes, ALL consumers re-render
- With 30 sessions updating frequently, this creates severe performance issues
- 350ms render time for 1000 components vs 35ms with Zustand
- "Provider Hell" with multiple contexts

---

## Why Zustand?

### Selector Pattern for Fine-Grained Updates

```typescript
import { create } from 'zustand'

const useSessionStore = create((set, get) => ({
  sessions: {},

  addSession: (sessionId, sessionData) =>
    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: sessionData }
    })),

  updateSessionOutput: (sessionId, newOutput) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          output: [...state.sessions[sessionId].output, newOutput]
        }
      }
    })),

  getSession: (sessionId) => get().sessions[sessionId]
}))

// Component only re-renders when THIS session changes
function SessionView({ sessionId }) {
  const session = useSessionStore(state => state.sessions[sessionId])
  return <Terminal session={session} />
}
```

### Built-in Middleware

```typescript
import { create } from 'zustand'
import { persist, devtools } from 'zustand/middleware'

const useSettingsStore = create(
  devtools(
    persist(
      (set) => ({
        theme: 'dark',
        fontSize: 14,
        fontFamily: 'Menlo',
        setTheme: (theme) => set({ theme }),
        setFontSize: (size) => set({ fontSize: size }),
      }),
      { name: 'trex-settings' } // localStorage key
    )
  )
)
```

---

## Recommended State Architecture

### Separate Stores by Concern

```typescript
// UI State - Changes frequently, affects many components
const useUIStore = create((set) => ({
  activeSessionId: null,
  sidebarCollapsed: false,
  setActiveSession: (id) => set({ activeSessionId: id }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
}))

// Settings State - Changes rarely, persisted
const useSettingsStore = create(
  persist(
    (set) => ({
      theme: 'dark',
      fontSize: 14,
      fontFamily: 'Menlo',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'trex-settings' }
  )
)

// Session State - High frequency updates (100+ msg/sec)
const useSessionStore = create((set) => ({
  sessions: {},
  addSession: (id, data) => set((s) => ({
    sessions: { ...s.sessions, [id]: data }
  })),
  appendOutput: (id, line) => set((s) => ({
    sessions: {
      ...s.sessions,
      [id]: {
        ...s.sessions[id],
        lines: [...s.sessions[id].lines, line]
      }
    }
  }))
}))
```

---

## Handling High-Frequency WebSocket Updates

### Problem
Terminal output at 100+ messages/second overwhelms React's reconciliation.

### Solution: Batch Updates

```typescript
function useThrottledSessionOutput(sessionId) {
  const appendOutput = useSessionStore(s => s.appendOutput)
  const batchRef = useRef([])
  const timeoutRef = useRef(null)

  const addToBatch = useCallback((line) => {
    batchRef.current.push(line)

    // Flush batch every 100ms or at 50 lines
    if (batchRef.current.length >= 50) {
      appendOutput(sessionId, batchRef.current)
      batchRef.current = []
    } else if (!timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        if (batchRef.current.length > 0) {
          appendOutput(sessionId, batchRef.current)
          batchRef.current = []
        }
        timeoutRef.current = null
      }, 100)
    }
  }, [sessionId, appendOutput])

  return addToBatch
}
```

---

## Normalized State Shape

```typescript
interface TerminalState {
  sessions: {
    ids: string[]
    entities: {
      [sessionId: string]: TerminalSession
    }
  }
}

interface TerminalSession {
  id: string
  name: string
  status: 'connected' | 'disconnected' | 'connecting'
  lines: {
    ids: string[]
    entities: {
      [lineId: string]: OutputLine
    }
  }
  cursor: { row: number; column: number }
}

interface OutputLine {
  id: string
  text: string
  style?: TextStyle
  timestamp: number
}
```

This enables:
- Efficient updates (only changed session updates)
- Efficient lookups (O(1) by ID)
- Minimal re-renders

---

## Component Isolation Pattern

```typescript
// Parent doesn't re-render when individual sessions update
function SessionList({ sessionIds }) {
  return (
    <div>
      {sessionIds.map(id => (
        <IsolatedSession key={id} sessionId={id} />
      ))}
    </div>
  )
}

// Only re-renders when THIS session changes
function IsolatedSession({ sessionId }) {
  const session = useSessionStore(state => state.sessions[sessionId])
  return <SessionView session={session} />
}
```

---

## Multi-Tab Synchronization

```typescript
import { create } from 'zustand'

const useSettingsStore = create((set) => {
  // Listen for changes from other tabs
  const channel = new BroadcastChannel('trex-settings')
  channel.onmessage = (event) => {
    set(event.data)
  }

  return {
    theme: 'dark',
    setTheme: (theme) => {
      set({ theme })
      channel.postMessage({ theme })
    }
  }
})
```

---

## WebSocket Integration

```typescript
function useCentralWebSocket() {
  const sessions = useSessionStore(s => Object.keys(s.sessions))
  const appendOutput = useSessionStore(s => s.appendOutput)
  const updateStatus = useSessionStore(s => s.updateStatus)

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000/ws')

    ws.onmessage = (event) => {
      const { sessionId, type, data } = JSON.parse(event.data)

      if (!sessions.includes(sessionId)) return

      switch (type) {
        case 'output':
          appendOutput(sessionId, data)
          break
        case 'status':
          updateStatus(sessionId, data)
          break
      }
    }

    return () => ws.close()
  }, [sessions, appendOutput, updateStatus])
}
```

---

## localStorage Persistence with Debounce

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import debounce from 'lodash/debounce'

const useSettingsStore = create(
  persist(
    (set) => ({
      theme: 'dark',
      fontSize: 14,
      // Debounced setter to avoid excessive writes
      setFontSize: debounce((size) => set({ fontSize: size }), 500),
    }),
    {
      name: 'trex-settings',
      // Only persist specific keys
      partialize: (state) => ({
        theme: state.theme,
        fontSize: state.fontSize,
      }),
    }
  )
)
```

---

## Professional Terminal App Examples

### Warp Terminal
- Separates persistent config, ephemeral session state, real-time output
- Bounded buffers for terminal history
- Archives older history to disk

### Hyper Terminal
- Plugin system with decentralized reducers
- Core Redux store for global state
- Sessions maintain own state

### Tabby Terminal
- Efficient split-pane rendering
- GPU-accelerated output
- Localized connection state

---

## Comparison Summary

| Feature | Context | Redux Toolkit | Zustand | Jotai |
|---------|---------|---------------|---------|-------|
| Bundle size | 0 | 15KB | 1.1KB | 2.9KB |
| Boilerplate | Low | High | Low | Low |
| DevTools | No | Excellent | Good | Good |
| Selectors | Manual | Built-in | Built-in | Automatic |
| Persistence | Manual | RTK Query | Middleware | Manual |
| Learning curve | Low | High | Medium | Medium |
| Re-render efficiency | Low | High | High | Very High |

---

## Final Recommendation

For trex with 30+ sessions and high-frequency WebSocket updates:

1. **Use Zustand** as primary state management
2. **Separate stores**: UI, Settings, Sessions
3. **Batch terminal output** at 50-100ms intervals
4. **Normalize session state** for efficient updates
5. **Use selectors** to isolate component re-renders
6. **Persist settings** with debounced localStorage

---

## Sources

- Zustand documentation
- Redux Toolkit documentation
- Jotai documentation
- Performance benchmarks from betterstack.com
- Professional terminal app architectures (Warp, Hyper, Tabby)
