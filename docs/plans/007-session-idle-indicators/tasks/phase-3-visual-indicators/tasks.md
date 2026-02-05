# Phase 3: Visual Indicators – Tasks & Alignment Brief

**Spec**: [../../session-idle-indicators-spec.md](../../session-idle-indicators-spec.md)
**Plan**: [../../session-idle-indicators-plan.md](../../session-idle-indicators-plan.md)
**Date**: 2026-02-05
**GitHub Issue**: https://github.com/vaughanknight/trex/issues/25

---

## Executive Briefing

### Purpose
This phase adds the visual idle state indicators to the SessionItem component in the sidebar. Users will see color-coded indicators that show at a glance which terminal sessions are active, recently idle, or dormant.

### What We're Building
Updates to `SessionItem.tsx` that:
- Display color-coded status dots (blue→green→amber→red→grey based on idle state)
- Apply background tint to session buttons matching idle state
- Change Terminal icon color to match idle state
- Show idle duration in tooltips ("Active", "Idle: 5 minutes")
- Apply smooth CSS transitions between color states

### User Value
Users can instantly identify which terminal sessions are actively receiving output versus idle, enabling efficient workflow management without switching between sessions. Idle state is visible even when the sidebar is collapsed.

### Example
```
Before: All sessions show static green/grey dot based on connection status only
After:  Sessions show dynamic colors:
        - Blue dot + blue tint = actively receiving output (< 5s)
        - Green dot + green tint = recently used (5s - 30s)
        - Amber dot + amber tint = medium idle (5min - 10min)
        - Red dot + red tint = long idle (10min - 60min)
        - Grey dot + grey tint = dormant (> 60min)
```

---

## Objectives & Scope

### Objective
Implement visual idle indicators as specified in the plan, satisfying:
- AC-03: Visual Indicator - Dot Color (correct colors per state)
- AC-04: Visual Indicator - Button Background Tint and Icon Color
- AC-08: Collapsed Sidebar Visibility (both tint + icon visible)
- AC-09: Smooth Color Transitions (200ms ease-linear)
- AC-12: Tooltip Shows Idle Duration (already implemented in Phase 2)

### Goals

- ✅ Define color mapping constant for all 6 idle states
- ✅ Update SessionItem to consume `useIdleState(session.id)`
- ✅ Apply idle state colors to status dot
- ✅ Apply background tint to SidebarMenuButton
- ✅ Apply icon color to Terminal icon
- ✅ Update tooltip to show formatted idle duration
- ✅ Add CSS transitions for smooth color changes

### Non-Goals

- ❌ Settings UI for thresholds (Phase 4)
- ❌ Feature flag toggle (Phase 4)
- ❌ Custom threshold values (Phase 4 - using DEFAULT_THRESHOLDS)
- ❌ Animated pulse/glow effects (per spec Non-Goals)
- ❌ Unit tests for color classes (lightweight visual verification)

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|----|------|--------------|------------------|------------|----------|-------|
| [x] | T001 | Define `IDLE_STATE_COLORS` constant mapping states to Tailwind classes | 1 | Core | – | /Users/vaughanknight/GitHub/trex/frontend/src/components/SessionItem.tsx | All 6 states mapped with dot, icon, tint classes | – | Per plan code example |
| [x] | T002 | Import `useIdleState` and `formatIdleDuration` into SessionItem | 1 | Integration | – | /Users/vaughanknight/GitHub/trex/frontend/src/components/SessionItem.tsx | Imports resolve, type check passes | – | From Phase 2 |
| [x] | T003 | Call `useIdleState(session.id)` to get current idle state | 1 | Integration | T002 | /Users/vaughanknight/GitHub/trex/frontend/src/components/SessionItem.tsx | Hook called, returns IdleStateResult | – | – |
| [x] | T004 | Update status dot className to use idle state colors | 2 | Core | T001, T003 | /Users/vaughanknight/GitHub/trex/frontend/src/components/SessionItem.tsx | Dot color changes per idle state | – | Per AC-03 |
| [x] | T005 | Add background tint className to SidebarMenuButton | 2 | Core | T001, T003 | /Users/vaughanknight/GitHub/trex/frontend/src/components/SessionItem.tsx | 10% opacity tint visible | – | Per AC-04 |
| [x] | T006 | Update Terminal icon className to use idle state colors | 2 | Core | T001, T003 | /Users/vaughanknight/GitHub/trex/frontend/src/components/SessionItem.tsx | Icon color matches idle state | – | Per AC-04 |
| [x] | T007 | Update tooltip to show formatted idle duration | 1 | Core | T002, T003 | /Users/vaughanknight/GitHub/trex/frontend/src/components/SessionItem.tsx | Tooltip shows "Active" or "Idle: X" | – | Per AC-12 |
| [x] | T008 | Add CSS transitions for color properties | 1 | Core | T004, T005, T006 | /Users/vaughanknight/GitHub/trex/frontend/src/components/SessionItem.tsx | 200ms ease-linear on color changes | – | Per AC-09 |

---

## Alignment Brief

### Prior Phases Summary

**Phase 1** delivered activity tracking:
- `useActivityStore` with `lastActivityAt: Map<string, number>`
- `selectLastActivityAt(sessionId)` selector
- Debounced activity updates in Terminal.tsx and WebSocket handler

**Phase 2** delivered idle computation:
- `useIdleState(sessionId)` → `{ state: IdleState, idleMs: number }`
- `formatIdleDuration(idleMs)` → `"Active"` or `"Idle: X minutes"`
- 1-second interval for periodic recalculation

### APIs This Phase Consumes

```typescript
// From Phase 2
import { useIdleState } from '@/hooks/useIdleState'
import { formatIdleDuration } from '@/utils/idleState'

// Usage
const { state, idleMs } = useIdleState(session.id)
const colors = IDLE_STATE_COLORS[state]
const tooltip = formatIdleDuration(idleMs)
```

### Color Mapping (from plan)

```typescript
const IDLE_STATE_COLORS = {
  active: { dot: 'bg-blue-500', icon: 'text-blue-500', tint: 'bg-blue-500/10' },
  recent: { dot: 'bg-green-500', icon: 'text-green-500', tint: 'bg-green-500/10' },
  short: { dot: 'bg-green-400', icon: 'text-green-400', tint: 'bg-green-400/5' },
  medium: { dot: 'bg-amber-500', icon: 'text-amber-500', tint: 'bg-amber-500/10' },
  long: { dot: 'bg-red-500', icon: 'text-red-500', tint: 'bg-red-500/10' },
  dormant: { dot: 'bg-gray-400', icon: 'text-gray-400', tint: 'bg-gray-400/5' },
} as const
```

### Commands to Run

```bash
cd /Users/vaughanknight/GitHub/trex/frontend
npx tsc --noEmit  # Type check
npm run build     # Build verification
```

---

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-02-05 | T001 | insight | Color mapping uses `as const` for type-safe IdleState keys | Enables type checking when indexing by idle state | SessionItem.tsx:34-41 |
| 2026-02-05 | T005 | decision | Used opacity modifiers (/10, /5) for subtle tints | Prevents visual clutter while maintaining state visibility | Per AC-04 |
| 2026-02-05 | T007 | decision | Combined session name + idle in tooltip | Single tooltip provides complete context | SessionItem.tsx:134 |

---

## Directory Layout

```
docs/plans/007-session-idle-indicators/
└── tasks/
    └── phase-3-visual-indicators/
        ├── tasks.md
        └── execution.log.md
```
