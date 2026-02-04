# Research Report: Sidebar, Settings, and Multi-Session Support

**Generated**: 2026-02-04T20:45:00Z
**Research Query**: "Baseline for minimalist sidebar, settings, and sessions - collapsible sidebar with session list, settings page with theme/font options"
**Mode**: Pre-Plan (Plan-Associated)
**Location**: `docs/plans/003-sidebar-settings-sessions/research-dossier.md`
**FlowSpace**: Not Available (standard tools used)
**Findings**: 55+ findings from 7 subagents

---

## Executive Summary

### What It Does
Extends trex from a single-terminal view to a multi-session terminal management UI with:
- **Collapsible Sidebar**: Lists terminal sessions, favorites, and groups with hover-reveal behavior
- **Settings Page**: Theme selection (3 themes), font family (3 fonts), and font size configuration
- **Multi-Session Support**: Create, switch between, and manage multiple terminal sessions

### Business Purpose
Transforms trex from a "hello world" terminal demo into a functional tmux session management tool - the core value proposition. Users can visually navigate their terminal contexts instead of remembering tmux keybindings.

### Key Insights
1. **Current architecture is single-session**: Terminal.tsx, useTerminalSocket, and backend handler all assume one session per browser tab
2. **State management gap**: No global state (Context, Zustand, Redux) exists - must be added for sidebar/settings
3. **xterm.js multi-instance unknown**: Performance with 5+ concurrent terminals needs testing
4. **Prior learnings reusable**: Async polling patterns, mutex safety, context cleanup from Plan 002 apply directly

### Quick Stats
- **Components to modify**: 5 existing files (App.tsx, Terminal.tsx, useTerminalSocket.ts, server.go, terminal.go)
- **Components to create**: 10+ new files (Sidebar, SessionList, SettingsPanel, contexts, hooks)
- **Dependencies to add**: Potentially state management library (Zustand ~3KB) or React Context
- **Test Coverage**: 0% frontend tests (critical gap), 19 backend tests (good foundation)
- **Prior Learnings**: 15 relevant discoveries from Plan 002 implementation

---

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| App.tsx | React Root | `frontend/src/App.tsx:1-12` | Renders single `<Terminal />` |
| /ws | WebSocket | `backend/internal/server/server.go:31` | Terminal WebSocket endpoint |
| handleTerminal | Handler | `backend/internal/server/terminal.go:22-49` | Creates PTY per connection |

### Core Execution Flow

1. **Browser loads App.tsx** → Renders Terminal component
2. **Terminal mounts** → Creates xterm.js instance, loads FitAddon/WebglAddon
3. **useTerminalSocket hook** → Opens WebSocket to `/ws`
4. **Backend handleTerminal** → Upgrades HTTP, creates PTY, creates Session
5. **Session.Run()** → Two goroutines: PTY→WebSocket, WebSocket→PTY
6. **User types** → `onData` → `sendInput` → WebSocket → PTY.Write()
7. **PTY outputs** → Session.readPTY → WebSocket → `onOutput` → terminal.write()

### Data Flow
```
User Input → xterm.onData → useTerminalSocket.sendInput → WebSocket
                                                              ↓
                                          Backend Session ← JSON.parse
                                                ↓
                                         PTY.Write(data)
                                                ↓
                                         Shell Process
                                                ↓
                                          PTY.Read()
                                                ↓
                                    Session.sendJSON(output)
                                                ↓
WebSocket → useTerminalSocket.onmessage → terminal.write(data)
```

### State Management
**Current**: Component-local state only
- `useTerminalSocket`: `useState<ConnectionState>`
- `Terminal`: `useRef` for xterm instance, fitAddon, resize timeout
- **No global state**: No Context, Redux, Zustand, or shared state

---

## Architecture & Design

### Component Map

```
frontend/src/
├── App.tsx (12 lines - minimal wrapper)
├── App.css (16 lines - full viewport)
├── index.css (20 lines - reset)
├── main.tsx (10 lines - React root)
├── components/
│   └── Terminal.tsx (166 lines - xterm.js integration)
├── hooks/
│   └── useTerminalSocket.ts (101 lines - WebSocket management)
└── types/
    └── terminal.ts (29 lines - message protocols)

backend/internal/
├── server/
│   ├── server.go (routes: /api/health, /ws, /)
│   ├── terminal.go (WebSocket handler)
│   └── terminal_test.go (3 tests)
└── terminal/
    ├── pty.go (PTY interface)
    ├── real_pty.go (creack/pty implementation)
    ├── fake_pty.go (test double)
    ├── websocket.go (Conn interface)
    ├── fake_websocket.go (test double)
    ├── messages.go (ClientMessage, ServerMessage)
    ├── session.go (PTY↔WebSocket bridge)
    └── session_test.go (5 tests)
```

### Design Patterns Identified

1. **Functional Components + Hooks**: All React code uses modern hooks (useRef, useCallback, useEffect)
2. **Interface Abstraction (Go)**: PTY and Conn interfaces enable fakes-only testing
3. **Mutex Write Protection**: Session.writeMu guards concurrent WebSocket writes
4. **Context Cancellation**: Session uses context.WithCancel for goroutine lifecycle
5. **100ms Resize Debounce**: Prevents resize message flooding
6. **JSON WebSocket Protocol**: Extensible message types with optional fields

### System Boundaries
- **Frontend ↔ Backend**: Single WebSocket at `/ws`, JSON messages
- **Backend ↔ Shell**: creack/pty spawns user's $SHELL
- **Electron**: Opens localhost:3000 in BrowserWindow, spawns Go binary

---

## Dependencies & Integration

### Frontend Dependencies

| Package | Version | Purpose | Multi-Session Impact |
|---------|---------|---------|---------------------|
| react | ^19.2.0 | UI framework | N/A |
| react-dom | ^19.2.0 | DOM renderer | N/A |
| @xterm/xterm | ^6.0.0 | Terminal emulator | ~500KB per instance |
| @xterm/addon-fit | ^0.11.0 | Responsive sizing | Required per terminal |
| @xterm/addon-webgl | ^0.19.0 | GPU rendering | Memory per instance |

**Missing for Sidebar/Settings**:
- State management: None (need Context API or Zustand)
- Routing: None (need conditional rendering or react-router)
- UI components: None (vanilla CSS only)

### Backend Dependencies

| Package | Version | Purpose | Multi-Session Impact |
|---------|---------|---------|---------------------|
| github.com/gorilla/websocket | v1.5.3 | WebSocket server | One per session |
| github.com/creack/pty | v1.1.24 | PTY management | One per session |

**Missing for Multi-Session**:
- Session registry/manager
- REST endpoints for session list
- Settings persistence layer

### Integration Points

| Integration | Current | Required for Feature |
|-------------|---------|---------------------|
| WebSocket | Single connection | Multiplexed or multiple connections |
| Session storage | None | XDG paths for settings/groups |
| State sharing | None | React Context or Zustand |

---

## Quality & Testing

### Current Test Coverage

| Package | Tests | Coverage | Gaps |
|---------|-------|----------|------|
| backend/terminal | 13 | Good | No multi-session tests |
| backend/server | 5 | Good | No settings endpoints |
| frontend | 0 | **CRITICAL** | No test framework |

### Test Strategy Analysis
- **Fakes-only** (ADR-0004): FakePTY, FakeWebSocket enable deterministic testing
- **Integration tests**: TestHandleTerminal_EchoCommand uses real PTY
- **Missing**: Frontend unit tests, multi-session scenarios, settings persistence

### Known Issues & Technical Debt

| Issue | Severity | Impact |
|-------|----------|--------|
| No frontend tests | Critical | Can't verify sidebar/settings behavior |
| Module-level resizeTimeout | Moderate | Breaks multi-terminal support |
| CheckOrigin allows all | Low | Security (dev-only comment exists) |
| No accessibility | Critical | WCAG non-compliant |

---

## Modification Considerations

### ✅ Safe to Modify

1. **App.tsx**: Currently minimal wrapper - add layout/contexts here
2. **App.css/index.css**: Full viewport CSS - add grid layout
3. **types/terminal.ts**: Add sessionId to messages
4. **package.json**: Add state management dependency

### ⚠️ Modify with Caution

1. **Terminal.tsx**: Works well but module-level `resizeTimeout` breaks multi-instance
   - Fix: Move to `useRef` before adding multi-terminal
2. **useTerminalSocket.ts**: Single-session assumption baked in
   - Risk: Adding sessionId context requires careful refactoring
3. **session.go**: Add metadata (title, id) without breaking existing flow

### 🚫 Danger Zones

1. **Session.Run() goroutines**: Tightly synchronized - changes risk deadlock
2. **WebSocket upgrade in handleTerminal**: Error paths critical for cleanup
3. **xterm.js lifecycle in Terminal.tsx**: Memory leaks if disposal broken

### Extension Points

1. **Message protocol**: Add new types without breaking existing
2. **Backend routes**: Add /api/sessions, /api/settings endpoints
3. **React Context**: Wrap App with providers for sessions/settings

---

## Prior Learnings (From Previous Implementations)

### 📚 PL-01: PTY Blocking Behavior Mismatch
**Source**: Plan 002, Task T009
**Type**: gotcha

**What They Found**:
> bytes.Buffer returns io.EOF immediately when empty, unlike real PTY which blocks

**How They Resolved It**:
> Added timeout-based polling in FakePTY.Read() with deadline checks

**Why This Matters Now**:
Session state tracking for sidebar requires same async polling pattern.

**Action for Current Work**:
Use deadline-based polling when waiting for multi-session state changes in tests.

---

### 📚 PL-02: WebSocket Message Queue Blocking
**Source**: Plan 002, Task T009
**Type**: gotcha

**What They Found**:
> FakeWebSocket.ReadMessage returned empty data when queue empty, causing infinite loop

**How They Resolved It**:
> Added timeout-based polling and Closed flag check

**Why This Matters Now**:
Multi-session broadcasts could trigger similar race conditions.

**Action for Current Work**:
Always check connection state before blocking reads; implement timeouts.

---

### 📚 PL-07: Context Cancellation for PTY Cleanup
**Source**: Plan 002, Critical Research #08
**Type**: insight

**What They Found**:
> PTY cleanup critical - orphaned processes if WebSocket closes without cleanup

**How They Resolved It**:
> Session.Stop() defers cancel() to cascade cleanup through context

**Why This Matters Now**:
Multi-session multiplies orphan risk. Each session needs independent context.

**Action for Current Work**:
Per-session context: `sessionCtx, sessionCancel := context.WithCancel(parentCtx)`

---

### 📚 PL-08: Gorilla/WebSocket Mutex Safety
**Source**: Plan 002, Risk mitigation
**Type**: decision

**What They Found**:
> gorilla/websocket requires mutex for concurrent writes

**How They Resolved It**:
> Session.writeMu sync.Mutex protects all WriteMessage calls

**Why This Matters Now**:
Multi-session means multiple goroutines writing to different sessions.

**Action for Current Work**:
CRITICAL: Maintain mutex pattern for all new WebSocket write paths.

---

### 📚 PL-13: xterm.js React Cleanup
**Source**: Plan 002, frontend-terminal-libraries.md
**Type**: insight

**What They Found**:
> Must call terminal.dispose() on unmount to prevent GPU memory leak

**How They Resolved It**:
> useEffect cleanup function disposes terminal

**Why This Matters Now**:
Sidebar showing multiple sessions creates/destroys terminals on tab switch.

**Action for Current Work**:
Wrap each terminal instance in component that handles cleanup lifecycle.

---

### Prior Learnings Summary

| ID | Type | Key Insight | Action |
|----|------|-------------|--------|
| PL-01 | gotcha | PTY blocking needs polling | Use deadline-based polling |
| PL-02 | gotcha | WebSocket queue race | Check closed before read |
| PL-03 | insight | Async tests need polling | Polling with early exit |
| PL-04 | insight | xterm.js ~638KB | Lazy-load in sidebar |
| PL-07 | decision | Context cleanup cascade | Per-session contexts |
| PL-08 | decision | Mutex for WebSocket | Guard all writes |
| PL-10 | pattern | 100ms resize debounce | Apply to sidebar too |
| PL-13 | insight | Dispose terminal on unmount | Cleanup in useEffect |

---

## Critical Discoveries

### 🚨 Critical Finding 01: No State Management Architecture
**Impact**: Critical
**Source**: DC-04, IA-03
**What**: No Context API, Redux, Zustand, or shared state exists
**Why It Matters**: Sidebar needs session list state, settings need persistence state
**Required Action**: Add state management before implementing UI (recommend Context API or Zustand)

### 🚨 Critical Finding 02: Single-Session Protocol Design
**Impact**: Critical
**Source**: IC-01, IC-02
**What**: WebSocket messages lack sessionId field; one PTY per connection assumed
**Why It Matters**: Multi-session requires routing messages to correct terminal
**Required Action**: Extend protocol with sessionId in ClientMessage/ServerMessage

### 🚨 Critical Finding 03: No Frontend Test Infrastructure
**Impact**: Critical
**Source**: QT-01
**What**: Zero test files, no vitest/jest setup, no @testing-library
**Why It Matters**: Can't verify sidebar/settings behavior, regression risk
**Required Action**: Setup vitest + @testing-library/react before feature development

### 🚨 Critical Finding 04: xterm.js Multi-Instance Performance Unknown
**Impact**: High
**Source**: IA-05, IA-09
**What**: No benchmarks for 5+ concurrent xterm instances
**Why It Matters**: Sidebar with session previews may cause memory/GPU issues
**Required Action**: Performance test before committing to live preview design

---

## External Research Opportunities

### Research Opportunity 1: React State Management for Terminal Apps

**Why Needed**: Current codebase has zero state management. Must choose between Context API, Zustand, Jotai, or TanStack Query.

**Impact on Plan**: Foundational decision affecting all new components.

**Source Findings**: DC-04, IA-03, QT-09

**Ready-to-use prompt**:
```
/deepresearch "React state management comparison 2026 for terminal/editor applications.

Context: Building multi-session terminal manager with:
- Session list state (5-20 active sessions)
- User settings (theme, font, keybindings)
- UI state (sidebar collapsed, active tab)
- Settings persistence to localStorage/file

Technology stack: React 19.2, Vite 7, TypeScript 5.9, no existing state management.

Research questions:
1. Context API vs Zustand vs Jotai for this use case - which has best DX?
2. Performance with frequent terminal output updates (100+ messages/sec)
3. localStorage sync patterns for settings persistence
4. How do Hyper, Warp, or other Electron terminals handle state?

Integration: Must work with existing useTerminalSocket hook pattern."
```

**Results location**: `docs/plans/003-sidebar-settings-sessions/external-research/state-management.md`

---

### Research Opportunity 2: xterm.js Multi-Instance Performance

**Why Needed**: Sidebar with session previews may render 5-10 xterm instances simultaneously.

**Impact on Plan**: Determines whether sidebar shows live previews or static content.

**Source Findings**: IA-05, IA-09, QT-03

**Ready-to-use prompt**:
```
/deepresearch "xterm.js multi-instance performance and memory optimization 2026.

Context: Building multi-session terminal UI that may render 5-10 terminal instances (sidebar previews + active terminal).

Technology stack: @xterm/xterm 6.0, @xterm/addon-webgl 0.19, React 19.

Research questions:
1. Memory footprint per xterm instance with WebGL addon?
2. Can WebGL contexts be shared across instances?
3. Best practices for pausing/hiding inactive terminals without memory leaks?
4. How does VS Code terminal handle multiple instances?
5. Is there a terminal instance pooling pattern?

Constraints: Must maintain <50ms input latency on active terminal."
```

**Results location**: `docs/plans/003-sidebar-settings-sessions/external-research/xterm-multiinstance.md`

---

### Research Opportunity 3: CSS Sidebar Animation Patterns

**Why Needed**: User requested hover-reveal sidebar that collapses "to almost nothing".

**Impact on Plan**: UX/interaction design for sidebar behavior.

**Source Findings**: PS-03, IA-04

**Ready-to-use prompt**:
```
/deepresearch "CSS sidebar collapse and hover-reveal animation patterns 2026.

Context: Building collapsible sidebar for terminal app that:
- Collapses to minimal width (~40px icons only)
- Reveals on hover with smooth animation
- Hides completely when not moused over (optional)
- Must not interfere with terminal keyboard focus

Technology stack: React 19, vanilla CSS (no Tailwind), full-viewport layout.

Research questions:
1. CSS-only vs JavaScript for hover-reveal (accessibility implications)?
2. Animation timing/easing for professional feel?
3. How to handle focus management (sidebar shouldn't steal keyboard focus)?
4. Mobile/touch considerations (hover doesn't work)?

Constraints: Dark theme, must work in both browser and Electron."
```

**Results location**: `docs/plans/003-sidebar-settings-sessions/external-research/sidebar-animation.md`

---

## Recommendations

### If Modifying This System

1. **Add frontend tests first** (vitest + @testing-library)
2. **Add state management** before UI components (Context API minimum)
3. **Fix resizeTimeout** to useRef before multi-terminal
4. **Extend protocol** with sessionId field

### If Extending This System

1. **Follow fakes-only pattern** from backend for frontend tests
2. **Use existing hook pattern** (useTerminalSocket → useSessionManager)
3. **Keep CSS simple** (vanilla CSS, avoid framework for now)
4. **Debounce all events** (100ms pattern established)

### If Refactoring This System

1. **Session management** belongs in dedicated context/provider
2. **Terminal component** should accept sessionId prop
3. **Settings** should use XDG paths via backend API
4. **Protocol versioning** needed for future binary format

---

## Appendix: File Inventory

### Core Files to Modify

| File | Purpose | Lines | Changes Needed |
|------|---------|-------|----------------|
| frontend/src/App.tsx | Root component | 12 | Add layout, contexts |
| frontend/src/App.css | Layout styles | 16 | Add grid, sidebar styles |
| frontend/src/components/Terminal.tsx | Terminal | 166 | Accept sessionId prop |
| frontend/src/hooks/useTerminalSocket.ts | WebSocket | 101 | Add sessionId routing |
| frontend/src/types/terminal.ts | Protocol | 29 | Add sessionId to messages |
| backend/internal/server/server.go | Routes | 36 | Add /api/sessions, /api/settings |
| backend/internal/server/terminal.go | Handler | 50 | Session registry integration |
| backend/internal/terminal/session.go | Bridge | 176 | Add metadata, ID tracking |
| backend/internal/terminal/messages.go | Protocol | 27 | Add sessionId field |

### New Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| frontend/src/contexts/SessionContext.tsx | Session state | 80 |
| frontend/src/contexts/SettingsContext.tsx | Settings state | 60 |
| frontend/src/components/Sidebar.tsx | Sidebar UI | 150 |
| frontend/src/components/SessionList.tsx | Session items | 80 |
| frontend/src/components/SettingsPanel.tsx | Settings UI | 200 |
| frontend/src/hooks/useSettings.ts | Settings logic | 50 |
| frontend/src/types/session.ts | Session types | 40 |
| frontend/src/types/settings.ts | Settings types | 30 |
| backend/internal/server/sessions.go | REST endpoints | 100 |
| backend/internal/server/settings.go | Settings API | 80 |
| backend/internal/terminal/manager.go | Session registry | 120 |

---

## Next Steps

**External Research Opportunities identified**: 3

1. **Optional**: Run `/deepresearch` prompts above for state management, xterm performance, sidebar animation
2. **Save results** to `external-research/` folder if conducted
3. **Then proceed** to `/plan-1b-specify` to create specification

**If skipping external research**:
- Run `/plan-1b-specify "minimalist sidebar with session list, settings page with theme/font options, and multi-session terminal support"` to create specification
- Unresolved research opportunities will be noted as soft warnings

---

**Research Complete**: 2026-02-04T20:45:00Z
**Report Location**: `docs/plans/003-sidebar-settings-sessions/research-dossier.md`
