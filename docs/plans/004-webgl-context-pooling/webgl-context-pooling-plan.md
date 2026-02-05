# WebGL Context Pooling Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-05
**Spec**: [./webgl-context-pooling-spec.md](./webgl-context-pooling-spec.md)
**Status**: READY
**GitHub Issue**: [#22](https://github.com/vaughanknight/trex/issues/22)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Pool Foundation](#phase-1-pool-foundation-tdd)
   - [Phase 2: GPU Detection](#phase-2-gpu-detection-lightweight)
   - [Phase 3: Terminal Integration](#phase-3-terminal-integration-tdd)
   - [Phase 4: Container Simplification](#phase-4-container-simplification-lightweight)
   - [Phase 5: Documentation & Observability](#phase-5-documentation--observability)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: trex terminal sessions are limited to 3 WebGL-accelerated terminals due to static allocation. Browsers limit WebGL contexts to 8-16 per tab. Current implementation creates contexts at mount time and never releases them, preventing dynamic allocation to the active terminal. Users with 4+ sessions experience degraded rendering performance on some terminals.

**Solution**: Implement a WebGL addon pool that:
- Allocates WebGL to the **active terminal** dynamically
- Uses LRU eviction when pool reaches device-appropriate capacity (4-8 contexts)
- Gracefully degrades to DOM renderer when pool exhausted
- Provides observable pool state for debugging

**Expected Outcomes**:
- Support 20+ terminal sessions without context exhaustion
- Active terminal always has GPU-accelerated rendering (<50ms latency)
- Seamless session switching with no visual flicker
- Device-appropriate pool sizing via GPU detection

**Success Metrics**:
- AC-01 through AC-11 acceptance criteria passing
- No WebGL context errors in console with 20 sessions
- Pool stats show correct acquire/release/eviction counts
- Manual testing confirms smooth session switching

---

## Technical Context

### Current System State

**WebGL Allocation** (TerminalContainer.tsx:43-59):
```typescript
// Current: Static allocation, frozen at mount
const webGLSessionIds = useMemo(() => {
  const webGLSet = new Set<string>()
  if (activeSessionId) webGLSet.add(activeSessionId)
  // Limited to maxWebGLSessions (default: 3)
  for (const id of sortedIds) {
    if (webGLSet.size >= maxWebGLSessions) break
    webGLSet.add(id)
  }
  return webGLSet
}, [sessionIds, activeSessionId, maxWebGLSessions])
```

**WebGL Creation** (Terminal.tsx:114-130):
```typescript
// Current: Created at mount, prop frozen in ref
const useWebGLRef = useRef(useWebGL)  // Line 41 - FROZEN
if (useWebGLRef.current) {
  const webglAddon = new WebglAddon()
  terminal.loadAddon(webglAddon)
  webglAddon.onContextLoss(() => { /* fallback to DOM */ })
}
```

### Integration Requirements

- **Pool Store**: New Zustand store following sessions.ts pattern
- **Terminal.tsx**: Replace mount-time WebGL with isActive-based acquisition
- **TerminalContainer.tsx**: Remove static WebGL tracking
- **GPU Detection**: New utility for device-appropriate pool sizing

### Constraints & Limitations

| Constraint | Description | Mitigation |
|------------|-------------|------------|
| xterm.js 1:1 binding | WebglAddon cannot be transferred between terminals | Dispose/recreate pattern |
| Browser context limit | 8-16 WebGL contexts per tab | Pool with LRU eviction |
| Frozen useWebGL prop | Current architecture prevents dynamic reallocation | New isActive-based effect |
| Context loss async | GPU reset loses contexts without warning | Pool-level onContextLoss handling |

### Assumptions

1. WebglAddon.dispose() fully releases WebGL resources
2. requestAnimationFrame timing prevents visual flicker
3. WEBGL_debug_renderer_info available in target browsers
4. 4-8 pooled contexts sufficient for typical usage

---

## Critical Research Findings

### 🚨 Critical Discovery 01: useWebGL Prop Freeze Prevents Dynamic Allocation
**Impact**: Critical
**Sources**: [I1-03, R1-01]
**Problem**: Terminal.tsx captures `useWebGL` in a ref on mount. Changing the prop after mount has no effect.
**Root Cause**: Line 41 `useWebGLRef.current = useWebGL` runs once at initialization.
**Solution**: Move WebGL addon management to isActive-dependent effect, not initialization effect.
**Example**:
```typescript
// ❌ WRONG - Current frozen prop
const useWebGLRef = useRef(useWebGL) // Captured once at mount

// ✅ CORRECT - Pool-based dynamic acquisition
useEffect(() => {
  if (isActive) {
    const addon = pool.acquire(sessionId, xtermRef.current)
    if (addon) xtermRef.current.loadAddon(addon)
  } else {
    pool.release(sessionId)
  }
}, [isActive, sessionId])
```
**Action Required**: Split Terminal.tsx effects: initialization (mount-time) vs WebGL (isActive-based)
**Affects Phases**: Phase 3

---

### 🚨 Critical Discovery 02: WebglAddon Cannot Be Reattached
**Impact**: Critical
**Sources**: [I1-02, R1-02]
**Problem**: Pool cannot "transfer" an addon from one terminal to another.
**Root Cause**: xterm.js WebglAddon is 1:1 bound to terminal instances.
**Solution**: Dispose addon on release, create fresh addon on acquire. Pool manages context COUNT, not addon reuse.
**Example**:
```typescript
// ❌ WRONG - Trying to reuse addon
pool.release(oldSession)  // Don't dispose
pool.acquire(newSession)  // Return same addon? NO!

// ✅ CORRECT - Dispose and recreate
release(sessionId) {
  const slot = this.slots.get(sessionId)
  if (slot?.addon) {
    slot.addon.dispose()  // Always dispose
    this.activeCount--
  }
}
acquire(sessionId, terminal) {
  if (this.activeCount < this.maxSize) {
    return new WebglAddon()  // Always create fresh
  }
  return null  // Pool exhausted
}
```
**Action Required**: Pool must track context count and creation timing, not addon reuse
**Affects Phases**: Phase 1

---

### 🚨 Critical Discovery 03: Memory Leak Risk from Improper Disposal
**Impact**: Critical
**Sources**: [I1-02, R1-02]
**Problem**: If dispose() not called, WebGL resources accumulate causing browser memory pressure.
**Root Cause**: Pool ownership change creates ambiguity - Terminal vs Pool owns disposal.
**Solution**: Strict ownership: Pool OWNS all addons. Terminal never calls dispose() directly.
**Example**:
```typescript
// ❌ WRONG - Terminal disposes its own addon
// Terminal.tsx cleanup
return () => {
  webglAddonRef.current?.dispose()  // NO! Pool owns this
}

// ✅ CORRECT - Pool manages all disposal
// Terminal.tsx cleanup
return () => {
  pool.release(sessionId)  // Pool will dispose
}

// Pool.release()
release(sessionId) {
  const addon = this.addons.get(sessionId)
  addon?.dispose()  // Pool always disposes
  this.addons.delete(sessionId)
}
```
**Action Required**: Create FakeWebglAddon for testing dispose() call counts
**Affects Phases**: Phase 1, Phase 3

---

### High Discovery 04: Pool State Desync with Actual Contexts
**Impact**: High
**Sources**: [R1-05]
**Problem**: Pool may show addon as "active" when WebGL context was lost by browser.
**Root Cause**: Context loss fires asynchronously via browser, not through pool.
**Solution**: Pool subscribes to onContextLoss for ALL created addons. Mark slot as DEAD on loss.
**Example**:
```typescript
// ❌ WRONG - Context loss only handled by current terminal
webglAddon.onContextLoss(() => {
  webglAddon.dispose()  // Terminal handles, pool doesn't know
})

// ✅ CORRECT - Pool registers handler at creation
acquire(sessionId, terminal) {
  const addon = new WebglAddon()
  addon.onContextLoss(() => {
    this.markDead(sessionId)  // Pool updates state
    terminal.refresh(0, terminal.rows - 1)
  })
  return addon
}
```
**Action Required**: Pool registers onContextLoss at addon creation time
**Affects Phases**: Phase 1, Phase 3

---

### High Discovery 05: Rapid Session Switching Race Condition
**Impact**: High
**Sources**: [R1-06]
**Problem**: Switching A->B->C faster than frames causes overlapping acquire/release.
**Root Cause**: isActive prop may change twice in <16ms, queueing conflicting operations.
**Solution**: Make pool operations idempotent. Use transaction pattern or debounce.
**Example**:
```typescript
// ❌ WRONG - Non-idempotent operations
acquire(sessionId) {
  // If called twice, creates two addons!
  return new WebglAddon()
}

// ✅ CORRECT - Idempotent acquire
acquire(sessionId, terminal) {
  if (this.addons.has(sessionId)) {
    return this.addons.get(sessionId)  // Already acquired, return existing
  }
  // ... create new
}
```
**Action Required**: Add idempotency guards to acquire/release. Test rapid switching.
**Affects Phases**: Phase 1, Phase 3

---

### High Discovery 06: Terminal Flicker Prevention Pattern
**Impact**: High
**Sources**: [I1-09, R1-01]
**Problem**: Session switch may show blank frame during addon transfer.
**Root Cause**: Timing gap between old dispose and new attach.
**Solution**: Use requestAnimationFrame pattern from existing code (line 218). Acquire before release.
**Example**:
```typescript
// ✅ CORRECT - Synchronized with paint cycle
useEffect(() => {
  if (isActive && xtermRef.current) {
    requestAnimationFrame(() => {
      const addon = pool.acquire(sessionId, xtermRef.current)
      if (addon) {
        xtermRef.current.loadAddon(addon)
        xtermRef.current.refresh(0, xtermRef.current.rows - 1)
      }
    })
  }
}, [isActive])
```
**Action Required**: Wrap WebGL acquisition in requestAnimationFrame
**Affects Phases**: Phase 3

---

### High Discovery 07: FakeWebglAddon Required per ADR-0004
**Impact**: High
**Sources**: [I1-05]
**Problem**: Pool tests need to verify addon disposal and context loss handling.
**Root Cause**: ADR-0004 mandates fakes only, no mocking frameworks.
**Solution**: Create FakeWebglAddon following FakeWebSocket pattern.
**Example**:
```typescript
// src/test/fakeWebglAddon.ts
export class FakeWebglAddon {
  private disposed = false
  private onContextLossHandler: (() => void) | null = null

  dispose() { this.disposed = true }
  wasDisposed() { return this.disposed }
  onContextLoss(handler: () => void) { this.onContextLossHandler = handler }
  simulateContextLoss() { this.onContextLossHandler?.() }
}
```
**Action Required**: Create FakeWebglAddon and FakeGPUContext before pool tests
**Affects Phases**: Phase 1, Phase 2

---

### Medium Discovery 08: Store Pattern Must Match sessions.ts
**Impact**: Medium
**Sources**: [I1-01, I1-10]
**Problem**: Inconsistent store patterns cause testing friction and re-render issues.
**Root Cause**: Different state management approaches in same codebase.
**Solution**: Mirror sessions.ts exactly: Map-based state, typed interfaces, selector exports.
**Action Required**: Follow sessions.ts structure for webglPool.ts
**Affects Phases**: Phase 1

---

### Medium Discovery 09: GPU Detection Conservative Defaults
**Impact**: Medium
**Sources**: [I1-07, R1-04]
**Problem**: GPU detection may fail or return generic strings.
**Root Cause**: Privacy extensions block WEBGL_debug_renderer_info.
**Solution**: Conservative default (4 contexts), accept false negatives as safe.
**Action Required**: Wrap detection in try-catch, log detected capability
**Affects Phases**: Phase 2

---

### Medium Discovery 10: Rollback Strategy Required
**Impact**: Medium
**Sources**: [R1-09]
**Problem**: If pooling has bugs, users cannot use the app.
**Root Cause**: Fundamental change to WebGL lifecycle.
**Solution**: Keep existing code as fallback, feature flag for gradual rollout.
**Action Required**: Structure pool integration as additive, not replacement
**Affects Phases**: All phases

---

## Testing Philosophy

### Testing Approach
**Selected Approach**: Hybrid (TDD + Lightweight)
**Rationale**: Pool mechanics are algorithmic (TDD benefits), GPU detection is heuristic (lightweight sufficient)

### Focus Areas
| Area | Approach | Rationale |
|------|----------|-----------|
| Pool store (acquire/release/LRU) | TDD | Critical algorithmic logic |
| Session switching integration | TDD | User-visible behavior |
| GPU detection | Lightweight | Heuristics with conservative fallbacks |
| Context loss recovery | Lightweight | Browser behavior, hard to unit test |

### Excluded from Testing
- xterm.js WebglAddon internals (library responsibility)
- Visual rendering verification (manual testing)
- Cross-browser GPU detection variations (too many permutations)

### Test-Driven Development (Phases 1, 3)
- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Mock Usage
**Policy**: FAKES ONLY (per constitution ADR-0004)
- Create `FakeWebglAddon` for pool tests
- Create `FakeGPUContext` for detection tests
- No mocking frameworks (jest.mock, sinon) permitted

### Test Documentation
Every promoted test must include Test Doc block:
```typescript
/**
 * Test Doc:
 * - Why: <business/bug/regression reason>
 * - Contract: <what invariant this asserts>
 * - Usage Notes: <how to call, gotchas>
 * - Quality Contribution: <what failures it catches>
 * - Worked Example: <inputs/outputs summary>
 */
```

---

## Implementation Phases

### Phase 1: Pool Foundation (TDD)

**Objective**: Create the WebGL pool Zustand store with acquire/release/LRU mechanics following TDD.

**Deliverables**:
- `src/test/fakeWebglAddon.ts` - Fake for testing
- `src/stores/webglPool.ts` - Pool store with Zustand
- `src/stores/__tests__/webglPool.test.ts` - Unit tests

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LRU eviction edge cases | Low | Medium | Explicit eviction queue with tests |
| Store pattern mismatch | Low | Low | Follow sessions.ts exactly |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Create FakeWebglAddon in src/test/ | 2 | dispose(), wasDisposed(), simulateContextLoss() methods work | - | Follow FakeWebSocket pattern |
| 1.2 | [ ] | Write tests for pool acquire/release | 2 | Tests cover: acquire returns addon, release disposes, idempotent ops | - | TDD: tests first |
| 1.3 | [ ] | Write tests for LRU eviction | 2 | Tests cover: evicts oldest, ordering, tie-breaker | - | Use monotonic counter |
| 1.4 | [ ] | Write tests for pool exhaustion | 2 | Tests cover: returns null when full, getStats accurate | - | |
| 1.5 | [ ] | Implement webglPool.ts store | 3 | All tests from 1.2-1.4 pass | - | Map-based state, selector pattern |
| 1.6 | [ ] | Add context loss handling to pool | 2 | Pool marks slot dead on context loss | - | Register handler at creation |
| 1.7 | [ ] | Add reset() action for testing | 1 | Store can be reset between tests | - | Required for test isolation |

### Test Examples (Write First!)

```typescript
// src/stores/__tests__/webglPool.test.ts
import { describe, test, expect, beforeEach } from 'vitest'
import { useWebGLPoolStore } from '../webglPool'
import { FakeWebglAddon, installFakeWebglAddon } from '../../test/fakeWebglAddon'

describe('WebGL Pool Store', () => {
  beforeEach(() => {
    useWebGLPoolStore.getState().reset()
    installFakeWebglAddon()
  })

  test('acquire returns addon when pool has capacity', () => {
    /**
     * Test Doc:
     * - Why: Core pool functionality - must allocate WebGL
     * - Contract: acquire() returns non-null addon when under maxSize
     * - Usage Notes: Call with sessionId and terminal ref
     * - Quality Contribution: Prevents null addon bugs
     * - Worked Example: acquire('session-1') → FakeWebglAddon instance
     */
    const store = useWebGLPoolStore.getState()
    const mockTerminal = {} as any

    const addon = store.acquire('session-1', mockTerminal)

    expect(addon).not.toBeNull()
    expect(store.getStats().activeCount).toBe(1)
  })

  test('release disposes addon and decrements count', () => {
    /**
     * Test Doc:
     * - Why: Prevents memory leaks from undisposed addons
     * - Contract: release() calls addon.dispose() and updates stats
     * - Usage Notes: Must call release when terminal deactivates
     * - Quality Contribution: Catches missing dispose() calls
     * - Worked Example: release('session-1') → addon.wasDisposed() === true
     */
    const store = useWebGLPoolStore.getState()
    const mockTerminal = {} as any
    store.acquire('session-1', mockTerminal)

    store.release('session-1')

    expect(store.getStats().activeCount).toBe(0)
    // FakeWebglAddon tracks dispose calls
  })

  test('acquire is idempotent for same session', () => {
    /**
     * Test Doc:
     * - Why: Prevents double-acquisition during rapid switching
     * - Contract: Multiple acquire() calls return same addon
     * - Usage Notes: Safe to call acquire when already acquired
     * - Quality Contribution: Prevents context count inflation
     * - Worked Example: acquire('s1') twice → same addon, count still 1
     */
    const store = useWebGLPoolStore.getState()
    const mockTerminal = {} as any

    const addon1 = store.acquire('session-1', mockTerminal)
    const addon2 = store.acquire('session-1', mockTerminal)

    expect(addon1).toBe(addon2)
    expect(store.getStats().activeCount).toBe(1)
  })

  test('evicts LRU when pool at capacity', () => {
    /**
     * Test Doc:
     * - Why: Pool must not exceed browser context limit
     * - Contract: When full, evict least recently used before new acquire
     * - Usage Notes: LRU determined by last access, not creation time
     * - Quality Contribution: Prevents context exhaustion crashes
     * - Worked Example: Pool(2): acquire a, b, c → a evicted, c acquired
     */
    const store = useWebGLPoolStore.getState()
    store.setMaxSize(2)
    const mockTerminal = {} as any

    store.acquire('a', mockTerminal)
    store.acquire('b', mockTerminal)
    store.acquire('c', mockTerminal)  // Should evict 'a'

    const stats = store.getStats()
    expect(stats.activeCount).toBe(2)
    expect(store.hasWebGL('a')).toBe(false)
    expect(store.hasWebGL('c')).toBe(true)
  })
})
```

### Non-Happy-Path Coverage
- [ ] Null terminal reference passed to acquire
- [ ] Release called for non-existent session
- [ ] Context loss during acquire operation
- [ ] Double release for same session

### Acceptance Criteria
- [ ] All tests passing (10+ tests)
- [ ] FakeWebglAddon tracks dispose() calls correctly
- [ ] Pool stats accurate after all operations
- [ ] No mocking frameworks used (fakes only per ADR-0004)

---

### Phase 2: GPU Detection (Lightweight)

**Objective**: Create device capability detection utility with conservative fallbacks.

**Deliverables**:
- `src/test/fakeGPUContext.ts` - Fake for testing
- `src/utils/gpuCapability.ts` - Detection utility
- `src/utils/__tests__/gpuCapability.test.ts` - Unit tests

**Dependencies**: None (can run in parallel with Phase 1)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Detection blocked by privacy | Medium | Low | Conservative default (4) |
| Electron behaves differently | Low | Low | Test in both contexts |

### Tasks (Lightweight Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Create FakeGPUContext utility | 1 | Can simulate different renderer strings | - | |
| 2.2 | [ ] | Implement detectGPUCapability() | 2 | Returns 4-8 based on GPU heuristics | - | Pure function |
| 2.3 | [ ] | Add fallback for detection failure | 1 | Returns 4 on any exception | - | Try-catch wrapper |
| 2.4 | [ ] | Write validation tests | 2 | Tests cover: Apple=6, Intel=4, NVIDIA=8, unknown=4 | - | Lightweight validation |
| 2.5 | [ ] | Integrate with pool initialization | 1 | Pool calls detection on first acquire | - | Lazy initialization |

### Test Examples

```typescript
// src/utils/__tests__/gpuCapability.test.ts
import { describe, test, expect } from 'vitest'
import { detectGPUCapability, setFakeGPUContext } from '../gpuCapability'

describe('GPU Capability Detection', () => {
  test('returns 6 for Apple Silicon GPU', () => {
    setFakeGPUContext('Apple M2 Pro')
    expect(detectGPUCapability()).toBe(6)
  })

  test('returns 4 for Intel integrated GPU', () => {
    setFakeGPUContext('Intel(R) UHD Graphics 630')
    expect(detectGPUCapability()).toBe(4)
  })

  test('returns 8 for NVIDIA discrete GPU', () => {
    setFakeGPUContext('NVIDIA GeForce RTX 3080')
    expect(detectGPUCapability()).toBe(8)
  })

  test('returns 4 when detection fails', () => {
    setFakeGPUContext(null)  // Simulates blocked extension
    expect(detectGPUCapability()).toBe(4)
  })
})
```

### Acceptance Criteria
- [ ] Detection returns appropriate values for GPU types
- [ ] Fallback to 4 on any exception
- [ ] Pool uses detection on initialization
- [ ] Console logs detected capability for debugging

---

### Phase 3: Terminal Integration (TDD)

**Objective**: Modify Terminal.tsx to use pool based on isActive prop instead of mount-time allocation.

**Deliverables**:
- Modified `src/components/Terminal.tsx`
- `src/components/__tests__/integration/webgl-pool.test.tsx` - Integration tests

**Dependencies**: Phase 1 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Terminal flicker on switch | Medium | Medium | requestAnimationFrame pattern |
| Memory leak from missed release | Low | High | useEffect cleanup calls release |
| Race condition on rapid switch | Medium | Medium | Idempotent operations |

### Tasks (TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write integration tests for acquire on activate | 2 | Terminal acquires WebGL when isActive=true | - | Test first |
| 3.2 | [ ] | Write integration tests for release on deactivate | 2 | Terminal releases WebGL when isActive=false | - | Test first |
| 3.3 | [ ] | Write test for session switch sequence | 2 | Old releases, new acquires, no flicker | - | Verify ordering |
| 3.4 | [ ] | Modify Terminal.tsx initialization effect | 3 | Remove WebGL from init, XTerm + FitAddon only | - | Split effects |
| 3.5 | [ ] | Add isActive-based WebGL management effect | 3 | Acquire/release based on isActive | - | Use requestAnimationFrame |
| 3.6 | [ ] | Add useEffect cleanup for pool release | 2 | Cleanup calls pool.release() | - | Prevents leaks |
| 3.7 | [ ] | Test rapid session switching | 2 | 10 switches in 1 second, final session has WebGL | - | Edge case validation |
| 3.8 | [ ] | Verify context loss recovery | 2 | Context loss handled, terminal continues working | - | Graceful degradation |

### Test Examples (Write First!)

```typescript
// src/components/__tests__/integration/webgl-pool.test.tsx
import { describe, test, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useWebGLPoolStore } from '../../stores/webglPool'
import { useSessionStore } from '../../stores/sessions'
import { useUIStore } from '../../stores/ui'

describe('WebGL Pool Integration', () => {
  beforeEach(() => {
    useWebGLPoolStore.getState().reset()
    useSessionStore.getState().clearSessions()
    useUIStore.getState().setActiveSession(null)
  })

  test('active terminal acquires WebGL from pool', async () => {
    /**
     * Test Doc:
     * - Why: Core feature - active terminal must get GPU rendering
     * - Contract: When session becomes active, it acquires WebGL
     * - Usage Notes: Requires pool initialized with capacity > 0
     * - Quality Contribution: Verifies pool-terminal integration
     * - Worked Example: Set session active → pool.hasWebGL(sessionId) === true
     */
    // Arrange
    const sessionId = 'test-session-1'
    useSessionStore.getState().addSession({
      id: sessionId,
      name: 'test',
      shellType: 'bash',
      status: 'active',
      createdAt: Date.now()
    })

    // Act
    useUIStore.getState().setActiveSession(sessionId)
    await act(() => new Promise(r => setTimeout(r, 50)))

    // Assert
    expect(useWebGLPoolStore.getState().hasWebGL(sessionId)).toBe(true)
  })

  test('session switch releases old and acquires new', async () => {
    /**
     * Test Doc:
     * - Why: Session switching must transfer WebGL correctly
     * - Contract: Old session releases, new session acquires
     * - Usage Notes: Sequence matters for flicker prevention
     * - Quality Contribution: Verifies no WebGL leak on switch
     * - Worked Example: Switch A→B → A released, B acquired
     */
    // Arrange
    const sessionA = 'session-a'
    const sessionB = 'session-b'
    // ... setup sessions

    // Act - Switch to A
    useUIStore.getState().setActiveSession(sessionA)
    await act(() => new Promise(r => setTimeout(r, 50)))

    // Act - Switch to B
    useUIStore.getState().setActiveSession(sessionB)
    await act(() => new Promise(r => setTimeout(r, 50)))

    // Assert
    const pool = useWebGLPoolStore.getState()
    expect(pool.hasWebGL(sessionA)).toBe(false)
    expect(pool.hasWebGL(sessionB)).toBe(true)
  })
})
```

### Non-Happy-Path Coverage
- [ ] Terminal unmounts before acquire completes
- [ ] Context loss during session switch
- [ ] 20+ sessions rapid switching stress test
- [ ] isActive changes twice in <16ms

### Acceptance Criteria
- [ ] All integration tests passing
- [ ] No visual flicker on session switch (manual verify)
- [ ] useEffect cleanup properly releases pool
- [ ] requestAnimationFrame used for all addon operations
- [ ] ADR-0004 constraints respected (fakes only)

---

### Phase 4: Container Simplification (Lightweight)

**Objective**: Remove static WebGL tracking from TerminalContainer now that pool handles allocation.

**Deliverables**:
- Modified `src/components/TerminalContainer.tsx`
- Updated component tests

**Dependencies**: Phase 3 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing behavior | Low | High | Keep fallback code path |
| Test updates needed | Medium | Low | Update mocks/expectations |

### Tasks (Lightweight Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Remove webGLSessionIds useMemo | 2 | No more static WebGL allocation | - | Lines 43-59 |
| 4.2 | [ ] | Remove maxWebGLSessions prop | 1 | Prop no longer needed | - | |
| 4.3 | [ ] | Remove useWebGL prop from Terminal | 1 | Terminal self-manages WebGL | - | |
| 4.4 | [ ] | Update TerminalContainer tests | 2 | Tests pass without WebGL props | - | |
| 4.5 | [ ] | Verify all terminals work correctly | 1 | Manual testing with 10+ sessions | - | |

### Acceptance Criteria
- [ ] TerminalContainer simplified (reduced LOC)
- [ ] No useWebGL prop passed to Terminal
- [ ] All existing tests pass or updated
- [ ] Manual verification with multiple sessions

---

### Phase 5: Documentation & Observability

**Objective**: Create architecture documentation and ensure pool state is observable for debugging.

**Deliverables**:
- `docs/how/webgl-pooling.md` - Architecture documentation
- Pool stats logging in development mode

**Dependencies**: Phases 1-4 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Docs drift from implementation | Medium | Low | Review during phase completion |

### Tasks (Lightweight Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Create docs/how/webgl-pooling.md | 2 | Pool architecture documented | - | |
| 5.2 | [ ] | Document LRU eviction strategy | 1 | Algorithm explained with diagrams | - | |
| 5.3 | [ ] | Document GPU detection heuristics | 1 | All heuristics listed with rationale | - | |
| 5.4 | [ ] | Add __DEV__ logging to pool | 1 | Console logs acquire/release in dev | - | |
| 5.5 | [ ] | Document debugging pool state | 1 | How to inspect pool via DevTools | - | |

### Documentation Outline

**docs/how/webgl-pooling.md**:
1. Overview - Why pooling exists
2. Architecture Diagram - Pool, Terminal, Store relationships
3. LRU Eviction - Algorithm, edge cases
4. GPU Detection - Heuristics table
5. Debugging - How to inspect pool state
6. Troubleshooting - Common issues

### Acceptance Criteria
- [ ] Documentation created and linked from plan
- [ ] Pool logs acquire/release in development
- [ ] getStats() returns accurate information
- [ ] DevTools inspection documented

---

## Cross-Cutting Concerns

### Security Considerations
- No security implications (frontend-only change)
- No new data exposure or authentication changes
- WebGL contexts are browser-managed

### Observability
**Logging Strategy**:
- `__DEV__` conditional logging for acquire/release/evict
- Console.info for GPU detection result
- Console.warn for context loss events

**Metrics to Capture**:
- Pool utilization (activeCount / maxSize)
- Context loss frequency
- Eviction frequency

**Error Tracking**:
- Context creation failures → graceful DOM fallback
- No user-visible errors for pool issues

### Documentation
**Location**: docs/how/ only (per spec)
**Content Structure**: Single file `docs/how/webgl-pooling.md`
**Target Audience**: Contributors maintaining terminal rendering
**Maintenance**: Update when pool strategy changes

---

## Complexity Tracking

| Component | CS | Label | Breakdown | Justification | Mitigation |
|-----------|-----|-------|-----------|---------------|------------|
| Pool Store | 3 | Medium | S=1,I=1,D=1,N=1,F=1,T=1 | New store with algorithmic logic | TDD, follow sessions.ts pattern |
| Terminal Integration | 3 | Medium | S=1,I=1,D=1,N=1,F=1,T=1 | Modifying critical rendering path | requestAnimationFrame, integration tests |
| GPU Detection | 2 | Small | S=1,I=0,D=0,N=1,F=0,T=0 | Pure utility with heuristics | Conservative defaults |

**Overall Feature CS**: 3 (Medium) - per spec assessment

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Pool Foundation - COMPLETE (2026-02-05)
- [x] Phase 2: GPU Detection - COMPLETE (2026-02-05)
- [x] Phase 3: Terminal Integration - COMPLETE (2026-02-05)
- [x] Phase 4: Container Simplification - COMPLETE (2026-02-05)
- [x] Phase 5: Documentation & Observability - COMPLETE (2026-02-05)

### STOP Rule
**IMPORTANT**: This plan must be validated before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

**Next step**: Run `/plan-4-complete-the-plan` to validate readiness.
