# Sidebar, Settings & Multi-Session Support (Baseline)

**Mode**: Full

📚 **This specification incorporates findings from `research-dossier.md` and external research.**

---

## Research Context

### From Internal Research (research-dossier.md)

**Components Affected**:
- Frontend: App.tsx, Terminal.tsx, useTerminalSocket.ts, types/terminal.ts
- Backend: server.go, terminal.go, session.go, messages.go
- New: 10+ files across contexts, components, hooks, types

**Critical Dependencies**:
- State management (none exists → add Zustand)
- UI component library (none exists → add shadcn/ui + Tailwind)
- Protocol extension (sessionId required in all messages)

**Modification Risks**:
- Module-level `resizeTimeout` in Terminal.tsx breaks multi-instance (fix: move to useRef)
- Session.Run() goroutines are tightly synchronized (modify with caution)
- xterm.js lifecycle must handle proper disposal to prevent GPU memory leaks

**Prior Learnings Applied**:
- PL-01: Use deadline-based polling for async state changes in tests
- PL-07: Per-session context cancellation for clean PTY cleanup
- PL-08: Maintain mutex pattern for all WebSocket write paths
- PL-13: Dispose terminals properly on unmount to prevent memory leaks

See `research-dossier.md` for full analysis (55+ findings from 7 research subagents).

### From External Research

**State Management** (state-management-comparison.md):
- Zustand recommended: 1.1KB, 35ms update time, selector-based isolation
- Separate stores: UI state, Settings (persisted), Sessions (high-frequency)
- Batch WebSocket output at 50-100ms intervals for 100+ msg/sec

**xterm.js Multi-Instance** (xterm-multiinstance-performance.md):
- WebGL context limit: 8-16 per browser page (critical constraint)
- Memory: ~20-34 MB per terminal with 3000-line scrollback
- Solution: pause/resume renderer API, hybrid rendering (WebGL active, Canvas previews)
- Instance pooling for pre-allocation and recycling

**shadcn/ui Implementation** (shadcn-sidebar-implementation.md):
- Requires Tailwind CSS installation
- `icon` collapsible mode with `floating` variant for hover-reveal
- Built-in dark mode with CSS variables
- Components: sidebar, tabs, card, select, input, switch, form

---

## Summary

Transform trex from a single-terminal demo into a functional multi-session terminal manager with visual navigation. This baseline feature adds:

1. **Collapsible Sidebar**: Lists all terminal sessions with hover-reveal behavior
2. **Settings Page**: Terminal theme, font family, and font size configuration
3. **Multi-Session Support**: Create, switch, and manage multiple concurrent terminals

**WHY**: Users currently manage tmux sessions through terminal commands alone. trex's value proposition is bringing browser-native organizational features to tmux workflows. Without multi-session support and visual navigation, trex is merely an embedded terminal—not a session manager.

**SCOPE**: This is a **baseline implementation**, not the final vision. It establishes the architectural foundation (state management, component library, protocol extension) that all future features will build upon.

---

## Goals

1. **Enable concurrent terminal sessions**: Users can create and manage 5-30+ terminal sessions simultaneously
2. **Provide visual session navigation**: Sidebar displays all sessions with status indicators, enabling quick context switching
3. **Support terminal customization**: Users can configure theme (12 options), font family (6 bundled + 3 fallback + detected system fonts), and font size
4. **Maintain terminal performance**: Input latency remains <50ms even with multiple sessions
5. **Establish state management foundation**: Architecture supports future features (favorites, groups, history)
6. **Introduce component library**: shadcn/ui + Tailwind CSS for consistent, accessible UI components

---

## Non-Goals

1. **Session persistence across browser refresh**: Sessions are ephemeral; persistence deferred to future work
2. **Favorites and bookmarks**: Foundation exists but feature not implemented
3. **Session groups/folders**: Organizational hierarchy deferred
4. **Keyboard shortcuts/command palette**: Pro-level navigation deferred
5. **tmux integration**: This baseline uses PTY directly; tmux integration via tmax library comes later
6. **Session preview thumbnails**: Live previews deferred due to WebGL context limits
7. **Mobile/responsive design**: Desktop-focused baseline
8. **Accessibility (WCAG)**: Noted as gap but not addressed in baseline
9. **Per-session settings**: Settings are global; per-session overrides deferred to future

---

## Complexity

**Score**: CS-4 (large)

**Breakdown**:
| Factor | Score | Rationale |
|--------|-------|-----------|
| **S**urface Area | 2 | 5 files modified, 10+ files created, cross-cutting frontend/backend |
| **I**ntegration | 2 | Adding Zustand, shadcn/ui, Tailwind CSS |
| **D**ata/State | 1 | New state architecture, protocol extension, no DB migrations |
| **N**ovelty | 1 | Requirements well-defined by research; some UI behavior ambiguity |
| **F**unctional | 1 | <50ms latency, memory management, WebGL limits (moderate) |
| **T**esting | 1 | Frontend test framework setup, integration tests required |
| **Total** | **8** | |

**Confidence**: 0.85 (high confidence due to thorough external research)

**Assumptions**:
1. shadcn/ui sidebar component meets hover-reveal requirements
2. Zustand selector pattern prevents cascading re-renders
3. pause/resume renderer API works as documented for hidden terminals
4. 12 themes, 6 bundled fonts + system font detection provide comprehensive customization

**Dependencies**:
- Tailwind CSS must be installed before shadcn/ui components
- TypeScript path aliases (`@/*`) required for shadcn/ui
- Frontend test framework (vitest) should be set up for TDD

**Risks**:
- WebGL context exhaustion with 30+ sessions (mitigated by hybrid rendering)
- Frontend bundle size increase (~650KB xterm.js + Tailwind + shadcn)
- Breaking change to message protocol (sessionId field)

**Phases** (high-level):
1. **Foundation**: Tailwind + shadcn setup, Zustand stores, protocol extension
2. **Backend**: Session registry, REST endpoints, multi-session WebSocket handling
3. **Sidebar**: shadcn Sidebar component, session list, new session button
4. **Settings**: Settings page with theme/font controls, localStorage persistence
5. **Integration**: Wire everything together, fix Terminal.tsx for multi-instance

**CS-4 Requirements**:
- ✅ Phased implementation (5 phases identified)
- ⚠️ Feature flags: Deferred (baseline establishes foundation; flags for future features)
- ⚠️ Rollback plan: Document per-phase rollback approach during planning
- ✅ ADR: Required for state management and component library decisions

---

## Acceptance Criteria

### Session Management

**AC-01**: User can create a new terminal session
- Given: User is on trex main view
- When: User clicks "New Session" button in sidebar
- Then: A new terminal session opens and becomes active
- And: The session appears in the sidebar session list

**AC-02**: User can switch between sessions
- Given: Multiple terminal sessions exist
- When: User clicks a session in the sidebar
- Then: That session becomes active and visible
- And: The previously active session is preserved (not destroyed)

**AC-03**: User can close a terminal session
- Given: A terminal session exists
- When: User clicks the X button on the session item, OR right-clicks and selects "Close"
- Then: The session is terminated immediately (no confirmation)
- And: The session is removed from the sidebar
- And: Another session becomes active (or empty state shown)

**AC-04**: Session list shows status indicators and controls
- Given: Multiple sessions exist with different states
- Then: Each session in sidebar shows:
  - Name (default: shell + increment, e.g., "bash-1", "zsh-2")
  - Connection status (● connected, ○ disconnected)
  - X button (close) on hover

**AC-04a**: User can rename a session
- Given: A session exists in the sidebar
- When: User right-clicks the session and selects "Rename"
- Then: Session name becomes editable inline
- And: User can type new name and press Enter to confirm (or Escape to cancel)
- And: Renamed session persists the custom name

**AC-04b**: Session context menu
- Given: A session exists in the sidebar
- When: User right-clicks the session
- Then: Context menu appears with options: "Rename", "Close"

### Sidebar Behavior

**AC-05**: Sidebar collapses to icon-only mode
- Given: Sidebar is expanded
- When: User clicks collapse toggle (or moves mouse away)
- Then: Sidebar collapses to ~48px width showing only icons
- And: Tooltips appear on hover for session names

**AC-06**: Sidebar expands on hover (temporary) or click (locked)
- Given: Sidebar is in collapsed (icon) mode
- When: User hovers over the sidebar
- Then: Sidebar smoothly expands to show full session names (temporary expand)
- And: Sidebar collapses when mouse leaves (after 300ms delay)
- When: User clicks the expand/pin toggle
- Then: Sidebar locks in expanded state until explicitly collapsed
- And: Hover behavior is disabled while locked

**AC-07**: Sidebar floats over terminal content
- Given: Sidebar is in floating mode
- Then: Sidebar overlays terminal content when expanded (doesn't push it)
- And: Terminal remains fully usable when sidebar is collapsed

### Settings

**AC-08**: User can access settings page
- Given: User is on main view
- When: User clicks settings icon in sidebar footer
- Then: Settings page/panel opens

**AC-09**: User can change terminal theme
- Given: User is on settings page
- When: User selects a theme from 12 options (Dark, Light, Dracula, Nord, Monokai, Solarized Light, Solarized Dark, One Dark, Gruvbox Dark, Tokyo Night, Catppuccin, GitHub Light)
- Then: Terminal immediately reflects the new theme
- And: Setting persists after page refresh

**AC-10**: User can change terminal font family
- Given: User is on settings page
- When: User selects a font from available options:
  - **Bundled (6)**: Fira Code, JetBrains Mono, Source Code Pro, Hack, IBM Plex Mono, Cascadia Code
  - **Fallback (3)**: Menlo, Monaco, Consolas
  - **Detected**: Any monospace fonts installed on user's system
- Then: Terminal immediately reflects the new font
- And: Setting persists after page refresh

**AC-11**: User can change terminal font size
- Given: User is on settings page
- When: User adjusts font size (8-24px range)
- Then: Terminal immediately reflects the new size
- And: Setting persists after page refresh

**AC-11a**: Auto-open terminal setting (future-proofing)
- Given: User is on settings page
- When: User toggles "Auto-open terminal on startup" (default: OFF)
- Then: Setting persists after page refresh
- And: When ON, app creates first session automatically on startup
- And: When OFF, app shows empty state until user clicks "New Session"

### Performance

**AC-12**: Terminal input latency remains under 50ms
- Given: 5+ terminal sessions exist
- When: User types in active terminal
- Then: Characters appear within 50ms (measured round-trip)

**AC-13**: Inactive sessions don't consume GPU resources
- Given: Multiple sessions exist, only one active
- Then: Inactive sessions have paused renderers
- And: Switching to inactive session resumes rendering smoothly

### Protocol & Integration

**AC-14**: WebSocket messages include session ID
- Given: Multiple sessions connected
- When: Any message is sent (input, output, resize)
- Then: Message includes `sessionId` field for routing

**AC-15**: Sessions maintain independent PTY processes
- Given: Multiple sessions exist
- When: User runs commands in Session A
- Then: Session B is not affected
- And: Each session has its own shell process

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WebGL context exhaustion (>16 sessions) | Medium | High | Hybrid rendering: WebGL for active, Canvas for others |
| Re-render performance with 30+ sessions | Medium | High | Zustand selectors isolate session updates |
| Bundle size bloat | Low | Medium | Tree-shaking, lazy loading settings page |
| Protocol breaking change | High | Medium | Version field, backwards-compatible extension |
| Frontend test setup friction | Medium | Low | Use vitest (Vite-native), follow existing patterns |

### Assumptions

1. **Users have modern browsers**: WebGL support required, Chrome/Firefox/Safari recent versions
2. **Sessions are ephemeral**: No persistence expected in baseline (acceptable for v1)
3. **Desktop-first usage**: Mobile/touch not priority for baseline
4. **Single-user deployment**: No multi-tenant considerations
5. **Localhost-only**: No authentication required (per constitution)

---

## Open Questions

1. ~~**[Theme Options]**: Which 3 terminal themes should be included?~~ → RESOLVED: 12 themes (see Q4)
2. ~~**[Font Options]**: Which 3 terminal fonts?~~ → RESOLVED: 6 bundled + 3 fallback + system detection (see Q5)
3. ~~**[Sidebar Auto-Collapse]**: Should sidebar auto-collapse after delay, or stay expanded until mouse leaves?~~ → RESOLVED: Hybrid (see Q6)
4. ~~**[Session Naming]**: How are sessions named?~~ → RESOLVED: Shell + increment, renameable (see Q7)
5. ~~**[Settings Scope]**: Settings apply globally or per-session?~~ → RESOLVED: Global for baseline, per-session future (see Q8)

---

## ADR Seeds (Optional)

### ADR-001: State Management Library Selection

**Decision Drivers**:
- High-frequency terminal output updates (100+ msg/sec)
- Fine-grained re-render control needed
- Settings persistence required
- Minimal bundle size preference

**Candidate Alternatives**:
- A. Zustand (1.1KB, selector-based, persist middleware)
- B. React Context API (0KB, but cascading re-renders)
- C. Jotai (2.9KB, atomic updates)
- D. Redux Toolkit (15KB, comprehensive but heavy)

**Stakeholders**: Frontend developers, performance reviewers

### ADR-002: UI Component Library Selection

**Decision Drivers**:
- Consistent, accessible components
- Dark mode support
- Sidebar with collapse/expand
- Form components for settings

**Candidate Alternatives**:
- A. shadcn/ui + Tailwind (composable, requires Tailwind)
- B. Radix UI + custom CSS (primitives only, more work)
- C. Vanilla CSS (full control, more maintenance)

**Stakeholders**: Frontend developers, UX reviewers

### ADR-003: Multi-Terminal Rendering Strategy

**Decision Drivers**:
- WebGL context limit (8-16 per page)
- Memory usage (20-34MB per terminal)
- Input latency (<50ms required)

**Candidate Alternatives**:
- A. Hybrid rendering (WebGL active, Canvas others)
- B. Single shared WebGL context (complex implementation)
- C. DOM fallback only (simpler, slower)

**Stakeholders**: Performance engineers, frontend developers

---

## External Research

**Incorporated**:
- `external-research/state-management-comparison.md`
- `external-research/xterm-multiinstance-performance.md`
- `external-research/shadcn-sidebar-implementation.md`

**Key Findings**:
| Source | Key Insight | Applied To |
|--------|-------------|------------|
| State Management | Zustand with selectors prevents re-render cascade | Goals, Complexity, ADR-001 |
| State Management | Separate stores (UI, Settings, Sessions) | Architecture assumption |
| xterm Multi-Instance | WebGL limited to 8-16 contexts | Risks, AC-13, ADR-003 |
| xterm Multi-Instance | pause/resume renderer API for hidden terminals | AC-13 |
| xterm Multi-Instance | ~20-34 MB per terminal | Complexity (memory constraint) |
| shadcn Sidebar | `icon` collapsible + `floating` variant | AC-05, AC-06, AC-07 |
| shadcn Sidebar | Requires Tailwind CSS setup | Dependencies, Phase 1 |
| shadcn Sidebar | Form components for settings | AC-08 through AC-11 |

**Applied To**:
- Goals: Informed by performance research (concurrent session count realistic)
- Complexity: Research reduced novelty score, clarified integration needs
- Risks: WebGL limits, memory usage directly from research
- ADR Seeds: All three informed by external research

---

## Unresolved Research

**Topics**:
- CSS sidebar animation patterns (originally identified in research-dossier.md)

**Resolution**: Superseded by shadcn/ui approach. The external research on shadcn-sidebar-implementation.md addresses the sidebar requirement through a component library approach rather than vanilla CSS animations. This is a superior approach given the decision to adopt shadcn/ui.

**Impact**: None. The shadcn approach provides built-in animation, accessibility, and responsive behavior that exceeds what custom CSS would provide.

---

## Documentation Strategy

**Location**: Hybrid (README.md + docs/how/)

**Rationale**: Foundational architecture requires both quick-start updates and detailed guides for future contributors.

**Content Split**:
| Location | Content |
|----------|---------|
| README.md | Updated usage: multi-session basics, settings access, sidebar navigation |
| docs/how/state-management.md | Zustand store patterns, selector usage, adding new state |
| docs/how/component-patterns.md | shadcn/ui conventions, Terminal multi-instance handling |
| docs/how/protocol.md | WebSocket message format, sessionId routing, extending messages |

**Target Audience**:
- README: End users, new developers getting started
- docs/how/: Contributors extending trex, future maintainers

**Maintenance**: Update docs alongside code changes; docs/how/ guides reviewed during architecture changes.

---

## Testing Strategy

**Approach**: Hybrid (TDD + TAD)

**Rationale**: Mixed complexity - backend extends proven patterns (TDD), frontend establishes new test infrastructure (TAD for documentation value).

**Focus Areas**:
- **TDD (Backend)**: Session registry, multi-session WebSocket handling, protocol extensions, REST endpoints
- **TAD (Frontend)**: Zustand stores, sidebar components, settings persistence, Terminal multi-instance fixes

**Excluded**:
- shadcn/ui component internals (library responsibility)
- Tailwind CSS configuration (styling, not logic)
- Pure presentation components without logic

**Mock Policy**: FAKES ONLY (per constitution ADR-0004)
- Backend: Extend FakePTY, FakeWebSocket patterns
- Frontend: Create FakeWebSocket, FakeStorage for deterministic tests
- No mocking frameworks permitted

**TAD-Specific**:
- Scratch→Promote workflow: Use `tests/scratch/` for iteration, promote immediately when working
- Test Doc blocks required for promoted tests (Why, Contract, Usage Notes, Quality Contribution, Worked Example)
- Promotion heuristic: Critical paths, Opaque logic, Regression prevention, Edge cases

---

## Clarifications

### Session 2026-02-04

**Q1: Workflow Mode**
- **Answer**: B (Full)
- **Rationale**: CS-4 complexity, foundational baseline for future functionality, 5 phases, 3 ADRs required. Full gates and dossiers warranted.

**Q2: Testing Strategy**
- **Answer**: E (Hybrid)
- **Rationale**: TDD for backend (extends existing 19-test suite with fakes), TAD for frontend (new infrastructure, tests serve as documentation for new patterns).

**Q3: Documentation Strategy**
- **Answer**: C (Hybrid)
- **Rationale**: README for user-facing updates (usage), docs/how/ for architecture guides (state management, components, protocol).

**Q4: Theme Options**
- **Answer**: C (12 themes)
- **Themes**: Dark, Light, Dracula, Nord, Monokai, Solarized Light, Solarized Dark, One Dark, Gruvbox Dark, Tokyo Night, Catppuccin, GitHub Light
- **Rationale**: Themes are just color configs (~200 bytes each), minimal effort to include popular options.

**Q5: Font Options**
- **Answer**: Comprehensive (6 bundled + 3 fallback + system detection)
- **Bundled web fonts**: Fira Code, JetBrains Mono, Source Code Pro, Hack, IBM Plex Mono, Cascadia Code
- **System fallbacks**: Menlo, Monaco, Consolas
- **System detection**: Detect and display installed monospace fonts
- **Rationale**: Guarantees good fonts available while also leveraging user's installed fonts for maximum choice.

**Q6: Sidebar Auto-Collapse Behavior**
- **Answer**: D (Hybrid)
- **Behavior**: Hover expands temporarily (collapses after 300ms on mouse leave), click/pin locks expanded state
- **Rationale**: Common IDE pattern (VS Code, JetBrains). Quick peek for navigation, lock open for extended session management.

**Q7: Session Naming & Management**
- **Answer**: C (Shell + increment) with full management
- **Default name**: "bash-1", "zsh-2", etc. (shell name + auto-increment)
- **Rename**: Right-click → "Rename" for inline editing
- **Close options**: X button on hover + right-click → "Close"
- **Confirmation**: None (immediate close)
- **Rationale**: Informative defaults, quick management, no friction for power users.

**Q8: Settings Scope**
- **Answer**: A (Global only) for baseline
- **Future direction**: C (Global default + per-session override)
- **Rationale**: Global settings cover 90% of use cases, simpler state management. Architecture will support future per-session overrides without breaking changes.

---

**Spec Version**: 1.1.0
**Created**: 2026-02-04
**Status**: Clarified - Ready for Architecture

---

*Next step: Run `/plan-3-architect` to generate the phase-based plan.*
