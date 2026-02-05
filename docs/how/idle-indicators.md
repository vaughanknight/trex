# Session Idle State Indicators

This document explains the session idle indicator system used in trex to display color-coded activity status for terminal sessions.

## Overview

### The Problem

In multi-session terminal workflows, users cannot quickly identify which sessions are actively receiving output versus idle. The previous binary status indicator (green for connected, grey for disconnected) provided no time-based feedback.

### The Solution

A color-coded idle indicator system that:
- **Tracks activity timestamps** for each session (both input and output)
- **Computes idle state** based on time since last activity (6 states)
- **Displays visual indicators** using color-coded dots, icons, and background tints
- **Allows customization** via Settings panel threshold sliders

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **At-a-glance status** | Instantly identify active, idle, and dormant sessions |
| **Collapsed sidebar visible** | Tint and icon color visible even when sidebar is collapsed |
| **Configurable thresholds** | Adjust timing to match your workflow |
| **Smooth transitions** | 200ms CSS transitions between color states |
| **Zero latency impact** | Fire-and-forget activity updates don't block input |

---

## Idle State Definitions

Sessions progress through 6 idle states based on time since last activity:

| State | Time Since Activity | Dot Color | Icon Color | Tint | Meaning |
|-------|---------------------|-----------|------------|------|---------|
| **Active** | < 5 seconds | Blue | Blue | Blue/10% | Currently receiving output |
| **Recent** | 5s - 30s | Green | Green | Green/10% | Just used |
| **Short** | 30s - 5 min | Light Green | Light Green | Green/5% | Brief idle |
| **Medium** | 5 min - 10 min | Amber | Amber | Amber/10% | Medium idle |
| **Long** | 10 min - 60 min | Red | Red | Red/10% | Long idle |
| **Dormant** | > 60 min | Grey | Grey | Grey/5% | Inactive |

**Boundary Behavior**: Lower bound inclusive. At exactly 5 seconds, the state transitions to "recent".

---

## Architecture

### Component Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                         Terminal.tsx                             │
│  - Calls updateActivityDebounced() on user input (onData)        │
└──────────────┬───────────────────────────────────────────────────┘
               │ debounced (150ms)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Activity Store                              │
│  - lastActivityAt: Map<sessionId, timestamp>                     │
│  - Separate from sessions store (prevents re-render storms)      │
└──────────────┬───────────────────────────────────────────────────┘
               │ selectLastActivityAt(sessionId)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      useIdleState Hook                           │
│  - Subscribes to activity timestamp                              │
│  - Recalculates every 1 second (useIdleComputation)              │
│  - Returns { state: IdleState, idleMs: number }                  │
└──────────────┬───────────────────────────────────────────────────┘
               │ idleState
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SessionItem.tsx                            │
│  - Maps state to colors via IDLE_STATE_COLORS                    │
│  - Applies dot color, icon color, background tint               │
│  - Shows formatted idle duration in tooltip                      │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Activity Detection**: User types in terminal or output is received
2. **Debounced Update**: Activity timestamp stored after 150ms debounce
3. **Periodic Computation**: Every 1 second, idle state recalculated
4. **Visual Update**: SessionItem applies colors based on computed state
5. **Settings Applied**: Custom thresholds from Settings store used in computation

---

## API Reference

### Activity Tracking (Phase 1)

**`useActivityStore`** - Zustand store for activity timestamps

```typescript
import { useActivityStore, selectLastActivityAt } from '@/stores/activityStore'

// Get last activity for a session
const lastActivity = useActivityStore(selectLastActivityAt('session-id'))

// Update activity (usually via debounced hook)
useActivityStore.getState().updateActivity('session-id', Date.now())

// Cleanup on session close
useActivityStore.getState().removeActivity('session-id')
```

**`useActivityDebounce`** - Hook for debounced activity updates

```typescript
import { useActivityDebounce, ACTIVITY_DEBOUNCE_MS } from '@/hooks/useActivityDebounce'

function Terminal({ sessionId }) {
  const updateActivityDebounced = useActivityDebounce()

  // Call on user input (fire-and-forget)
  xterm.onData((data) => {
    updateActivityDebounced(sessionId)  // Non-blocking
    sendInput(sessionId, data)
  })
}
```

### Idle Computation (Phase 2)

**`computeIdleState`** - Pure function for idle state calculation

```typescript
import { computeIdleState, DEFAULT_THRESHOLDS } from '@/utils/idleState'

const result = computeIdleState(
  lastActivityAt,        // timestamp or undefined
  DEFAULT_THRESHOLDS,    // optional custom thresholds
  Date.now()             // optional current time (for testing)
)
// Returns: { state: 'active' | 'recent' | ... , idleMs: number }
```

**`formatIdleDuration`** - Human-readable idle duration

```typescript
import { formatIdleDuration } from '@/utils/idleState'

formatIdleDuration(0)         // "Active"
formatIdleDuration(45000)     // "Idle: 45 seconds"
formatIdleDuration(300000)    // "Idle: 5 minutes"
formatIdleDuration(3600000)   // "Idle: 1 hour"
```

**`useIdleState`** - React hook for component use

```typescript
import { useIdleState } from '@/hooks/useIdleState'

function SessionItem({ sessionId }) {
  const { state, idleMs } = useIdleState(sessionId)
  // state: 'active' | 'recent' | 'short' | 'medium' | 'long' | 'dormant'
  // idleMs: milliseconds since last activity
}
```

### Settings (Phase 4)

**Threshold Configuration**

```typescript
import { useSettingsStore, selectIdleThresholds, selectIdleIndicatorsEnabled } from '@/stores/settings'

// Get current thresholds
const thresholds = useSettingsStore(selectIdleThresholds)
// { active: 5000, recent: 30000, short: 300000, medium: 600000, long: 3600000 }

// Check if feature enabled
const enabled = useSettingsStore(selectIdleIndicatorsEnabled)

// Update thresholds (validates automatically)
useSettingsStore.getState().setIdleThresholds({
  active: 3000,   // 3 seconds
  recent: 15000,  // 15 seconds
  // ... other thresholds
})
```

---

## Customization

### Via Settings Panel

1. Open Settings (gear icon in sidebar)
2. Scroll to "Idle Indicators" section
3. Toggle the feature on/off
4. Adjust threshold sliders for each state

### Threshold Validation

The system enforces:
- **Minimum 1 second** for all thresholds
- **Ascending order**: active < recent < short < medium < long
- Invalid values are automatically corrected

### Color Customization

Colors are defined in `SessionItem.tsx`:

```typescript
const IDLE_STATE_COLORS: Record<IdleState, { dot: string; icon: string; tint: string }> = {
  active: { dot: 'bg-blue-500', icon: 'text-blue-500', tint: 'bg-blue-500/10' },
  recent: { dot: 'bg-green-500', icon: 'text-green-500', tint: 'bg-green-500/10' },
  // ... modify Tailwind classes as needed
}
```

---

## Debugging

### Verify Activity Tracking

Open browser DevTools console:

```javascript
// Check if activity is being tracked
const store = window.__ZUSTAND_STORES__?.activityStore
store?.getState().lastActivityAt
// Should show Map with session IDs and timestamps
```

### Verify Idle Computation

```javascript
// Import in a component or test
import { computeIdleState, DEFAULT_THRESHOLDS } from '@/utils/idleState'

// Test with known timestamp
const result = computeIdleState(Date.now() - 45000, DEFAULT_THRESHOLDS)
console.log(result) // { state: 'short', idleMs: 45000 }
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Indicator stays grey | Activity not being tracked | Check Terminal.tsx onData handler |
| Indicator never updates | Interval not running | Verify useIdleComputation hook is mounted |
| Wrong colors after threshold change | Old thresholds cached | Settings persist immediately - refresh if needed |
| Feature not visible | Feature flag disabled | Check Settings → Idle Indicators toggle |

### Testing Thresholds

Use browser DevTools to simulate time passage:

```javascript
// In test files
import { vi } from 'vitest'

vi.useFakeTimers()
vi.setSystemTime(new Date())
// ... test idle states at different times
vi.advanceTimersByTime(60000) // Advance 1 minute
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `frontend/src/stores/activityStore.ts` | Activity timestamp storage |
| `frontend/src/hooks/useActivityDebounce.ts` | Debounced activity updates |
| `frontend/src/utils/idleState.ts` | Types, computation, formatting |
| `frontend/src/hooks/useIdleState.ts` | React hooks for idle state |
| `frontend/src/components/SessionItem.tsx` | Visual indicator rendering |
| `frontend/src/components/IdleThresholdSettings.tsx` | Settings UI |
| `frontend/src/stores/settings.ts` | Threshold persistence |

---

## Related

- [Terminal Architecture](./terminal-architecture.md) - Overall terminal system design
- [WebGL Pooling](./webgl-pooling.md) - GPU context management for terminals
