# Dynamic Session Titles Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-05
**Spec**: [./dynamic-session-titles-spec.md](./dynamic-session-titles-spec.md)
**Status**: COMPLETE

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Implementation](#implementation)
4. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Terminal sessions have static names (`bash-1`, `zsh-2`) that don't reflect current activity, making it difficult to identify sessions when working with multiple terminals.

**Solution**: Wire up xterm.js's existing `onTitleChange` event to capture OSC escape sequences (sent by shells, vim, tmux) and update session names dynamically in the sidebar, while preserving user's ability to manually rename sessions.

**Expected Outcome**: Session names automatically reflect terminal title (e.g., "vim ~/.bashrc", current directory) with user renames taking precedence over automatic updates.

---

## Critical Research Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **xterm.js `onTitleChange` API ready**: Event fires on OSC 0/2 sequences, returns `IDisposable`, listener receives `string` title | Use same pattern as existing `onData` handler |
| 02 | Critical | **No `userRenamed` flag exists**: Session type has no way to track user intent vs automatic naming | Add `userRenamed: boolean` to Session interface |
| 03 | Critical | **`updateName` already exists**: Store action at `sessions.ts:68-75` uses spread pattern `{ ...session, name }` | Modify to also set `userRenamed: true` when called |
| 04 | High | **Session store NOT persisted**: Store uses basic `create()`, not `persist()` middleware | No migration needed; flag resets on refresh (acceptable) |
| 05 | High | **Event cleanup pattern established**: `useEffect` returns `disposable.dispose()` in cleanup | Follow exact pattern from `onData` handler (lines 162-185) |
| 06 | High | **Inline rename calls `updateName` directly**: `SessionItem.tsx:123-129` `handleRenameSubmit()` | This path should set `userRenamed: true` |
| 07 | High | **New sessions init in NewSessionButton**: Lines 29-35 create session with auto-generated name | Add `userRenamed: false` to initialization |
| 08 | Medium | **No Terminal component tests exist**: Testing strategy should focus on store transitions | Test `updateName` → store state, not xterm.js directly |
| 09 | Medium | **FakeWebSocket pattern available**: ADR-0004 mandates fakes over mocks | Title updates don't need WebSocket testing (store-only) |
| 10 | Medium | **`sessionId` available as required prop**: Terminal component receives it for message routing | Use directly in `onTitleChange` handler |
| 11 | Low | **Import pattern**: `useSessionStore` exported from `stores/index.ts` | Import and extract `updateName` action |
| 12 | Low | **Activity tracking exists**: `onData` calls `updateActivityDebounced(sessionId)` | Consider adding to title handler too (optional) |

---

## Implementation

**Objective**: Enable dynamic session title updates from OSC escape sequences while preserving user rename precedence.

**Testing Approach**: Lightweight (per spec)
**Mock Usage**: Targeted - no xterm.js mocking needed; test store transitions

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [x] | T001 | Add `userRenamed: boolean` to Session interface | 1 | Core | -- | `/Users/vaughanknight/GitHub/trex/frontend/src/stores/sessions.ts` | Session type includes `userRenamed` field | Line 16-22 |
| [x] | T002 | Update `updateName` action to set `userRenamed: true` | 1 | Core | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/stores/sessions.ts` | Action spreads `userRenamed: true` into session | Line 68-75 |
| [x] | T003 | Add `updateTitleFromTerminal` action (sets name only if `!userRenamed`) | 2 | Core | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/stores/sessions.ts` | New action checks flag before updating name | New action after updateName |
| [x] | T004 | Initialize `userRenamed: false` in NewSessionButton | 1 | Core | T001 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/NewSessionButton.tsx` | New sessions have `userRenamed: false` | Line 29-35 |
| [x] | T005 | Add `onTitleChange` handler to Terminal.tsx | 2 | Core | T003 | `/Users/vaughanknight/GitHub/trex/frontend/src/components/Terminal.tsx` | Handler calls `updateTitleFromTerminal`, disposable cleaned up | After line 185 |
| [x] | T006 | Handle empty title as reset to shellType pattern | 1 | Core | T003,T005 | `/Users/vaughanknight/GitHub/trex/frontend/src/stores/sessions.ts`, `/Users/vaughanknight/GitHub/trex/frontend/src/components/Terminal.tsx` | Empty title resets name to `{shellType}-{count}` and clears `userRenamed` | Per spec Q2 resolution |
| [x] | T007 | Update session store tests with `userRenamed` field | 1 | Test | T001,T002,T003 | `/Users/vaughanknight/GitHub/trex/frontend/src/stores/__tests__/sessions.test.ts` | Tests pass with new field in fixtures | Lines 67-73, 93-99, 122-142 |
| [x] | T008 | Add test for title update respecting `userRenamed` flag | 2 | Test | T003,T007 | `/Users/vaughanknight/GitHub/trex/frontend/src/stores/__tests__/sessions.test.ts` | Test proves: userRenamed=true blocks title updates | New test case |
| [~] | T009 | Manual verification with OSC sequences | 1 | Test | T005 | -- | `echo -ne '\033]0;My Title\007'` updates sidebar name | Manual test per AC-01 |

### Acceptance Criteria

- [ ] **AC-01**: Running `echo -ne '\033]0;My Title\007'` updates sidebar session name to "My Title"
- [ ] **AC-02**: Running `echo -ne '\033]2;Window Title\007'` updates sidebar session name
- [ ] **AC-03**: After user manually renames session, shell title updates do NOT override the name
- [ ] **AC-04**: New sessions start with `shellType-count` pattern until first title change
- [ ] **AC-05**: Empty title (`\033]0;\007`) resets name back to shellType pattern
- [ ] **AC-06**: Terminal input responsiveness remains under 5ms
- [ ] **AC-07**: Title change in Session 1 does not affect Session 2's name
- [ ] **AC-08**: No memory leaks from title event listeners (disposed on unmount)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Rapid title updates cause re-render storms | Low | Medium | Store updates already batched by Zustand |
| Long titles overflow sidebar | Low | Low | CSS truncation already in place |
| Shell-specific title formats vary | Low | Low | Pass through as-is; user can rename |

---

## Implementation Details

### T001-T002: Session Type and updateName Changes

```typescript
// sessions.ts - Updated Session interface
export interface Session {
  id: string
  name: string
  shellType: string
  status: SessionStatus
  createdAt: number
  userRenamed: boolean  // NEW: Track if user manually renamed
}

// sessions.ts - Updated updateName action (for user renames)
updateName: (id, name) =>
  set((state) => {
    const session = state.sessions.get(id)
    if (!session) return state
    const newMap = new Map(state.sessions)
    newMap.set(id, { ...session, name, userRenamed: true })  // Always mark as user-renamed
    return { sessions: newMap }
  }),
```

### T003: New updateTitleFromTerminal Action

```typescript
// sessions.ts - New action for automatic title updates
updateTitleFromTerminal: (id, title) =>
  set((state) => {
    const session = state.sessions.get(id)
    if (!session) return state

    // Respect user's manual rename
    if (session.userRenamed) return state

    // Handle empty title as reset
    if (!title.trim()) {
      // Reset to shellType pattern (would need counter, simplify to just shellType)
      const newMap = new Map(state.sessions)
      newMap.set(id, { ...session, name: session.shellType })
      return { sessions: newMap }
    }

    const newMap = new Map(state.sessions)
    newMap.set(id, { ...session, name: title })
    return { sessions: newMap }
  }),
```

### T005: Terminal.tsx onTitleChange Handler

```typescript
// Terminal.tsx - After the onData useEffect (after line 185)

// Get the title update function
const updateTitleFromTerminal = useSessionStore((state) => state.updateTitleFromTerminal)

// Wire up terminal title change events
useEffect(() => {
  if (!xtermRef.current) return

  const disposable = xtermRef.current.onTitleChange((title) => {
    updateTitleFromTerminal(sessionId, title)
  })

  return () => {
    disposable.dispose()
  }
}, [sessionId, updateTitleFromTerminal])
```

---

## Change Footnotes Ledger

[^1]: Task T001-T003 - Session store changes for dynamic titles
  - `interface:frontend/src/stores/sessions.ts:Session`
  - `interface:frontend/src/stores/sessions.ts:SessionsActions`
  - `function:frontend/src/stores/sessions.ts:updateName`
  - `function:frontend/src/stores/sessions.ts:updateTitleFromTerminal`

[^2]: Task T004 - NewSessionButton initialization
  - `function:frontend/src/components/NewSessionButton.tsx:NewSessionButton`

[^3]: Task T005 - Terminal title change handler
  - `function:frontend/src/components/Terminal.tsx:Terminal`

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "008-dynamic-session-titles"`
- **Optional validation**: `/plan-4-complete-the-plan` (recommended for verification)
