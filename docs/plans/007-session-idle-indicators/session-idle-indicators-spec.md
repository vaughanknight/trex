# Session Idle State Indicators

**Version**: 1.0.0
**Created**: 2026-02-05
**GitHub Issue**: https://github.com/vaughanknight/trex/issues/25
**Mode**: Full

---

## Research Context

📚 This specification incorporates findings from the `/plan-1a-explore` research conducted 2026-02-05, synthesizing 65+ findings from 7 research subagents plus 20 prior learnings from plans 002 and 003.

**Components Affected**:
- `frontend/src/stores/sessions.ts` - Add `lastActivityAt` field and `updateActivity` action
- `frontend/src/components/SessionItem.tsx` - Replace binary indicator with time-based colors
- `frontend/src/components/Terminal.tsx` - Trigger activity updates on input/output
- `frontend/src/hooks/useCentralWebSocket.ts` - Trigger activity updates on message receipt

**Critical Dependencies**:
- Zustand store architecture (established in plan 003)
- WebSocket message routing with sessionId (established in plan 003)
- Selector pattern with `useShallow` to prevent re-renders (PL-14)

**Modification Risks**:
- Terminal.tsx event handlers: Must not delay input/output flow
- useCentralWebSocket.ts: Activity updates could cause cascading re-renders without proper memoization
- Infinite re-render risk from array selectors (PL-14 warning)

**Link**: Research findings available in console output from `/plan-1a-explore` session.

---

## Summary

**WHAT**: Add visual indicators to the sidebar session list that communicate how long each terminal session has been idle, using a time-based color progression from active (blue) through idle states (green → amber → red → grey).

**WHY**: In multi-session terminal workflows (especially coding), users need to quickly identify:
1. Which sessions are actively receiving output (may be running builds, tests, or awaiting input)
2. Which sessions have been idle and might be waiting for user input
3. Which sessions have been dormant long enough to consider closing
4. Overall workspace activity at a glance, even with the sidebar collapsed

---

## Goals

1. **Activity Awareness**: Users can instantly see which sessions are active vs idle without switching to them
2. **Urgency Signaling**: Color progression communicates increasing idle duration (green → amber → red → grey)
3. **Collapsed Visibility**: Idle state should be visible even when sidebar is collapsed (via button background tint)
4. **Minimal Performance Impact**: Idle tracking should not impact terminal input/output latency
5. **Accurate Tracking**: Activity timestamps reset on any user input or terminal output
6. **Independent Tracking**: Each session tracks its own idle state independently

---

## Non-Goals

1. **Activity logging or history** - Not tracking what happened, only when
2. **Auto-close idle sessions** - No automatic session termination based on idle time
3. **Notifications or alerts** - No popups, sounds, or external notifications
4. **Backend involvement** - Idle tracking is frontend-only (backend doesn't need to know idle state)
5. **Persistence of idle state** - Idle timers reset on page refresh (transient state)
6. **Animation of color transitions** - CSS transitions allowed, but no animated pulse/glow effects

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 1 | 5-6 files modified (sessions.ts, SessionItem.tsx, Terminal.tsx, useCentralWebSocket.ts, settings.ts, SettingsPanel.tsx) |
| Integration (I) | 1 | Integrates with existing settings store for threshold persistence |
| Data/State (D) | 1 | New `lastActivityAt` field, new timer interval, new computed idle state, new settings fields |
| Novelty (N) | 1 | Time-based UI updates have some gotchas (re-renders, fake timers in tests) |
| Non-Functional (F) | 1 | Performance consideration: must not impact terminal latency, debounce needed |
| Testing/Rollout (T) | 1 | Integration tests with fake timers required, multiple threshold tests |

**Total**: S(1) + I(1) + D(1) + N(1) + F(1) + T(1) = **6** → **CS-3**

**Confidence**: 0.85

**Assumptions**:
- Can debounce activity updates to 100-200ms without losing accuracy (per PL-10)
- 1-second interval for idle state recalculation is sufficient granularity
- CSS color classes for all threshold states are available in Tailwind

**Dependencies**:
- Existing Zustand session store architecture
- Existing selector pattern with `useShallow`

**Risks**:
- Re-render storms if activity updates trigger cascading store updates (mitigate with selectors)
- Timer cleanup on component unmount (mitigate with useEffect cleanup)
- Test complexity with fake timers for threshold boundaries

**Suggested Phases**:
1. **Phase 1: Activity Tracking** - Add `lastActivityAt` to Session, wire up activity updates with debouncing
2. **Phase 2: Idle State Computation** - Add interval timer, `computeIdleState()` utility, threshold logic
3. **Phase 3: Visual Indicators** - Update SessionItem with color-coded dot, icon, and background tint
4. **Phase 4: Settings Integration** - Add threshold configuration to settings store and SettingsPanel
5. **Phase 5: Documentation** - Create docs/how/idle-indicators.md

---

## Acceptance Criteria

### AC-01: Activity Timestamp Tracking
**Given** a terminal session exists
**When** the user types input OR the terminal receives output
**Then** the session's `lastActivityAt` timestamp is updated to the current time

### AC-02: Idle State Computation
**Given** a session with `lastActivityAt` timestamp
**When** the idle check interval fires (every 1 second)
**Then** the computed idle state reflects the correct threshold (lower bound inclusive, defaults shown, all configurable):
- Active (blue): idle < 5s (output in last 5 seconds)
- Recent (green): 5s <= idle < 30s
- Short (green variant): 30s <= idle < 5min
- Medium (amber): 5min <= idle < 10min
- Long (red): 10min <= idle < 60min
- Dormant (grey): idle >= 60min

Default thresholds (ms): active=5000, recent=30000, short=300000, medium=600000, long=3600000

### AC-03: Visual Indicator - Dot Color
**Given** a session in the sidebar
**When** viewing the session item
**Then** the status indicator dot displays the appropriate color:
- Blue (`bg-blue-500`) for active
- Green (`bg-green-500`) for recent/short idle
- Amber (`bg-amber-500`) for medium idle
- Red (`bg-red-500`) for long idle
- Grey (`bg-gray-400`) for dormant

### AC-04: Visual Indicator - Button Background Tint and Icon Color
**Given** a session in the sidebar (expanded or collapsed)
**When** the session has any idle state
**Then** the session button displays both:
- Background tint matching the idle state color: `bg-{color}-500/10` (10% opacity)
- Terminal icon color matching the idle state: `text-{color}-500`
- Both indicators visible in collapsed sidebar state

### AC-05: Activity Reset on User Input
**Given** a session that is in "long idle" state (red)
**When** the user types any input in that session's terminal
**Then** the idle state immediately resets to "active" (blue)

### AC-06: Activity Reset on Terminal Output
**Given** a session that is in "medium idle" state (amber)
**When** the terminal receives output from the backend
**Then** the idle state resets based on current activity

### AC-07: Independent Session Tracking
**Given** multiple sessions (session A and session B)
**When** session A receives input and session B does not
**Then** only session A's idle state is affected; session B continues its idle progression

### AC-08: Collapsed Sidebar Visibility
**Given** the sidebar is in collapsed state
**When** viewing the session icons
**Then** both idle state indicators are clearly visible:
- Terminal icon color reflects idle state
- Background tint provides additional context
- Idle state identifiable at a glance without expanding sidebar

### AC-09: Smooth Color Transitions
**Given** a session transitioning between idle states
**When** the idle state changes (e.g., from green to amber)
**Then** the color change applies with a CSS transition (200ms ease-linear)

### AC-10: Performance - No Input Latency Impact
**Given** a user typing in an active terminal session
**When** the idle tracking system is running
**Then** there is no perceptible increase in input latency (< 5ms overhead)

### AC-11: Timer Cleanup
**Given** the application is running with idle tracking active
**When** the component unmounts or sessions are cleared
**Then** all interval timers are properly cleaned up (no memory leaks)

### AC-12: Tooltip Shows Idle Duration
**Given** a session in any idle state
**When** hovering over the status indicator
**Then** the tooltip shows the approximate idle duration (e.g., "Idle: 7 minutes", "Active")

### AC-13: Configurable Thresholds in Settings
**Given** the settings panel is open
**When** viewing idle indicator settings
**Then** the user can configure thresholds for each idle state:
- Active threshold (default: 5 seconds)
- Recent idle threshold (default: 30 seconds)
- Short idle threshold (default: 5 minutes)
- Medium idle threshold (default: 10 minutes)
- Long idle threshold (default: 60 minutes)

### AC-14: Settings Persistence
**Given** the user has customized idle thresholds
**When** the page is refreshed
**Then** the custom thresholds are restored from settings storage

### AC-15: Settings Apply Immediately
**Given** the user changes an idle threshold in settings
**When** the setting is saved
**Then** the idle state computation immediately uses the new threshold (no refresh required)

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Re-render storms from frequent timestamp updates | Medium | High | Debounce activity updates to 100-200ms, use primitive selectors |
| Timer memory leaks on unmount | Low | Medium | Proper useEffect cleanup patterns |
| Fake timer complexity in tests | Medium | Low | Follow existing patterns from webglPool tests |
| Color accessibility issues | Low | Medium | Ensure sufficient contrast ratios for all colors |
| Performance impact on slow devices | Low | Medium | 1-second interval is conservative; can increase if needed |

### Assumptions

1. **Terminal output frequency** is manageable (not 1000s of messages/second sustained)
2. **Session count** stays reasonable (< 50 sessions) for iteration performance
3. **Tailwind color classes** exist for all required colors (blue, green, amber, red, gray)
4. **CSS transitions** work correctly in both browser and Electron contexts
5. **Date.now()** provides sufficient precision for idle tracking (millisecond-level)

---

## Testing Strategy

**Approach**: Hybrid (TDD for complex logic, lightweight for UI)

**Rationale**: Time-based threshold computation and timer management require thorough TDD with fake timers. UI color changes are straightforward and need only basic validation.

**Mock Usage**: Fakes only (per ADR-0004) - no mocking frameworks permitted

**Focus Areas** (TDD):
- `computeIdleState()` utility - all threshold boundaries
- Timer lifecycle (setup, cleanup, memory leaks)
- Activity update debouncing
- Multiple session independence
- Fake timer integration tests for time advancement

**Lighter Coverage**:
- SessionItem color class application (visual verification)
- CSS transition presence (snapshot or manual)
- Tooltip content formatting

**Excluded**:
- E2E browser tests (manual verification sufficient)
- Performance benchmarking (defer unless issues arise)

**Test Infrastructure**:
- Use `vi.useFakeTimers()` for deterministic time control
- Follow existing patterns from `webglPool.test.ts`
- Create `FakeActivityTracker` if needed for isolation

---

## Documentation Strategy

**Location**: docs/how/ only

**Rationale**: Feature is self-explanatory to end users (colors appear automatically). Developer-focused documentation explains thresholds, implementation patterns, and maintenance considerations.

**Deliverable**: `docs/how/idle-indicators.md`

**Content**:
- Overview of idle state system
- Threshold definitions with rationale
- Architecture (where activity is tracked, how idle state is computed)
- Debugging tips (how to verify idle tracking is working)
- API reference for `computeIdleState()` utility

**Target Audience**: Developers maintaining or extending the idle indicator system

**Maintenance**: Update when thresholds change or new idle states are added

---

## Open Questions

1. ~~**Q1: Active state detection**~~ - RESOLVED: Active (blue) = terminal output received in last 5 seconds (configurable)

2. ~~**Q2: Threshold configurability**~~ - RESOLVED: All thresholds configurable in settings

3. ~~**Q3: Collapsed indicator design**~~ - RESOLVED: Both background tint AND icon color change for maximum visibility

4. ~~**Q4: Boundary behavior**~~ - RESOLVED: Lower bound inclusive. At exactly 30s, transition to next state (Short idle).

---

## ADR Seeds (Optional)

### Decision Drivers
- Performance: Must not impact terminal input latency
- Simplicity: Prefer CSS-only solutions over JavaScript animations
- Accessibility: Colors should have sufficient contrast
- Consistency: Follow existing Zustand patterns from session store

### Candidate Alternatives
- **A: Store-based idle state** - Add `idleState` field to Session, computed on timer
- **B: Selector-computed idle state** - Keep `lastActivityAt` only, compute idle state in selector
- **C: Separate idle store** - New Zustand store just for idle tracking (isolates re-renders)

### Stakeholders
- Users: Primary beneficiaries of visual feedback
- Developers: Must maintain performance and test coverage

---

## External Research Opportunities

Two external research opportunities were identified during `/plan-1a-explore`:

### Opportunity 1: xterm.js Activity Detection Best Practices
**Status**: Not yet researched
**Topic**: What xterm.js events/callbacks are available beyond `onData()` for tracking activity?
**Impact**: Could improve activity detection accuracy

### Opportunity 2: React Timer Patterns for Multi-Component State
**Status**: Not yet researched
**Topic**: Best practices for setInterval with Zustand, preventing re-render cascades
**Impact**: Could inform optimal implementation pattern

**Recommendation**: These are nice-to-have. The core implementation can proceed with known patterns from plan 002/003 prior learnings. Consider researching if performance issues arise.

---

## Next Steps

1. Run `/plan-2-clarify` to resolve open questions (Q1-Q4)
2. Run `/plan-3-architect` to generate phase-based implementation plan
3. Implement phases following established patterns

---

## Clarifications

### Session 2026-02-05

**Q1: Workflow Mode**
- **Answer**: Full (B)
- **Rationale**: CS-3 complexity with multiple files, time-based state management, and integration test requirements warrants comprehensive planning with all gates.

**Q2: Testing Strategy**
- **Answer**: Hybrid (E) with fakes-only (per ADR-0004)
- **Rationale**: TDD for complex time-based logic (threshold computation, timer management), lighter testing for straightforward UI color changes.

**Q3: Documentation Strategy**
- **Answer**: docs/how/ only (B)
- **Rationale**: Feature is self-explanatory to users. Developer documentation in docs/how/idle-indicators.md will explain thresholds and implementation for maintenance.

**Q4: Active State Definition**
- **Answer**: A (terminal output in last 5000ms) with configurable thresholds
- **Rationale**: Activity-based (not selection-based) better signals "something is happening." 5 seconds gives meaningful window. All thresholds configurable in settings for user customization.

**Q5: Collapsed Sidebar Indicators**
- **Answer**: C (both background tint + icon color)
- **Rationale**: Maximum visibility in collapsed state. Icon color change ensures idle state is obvious even at small sizes.

**Q6: Threshold Boundary Behavior**
- **Answer**: A (lower bound inclusive)
- **Rationale**: At boundary, transition to next state. Blue < 5s, Green >= 5s to < 30s, etc. Standard convention.

### Coverage Summary

| Category | Status | Details |
|----------|--------|---------|
| Workflow Mode | Resolved | Full mode (CS-3 complexity) |
| Testing Strategy | Resolved | Hybrid + fakes-only (ADR-0004) |
| Documentation Strategy | Resolved | docs/how/idle-indicators.md |
| Active State Definition | Resolved | Output in last 5s, configurable |
| Threshold Configurability | Resolved | All thresholds in settings |
| Collapsed Visibility | Resolved | Both tint + icon color |
| Boundary Behavior | Resolved | Lower bound inclusive |
| FRs/NFRs | Resolved | 15 acceptance criteria defined |
| Data Model | Resolved | `lastActivityAt` field + settings fields |
| Edge Cases | Resolved | Timer cleanup, multiple sessions |

**Deferred**: None
**Outstanding**: None

---

**Specification Complete**: 2026-02-05
**Location**: `docs/plans/007-session-idle-indicators/session-idle-indicators-spec.md`
