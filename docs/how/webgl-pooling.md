# WebGL Context Pooling

This document explains the WebGL pooling system used in trex to manage GPU-accelerated terminal rendering across multiple sessions.

## Overview

### The Problem

Browsers limit WebGL contexts to 8-16 per tab. Each terminal session with WebGL rendering creates one context. Without pooling, opening more than 8 sessions causes:
- Context exhaustion errors
- Blank or corrupted terminal displays
- Browser memory pressure

### The Solution

A dynamic WebGL pool that:
- **Allocates WebGL to the active terminal only** - inactive terminals use the DOM renderer
- **Uses LRU eviction** when pool reaches device-appropriate capacity
- **Gracefully degrades** to DOM renderer when pool exhausted
- **Auto-detects GPU capability** to set optimal pool size

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **20+ sessions** | Support unlimited sessions without context exhaustion |
| **Always GPU-accelerated** | Active terminal always has crisp WebGL rendering |
| **Device-aware** | Pool size adapts to GPU capability (4-8 contexts) |
| **Zero flicker** | requestAnimationFrame timing prevents visual glitches |

---

## Architecture

### Component Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                        TerminalContainer                         │
│  - Renders all sessions                                          │
│  - Passes isActive prop to each Terminal                         │
└──────────────┬──────────────┬──────────────┬────────────────────┘
               │              │              │
               ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │Terminal A│   │Terminal B│   │Terminal C│
        │(active)  │   │(inactive)│   │(inactive)│
        └────┬─────┘   └──────────┘   └──────────┘
             │
             │ acquire(sessionId, terminal)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WebGL Pool Store                            │
│  - Manages pool of WebGL contexts                                │
│  - Tracks which sessions have WebGL (slots Map)                  │
│  - Handles GPU detection on first acquire                        │
│  - Disposes addons on release                                    │
└─────────────────────────────────────────────────────────────────┘
             │
             │ first acquire triggers
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     GPU Capability Detection                     │
│  - Queries WEBGL_debug_renderer_info                             │
│  - Returns recommended pool size (4-8)                           │
│  - Falls back to 4 if detection fails                            │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Session Activation**: User clicks session in sidebar
2. **isActive Change**: TerminalContainer passes `isActive=true` to Terminal
3. **Pool Acquire**: Terminal's useEffect calls `pool.acquire(sessionId, terminal)`
4. **GPU Detection** (first time): Pool calls `detectGPUCapability()` to set maxSize
5. **Addon Creation**: Pool creates WebglAddon, registers context loss handler
6. **Addon Load**: Terminal calls `terminal.loadAddon(addon)` and refreshes
7. **Session Deactivation**: When switching away, cleanup calls `pool.release(sessionId)`
8. **Addon Disposal**: Pool disposes the addon, freeing the WebGL context

### Key Files

| File | Purpose |
|------|---------|
| `src/stores/webglPool.ts` | Zustand store managing pool state and operations |
| `src/utils/gpuCapability.ts` | GPU detection and pool size heuristics |
| `src/components/Terminal.tsx` | Pool integration via isActive-based effect |
| `src/components/TerminalContainer.tsx` | Renders terminals, passes isActive |

---

## LRU Eviction Strategy

### Algorithm

The pool uses Least Recently Used (LRU) eviction when at capacity:

1. **Track Access Time**: Each slot records `lastAccess` timestamp on acquire
2. **Check Capacity**: On acquire, if `activeCount >= maxSize`, attempt eviction
3. **Find LRU**: Sort inactive slots by `lastAccess`, oldest first
4. **Evict Oldest**: Dispose the oldest inactive slot's addon
5. **Create New**: Create fresh addon for the requesting session

### Current Behavior

> **Note**: The current implementation returns `null` when pool is full rather than evicting active sessions. This is intentional—active terminals cannot have their WebGL "stolen."

### Worked Example

**Setup**: Pool with maxSize=2, sessions A, B, C

```
Time 0: Pool empty
  slots: {}
  activeCount: 0

Time 1: Terminal A activates
  pool.acquire('A', terminalA)
  → Creates addon for A
  slots: { A: { addon, lastAccess: 1, isActive: true } }
  activeCount: 1

Time 2: Terminal B activates (A deactivates)
  pool.release('A')  // A becomes inactive, addon disposed
  pool.acquire('B', terminalB)
  → Creates addon for B
  slots: { B: { addon, lastAccess: 2, isActive: true } }
  activeCount: 1

Time 3: Terminal C activates (B deactivates)
  pool.release('B')  // B becomes inactive, addon disposed
  pool.acquire('C', terminalC)
  → Creates addon for C
  slots: { C: { addon, lastAccess: 3, isActive: true } }
  activeCount: 1
```

### Key Insight

Because only the active terminal holds WebGL (others release on deactivation), the pool rarely reaches capacity. The maxSize limit (4-8) provides headroom for:
- Rapid session switching (brief overlap)
- Context loss recovery
- Future features (e.g., picture-in-picture)

---

## GPU Detection Heuristics

### Detection Method

The pool queries the GPU renderer string via WebGL:

```javascript
const canvas = document.createElement('canvas')
const gl = canvas.getContext('webgl')
const ext = gl.getExtension('WEBGL_debug_renderer_info')
const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
// Example: "Apple M3 Pro" or "NVIDIA GeForce RTX 3080"
```

### Pool Size by GPU Type

| GPU Type | Detection Pattern | Pool Size | Rationale |
|----------|-------------------|-----------|-----------|
| **Apple Silicon** | Contains "APPLE" | 6 | Unified memory, efficient context switching |
| **Intel Integrated** | Contains "INTEL" | 4 | Limited GPU memory, conservative |
| **NVIDIA Discrete** | Contains "NVIDIA" or "GEFORCE" | 8 | Dedicated VRAM, handles many contexts |
| **AMD Discrete** | Contains "AMD" or "RADEON" | 8 | Dedicated VRAM, handles many contexts |
| **Unknown** | No pattern match | 4 | Conservative fallback |
| **Detection Failed** | Exception or blocked | 4 | Safe default |

### Fallback Behavior

Detection can fail if:
- WebGL is unavailable (rare in modern browsers)
- `WEBGL_debug_renderer_info` extension is blocked by privacy settings
- Canvas creation fails

In all cases, the pool falls back to **maxSize=4** with a console warning. This is intentional per Critical Discovery 09: accept false negatives as safe.

---

## Debugging

### Console Logging

The pool logs key operations to the console:

**GPU Detection** (always logged):
```
[WebGL Pool] GPU detected: "Apple M3 Pro" → maxSize 6
```

**Detection Unavailable**:
```
[WebGL Pool] GPU detection unavailable, using default maxSize: 4
```

**Acquire/Release** (development mode only):
```
[WebGL Pool] acquire("session-1") → addon created, activeCount: 1/6
[WebGL Pool] release("session-1") → disposed, activeCount: 0/6
```

**Context Loss**:
```
[WebGL Pool] context loss for session "session-1", addon disposed
```

### Inspecting Pool State

In browser DevTools console:

```javascript
// Get current pool state
const pool = window.__ZUSTAND_STORES__?.webglPool?.getState()

// Or import directly in dev tools (if source maps available)
// Check pool stats
pool.getStats()
// → { maxSize: 6, activeCount: 1 }

// Check if specific session has WebGL
pool.hasWebGL('session-123')
// → true/false

// List all active slots (internal debugging)
pool.slots
// → Map { 'session-123' => { addon, terminal, lastAccess, isActive } }
```

### Common Issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Terminal blank after switching | Context loss during switch | Check for `[WebGL Pool] context loss` in console; pool auto-recovers on next activate |
| All terminals using DOM renderer | Pool exhausted or GPU unavailable | Check `pool.getStats()` - if maxSize=0 or activeCount=maxSize, GPU may be unavailable |
| Flicker during session switch | requestAnimationFrame not firing | Check if browser tab is backgrounded; rAF pauses in background tabs |
| "WebGL context lost" error | GPU memory pressure | Pool handles this automatically; terminal will re-acquire on next activate |

### DevTools Tips

1. **Filter console**: Type `[WebGL Pool]` in console filter to see only pool messages
2. **Breakpoint on acquire**: In Sources, search for `pool.acquire` and set breakpoint
3. **Memory profiling**: Use Memory tab to check for WebGL context leaks (should see dispose on release)
4. **Performance**: In Performance tab, look for `requestAnimationFrame` timing around session switches

---

## API Reference

### Pool Store Actions

```typescript
// Acquire WebGL for a session (returns addon or null if pool exhausted)
acquire(sessionId: string, terminal: Terminal): IWebglAddon | null

// Release WebGL for a session (disposes addon, no-op if not acquired)
release(sessionId: string): void

// Check if session currently has WebGL
hasWebGL(sessionId: string): boolean

// Get pool statistics
getStats(): { maxSize: number, activeCount: number }

// Set pool maximum size (usually called by GPU detection)
setMaxSize(size: number): void

// Reset pool state (for testing only)
reset(): void
```

### GPU Detection

```typescript
// Detect GPU capability and return recommended pool size
detectGPUCapability(): {
  maxSize: number      // Recommended pool size (4-8)
  renderer: string | null  // GPU renderer string or null
  detected: boolean    // Whether detection succeeded
}

// Get conservative default pool size
getDefaultPoolSize(): number  // Always returns 4
```

### Selectors

```typescript
// Fine-grained subscriptions for React components
selectPoolStats(state)           // Subscribe to { maxSize, activeCount }
selectHasWebGL(sessionId)(state) // Subscribe to specific session's WebGL status
selectActiveCount(state)         // Subscribe to activeCount only
selectMaxSize(state)             // Subscribe to maxSize only
```

---

## Testing

### Test Infrastructure

The pool uses fakes (not mocks) per ADR-0004:

```typescript
import { installFakeWebglAddon, FakeWebglAddon } from '../test/fakeWebglAddon'
import { installFakeGPUContext, resetFakeGPUContext } from '../test/fakeGPUContext'

beforeEach(() => {
  const fakeWebGL = installFakeWebglAddon()  // Tracks created addons
  installFakeGPUContext('Apple M3 Pro')      // Fake GPU detection
  useWebGLPoolStore.getState().reset()       // Clear pool state
})

afterEach(() => {
  fakeWebGL.restore()
  resetFakeGPUContext()
})
```

### FakeWebglAddon API

```typescript
// Test helpers
addon.wasDisposed()        // Check if dispose() was called
addon.simulateContextLoss() // Trigger onContextLoss handler
addon.hasContextLossHandler() // Check if handler registered
```

### Test Patterns

```typescript
// Verify acquisition
const addon = pool.acquire('session-1', mockTerminal)
expect(addon).not.toBeNull()
expect(pool.getStats().activeCount).toBe(1)

// Verify release disposes
pool.release('session-1')
expect(fakeWebGL.instances[0].wasDisposed()).toBe(true)

// Verify context loss handling
addon.simulateContextLoss()
expect(pool.hasWebGL('session-1')).toBe(false)
```

---

## Troubleshooting

### "Pool exhausted, returning null"

**Cause**: All pool slots are in use and none can be evicted.

**Solution**: This is expected behavior. Terminal falls back to DOM renderer, which works fine (just slower). If this happens frequently, consider:
1. Checking if sessions are properly releasing on deactivation
2. Verifying GPU detection returned appropriate maxSize

### "GPU detection failed"

**Cause**: WebGL or WEBGL_debug_renderer_info unavailable.

**Solution**: Pool uses conservative default (maxSize=4). No action needed unless you need more contexts. Check:
1. Is WebGL enabled in browser settings?
2. Is a privacy extension blocking GPU fingerprinting?

### "Context loss" messages appearing frequently

**Cause**: GPU memory pressure, driver issues, or system sleep/wake.

**Solution**: Pool automatically handles recovery. If persistent:
1. Close other GPU-intensive applications
2. Check for GPU driver updates
3. Reduce number of active terminal sessions

### Terminal shows blank content after wake from sleep

**Cause**: Context loss during sleep, terminal didn't re-acquire.

**Solution**: Switch to another session and back, or reload the app. The pool will acquire a fresh context.
