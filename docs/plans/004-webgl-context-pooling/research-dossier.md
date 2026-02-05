# WebGL Context Pooling Research Dossier

**Date:** 2026-02-05
**Phase:** Post-Phase 5 Enhancement
**Status:** Research Complete

## Executive Summary

This document captures research findings for implementing WebGL context pooling to support 20+ terminal sessions without hitting browser WebGL context limits (typically 8-16 per tab).

## Problem Statement

### Current Behavior
- Each terminal with WebGL enabled creates its own WebGL context
- Browser limit: 8-16 WebGL contexts per tab (varies by browser/GPU)
- Current mitigation: `maxWebGLSessions = 3` limits WebGL to 3 terminals
- Remaining terminals use DOM renderer (slower, higher CPU usage)

### Issues with Current Approach
1. **Fixed limit**: 3 WebGL contexts regardless of device capability
2. **No reuse**: WebGL contexts created/destroyed on session changes
3. **Context exhaustion**: Opening many sessions can exhaust WebGL contexts
4. **Blank terminals**: Context loss can cause blank terminal displays

### Target State
- Support 20+ terminal sessions
- Active terminal always gets WebGL rendering
- Efficient reuse of WebGL contexts via pooling
- Graceful degradation when contexts are limited

## Current Architecture

### File: `Terminal.tsx` (lines 114-130)
```typescript
if (useWebGLRef.current) {
  try {
    const webglAddon = new WebglAddon()
    webglAddonRef.current = webglAddon
    terminal.loadAddon(webglAddon)
    webglAddon.onContextLoss(() => {
      webglAddon.dispose()
      webglAddonRef.current = null
      console.warn('WebGL context lost, using default DOM renderer')
      terminal.refresh(0, terminal.rows - 1)
    })
  } catch (e) {
    console.warn('WebGL addon not available, using default DOM renderer')
  }
}
```

### File: `TerminalContainer.tsx` (lines 43-59)
```typescript
const webGLSessionIds = useMemo(() => {
  const webGLSet = new Set<string>()

  // Always include active session for WebGL
  if (activeSessionId) {
    webGLSet.add(activeSessionId)
  }

  // Add more sessions up to max (most recently created first)
  const sortedIds = [...sessionIds].reverse()
  for (const id of sortedIds) {
    if (webGLSet.size >= maxWebGLSessions) break
    webGLSet.add(id)
  }

  return webGLSet
}, [sessionIds, activeSessionId, maxWebGLSessions])
```

### Current Resource Flow
```
Terminal Mount → Create XTerm → Load WebGL Addon → Own WebGL Context
Terminal Unmount → Dispose WebGL Addon → Release Context
Session Switch → No Context Reuse
```

## Proposed Solution: WebGL Context Pooling

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────┐
│                    WebGL Context Pool                        │
├─────────────────────────────────────────────────────────────┤
│  Pool Manager (Singleton)                                    │
│  ├─ contexts: Map<id, { context, terminal, addon }>         │
│  ├─ maxPoolSize: number (dynamic based on device)           │
│  ├─ lruQueue: string[] (session IDs by last access)         │
│  └─ Methods:                                                 │
│      ├─ acquire(sessionId, terminal) → WebglAddon | null    │
│      ├─ release(sessionId)                                  │
│      ├─ evict() → evicts LRU context                        │
│      └─ getStats() → { active, available, total }           │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. WebGL Pool Store (`useWebGLPool.ts`)
```typescript
interface PooledContext {
  addon: WebglAddon
  terminalId: string | null  // null = available
  lastAccess: number
}

interface WebGLPoolState {
  pool: Map<string, PooledContext>
  maxSize: number
  acquire: (terminalId: string) => WebglAddon | null
  release: (terminalId: string) => void
  getStats: () => { active: number; available: number; total: number }
}
```

#### 2. Device Capability Detection
```typescript
function detectMaxContexts(): number {
  // Try to detect device capability
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

  if (!gl) return 0

  // Check renderer for GPU info
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : 'unknown'

  // Heuristics based on GPU
  if (renderer.includes('Apple')) return 8  // Metal limitation
  if (renderer.includes('Intel')) return 8
  if (renderer.includes('NVIDIA') || renderer.includes('AMD')) return 16

  return 8 // Safe default
}
```

#### 3. LRU Eviction Strategy
```typescript
function evictLRU(pool: Map<string, PooledContext>): string | null {
  let oldestTime = Infinity
  let oldestId: string | null = null

  for (const [id, ctx] of pool.entries()) {
    if (ctx.terminalId === null && ctx.lastAccess < oldestTime) {
      oldestTime = ctx.lastAccess
      oldestId = id
    }
  }

  if (oldestId) {
    const ctx = pool.get(oldestId)!
    ctx.addon.dispose()
    pool.delete(oldestId)
  }

  return oldestId
}
```

### Implementation Strategy

#### Phase 1: Pool Foundation
1. Create `useWebGLPool` store with Zustand
2. Implement context creation with pooling
3. Add acquire/release methods
4. Track context assignments

#### Phase 2: Integration
1. Modify `Terminal.tsx` to use pool
2. Update `TerminalContainer.tsx` to coordinate pool
3. Handle context transfers on session switch
4. Implement context loss recovery from pool

#### Phase 3: Optimization
1. Add device capability detection
2. Implement dynamic pool sizing
3. Add performance metrics
4. Tune eviction thresholds

## Technical Considerations

### xterm.js WebglAddon Constraints
- **1:1 Binding**: WebglAddon is designed for single terminal use
- **No Context Sharing**: Cannot share WebGL context between addons
- **Reattachment**: May need to dispose and recreate addon to "transfer"

### Pooling Approach Options

#### Option A: Addon Pool (Recommended)
- Pool WebglAddon instances
- Detach from inactive terminal, attach to active
- Pro: Works with xterm.js design
- Con: Requires terminal refresh on transfer

#### Option B: Context Wrapper Pool
- Pool raw WebGL contexts
- Create wrapper that manages addon lifecycle
- Pro: More control over context lifecycle
- Con: More complex, may conflict with addon internals

#### Option C: Terminal Instance Pool
- Pool entire XTerm + addon combinations
- Reassign terminal instances to sessions
- Pro: Cleanest abstraction
- Con: Requires significant refactor

### Recommended Approach: Option A (Addon Pool)

```typescript
// On session switch
const newActive = sessionId
const oldActive = previousActiveSessionId

// Release from old terminal
pool.release(oldActive)  // Marks addon as available, doesn't dispose

// Acquire for new terminal
const addon = pool.acquire(newActive)  // Gets existing or creates new
if (addon) {
  terminal.loadAddon(addon)
}
```

## Performance Considerations

### Current Performance
- 3 WebGL terminals: ~3 contexts, fast rendering
- 4+ terminals: Some use DOM renderer (slower)
- Context creation: ~50-100ms overhead

### Expected Improvements
- Eliminate context creation on session switch
- Reduce total context count
- Faster session switching (no addon recreation)
- Better memory efficiency

### Metrics to Track
```typescript
interface PoolMetrics {
  contextCreations: number
  contextReuses: number
  contextEvictions: number
  averageAcquireTime: number
  peakPoolSize: number
}
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Addon doesn't support reattachment | Medium | High | Test thoroughly, may need terminal refresh |
| Context loss during transfer | Low | Medium | Handle in pool manager, fallback to DOM |
| Memory leaks from pool | Low | High | Strict lifecycle management, cleanup on unmount |
| Performance regression | Low | Medium | Benchmark before/after, feature flag |

## Testing Strategy

### Unit Tests
- Pool acquire/release mechanics
- LRU eviction ordering
- Context count limits

### Integration Tests
- Session switching with pool
- Context loss recovery
- Multiple rapid session switches
- Pool cleanup on app unmount

### Manual Testing
- Open 10+ sessions, verify rendering
- Rapid session switching
- Browser dev tools: WebGL context count
- Memory profiling

## Dependencies

### Current
- `@xterm/xterm@^6.0.0`
- `@xterm/addon-webgl@^0.19.0`
- `zustand@^5.0.11`

### New (None Required)
- No new dependencies needed

## Future Enhancements

### WebGPU Migration Path
- WebGPU uses single adapter for unlimited surfaces
- No context pooling needed with WebGPU
- Monitor `@nicholasrice/xterm-addon-webgpu` development
- Plan migration when addon is stable

### Potential Optimizations
- Shared texture atlas for common glyphs
- Context hibernation for background tabs
- Predictive context allocation based on usage patterns

## Files to Modify

1. **New**: `src/hooks/useWebGLPool.ts` - Pool store and logic
2. **Modify**: `src/components/Terminal.tsx` - Use pool instead of direct addon
3. **Modify**: `src/components/TerminalContainer.tsx` - Coordinate pool with visibility
4. **New**: `src/utils/detectGPUCapability.ts` - Device detection utility

## Estimated Effort

| Phase | Scope | Complexity |
|-------|-------|------------|
| Phase 1: Foundation | Pool store, basic acquire/release | Medium |
| Phase 2: Integration | Terminal/Container updates | Medium |
| Phase 3: Optimization | Device detection, metrics | Low |
| Testing | Unit + integration tests | Medium |

## References

- [xterm.js WebGL Addon Source](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl)
- [WebGL Context Limits Discussion](https://stackoverflow.com/questions/30767191/webgl-too-many-active-webgl-contexts)
- [Chrome WebGL Best Practices](https://developer.chrome.com/blog/webgl-best-practices/)
