# Session Idle State Indicators Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-05
**Spec**: [./session-idle-indicators-spec.md](./session-idle-indicators-spec.md)
**Status**: READY (validated 2026-02-05, HIGH issues remediated)
**Mode**: Full
**GitHub Issue**: https://github.com/vaughanknight/trex/issues/25

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Activity Tracking Foundation](#phase-1-activity-tracking-foundation)
   - [Phase 2: Idle State Computation](#phase-2-idle-state-computation)
   - [Phase 3: Visual Indicators](#phase-3-visual-indicators)
   - [Phase 4: Settings Integration](#phase-4-settings-integration)
   - [Phase 5: Documentation](#phase-5-documentation)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem Statement**: In multi-session terminal workflows, users cannot quickly identify which sessions are actively receiving output versus idle. The current binary status indicator (green dot for active, grey for other) provides no time-based feedback.

**Solution Approach**:
- Add `lastActivityAt` timestamp tracking to sessions
- Implement time-based idle state computation with configurable thresholds
- Display color-coded indicators (blue→green→amber→red→grey) on session items
- Integrate threshold configuration into settings panel

**Expected Outcomes**:
- Users can identify idle sessions at a glance, even with collapsed sidebar
- Session activity awareness improves workflow efficiency
- No impact on terminal input/output latency (<5ms overhead)

**Success Metrics**:
- All 15 acceptance criteria from spec passing
- Test coverage >80% for new code
- Zero re-render storms (verified via React DevTools)
- Timer cleanup verified (no memory leaks)

---

## Technical Context

### Current System State

**Sessions Store** (`frontend/src/stores/sessions.ts`):
- Zustand store with Map-based session storage
- Session interface: `{ id, name, shellType, status, createdAt }`
- Selector pattern established (`selectSession`, `selectSessionList`, etc.)
- No activity timestamp tracking currently

**SessionItem Component** (`frontend/src/components/SessionItem.tsx`):
- Binary status indicator: green (active) or grey (other)
- No idle duration display
- Uses `cn()` for conditional Tailwind classes

**Settings Store** (`frontend/src/stores/settings.ts`):
- Persisted to localStorage via Zustand middleware
- Current settings: theme, fontSize, fontFamily, autoOpenTerminal
- No idle threshold configuration

### Integration Requirements

1. **Activity Tracking**: Hook into Terminal.tsx `onData` and useCentralWebSocket.ts output handlers
2. **Settings Integration**: Add idle thresholds to existing settings store and panel
3. **Visual Indicators**: Extend SessionItem with color-coded dot, icon, and background tint

### Constraints and Limitations

- Must not impact terminal input latency (<50ms requirement from constitution)
- Activity tracking overhead target: <5ms (measure via Performance.now() in development)
- Timer cleanup critical to prevent memory leaks
- Selector pattern required to prevent re-render storms (PL-14)
- Fakes-only testing per ADR-0004

### Latency Measurement Guidance

To verify AC-10 (<5ms overhead):
```typescript
// Development-only measurement in Terminal.tsx onData handler
const start = performance.now()
updateActivityDebounced(sessionId)
const elapsed = performance.now() - start
if (elapsed > 5) console.warn(`Activity update exceeded 5ms: ${elapsed}ms`)
```

### Assumptions

- Terminal output frequency is manageable (not 1000s/second sustained)
- Session count stays reasonable (<50 sessions)
- CSS transitions work in both browser and Electron

---

## Critical Research Findings

### 🚨 Critical Finding 01: Re-render Storm Risk from Timestamp Updates
**Impact**: Critical
**Sources**: [R1-01, I1-02, I1-03]
**Problem**: Naive timestamp updates on every input/output event cause re-render cascades for all SessionItem components.
**Root Cause**: `selectSessionList` with `useShallow` creates new array reference on any session change.
**Solution**: Debounce activity updates to 100-200ms per PL-10; use primitive selectors for individual sessions.
**Example**:
```typescript
// ❌ WRONG - Updates on every keystroke
onData((data) => {
  updateActivity(sessionId, Date.now()) // 100+ calls/second
})

// ✅ CORRECT - Debounced updates
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
onData((data) => {
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(() => {
    updateActivity(sessionId, Date.now())
  }, 150)
})
```
**Action Required**: Implement per-session debounce timers for activity updates
**Affects Phases**: Phase 1, Phase 2

---

### 🚨 Critical Finding 02: Terminal Input Handler Non-Blocking Requirement
**Impact**: Critical
**Sources**: [R1-03, I1-02]
**Problem**: Activity tracking in `onData` handler must not block user input path.
**Root Cause**: Synchronous store updates or async awaits in handler add latency.
**Solution**: Fire-and-forget debounced updates; no synchronous logic in handler.
**Example**:
```typescript
// ❌ WRONG - Blocks input
onData((data) => {
  updateActivitySync(sessionId) // Synchronous store update
  sendInput(sessionId, data)
})

// ✅ CORRECT - Non-blocking
onData((data) => {
  updateActivityDebounced(sessionId) // Fire-and-forget
  sendInput(sessionId, data)
})
```
**Action Required**: Activity update must be zero-cost in critical path
**Affects Phases**: Phase 1

---

### 🔴 High Finding 03: Timer Memory Leak Risk
**Impact**: High
**Sources**: [R1-02, I1-05]
**Problem**: Idle state recomputation interval can spawn orphaned timers.
**Root Cause**: Multiple re-renders create new intervals without cleanup.
**Solution**: Store-level interval management with lifecycle control; proper useEffect cleanup.
**Example**:
```typescript
// ❌ WRONG - No cleanup
useEffect(() => {
  const interval = setInterval(() => { /* recompute */ }, 1000)
}, []) // Missing return cleanup!

// ✅ CORRECT - Proper cleanup
useEffect(() => {
  const interval = setInterval(() => { /* recompute */ }, 1000)
  return () => clearInterval(interval)
}, [])
```
**Action Required**: Single global interval with explicit lifecycle management
**Affects Phases**: Phase 2

---

### 🔴 High Finding 04: Output Batching Interaction
**Impact**: High
**Sources**: [R1-04, I1-03]
**Problem**: WebSocket output already batched at 16ms; activity updates must align.
**Root Cause**: Independent activity updates cause 60 FPS re-render cycles.
**Solution**: Piggyback activity updates on existing 16ms batching window.
**Example**:
```typescript
// ❌ WRONG - Unbatched activity updates
bufferOutput(msg.sessionId, msg.data)
updateActivity(msg.sessionId) // 60 FPS re-renders!

// ✅ CORRECT - Batch with output
bufferOutput(msg.sessionId, msg.data)
bufferActivity(msg.sessionId) // Flushed with output batch
```
**Action Required**: Activity buffer flushed alongside output buffer
**Affects Phases**: Phase 1

---

### 🔴 High Finding 05: Separate Activity Store Pattern
**Impact**: High
**Sources**: [R1-05, I1-01]
**Problem**: Adding `lastActivityAt` to Session interface breaks shallow equality.
**Root Cause**: Every timestamp update changes Session object reference.
**Solution**: Separate activity store isolates timestamp updates from session map.
**Example**:
```typescript
// ❌ WRONG - Session object changes on every activity
interface Session {
  lastActivityAt: number // Changes constantly
}

// ✅ CORRECT - Separate store
const useActivityStore = create((set) => ({
  lastActivityAt: new Map<string, number>(),
  updateActivity: (id, ts) => set(...)
}))
```
**Action Required**: Create dedicated activity store, not modify Session interface
**Affects Phases**: Phase 1, Phase 3

---

### 🟡 Medium Finding 06: Debounce Implementation Pattern
**Impact**: Medium
**Sources**: [R1-06, I1-02]
**Problem**: Debounce closures can capture stale sessionId; timers need cleanup.
**Solution**: Per-sessionId debounce map with ref-based timer management.
**Example**:
```typescript
// Create dedicated hook for activity debouncing
function useActivityDebounce() {
  const debounceMapRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const updateDebounced = useCallback((sessionId: string) => {
    const existing = debounceMapRef.current.get(sessionId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      useActivityStore.getState().updateActivity(sessionId, Date.now())
      debounceMapRef.current.delete(sessionId)
    }, 150)

    debounceMapRef.current.set(sessionId, timer)
  }, [])

  useEffect(() => {
    return () => {
      for (const timer of debounceMapRef.current.values()) {
        clearTimeout(timer)
      }
    }
  }, [])

  return updateDebounced
}
```
**Action Required**: Create `useActivityDebounce` hook with cleanup
**Affects Phases**: Phase 1

---

### 🟡 Medium Finding 07: Fake Timer Test Patterns
**Impact**: Medium
**Sources**: [R1-07, I1-04]
**Problem**: Testing 6 different thresholds requires fake timer setup.
**Solution**: Follow webglPool.test.ts patterns with vi.useFakeTimers().
**Example**:
```typescript
describe('Idle State Computation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('transitions to amber at 5min boundary', () => {
    vi.setSystemTime(new Date(0))
    const fiveMinutesAgo = -5 * 60 * 1000

    const result = computeIdleState(fiveMinutesAgo, thresholds)
    expect(result.state).toBe('medium')
  })
})
```
**Action Required**: Create comprehensive threshold boundary tests
**Affects Phases**: Phase 2

---

### 🟡 Medium Finding 08: Feature Flag for Safe Rollback
**Impact**: Medium
**Sources**: [R1-08]
**Problem**: If idle indicators cause issues, need quick rollback path.
**Solution**: Add `idleIndicatorsEnabled` setting (default: true) for emergency disable.
**Example**:
```typescript
// In SettingsPanel or SessionItem
const idleEnabled = useSettingsStore(s => s.idleIndicatorsEnabled)
if (!idleEnabled) {
  return <SimpleStatusIndicator /> // Fallback to original green/grey
}
return <IdleStateIndicator />
```
**Action Required**: Add feature flag to settings store
**Affects Phases**: Phase 4

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Hybrid (TDD for complex, Lightweight for simple)
- **Rationale**: Time-based threshold computation needs thorough TDD; UI color changes are straightforward
- **Focus Areas**:
  - TDD: `computeIdleState()`, timer lifecycle, debouncing, multi-session independence
  - Lightweight: SessionItem colors, CSS transitions, tooltip formatting

### Test-Driven Development (for complex logic)
- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Mock Usage (per ADR-0004)
- **Policy**: Fakes only - no mocking frameworks permitted
- **Implementation**: Use `vi.useFakeTimers()` for time control; create FakeActivityStore if needed

### Test Documentation
Every test must include:
```typescript
/**
 * Purpose: [what truth this test proves]
 * Quality Contribution: [how this prevents bugs]
 * Acceptance Criteria: [measurable assertions]
 */
```

---

## Implementation Phases

### Phase 1: Activity Tracking Foundation

**Objective**: Establish activity timestamp tracking infrastructure with debounced updates.

**Deliverables**:
- Activity store (`useActivityStore`) with `lastActivityAt` Map
- `useActivityDebounce` hook for fire-and-forget updates
- Integration with Terminal.tsx `onData` handler
- Integration with useCentralWebSocket.ts output handler

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Re-render storms | Medium | High | Debounce at 150ms, separate activity store |
| Input latency impact | Low | High | Fire-and-forget pattern, no sync logic |
| Timer leaks | Low | Medium | Ref-based cleanup in useEffect |

#### Tasks (Hybrid: TDD for store, Lightweight for integration)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write tests for activity store `updateActivity` action | 2 | Tests cover: single update, multiple sessions, timestamp accuracy | - | TDD |
| 1.2 | [ ] | Create `useActivityStore` with `lastActivityAt` Map | 2 | Store created, tests from 1.1 pass | - | |
| 1.3 | [ ] | Write tests for `useActivityDebounce` hook | 2 | Tests cover: debounce timing, cleanup, per-session isolation | - | TDD |
| 1.4 | [ ] | Implement `useActivityDebounce` hook | 2 | Hook created, tests from 1.3 pass, proper cleanup | - | |
| 1.5 | [ ] | Integrate activity tracking into Terminal.tsx `onData` | 2 | Activity updates fire on input, debounced at 150ms | - | Lightweight |
| 1.6 | [ ] | Integrate activity tracking into useCentralWebSocket output handler | 2 | Activity updates fire on output receipt, batched with 16ms window | - | Lightweight |
| 1.7 | [ ] | Add selector `selectLastActivityAt(id)` to activity store | 1 | Selector returns number or undefined, primitive comparison | - | |
| 1.8 | [ ] | Verify no input latency impact | 1 | Manual test: typing feels normal, no measurable delay | - | |

#### Test Examples (Write First!)

```typescript
// /frontend/src/stores/__tests__/activityStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useActivityStore } from '../activityStore'

describe('Activity Store', () => {
  beforeEach(() => {
    useActivityStore.getState().clearActivity()
  })

  it('should update lastActivityAt for a session', () => {
    /**
     * Purpose: Proves activity timestamp is stored per session
     * Quality Contribution: Prevents lost activity data
     * Acceptance Criteria: Timestamp stored and retrievable by sessionId
     */
    const now = Date.now()
    useActivityStore.getState().updateActivity('s1', now)

    expect(useActivityStore.getState().lastActivityAt.get('s1')).toBe(now)
  })

  it('should track multiple sessions independently', () => {
    /**
     * Purpose: Proves session isolation for activity tracking
     * Quality Contribution: Prevents cross-session contamination
     * Acceptance Criteria: Each session has independent timestamp
     */
    const t1 = Date.now()
    const t2 = t1 + 1000

    useActivityStore.getState().updateActivity('s1', t1)
    useActivityStore.getState().updateActivity('s2', t2)

    expect(useActivityStore.getState().lastActivityAt.get('s1')).toBe(t1)
    expect(useActivityStore.getState().lastActivityAt.get('s2')).toBe(t2)
  })
})
```

#### Non-Happy-Path Coverage
- [ ] Activity update for non-existent session (should store anyway)
- [ ] Concurrent updates from Terminal and WebSocket (both should succeed)
- [ ] Cleanup on session removal (activity entry deleted)

#### Acceptance Criteria
- [ ] Activity store created with Map-based timestamp storage
- [ ] Debounce hook properly cleans up timers on unmount
- [ ] Terminal input triggers debounced activity update
- [ ] WebSocket output triggers activity update (batched)
- [ ] No perceptible input latency increase

---

### Phase 2: Idle State Computation

**Objective**: Implement time-based idle state calculation with threshold logic.

**Deliverables**:
- `computeIdleState()` utility function with configurable thresholds
- `IdleState` type definition (active, recent, short, medium, long, dormant)
- Global interval timer for idle state recomputation
- `useIdleState(sessionId)` hook for component consumption

**Dependencies**: Phase 1 complete (activity store available)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Timer memory leaks | Low | Medium | Single global interval with cleanup |
| Threshold boundary errors | Medium | Low | TDD with fake timers for all boundaries |
| Performance with many sessions | Low | Low | O(n) iteration, 1-second interval |

#### Tasks (TDD Approach for core logic)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Define `IdleState` type and `IdleThresholds` interface | 1 | Types exported from utils/idleState.ts | - | |
| 2.2 | [ ] | Write comprehensive tests for `computeIdleState()` | 3 | Tests cover all 6 states, boundary conditions (exact threshold) | - | TDD |
| 2.3 | [ ] | Implement `computeIdleState()` utility | 2 | All tests from 2.2 pass, pure function | - | |
| 2.4 | [ ] | Write tests for idle recomputation interval | 2 | Tests cover: start/stop lifecycle, cleanup, multi-session | - | TDD |
| 2.5 | [ ] | Implement `useIdleComputation` hook with global interval | 2 | Single interval, proper cleanup, triggers re-renders | - | |

#### Global Interval Lifecycle Test Example

```typescript
// frontend/src/hooks/__tests__/useIdleComputation.test.ts
describe('useIdleComputation lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should start interval on mount and clear on unmount', () => {
    /**
     * Purpose: Proves interval lifecycle is properly managed
     * Quality Contribution: Prevents timer memory leaks
     * Acceptance Criteria: Interval starts once, clears on unmount
     */
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = renderHook(() => useIdleComputation())

    // Advance time to verify interval is running
    vi.advanceTimersByTime(1000)
    expect(useIdleComputationStore.getState().tick).toBe(1)

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('should not create multiple intervals on re-render', () => {
    /**
     * Purpose: Proves only one global interval exists
     * Quality Contribution: Prevents CPU waste from duplicate intervals
     */
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { rerender } = renderHook(() => useIdleComputation())
    rerender()
    rerender()

    // Should only have created one interval
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })
})
```
| 2.6 | [ ] | Create `useIdleState(sessionId)` hook for components | 2 | Returns computed idle state, re-renders on state change | - | |
| 2.7 | [ ] | Write tests for `formatIdleDuration()` utility | 1 | Formats: "Active", "5 seconds", "2 minutes", "1 hour" | - | |
| 2.8 | [ ] | Implement `formatIdleDuration()` utility | 1 | All tests pass, handles edge cases | - | |

#### Test Examples (Write First!)

```typescript
// /frontend/src/utils/__tests__/idleState.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeIdleState, IdleState } from '../idleState'

const DEFAULT_THRESHOLDS = {
  active: 5000,      // 5 seconds
  recent: 30000,     // 30 seconds
  short: 300000,     // 5 minutes
  medium: 600000,    // 10 minutes
  long: 3600000,     // 60 minutes
}

describe('computeIdleState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return "active" when idle < 5 seconds', () => {
    /**
     * Purpose: Proves active state threshold works correctly
     * Quality Contribution: Ensures blue indicator shows for recent activity
     * Acceptance Criteria: idle < 5s returns 'active'
     */
    vi.setSystemTime(new Date(10000)) // 10 seconds since epoch
    const lastActivity = 6000 // 4 seconds ago

    const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS)
    expect(result.state).toBe('active')
  })

  it('should return "recent" at exactly 5 seconds (lower bound inclusive)', () => {
    /**
     * Purpose: Proves boundary behavior is lower-bound inclusive
     * Quality Contribution: Prevents off-by-one errors at thresholds
     * Acceptance Criteria: At exactly 5s, state transitions to 'recent'
     */
    vi.setSystemTime(new Date(10000))
    const lastActivity = 5000 // exactly 5 seconds ago

    const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS)
    expect(result.state).toBe('recent')
  })

  it('should return "dormant" at 60+ minutes', () => {
    /**
     * Purpose: Proves dormant state for long idle sessions
     * Quality Contribution: Grey indicator shows for abandoned sessions
     * Acceptance Criteria: idle >= 60min returns 'dormant'
     */
    vi.setSystemTime(new Date(3600001)) // 60 min + 1ms
    const lastActivity = 0

    const result = computeIdleState(lastActivity, DEFAULT_THRESHOLDS)
    expect(result.state).toBe('dormant')
  })
})
```

#### Non-Happy-Path Coverage
- [ ] `lastActivityAt` in future (clock skew) - treat as active
- [ ] `lastActivityAt` is 0 or undefined - use session createdAt
- [ ] Custom thresholds with invalid ordering - validate or fallback
- [ ] Threshold exactly at boundary (lower bound inclusive)

#### Acceptance Criteria
- [ ] `computeIdleState()` correctly classifies all 6 states
- [ ] Boundary conditions tested (exact threshold values)
- [ ] Global interval runs at 1-second frequency
- [ ] Interval properly cleaned up on unmount
- [ ] `useIdleState` hook returns current idle state

---

### Phase 3: Visual Indicators

**Objective**: Update SessionItem to display color-coded idle state indicators.

**Deliverables**:
- Color-coded status dot (blue, green, amber, red, grey)
- Background tint on session button
- Terminal icon color change
- Tooltip showing idle duration
- CSS transitions for smooth color changes

**Dependencies**: Phase 2 complete (idle state computation available)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Color accessibility | Low | Medium | Use sufficient contrast ratios |
| CSS transition conflicts | Low | Low | Test in both browser and Electron |
| Re-renders on color change | Low | Low | Primitive selectors, memo if needed |

#### Tasks (Lightweight Approach for UI)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Define color mapping for idle states | 1 | Mapping object: state → Tailwind classes | - | |
| 3.2 | [ ] | Update SessionItem status dot color based on idle state | 2 | Dot changes color correctly per state | - | |
| 3.3 | [ ] | Add background tint to session button | 2 | `bg-{color}-500/10` applied, visible in collapsed | - | |
| 3.4 | [ ] | Update Terminal icon color based on idle state | 2 | Icon changes to `text-{color}-500` | - | |
| 3.5 | [ ] | Add tooltip showing idle duration | 2 | Hover shows "Active" or "Idle: X minutes" | - | |
| 3.6 | [ ] | Add CSS transitions for color changes | 1 | 200ms ease-linear transition on color properties | - | |
| 3.7 | [ ] | Verify collapsed sidebar visibility | 1 | Manual test: colors visible at 48px width | - | |
| 3.8 | [ ] | Write visual verification test | 2 | Test renders SessionItem with each state, snapshot | - | |

#### Code Example

```typescript
// /frontend/src/components/SessionItem.tsx
const IDLE_STATE_COLORS = {
  active: {
    dot: 'bg-blue-500',
    icon: 'text-blue-500',
    tint: 'bg-blue-500/10',
  },
  recent: {
    dot: 'bg-green-500',
    icon: 'text-green-500',
    tint: 'bg-green-500/10',
  },
  short: {
    dot: 'bg-green-400',
    icon: 'text-green-400',
    tint: 'bg-green-400/5',
  },
  medium: {
    dot: 'bg-amber-500',
    icon: 'text-amber-500',
    tint: 'bg-amber-500/10',
  },
  long: {
    dot: 'bg-red-500',
    icon: 'text-red-500',
    tint: 'bg-red-500/10',
  },
  dormant: {
    dot: 'bg-gray-400',
    icon: 'text-gray-400',
    tint: 'bg-gray-400/5',
  },
} as const

// In component
const idleState = useIdleState(session.id)
const colors = IDLE_STATE_COLORS[idleState.state]
const idleDuration = formatIdleDuration(idleState.idleMs)

return (
  <SidebarMenuButton
    className={cn(
      colors.tint,
      'transition-colors duration-200 ease-linear'
    )}
  >
    <Terminal className={cn('size-4', colors.icon)} />
    <span className="flex-1 truncate">{session.name}</span>
    <span
      className={cn('size-2 rounded-full', colors.dot)}
      title={idleDuration}
    />
  </SidebarMenuButton>
)
```

#### Acceptance Criteria
- [ ] Status dot displays correct color for each idle state
- [ ] Background tint visible and matches idle state
- [ ] Terminal icon color matches idle state
- [ ] Tooltip shows "Active" or "Idle: X" format
- [ ] Color transitions are smooth (200ms)
- [ ] Indicators visible in collapsed sidebar

---

### Phase 4: Settings Integration

**Objective**: Add configurable idle thresholds to settings panel.

**Deliverables**:
- Idle threshold fields in settings store
- IdleThresholdSettings component with sliders/inputs
- Settings persistence to localStorage
- Feature flag for emergency disable

**Dependencies**: Phase 2 complete (thresholds consumed by computation)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Invalid threshold values | Medium | Low | Validation on input |
| Settings not persisting | Low | Medium | Test with localStorage mock |

#### Tasks (Lightweight Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Add idle threshold fields to SettingsState interface | 1 | 5 threshold fields with defaults | - | |
| 4.2 | [ ] | Add threshold actions to settings store | 1 | setIdleThresholds action, individual setters | - | |
| 4.3 | [ ] | Add `idleIndicatorsEnabled` feature flag | 1 | Boolean field, default: true | - | |
| 4.4 | [ ] | Create IdleThresholdSettings component | 3 | Sliders for each threshold with labels | - | |
| 4.5 | [ ] | Add IdleThresholdSettings to SettingsPanel | 1 | New section after Font Size | - | |
| 4.6 | [ ] | Write test for settings persistence | 2 | Thresholds persist after refresh | - | |
| 4.7 | [ ] | Write test for settings apply immediately | 2 | Changing threshold updates idle computation | - | |
| 4.8 | [ ] | Add threshold validation | 1 | Prevent invalid values (min 1s, ascending order) | - | |

#### Code Example

```typescript
// /frontend/src/stores/settings.ts additions
export interface IdleThresholds {
  active: number    // default: 5000 (5s)
  recent: number    // default: 30000 (30s)
  short: number     // default: 300000 (5min)
  medium: number    // default: 600000 (10min)
  long: number      // default: 3600000 (60min)
}

export interface SettingsState {
  // ... existing fields
  idleThresholds: IdleThresholds
  idleIndicatorsEnabled: boolean
}

const defaultIdleThresholds: IdleThresholds = {
  active: 5000,
  recent: 30000,
  short: 300000,
  medium: 600000,
  long: 3600000,
}

// Selector
export const selectIdleThresholds = (state: SettingsStore) => state.idleThresholds
export const selectIdleIndicatorsEnabled = (state: SettingsStore) => state.idleIndicatorsEnabled
```

#### Acceptance Criteria
- [ ] All 5 thresholds configurable in settings
- [ ] Settings persist to localStorage
- [ ] Changing threshold immediately updates idle computation
- [ ] Feature flag can disable idle indicators
- [ ] Validation prevents invalid threshold values

---

### Phase 5: Documentation

**Objective**: Create developer documentation for idle indicator system.

**Deliverables**:
- `docs/how/idle-indicators.md` - Architecture and API reference
- Code comments for key functions

**Dependencies**: All implementation phases complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift | Low | Low | Update with any future changes |

#### Tasks (Lightweight)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Survey existing docs/how/ structure | 1 | Document current structure, no conflicts | - | |
| 5.2 | [ ] | Create docs/how/idle-indicators.md | 2 | Overview, architecture, API reference | - | |
| 5.3 | [ ] | Document threshold definitions and rationale | 1 | Each state explained with use case | - | |
| 5.4 | [ ] | Add debugging tips section | 1 | How to verify idle tracking works | - | |
| 5.5 | [ ] | Add code comments to key functions | 1 | computeIdleState, useIdleState documented | - | |
| 5.6 | [ ] | Review and finalize documentation | 1 | Peer review passed | - | |

#### Content Outline

**docs/how/idle-indicators.md**:
1. Overview - What idle indicators do and why
2. Idle State Definitions - Table of states with thresholds
3. Architecture - Diagram showing data flow
4. API Reference - computeIdleState, useIdleState, stores
5. Debugging - How to verify tracking works
6. Customization - How to change thresholds

#### Acceptance Criteria
- [ ] Documentation file created at correct path
- [ ] All idle states documented with thresholds
- [ ] Architecture explained clearly
- [ ] API reference complete
- [ ] Debugging tips useful for troubleshooting

---

## Cross-Cutting Concerns

### Security Considerations
- No sensitive data in idle tracking (only timestamps)
- Settings stored in localStorage (no server persistence)

### Observability
- Console logging for activity updates (development only, per webglPool pattern)
- React DevTools can profile re-renders

### Documentation
- **Location**: `docs/how/idle-indicators.md`
- **Target Audience**: Developers maintaining the feature
- **Maintenance**: Update when thresholds change

---

## Complexity Tracking

| Component | CS | Label | Breakdown | Justification | Mitigation |
|-----------|-----|-------|-----------|---------------|------------|
| computeIdleState | 2 | Small | S=0,I=0,D=1,N=0,F=0,T=1 | Pure function, 6 thresholds | TDD with fake timers |
| useActivityStore | 2 | Small | S=1,I=0,D=1,N=0,F=0,T=0 | New store, Map pattern | Follow sessions.ts pattern |
| useActivityDebounce | 2 | Small | S=0,I=0,D=0,N=1,F=1,T=0 | Timer cleanup critical | Per-session ref map |
| SessionItem updates | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | Visual changes only | Snapshot tests |
| Settings integration | 2 | Small | S=1,I=1,D=0,N=0,F=0,T=0 | Extends existing store | Follow existing pattern |

**Overall Feature**: CS-3 (score: 6) - manageable with proper phase decomposition

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Activity Tracking Foundation - COMPLETE (2026-02-05)
- [x] Phase 2: Idle State Computation - COMPLETE (2026-02-05)
- [x] Phase 3: Visual Indicators - COMPLETE (2026-02-05)
- [x] Phase 4: Settings Integration - COMPLETE (2026-02-05)
- [x] Phase 5: Documentation - COMPLETE (2026-02-05)

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Accepted | All | Fakes-only testing - no mocking frameworks |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

**Plan Complete**: 2026-02-05
**Location**: `docs/plans/007-session-idle-indicators/session-idle-indicators-plan.md`
**Next Step**: Run `/plan-4-complete-the-plan` to validate readiness
