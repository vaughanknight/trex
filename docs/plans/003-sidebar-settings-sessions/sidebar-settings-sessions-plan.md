# Sidebar, Settings & Multi-Session Support Implementation Plan

**Plan Version**: 1.1.0
**Created**: 2026-02-04
**Spec**: [./sidebar-settings-sessions-spec.md](./sidebar-settings-sessions-spec.md)
**Status**: READY

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Foundation](#phase-1-foundation)
   - [Phase 2: Backend Multi-Session](#phase-2-backend-multi-session)
   - [Phase 3: Sidebar UI](#phase-3-sidebar-ui)
   - [Phase 4: Settings](#phase-4-settings)
   - [Phase 5: Integration](#phase-5-integration)
   - [Phase 6: Documentation](#phase-6-documentation)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [Deviation Ledger](#deviation-ledger)
10. [ADR Ledger](#adr-ledger)
11. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

### Problem Statement

trex is currently a single-terminal demo that renders one xterm.js instance connected to one PTY via one WebSocket. Users cannot create multiple terminal sessions, navigate between them, or customize terminal appearance. This limits trex to being merely an embedded terminal rather than a tmux session management tool.

### Solution Approach

- **Add Zustand state management** with 3 separate stores (UI, Settings, Sessions) for performance isolation
- **Extend WebSocket protocol** with sessionId field for multi-session message routing
- **Implement session registry** in Go backend to track and manage multiple PTY sessions
- **Build collapsible sidebar** using shadcn/ui with hover-reveal behavior for session navigation
- **Create settings page** with 12 themes, 6 bundled fonts + system detection, and font size controls
- **Fix Terminal.tsx** for multi-instance support (resizeTimeout → useRef)

### Expected Outcomes

- Users can create, switch between, and manage 5-30+ concurrent terminal sessions
- Sidebar provides visual navigation with session status indicators
- Settings persist across browser refresh via localStorage
- Terminal performance maintains <50ms input latency with multiple sessions
- Architecture establishes foundation for future features (favorites, groups, tmux integration)

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Concurrent sessions | 30+ | Count of active sessions without degradation |
| Input latency | <50ms | Round-trip time from keypress to display |
| Memory usage | 600-900 MB | 30 sessions with 3000-line scrollback |
| FPS with 20 sessions | >30 FPS | React DevTools Profiler |
| Test coverage | >80% | Backend: Go coverage, Frontend: vitest |

---

## Technical Context

### Current System State

```
frontend/src/
├── App.tsx (12 lines - renders single Terminal)
├── components/Terminal.tsx (166 lines - xterm.js, module-level resizeTimeout)
├── hooks/useTerminalSocket.ts (101 lines - single WebSocket)
└── types/terminal.ts (29 lines - no sessionId)

backend/internal/
├── server/server.go (routes: /api/health, /ws)
├── server/terminal.go (WebSocket handler, single-session)
└── terminal/
    ├── session.go (PTY↔WebSocket bridge)
    └── messages.go (no sessionId field)
```

**Key Limitations**:
- No state management (component-local only)
- Single-session protocol (no sessionId)
- Module-level `resizeTimeout` breaks multi-instance
- No frontend test infrastructure (0 tests)
- No UI components (vanilla CSS only)

### Integration Requirements

| Integration | Current | Required |
|-------------|---------|----------|
| State management | None | Zustand (3 stores) |
| UI components | None | shadcn/ui + Tailwind |
| WebSocket protocol | Single-session | sessionId in all messages |
| Backend session tracking | None | SessionManager registry |
| Frontend testing | None | vitest + @testing-library |

### Constraints and Limitations

- **WebGL context limit**: 8-16 per browser page (hybrid rendering required)
- **Memory per terminal**: ~20-34 MB with 3000-line scrollback
- **Protocol backwards compatibility**: sessionId must be optional for existing tests
- **Constitution mandate**: Fakes-only testing (ADR-0004)
- **Performance requirement**: <50ms terminal latency (constitution)

### Assumptions

1. Users have modern browsers (Chrome/Firefox/Safari recent versions)
2. Sessions are ephemeral (no persistence in baseline)
3. Desktop-first usage (mobile deferred)
4. Single-user deployment (localhost-only)

---

## Critical Research Findings

### 🚨 Critical Finding 01: Session.Run() Goroutine Deadlock Risk
**Impact**: Critical
**Sources**: [R1-01] Risk research
**Problem**: Session.Run() uses two goroutines with shared WaitGroup and dual-defer cancel pattern
**Root Cause**: Tight synchronization creates timing vulnerability with concurrent session cancellations
**Solution**: Implement state machine pattern with atomic session state tracking
**Example**:
```go
// ❌ WRONG - Dual defer cancel risk
defer s.cancel() // in both goroutines

// ✅ CORRECT - State machine control
type SessionState int32
const (
  StateRunning SessionState = iota
  StateClosing
  StateClosed
)
```
**Action Required**: Redesign session lifecycle with state machine before multi-session
**Affects Phases**: Phase 2 (Backend)

---

### 🚨 Critical Finding 02: WebGL Context Exhaustion
**Impact**: Critical
**Sources**: [R1-02, I1-06] Risk + Implementation research
**Problem**: Browser limits WebGL contexts to 8-16 per page; naive implementation fails at 17th terminal
**Root Cause**: Each xterm.js WebglAddon creates separate WebGL context
**Solution**: Hybrid rendering (WebGL for active, Canvas for others) + pause/resume API
**Example**:
```typescript
// ❌ WRONG - Creates new WebGL context per terminal
const webglAddon = new WebglAddon()
terminal.loadAddon(webglAddon)

// ✅ CORRECT - Hybrid rendering with context management
if (isActive && contextManager.canAllocate()) {
  terminal.loadAddon(new WebglAddon())
} else {
  terminal.loadAddon(new CanvasAddon())
}
```
**Action Required**: Implement RendererManager with context tracking
**Affects Phases**: Phase 3 (Sidebar), Phase 5 (Integration)

---

### 🚨 Critical Finding 03: Module-Level resizeTimeout Breaks Multi-Instance
**Impact**: Critical (blocker for multi-terminal)
**Sources**: [R1-04, I1-02] Risk + Implementation research
**Problem**: Terminal.tsx line 9 uses module-level `let resizeTimeout` shared across all instances
**Root Cause**: Single variable for all Terminal components causes resize interference
**Solution**: Move to useRef for per-instance isolation
**Example**:
```typescript
// ❌ WRONG - Shared across all Terminal instances
let resizeTimeout: ReturnType<typeof setTimeout> | null = null

// ✅ CORRECT - Per-instance isolation
const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```
**Action Required**: Fix in Phase 1 before any multi-terminal work
**Affects Phases**: Phase 1 (Foundation) - BLOCKER

---

### 🔴 High Finding 04: Protocol Missing sessionId
**Impact**: High
**Sources**: [R1-06, I1-01] Risk + Implementation research
**Problem**: ClientMessage/ServerMessage lack sessionId field for routing
**Root Cause**: Protocol designed for 1:1 WebSocket-to-Session mapping
**Solution**: Add optional sessionId and version fields (backwards compatible)
**Example**:
```go
// ❌ WRONG - No routing information
type ClientMessage struct {
  Type string `json:"type"`
  Data string `json:"data,omitempty"`
}

// ✅ CORRECT - Session routing support
type ClientMessage struct {
  SessionId string `json:"sessionId,omitempty"` // NEW
  Type      string `json:"type"`
  Data      string `json:"data,omitempty"`
}
```
**Action Required**: Extend protocol in Phase 1, update all tests
**Affects Phases**: Phase 1 (Foundation), Phase 2 (Backend)

---

### 🔴 High Finding 05: No Frontend Test Infrastructure
**Impact**: High
**Sources**: [I1-05] Implementation research
**Problem**: Zero frontend tests, no vitest/jest setup, no @testing-library
**Root Cause**: Not established in Plan 002 (deferred)
**Solution**: Setup vitest + @testing-library/react before Sidebar phase
**Action Required**: Complete in Phase 1 Foundation
**Affects Phases**: Phase 1 (Foundation) - blocks TAD workflow

---

### 🔴 High Finding 06: Session Registry Race Conditions
**Impact**: High
**Sources**: [R1-07, I1-04] Risk + Implementation research
**Problem**: Go maps not safe for concurrent reads+writes; multi-session needs registry
**Root Cause**: No current session tracking mechanism
**Solution**: Mutex-protected SessionRegistry with sync.RWMutex
**Example**:
```go
// ❌ WRONG - Race condition
var sessions = make(map[string]*Session)

// ✅ CORRECT - Thread-safe registry
type SessionRegistry struct {
  mu       sync.RWMutex
  sessions map[string]*Session
}
```
**Action Required**: Implement in Phase 2 with `-race` flag testing
**Affects Phases**: Phase 2 (Backend)

---

### 🔴 High Finding 07: Cascading Re-Renders at 100+ msg/sec
**Impact**: High
**Sources**: [R1-08, I1-03] Risk + Implementation research
**Problem**: Context API causes 350ms re-render vs 35ms with Zustand selectors
**Root Cause**: Context propagates all state updates to all consumers
**Solution**: Zustand with selector pattern + output batching (50-100ms)
**Example**:
```typescript
// ❌ WRONG - All sessions re-render on any update
const { sessions } = useContext(SessionContext)

// ✅ CORRECT - Only THIS session re-renders
const session = useSessionStore(state => state.sessions[sessionId])
```
**Action Required**: Design Zustand stores in Phase 1
**Affects Phases**: Phase 1 (Foundation), Phase 3 (Sidebar)

---

### 🔴 High Finding 08: WebSocket Upgrade Error Path Cleanup
**Impact**: High
**Sources**: [R1-05] Risk research
**Problem**: PTY can leak if conn.WriteMessage panics before session.Stop() defer
**Root Cause**: Error handling split between multiple cleanup points
**Solution**: Consolidate with deferred cleanup at handler entry
**Action Required**: Refactor handleTerminal in Phase 2
**Affects Phases**: Phase 2 (Backend)

---

## Testing Philosophy

### Testing Approach
**Selected Approach**: Hybrid (TDD + TAD) per spec

**Rationale**: Mixed complexity - backend extends proven patterns (TDD), frontend establishes new test infrastructure (TAD for documentation value).

### Backend: Test-Driven Development (TDD)

Per constitution and existing 19-test suite:
- Write tests FIRST (RED) - Test files before implementation
- Implement minimal code (GREEN) - Pass tests, nothing more
- Refactor for quality (REFACTOR) - Clean up while tests pass

**Focus Areas**:
- Session registry (SessionManager)
- Multi-session WebSocket handling
- Protocol extensions (sessionId)
- REST endpoints (/api/sessions)

### Frontend: Test-Assisted Development (TAD)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#### ⚠️ TEST EXECUTION REQUIREMENT (MANDATORY FOR TAD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**TAD is not possible without executing tests repeatedly.**

Implementers MUST:
- **RUN** scratch tests after writing them (RED phase)
- **RUN** tests after each code change (GREEN phase)
- **RUN** tests after refactoring (verification)
- Provide test execution output as evidence
- Demonstrate 10-20+ RED→GREEN cycles per feature

```bash
# Frontend test execution
npm run test -- --watch
npx vitest run src/stores/__tests__/
```

**Success criteria must include**: "Test runner output shows X RED→GREEN cycles"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Tests are executable documentation optimized for developer comprehension
- **Scratch → RUN → Promote workflow**:
  1. Write probe tests in tests/scratch/ to explore/iterate
  2. **🔴🟢 RUN scratch tests repeatedly** (RED→GREEN cycle)
  3. When behavior stabilizes, promote 1-2 tests (~5-10% promotion rate)
  4. Add Test Doc comment block to promoted tests
  5. Delete scratch probes that don't add durable value (90-95%)

**Test Doc comment block** (required for every promoted test):
```typescript
/*
Test Doc:
- Why: <business/bug/regression reason>
- Contract: <invariant this test asserts>
- Usage Notes: <how to use the code, gotchas>
- Quality Contribution: <what failure this catches>
- Worked Example: <inputs/outputs summary>
*/
```

### Mock Policy: FAKES ONLY
Per constitution ADR-0004:
- Backend: Extend FakePTY, FakeWebSocket patterns
- Frontend: Create FakeWebSocket, FakeStorage
- No mocking frameworks permitted

---

## Implementation Phases

### Phase 1: Foundation

**Objective**: Establish architectural foundations - state management, protocol extension, frontend testing, and critical bug fixes.

**Testing Approach**: TDD for protocol, TAD for Zustand stores

**Deliverables**:
- Zustand stores (UI, Settings, Sessions)
- Protocol extension with sessionId
- Frontend test infrastructure (vitest)
- Terminal.tsx resizeTimeout fix
- Tailwind + shadcn/ui setup

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Protocol breaking tests | High | Medium | Backwards-compatible sessionId (optional) |
| Tailwind conflicts with existing CSS | Low | Low | CSS reset, scoped styles |
| vitest setup friction | Medium | Low | Use Vite-native configuration |

#### Tasks (Hybrid: TDD Protocol + TAD Stores)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write tests for sessionId and shellType in ClientMessage/ServerMessage | 2 | Tests verify: marshal/unmarshal with sessionId+shellType, backwards compat without them | - | TDD: backend/internal/terminal/messages_test.go |
| 1.2 | [ ] | Extend protocol: add sessionId and shellType to messages.go | 1 | Tests from 1.1 pass, existing 8 tests still pass; shellType extracted from shell path (e.g., /bin/zsh → zsh) | - | Add optional sessionId + shellType fields |
| 1.3 | [ ] | Update types/terminal.ts with sessionId and shellType | 1 | TypeScript types match Go structs | - | frontend/src/types/terminal.ts |
| 1.4 | [ ] | Fix Terminal.tsx: move resizeTimeout to useRef | 2 | Module-level variable removed, multi-instance resize works | - | BLOCKER for Phase 2+ |
| 1.5 | [ ] | Setup vitest + @testing-library/react | 2 | `npm run test` works, template test passes | - | Create frontend/vitest.config.ts |
| 1.6 | [ ] | Create FakeWebSocket for frontend tests | 2 | Deterministic WebSocket fake for store tests | - | frontend/src/test/fakeWebSocket.ts |
| 1.7 | [ ] | Create FakeStorage for localStorage tests | 1 | Deterministic localStorage fake for settings tests | - | frontend/src/test/fakeStorage.ts |
| 1.8 | [ ] | TAD scratch: Zustand store exploration | 2 | 10+ scratch tests with RED→GREEN evidence; verify: `ls frontend/src/stores/__tests__/scratch/*.test.ts \| wc -l` >= 10 | - | TAD: frontend/src/stores/__tests__/scratch/ |
| 1.9 | [ ] | Implement useUIStore with partial persist | 2 | activeSessionId (not persisted), sidebarCollapsed (persisted), sidebarPinned (persisted), settingsPanelOpen (not persisted); use Zustand persist with partialize | - | frontend/src/stores/ui.ts |
| 1.10 | [ ] | Implement useSettingsStore with persist | 2 | theme, fontSize, fontFamily, autoOpenTerminal (default: false), persists to localStorage | - | frontend/src/stores/settings.ts |
| 1.11 | [ ] | Implement useSessionStore | 3 | sessions map, addSession, removeSession, updateStatus | - | frontend/src/stores/sessions.ts |
| 1.12 | [ ] | Promote valuable store tests to frontend/src/stores/__tests__/ | 2 | 2-3 tests with Test Doc blocks, ~5-10% promotion rate | - | TAD promotion step |
| 1.13 | [ ] | Install Tailwind CSS | 2 | Tailwind directives in index.css, build works | - | npm install tailwindcss postcss autoprefixer |
| 1.14 | [ ] | Configure TypeScript path aliases | 1 | @/* aliases work in imports | - | tsconfig.json + vite.config.ts |
| 1.15 | [ ] | Initialize shadcn/ui | 2 | `npx shadcn@latest init` complete, components folder exists | - | Select: Neutral base color, CSS variables |
| 1.16 | [ ] | Verify all existing backend tests pass | 1 | `go test ./...` shows 19 tests pass | - | Regression check |

#### Test Examples

```go
// backend/internal/terminal/messages_test.go
func TestClientMessage_WithSessionId(t *testing.T) {
    /*
    Test Doc:
    - Why: Multi-session support requires sessionId routing
    - Contract: sessionId field marshals/unmarshals correctly
    - Usage Notes: sessionId is optional for backwards compatibility
    - Quality Contribution: Prevents routing failures in multi-session
    - Worked Example: {sessionId: "abc", type: "input"} → JSON → parse → sessionId="abc"
    */
    msg := ClientMessage{
        SessionId: "session-123",
        Type:      MsgTypeInput,
        Data:      "hello",
    }

    data, err := json.Marshal(msg)
    require.NoError(t, err)

    var parsed ClientMessage
    require.NoError(t, json.Unmarshal(data, &parsed))
    assert.Equal(t, "session-123", parsed.SessionId)
}

func TestServerMessage_WithShellType(t *testing.T) {
    /*
    Test Doc:
    - Why: Session naming requires shell type ("bash-1", "zsh-2")
    - Contract: shellType field marshals/unmarshals correctly
    - Usage Notes: shellType extracted from path (e.g., /bin/zsh → zsh)
    - Quality Contribution: Enables accurate session naming in sidebar
    - Worked Example: {shellType: "zsh", sessionId: "abc"} → JSON → parse → shellType="zsh"
    */
    msg := ServerMessage{
        SessionId: "session-123",
        ShellType: "zsh",
        Type:      MsgTypeOutput,
        Data:      "welcome",
    }

    data, err := json.Marshal(msg)
    require.NoError(t, err)

    var parsed ServerMessage
    require.NoError(t, json.Unmarshal(data, &parsed))
    assert.Equal(t, "zsh", parsed.ShellType)
}

func TestClientMessage_BackwardsCompatible(t *testing.T) {
    // Old message format without sessionId still works
    oldFormat := `{"type":"input","data":"hello"}`

    var msg ClientMessage
    require.NoError(t, json.Unmarshal([]byte(oldFormat), &msg))
    assert.Equal(t, "", msg.SessionId) // Empty, not error
    assert.Equal(t, "hello", msg.Data)
}
```

```typescript
// frontend/src/stores/__tests__/settings.test.ts
/*
Test Doc:
- Why: Settings must persist across browser refresh
- Contract: useSettingsStore persists to localStorage on change
- Usage Notes: Uses 'trex-settings' localStorage key
- Quality Contribution: Prevents settings loss on refresh
- Worked Example: setTheme('dracula') → refresh → theme === 'dracula'
*/
it('should persist settings to localStorage', () => {
  const { result } = renderHook(() => useSettingsStore())

  act(() => {
    result.current.setTheme('dracula')
  })

  const stored = JSON.parse(localStorage.getItem('trex-settings') || '{}')
  expect(stored.state.theme).toBe('dracula')
})
```

#### Verification Commands

```bash
# Backend protocol tests
cd backend && go test -v ./internal/terminal/... -run TestClientMessage

# Frontend tests
cd frontend && npm run test

# Build verification
cd frontend && npm run build

# Backend regression check
cd backend && go test ./...
```

#### Acceptance Criteria
- [ ] Protocol: sessionId in ClientMessage/ServerMessage (backwards compatible)
- [ ] Terminal.tsx: resizeTimeout moved to useRef
- [ ] Zustand: 3 stores created (UI, Settings, Sessions)
- [ ] vitest: `npm run test` works, 3+ promoted tests
- [ ] Tailwind + shadcn: initialized, build succeeds
- [ ] All 19 existing backend tests pass

---

### Phase 2: Backend Multi-Session

**Objective**: Implement session registry, multi-session WebSocket handling, and REST API endpoints.

**Testing Approach**: TDD (extends existing Go test patterns)

**Deliverables**:
- SessionManager registry with mutex protection
- REST endpoints: GET/DELETE /api/sessions
- Multi-session WebSocket message routing
- Session lifecycle management (create, close, list)

**Dependencies**: Phase 1 complete (protocol extension)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Goroutine deadlock (R1-01) | Medium | Critical | State machine pattern, timeout tests |
| Race conditions (R1-07) | Medium | High | sync.RWMutex, `go test -race` |
| PTY leak on error (R1-05) | Medium | High | Deferred cleanup pattern |

#### Tasks (TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests for SessionRegistry | 3 | Tests: Add, Get, Delete, List, concurrent ops | - | TDD first |
| 2.2 | [ ] | Implement SessionRegistry with mutex | 3 | All tests from 2.1 pass, `-race` clean | - | backend/internal/terminal/manager.go |
| 2.3 | [ ] | Write tests for atomic session ID generation | 1 | IDs unique across concurrent calls | - | Atomic counter pattern |
| 2.4 | [ ] | Write tests for session lifecycle states | 2 | StateRunning → StateClosing → StateClosed | - | State machine for R1-01 |
| 2.5 | [ ] | Implement session state machine | 2 | Clean shutdown without deadlock | - | Addresses R1-01 |
| 2.6 | [ ] | Write tests for GET /api/sessions | 2 | Returns session list with metadata | - | TDD first |
| 2.7 | [ ] | Implement GET /api/sessions endpoint | 2 | Tests from 2.6 pass | - | backend/internal/server/sessions.go |
| 2.8 | [ ] | Write tests for DELETE /api/sessions/:id | 2 | Session closed, removed from registry | - | TDD first |
| 2.9 | [ ] | Implement DELETE /api/sessions/:id | 2 | Tests from 2.8 pass | - | Clean PTY/WebSocket cleanup |
| 2.10 | [ ] | Write tests for sessionId message routing | 3 | Messages routed to correct session | - | TDD first |
| 2.11 | [ ] | Implement sessionId routing in WebSocket handler | 3 | Tests from 2.10 pass | - | handleTerminal updates |
| 2.12 | [ ] | Refactor handleTerminal error cleanup | 2 | Deferred cleanup at handler entry | - | Addresses R1-05 |
| 2.13 | [ ] | Write integration test: 10 concurrent sessions | 3 | Create/close 10 sessions, no leaks | - | Integration test |
| 2.14 | [ ] | Run `go test -race ./...` | 1 | Zero race conditions | - | Safety gate |

#### Test Examples

```go
// backend/internal/terminal/manager_test.go
func TestSessionRegistry_ConcurrentOperations(t *testing.T) {
    /*
    Test Doc:
    - Why: Multi-session requires thread-safe registry access
    - Contract: Concurrent Add/Get/Delete don't race
    - Usage Notes: Use RLock for reads, Lock for writes
    - Quality Contribution: Prevents data corruption with 30+ sessions
    - Worked Example: 10 goroutines × 100 ops = no races
    */
    registry := NewSessionRegistry()
    var wg sync.WaitGroup

    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func(index int) {
            defer wg.Done()
            for j := 0; j < 100; j++ {
                id := fmt.Sprintf("session-%d-%d", index, j)
                _ = registry.Add(id, &Session{ID: id})
                _ = registry.Get(id)
                if j%5 == 0 {
                    _ = registry.Delete(id)
                }
            }
        }(i)
    }

    wg.Wait()
    // Test passes if no race detected with -race flag
}

func TestSessionRegistry_List(t *testing.T) {
    registry := NewSessionRegistry()
    registry.Add("session-1", &Session{ID: "session-1", Name: "bash-1"})
    registry.Add("session-2", &Session{ID: "session-2", Name: "zsh-1"})

    sessions := registry.List()

    assert.Len(t, sessions, 2)
    names := []string{sessions[0].Name, sessions[1].Name}
    assert.Contains(t, names, "bash-1")
    assert.Contains(t, names, "zsh-1")
}
```

#### Verification Commands

```bash
# Run all backend tests with race detection
cd backend && go test -race -v ./...

# Run specific registry tests
cd backend && go test -v ./internal/terminal/... -run TestSessionRegistry

# Run API endpoint tests
cd backend && go test -v ./internal/server/... -run TestSessions

# Memory leak detection (integration test)
cd backend && go test -v -count=1 ./internal/terminal/... -run TestConcurrentSessions

# Coverage report
cd backend && go test -coverprofile=coverage.out ./... && go tool cover -html=coverage.out
```

#### Acceptance Criteria
- [ ] SessionRegistry: Add, Get, Delete, List work correctly
- [ ] Race conditions: `go test -race ./...` passes
- [ ] REST API: GET /api/sessions returns session list
- [ ] REST API: DELETE /api/sessions/:id closes session
- [ ] WebSocket: Messages routed by sessionId
- [ ] Integration: 10 concurrent sessions work without leaks

---

### Phase 3: Sidebar UI

**Objective**: Build collapsible sidebar with session list, new session button, and context menu.

**Testing Approach**: TAD (new component patterns, tests as documentation)

**Deliverables**:
- Sidebar component with icon collapse mode
- SessionList component with status indicators
- Session context menu (Rename, Close)
- New Session button
- Sidebar hover/pin behavior

**Dependencies**: Phase 1 (Zustand stores, shadcn), Phase 2 (backend registry)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WebGL context exhaustion | Medium | Critical | Defer live previews, use pause/resume |
| Re-render performance | Medium | High | Selector pattern verified |
| shadcn sidebar customization | Low | Medium | Follow docs, use floating variant |

#### Tasks (TAD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Install shadcn sidebar component | 1 | `npx shadcn@latest add sidebar` succeeds | - | Dependencies resolved |
| 3.2 | [ ] | Install shadcn supporting components | 1 | tooltip, button, badge, collapsible, sheet added | - | For session items + settings panel |
| 3.3 | [ ] | Install shadcn context-menu | 1 | Context menu component available | - | For right-click menu |
| 3.4 | [ ] | TAD scratch: Sidebar layout exploration | 2 | 5+ scratch tests with RED→GREEN evidence; verify: `ls tests/scratch/sidebar/*.test.tsx \| wc -l` >= 5 | - | tests/scratch/sidebar/ |
| 3.5 | [ ] | Implement SessionSidebar component | 3 | Sidebar with floating variant, icon collapsible | - | frontend/src/components/SessionSidebar.tsx |
| 3.6 | [ ] | Implement SessionList component | 3 | Maps sessions from store, shows status | - | frontend/src/components/SessionList.tsx |
| 3.7 | [ ] | Implement SessionItem component | 2 | Name, status indicator, X button on hover | - | frontend/src/components/SessionItem.tsx |
| 3.8 | [ ] | Implement SessionContextMenu | 2 | Right-click → Rename, Close options | - | Uses shadcn context-menu |
| 3.9 | [ ] | Implement inline rename editing | 2 | Click Rename → editable input → Enter/Escape | - | Controlled input pattern |
| 3.10 | [ ] | Implement NewSessionButton | 2 | Calls POST /api/sessions, adds to store | - | In sidebar header |
| 3.11 | [ ] | Implement sidebar hover/pin toggle | 2 | Hover expands (300ms collapse), click pins | - | AC-06 behavior |
| 3.12 | [ ] | Wire sidebar to useUIStore | 2 | activeSessionId, sidebarCollapsed, sidebarPinned | - | Store integration |
| 3.13 | [ ] | Wire sidebar to useSessionStore | 2 | Sessions list, click selects session | - | Selector pattern |
| 3.14 | [ ] | Promote valuable sidebar tests | 2 | 2-3 tests with Test Doc blocks | - | TAD promotion |
| 3.15 | [ ] | Update App.tsx with SidebarProvider layout | 2 | Sidebar + main content layout | - | Uses SidebarProvider context |

#### Test Examples

```typescript
// frontend/src/components/__tests__/SessionList.test.tsx
/*
Test Doc:
- Why: Session list is primary navigation for multi-session
- Contract: Clicking session updates activeSessionId in store
- Usage Notes: Uses selector pattern to prevent re-renders
- Quality Contribution: Prevents broken session switching
- Worked Example: click "bash-1" → activeSessionId === "session-1"
*/
it('should set active session on click', async () => {
  // Setup store with 2 sessions
  useSessionStore.setState({
    sessions: {
      'session-1': { id: 'session-1', name: 'bash-1', status: 'connected' },
      'session-2': { id: 'session-2', name: 'zsh-1', status: 'connected' },
    }
  })

  render(<SessionList />)

  await userEvent.click(screen.getByText('bash-1'))

  expect(useUIStore.getState().activeSessionId).toBe('session-1')
})
```

#### Verification Commands

```bash
# Frontend component tests
cd frontend && npm run test -- --run

# Run specific sidebar tests
cd frontend && npx vitest run src/components/__tests__/SessionList.test.tsx
cd frontend && npx vitest run src/components/__tests__/SessionSidebar.test.tsx

# Build verification
cd frontend && npm run build

# Type checking
cd frontend && npx tsc --noEmit
```

#### Acceptance Criteria
- [ ] Sidebar: Collapses to ~48px icon mode (AC-05)
- [ ] Sidebar: Expands on hover with 300ms collapse delay (AC-06)
- [ ] Sidebar: Click pins/unpins expanded state (AC-06)
- [ ] Sidebar: Floats over terminal content (AC-07)
- [ ] Sessions: List shows name, status indicator (AC-04)
- [ ] Sessions: X button closes session (AC-03)
- [ ] Sessions: Right-click context menu works (AC-04b)
- [ ] Sessions: Rename via context menu (AC-04a)
- [ ] New Session: Button creates new session (AC-01)
- [ ] Session switch: Click changes active session (AC-02)

---

### Phase 4: Settings

**Objective**: Build settings page with theme, font, and font size controls.

**Testing Approach**: TAD (form behavior, persistence)

**Deliverables**:
- Settings panel/page accessible from sidebar
- Theme selector (12 themes)
- Font family selector (6 bundled + 3 fallback + system detection)
- Font size slider (8-24px)
- Real-time terminal preview updates
- localStorage persistence

**Dependencies**: Phase 1 (Settings store, Tailwind, shadcn)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Font detection API availability | Medium | Low | Fallback to curated list |
| Theme application to xterm | Low | Medium | Use xterm.js ITheme interface |
| Bundle size (web fonts) | Low | Medium | Lazy load fonts, ~400KB total |

#### Tasks (TAD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Install shadcn form components | 1 | tabs, card, select, slider added | - | For settings UI |
| 4.2 | [ ] | Create theme definitions (12 themes) | 2 | ITheme objects for all themes | - | frontend/src/themes/index.ts |
| 4.3 | [ ] | Bundle web fonts (6 fonts) | 2 | Fira Code, JetBrains Mono, Source Code Pro, Hack, IBM Plex Mono, Cascadia Code | - | `npm install @fontsource/fira-code @fontsource/jetbrains-mono @fontsource/source-code-pro @fontsource/hack @fontsource/ibm-plex-mono @fontsource/cascadia-code` |
| 4.4 | [ ] | Implement font detection utility | 2 | Detects installed monospace fonts | - | Local Font Access API + fallback |
| 4.5 | [ ] | TAD scratch: Settings form exploration | 2 | 5+ scratch tests with RED→GREEN evidence; verify: `ls tests/scratch/settings/*.test.tsx \| wc -l` >= 5 | - | tests/scratch/settings/ |
| 4.6 | [ ] | Implement SettingsPanel component | 3 | Tabs: Appearance (theme, font, size) | - | frontend/src/components/SettingsPanel.tsx |
| 4.7 | [ ] | Implement ThemeSelector | 2 | Select with 12 theme options | - | Preview colors in dropdown |
| 4.8 | [ ] | Implement FontSelector | 2 | Select with bundled + system fonts | - | Groups: Bundled, System, Fallback |
| 4.9 | [ ] | Implement FontSizeSlider | 2 | Slider 8-24px with live update | - | Shows current value |
| 4.10 | [ ] | Wire SettingsPanel to useSettingsStore | 2 | Changes update store immediately | - | Real-time persistence |
| 4.11 | [ ] | Implement useTerminalTheme hook | 2 | Applies theme/font/size to xterm instance; include onRehydrateStorage callback to prevent flash for non-default theme users | - | Uses terminal.options |
| 4.12 | [ ] | Add settings icon to sidebar footer | 1 | Gear icon opens settings Sheet (slides from left, overlays terminal); uses settingsPanelOpen in useUIStore | - | SidebarFooter placement, shadcn Sheet |
| 4.13 | [ ] | Promote valuable settings tests | 2 | 2-3 tests with Test Doc blocks | - | TAD promotion |
| 4.14 | [ ] | Verify settings persist across refresh | 1 | Change theme, refresh, theme persists | - | AC-09 verification |

#### Test Examples

```typescript
// frontend/src/components/__tests__/SettingsPanel.test.tsx
/*
Test Doc:
- Why: Theme changes must apply immediately to terminal
- Contract: Selecting theme updates store and terminal options
- Usage Notes: Theme is applied via terminal.options.theme
- Quality Contribution: Prevents theme application failures
- Worked Example: select "dracula" → terminal.options.theme === draculaTheme
*/
it('should apply theme to terminal immediately', async () => {
  const mockTerminal = { options: { theme: {} } }

  render(
    <SettingsPanel terminalRef={{ current: mockTerminal }} />
  )

  await userEvent.click(screen.getByRole('combobox', { name: /theme/i }))
  await userEvent.click(screen.getByText('Dracula'))

  expect(useSettingsStore.getState().theme).toBe('dracula')
  expect(mockTerminal.options.theme).toEqual(draculaTheme)
})
```

#### Verification Commands

```bash
# Frontend component tests
cd frontend && npm run test -- --run

# Run specific settings tests
cd frontend && npx vitest run src/components/__tests__/SettingsPanel.test.tsx

# Build verification (includes font bundles)
cd frontend && npm run build

# Verify localStorage persistence (manual)
# 1. Open app, change theme
# 2. Check DevTools > Application > Local Storage > trex-settings
# 3. Refresh page, verify theme persists
```

#### Acceptance Criteria
- [ ] Settings: Accessible via sidebar footer icon (AC-08)
- [ ] Theme: 12 options available (AC-09)
- [ ] Theme: Changes apply immediately (AC-09)
- [ ] Theme: Persists after refresh (AC-09)
- [ ] Font: 6 bundled + 3 fallback + system fonts (AC-10)
- [ ] Font: Changes apply immediately (AC-10)
- [ ] Font: Persists after refresh (AC-10)
- [ ] Size: 8-24px range slider (AC-11)
- [ ] Size: Changes apply immediately (AC-11)
- [ ] Size: Persists after refresh (AC-11)

---

### Phase 5: Integration

**Objective**: Wire all components together, implement session switching, pause/resume rendering.

**Testing Approach**: Integration tests, manual verification

**Deliverables**:
- Full session switching flow
- Pause/resume renderer on session switch
- Terminal multi-instance support
- useCentralWebSocket hook
- End-to-end multi-session workflow

**Dependencies**: All previous phases

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Memory leak on session switch | Medium | High | Proper disposal, monitoring |
| Latency regression | Medium | High | Measure, optimize active session |
| Integration bugs | Medium | Medium | E2E testing, manual verification |

#### Tasks (Integration)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.0 | [ ] | Implement empty state for no-sessions startup | 2 | Show "No sessions - click New Session" when sessions empty; check autoOpenTerminal setting | - | Addresses first-session bootstrap |
| 5.1 | [ ] | Implement useCentralWebSocket hook | 3 | Single WebSocket, routes by sessionId; connects LAZILY on first session creation (not on app mount) | - | Replaces useTerminalSocket |
| 5.2 | [ ] | Implement useTerminalPauseResume hook | 2 | Pauses RENDERER only (not output processing); xterm.write() continues for all sessions; enables future idle detection and state inspection | - | For R1-02 mitigation |
| 5.2a | [ ] | Implement preemptive WebGL renderer strategy | 2 | Active + last 2-3 sessions get WebGL (LRU); older sessions get Canvas; handle context loss → Canvas fallback | - | For R1-02 WebGL context limits |
| 5.3 | [ ] | Refactor Terminal to accept sessionId prop | 2 | Terminal isolated per session | - | Multi-instance ready |
| 5.4 | [ ] | Implement TerminalContainer wrapper | 2 | Handles visibility + pause/resume | - | Addresses R1-03 |
| 5.5 | [ ] | Wire session switching flow | 3 | Click sidebar → pause old → show new → resume | - | Full flow |
| 5.6 | [ ] | Implement session close cleanup | 2 | Dispose terminal, remove from store | - | No memory leaks |
| 5.7 | [ ] | Add output batching (50-100ms) | 2 | High-frequency output doesn't lag UI | - | R1-08 mitigation |
| 5.8 | [ ] | Verify <50ms input latency | 2 | Performance test with 5+ sessions; measure via Chrome DevTools Performance tab or `console.time('input')/timeEnd('input')` in handleInput | - | AC-12 |
| 5.9 | [ ] | Verify inactive sessions don't use GPU | 2 | pauseRenderer called; verify via Chrome DevTools Task Manager (GPU process memory stable) or `chrome://gpu` | - | AC-13 |
| 5.10 | [ ] | Integration test: create 5 sessions, switch, close | 3 | Full workflow works | - | E2E test |
| 5.11 | [ ] | Manual test: vim/nano in multi-session | 1 | Full-screen apps work correctly | - | Manual verification |
| 5.12 | [ ] | Manual test: rapid session switching | 1 | No glitches, smooth transitions | - | UX verification |

#### Verification Commands

```bash
# Full test suite
cd backend && go test -race ./...
cd frontend && npm run test -- --run

# Build both
cd frontend && npm run build

# Performance measurement (manual)
# 1. Open app with 5+ sessions
# 2. Open Chrome DevTools > Performance tab
# 3. Type in active terminal, measure input→display time
# 4. Target: <50ms round-trip

# GPU memory verification (manual)
# 1. Open Chrome DevTools > More Tools > Task Manager
# 2. Note GPU Process memory with 1 session
# 3. Create 5 sessions, switch away from 4
# 4. Verify GPU memory stable (not 5x baseline)

# Integration test (manual checklist)
# [ ] Create 5 sessions via sidebar button
# [ ] Switch between sessions - verify content preserved
# [ ] Close session via X button
# [ ] Run vim in one session, verify works
# [ ] Rapid switch between sessions (10x) - no glitches
```

#### Acceptance Criteria
- [ ] Startup: Empty state shown when no sessions exist (AC-11a)
- [ ] Startup: autoOpenTerminal setting respected (AC-11a)
- [ ] Multi-session: Create 5+ sessions (AC-01)
- [ ] Switching: Click changes visible terminal (AC-02)
- [ ] Switching: Previous session preserved (AC-02)
- [ ] Performance: <50ms latency with 5+ sessions (AC-12)
- [ ] Performance: Inactive sessions paused (AC-13)
- [ ] Protocol: sessionId in all messages (AC-14)
- [ ] Isolation: Sessions have independent PTYs (AC-15)

---

### Phase 6: Documentation

**Objective**: Document architecture and usage following hybrid documentation strategy.

**Testing Approach**: Review (documentation accuracy)

**Deliverables**:
- README.md updates (multi-session usage)
- docs/how/state-management.md (Zustand patterns)
- docs/how/component-patterns.md (shadcn conventions)
- docs/how/protocol.md (WebSocket message format)

**Dependencies**: All implementation phases

#### Discovery & Placement Decision

**Existing docs/how/ structure**:
```
docs/how/
└── (empty - new directory)
```

**Decision**: Create new `docs/how/` files (no existing structure to integrate with)

**File strategy**: Create 3 new guide files

#### Tasks (Lightweight)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Update README.md: multi-session usage | 2 | Getting started with sessions, sidebar | - | README.md |
| 6.2 | [ ] | Create docs/how/state-management.md | 2 | Zustand patterns, 3 stores, selectors | - | docs/how/state-management.md |
| 6.3 | [ ] | Create docs/how/component-patterns.md | 2 | shadcn conventions, Terminal multi-instance, z-index escalation strategy (trust Radix defaults → Tailwind scale if issues) | - | docs/how/component-patterns.md |
| 6.4 | [ ] | Create docs/how/protocol.md | 2 | WebSocket format, sessionId routing | - | docs/how/protocol.md |
| 6.5 | [ ] | Create/update _index.yaml for docs/how/ | 1 | Agent-navigable index per ADR-0007 | - | docs/how/_index.yaml |
| 6.6 | [ ] | Review docs for accuracy | 1 | All examples work, links valid; run `npx markdown-link-check README.md docs/how/*.md` | - | Peer review |

#### Verification Commands

```bash
# Link checking
npx markdown-link-check README.md docs/how/*.md

# Verify _index.yaml structure (manual)
cat docs/how/_index.yaml  # Should list all new docs

# Code example verification (manual)
# Run each code snippet in docs to verify accuracy
```

#### Acceptance Criteria
- [ ] README: Multi-session getting started documented
- [ ] docs/how/state-management.md: Zustand patterns documented
- [ ] docs/how/component-patterns.md: shadcn patterns documented
- [ ] docs/how/protocol.md: WebSocket protocol documented
- [ ] docs/how/_index.yaml: Agent-navigable index created (ADR-0007)
- [ ] All code examples tested and working

---

## Cross-Cutting Concerns

### Security Considerations

| Concern | Approach |
|---------|----------|
| Input validation | sessionId validated before routing |
| XSS prevention | React escapes by default, no dangerouslySetInnerHTML |
| WebSocket origin | CheckOrigin restricts to localhost (existing) |
| Settings storage | localStorage only (client-side, no secrets) |

### Observability

| Aspect | Implementation |
|--------|----------------|
| Logging | Existing Go log.Printf pattern, add sessionId to messages |
| Metrics | Session count, active/inactive ratio (future) |
| Error tracking | Existing error message pattern in WebSocket |
| Performance | Console timing for latency measurement |

### Documentation

Per Documentation Strategy (Hybrid):

| Location | Content |
|----------|---------|
| README.md | Multi-session usage, getting started |
| docs/how/state-management.md | Zustand stores, selectors, persistence |
| docs/how/component-patterns.md | shadcn conventions, Terminal patterns |
| docs/how/protocol.md | WebSocket format, sessionId, message types |

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| SessionRegistry | 3 | Medium | S=1,I=1,D=0,N=0,F=1,T=0 | Thread-safe map, mutex pattern | Existing Session.writeMu pattern |
| useCentralWebSocket | 3 | Medium | S=1,I=1,D=1,N=0,F=0,T=0 | Protocol change, routing logic | Backwards-compatible sessionId |
| SessionSidebar | 3 | Medium | S=2,I=1,D=0,N=0,F=0,T=0 | New component library, state integration | shadcn docs, external research |
| Terminal multi-instance | 4 | Large | S=1,I=1,D=1,N=1,F=0,T=0 | WebGL limits, memory management | Hybrid rendering, pause/resume |
| Overall Feature | 4 | Large | S=2,I=2,D=1,N=1,F=1,T=1 | Cross-cutting, 5 phases | Phased rollout, per-phase testing |

---

## Progress Tracking

### Phase Completion Checklist
- [ ] Phase 1: Foundation - [Status: NOT STARTED]
- [ ] Phase 2: Backend Multi-Session - [Status: NOT STARTED]
- [ ] Phase 3: Sidebar UI - [Status: NOT STARTED]
- [ ] Phase 4: Settings - [Status: NOT STARTED]
- [ ] Phase 5: Integration - [Status: NOT STARTED]
- [ ] Phase 6: Documentation - [Status: NOT STARTED]

### STOP Rule
**IMPORTANT**: This plan must be validated before creating phase dossiers.

After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| Feature flags for CS-4 (constitution) | Baseline foundation doesn't benefit from flags | Feature flags add complexity to initial architecture | Phased rollout, per-phase testing, clear rollback triggers |
| XDG settings persistence (ADR-0006) | localStorage simpler for baseline, XDG for future sync | Backend settings API adds complexity | Architecture supports future backend migration |
| Scratch tests in tests/scratch/ (idioms.md) | Frontend scratch tests placed in frontend/src/stores/__tests__/scratch/ and tests/scratch/sidebar/ for co-location with code | Centralized tests/scratch/ would separate tests from implementation | Co-location aids TAD workflow; promoted tests move to standard locations |

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0001: Go Backend | ACCEPTED | Phase 2 | Backend continues Go patterns with tmax library |
| ADR-0002: Vite+React | ACCEPTED | All | Frontend foundation |
| ADR-0003: Dual Distribution | ACCEPTED | All | Multi-session works in both Web and Electron modes |
| ADR-0004: Fakes Only | ACCEPTED | All | Test doubles only, no mocks |
| ADR-0005: OpenTelemetry | ACCEPTED | Phase 2 | Logging follows existing patterns; sessionId added to log messages |
| ADR-0006: XDG Config | ACCEPTED | Phase 4 | Deferred to future; localStorage for baseline (see Deviation Ledger) |
| ADR-0007: Agent-Navigable Docs | ACCEPTED | Phase 6 | docs/how/_index.yaml required for new documentation |

### Implicit Architectural Decisions (from spec ADR seeds)

The following decisions are made implicitly by this plan based on external research. Full ADRs may be created if the implementation reveals complexity not anticipated here.

| Decision | Choice | Rationale | Phase |
|----------|--------|-----------|-------|
| State Management | Zustand | 1.1KB, selector-based isolation, persist middleware (see external-research/state-management-comparison.md) | Phase 1 |
| UI Component Library | shadcn/ui + Tailwind | Composable, dark mode, sidebar with icon collapse (see external-research/shadcn-sidebar-implementation.md) | Phase 1 |
| Multi-Terminal Rendering | Hybrid (WebGL active, Canvas others) | WebGL context limit 8-16 per page (see external-research/xterm-multiinstance-performance.md) | Phase 3, 5 |
| First Session Bootstrap | Empty state until user action | Clean mental model; foundation for workspaces/projects; autoOpenTerminal setting (default: off) for future | Phase 5 |
| WebSocket Connection Timing | Lazy (on first session creation) | Aligns with empty state; no wasted connections; simpler bootstrapping; can optimize later if needed | Phase 5 |
| Session Naming | Backend sends shellType in protocol | Enables "bash-1", "zsh-2" naming; future-proofs for escape sequences and title updates | Phase 1, 3 |
| Pause/Resume Strategy | Renderer-only pause; output continues | xterm state stays current; enables future idle detection and state inspection | Phase 5 |
| UI State Persistence | Persist sidebar state, not activeSessionId | Sidebar position is user preference; activeSessionId is ephemeral (sessions don't survive refresh) | Phase 1 |
| WebGL Renderer Strategy | Preemptive WebGL for active + 2-3 recent (LRU) | Anticipates switching; no upgrade flash; within 8-16 context limit; Canvas fallback for older/context loss | Phase 5 |
| Settings Panel Display | Sheet sliding from sidebar (shadcn Sheet) | Natural flow from sidebar; terminal visible during adjustments; slick UX; routing deferred to future | Phase 4 |
| Z-Index Strategy | Trust Radix/shadcn defaults; escalate to Tailwind scale if issues | Radix is battle-tested; xterm z-index (max 11) won't conflict with Radix (50+); YAGNI | Phase 3, 4 |

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering.

**Initial State** (before implementation begins):
```markdown
[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
...
```

---

**Plan Version**: 1.2.0
**Created**: 2026-02-04
**Validated**: 2026-02-04
**Clarified**: 2026-02-04 (10 critical insights session)
**Status**: READY

---

*Validated by `/plan-4-complete-the-plan`. Next step: Run `/plan-5-phase-tasks-and-brief` for Phase 1.*

---

## Critical Insights Discussion

**Session**: 2026-02-04
**Context**: Sidebar, Settings & Multi-Session Support Implementation Plan v1.1.0
**Analyst**: AI Clarity Agent
**Reviewer**: Development Team
**Format**: Water Cooler Conversation (10 Critical Insights)

### Insight 1: First Session Bootstrap Paradox

**Did you know**: When the app starts, there are zero sessions, but the plan doesn't address what happens on first load.

**Implications**:
- Current code auto-creates session on WebSocket connect (implicit behavior)
- Sidebar would show "bash-1" that user didn't create
- Confusing mental model for multi-session

**Options Considered**:
- Option A: Auto-create first session explicitly
- Option B: Empty state until user clicks "New Session"
- Option C: Keep implicit default session

**AI Recommendation**: Option A (explicit creation)

**Discussion Summary**: User chose Option B for cleaner mental model. Added `autoOpenTerminal` setting (default: off) for future flexibility when workspaces/projects are added.

**Decision**: Empty state on startup; autoOpenTerminal setting for future

**Action Items**:
- [x] Add autoOpenTerminal to useSettingsStore (default: false)
- [x] Add Phase 5 Task 5.0 for empty state UI

**Affects**: Phase 1, Phase 3, Phase 5

---

### Insight 2: WebSocket Connection Timing

**Did you know**: The plan says "single WebSocket, routes by sessionId" but doesn't specify WHEN it connects.

**Implications**:
- On app mount: wasted connection if no sessions created
- Lazy on first session: ~50-100ms latency on first creation
- Affects error handling and session lifecycle

**Options Considered**:
- Option A: Connect on app mount
- Option B: Connect lazily on first session creation
- Option C: Maintain per-session WebSocket (violates plan)

**AI Recommendation**: Option B (lazy connection)

**Discussion Summary**: User agreed - aligns with empty state decision, can optimize later if needed.

**Decision**: Lazy WebSocket connection on first session creation

**Action Items**:
- [x] Document lazy connection in Task 5.1

**Affects**: Phase 5

---

### Insight 3: Settings Hydration Race

**Did you know**: Zustand persist loads async, potentially causing theme flash (FOUC).

**Implications**:
- Problem doesn't exist yet (no Zustand, no themes)
- Dark defaults match 85%+ of users
- Real issue only in Phase 4 when themes added

**Options Considered**:
- Option A: Block render until hydrated
- Option B: Use onRehydrateStorage callback
- Option C: Good defaults (current approach)

**AI Recommendation**: Option C now, Option B in Phase 4

**Discussion Summary**: User agreed with pragmatic approach - solve when problem exists.

**Decision**: Dark defaults now; add hydration callback in Phase 4

**Action Items**:
- [x] Add onRehydrateStorage to Phase 4 Task 4.11

**Affects**: Phase 4

---

### Insight 4: Session Naming - Shell Type Unknown

**Did you know**: Plan specifies "bash-1", "zsh-2" naming but frontend has no way to know shell type.

**Implications**:
- Backend knows shell (os.Getenv("SHELL"))
- Protocol has no shellType field
- Frontend can't name sessions accurately

**Options Considered**:
- Option A: Backend sends shellType in protocol
- Option B: Generic names ("Session 1")
- Option C: User specifies shell at creation

**AI Recommendation**: Option A (backend sends shellType)

**Discussion Summary**: User chose Option A - need protocol extensibility for future escape sequences and title updates anyway.

**Decision**: Add shellType to protocol, bundled with sessionId extension

**Action Items**:
- [x] Update Phase 1 Tasks 1.1-1.3 to include shellType
- [x] Add test example for shellType

**Affects**: Phase 1, Phase 2, Phase 3

---

### Insight 5: Pause/Resume Timing Gap

**Did you know**: During session switching, output arriving mid-transition could be lost or cause stale display.

**Implications**:
- Current architecture has zero buffering
- xterm.write() is synchronous
- Race condition between pause signal and output arrival

**Options Considered**:
- Option A: Buffer output during pause
- Option B: Pause renderer only, continue output processing
- Option C: Accept potential output loss

**AI Recommendation**: Option B (renderer-only pause)

**Discussion Summary**: User chose Option B - enables future idle detection and state inspection since xterm state stays current.

**Decision**: Pause renderer only; output continues to xterm.write()

**Action Items**:
- [x] Clarify Phase 5 Task 5.2 for renderer-only pause

**Affects**: Phase 5

---

### Insight 6: UI State Lost on Refresh

**Did you know**: Settings persist but UI state (sidebar pinned, active session) doesn't.

**Implications**:
- Sessions are ephemeral by design (spec non-goal)
- Sidebar position is user preference
- activeSessionId would point to dead session

**Options Considered**:
- Option A: Persist UI state too
- Option B: Accept state loss (matches spec)
- Option C: URL-based state (blocked - no routing)

**AI Recommendation**: Option B (accept loss)

**Discussion Summary**: User chose Option A for sidebar state - if users like sidebar pinned, keep it pinned. Don't persist activeSessionId (ephemeral).

**Decision**: Persist sidebarCollapsed and sidebarPinned; don't persist activeSessionId

**Action Items**:
- [x] Update Phase 1 Task 1.9 for partial persist

**Affects**: Phase 1

---

### Insight 7: WebGL ↔ Canvas Renderer Switching

**Did you know**: Switching to inactive (Canvas) session requires deciding whether to upgrade to WebGL.

**Implications**:
- xterm.js addons can't be hot-swapped
- Upgrade requires terminal recreation (flash, lost state)
- Canvas is 40-50 FPS vs WebGL 60 FPS

**Options Considered**:
- Option A: Upgrade to WebGL on switch (flash)
- Option B: Keep Canvas (consistent but slower)
- Option C: Preemptive WebGL for recent sessions (LRU)

**AI Recommendation**: Option C (preemptive)

**Discussion Summary**: User chose Option C - keep recent sessions "warm" with WebGL to anticipate switching.

**Decision**: Active + last 2-3 sessions get WebGL (LRU); older get Canvas

**Action Items**:
- [x] Add Phase 5 Task 5.2a for preemptive WebGL strategy

**Affects**: Phase 5

---

### Insight 8: Font Loading Flash (FOUT)

**Did you know**: The concern about @fontsource web fonts causing flash doesn't apply - current code uses system fonts only.

**Implications**:
- Zero @fontsource packages installed
- System fonts (Menlo, Monaco) render instantly
- Problem only appears in Phase 4 when web fonts added

**Options Considered**: N/A - non-issue

**AI Recommendation**: Close as non-applicable

**Discussion Summary**: User agreed - move on, will handle naturally in Phase 4.

**Decision**: No changes needed; Phase 4 font implementation will handle

**Action Items**: None

**Affects**: None (future Phase 4)

---

### Insight 9: Settings Panel Display Mechanism

**Did you know**: Plan says "settings panel opens" but doesn't specify modal, sheet, or page.

**Implications**:
- Modal: centered overlay, feels temporary
- Sheet: slides from sidebar, natural flow
- Page: replaces view, requires routing (blocked)

**Options Considered**:
- Option A: Modal/Dialog overlay
- Option B: Sheet sliding from sidebar
- Option C: Route-based page (blocked - no routing)

**AI Recommendation**: Option B (Sheet)

**Discussion Summary**: User chose Option B - slick UX, natural flow from sidebar, can add routing later if needed.

**Decision**: Settings as Sheet sliding from sidebar (shadcn Sheet)

**Action Items**:
- [x] Add sheet to Phase 3 Task 3.2 component list
- [x] Update Phase 4 Task 4.12 with Sheet details
- [x] Add settingsPanelOpen to useUIStore

**Affects**: Phase 1, Phase 3, Phase 4

---

### Insight 10: Z-Index Stacking Strategy

**Did you know**: Multiple overlapping elements (sidebar, context menu, tooltips, sheet) need z-index coordination.

**Implications**:
- shadcn uses Radix portals (render to document.body)
- xterm has z-index -5 to 11
- Without strategy, z-index wars possible

**Options Considered**:
- Option A: Explicit Tailwind z-index scale
- Option B: Trust Radix/shadcn defaults
- Option C: CSS @layer ordering

**AI Recommendation**: Option B initially, escalate to A if issues

**Discussion Summary**: User agreed - trust well-designed system, document escalation path.

**Decision**: Trust Radix defaults; escalate to Tailwind scale if z-index bugs appear

**Action Items**:
- [x] Document escalation strategy in Phase 6 Task 6.3

**Affects**: Phase 3, Phase 4, Phase 6

---

## Session Summary

**Insights Surfaced**: 10 critical insights identified and discussed
**Decisions Made**: 9 decisions reached (1 was non-applicable)
**Action Items Created**: 15+ plan updates applied
**Areas Updated**:
- Phase 1: Tasks 1.1-1.3, 1.9, 1.10
- Phase 3: Task 3.2
- Phase 4: Tasks 4.11, 4.12
- Phase 5: Tasks 5.0, 5.1, 5.2, 5.2a
- Phase 6: Task 6.3
- ADR Ledger: 9 new architectural decisions documented

**Shared Understanding Achieved**: ✓

**Confidence Level**: High - All major architectural ambiguities resolved before implementation.

**Next Steps**: Run `/plan-5-phase-tasks-and-brief` for Phase 1 to generate implementation dossier.

**Notes**: User consistently chose forward-thinking options that enable future features (workspaces, idle detection, escape sequences) while keeping baseline simple. Good balance of pragmatism and extensibility.
