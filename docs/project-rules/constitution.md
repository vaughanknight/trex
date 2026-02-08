# trex Project Constitution

**Version**: 1.2.0
**Ratified**: 2026-02-04
**Last Amended**: 2026-02-05
**Status**: RATIFIED

---

<!--
Sync Impact Report:
- Mode: UPDATE
- Version: 1.0.0 → 1.1.0
- Changes:
  - Frontend: Next.js → Vite + React (simpler, better Electron support)
  - Distribution: Added Electron as v1 target alongside Web
  - Architecture: Updated to reflect dual distribution model
- Supporting docs updated: architecture.md, rules.md, idioms.md
-->

<!-- USER CONTENT START -->
<!-- This section preserves user customizations across constitution updates -->
<!-- USER CONTENT END -->

## Purpose & Mission

trex solves the **tmux session management complexity problem** by bringing browser-native organizational features to tmux workflows.

**The Problem**: tmux session management is complex and hard to navigate. Developers and teams juggling multiple projects, git worktrees, and concurrent workstreams lose track of context - "Which branch is this? Which project? What stage of workflow?"

**The Gap**: Terminal tools (like tmax) help but lack visual richness and organizational capabilities that browsers provide (bookmarks, tab groups, visual navigation).

**The Solution**: Browser-based UI with project listing, session status visualization, and rich previews - combining tmux power with browser efficiency.

---

## Target Users

**Primary Users**:
- Developers (solo) managing multiple concurrent projects
- Teams collaborating across multiple workstreams

**Technical Profile**:
- Proficient with tmux and git worktrees
- Managing high cognitive complexity (multiple projects, branches, workflows simultaneously)

**Core Pain Point**: Context confusion and cognitive overload from switching between multiple concurrent sessions

**User Need**: Visual clarity and situational awareness across all active contexts

---

## Guiding Principles

These principles are **non-negotiable** and guide every design and implementation decision:

### 1. Developer Experience Paramount
**Rationale**: trex MUST demonstrably improve on terminal-only workflows. If trex doesn't make the experience better than terminal tools alone, it fails its core mission. Every feature must pass the "Is this better than doing it in the terminal?" test.

**Application**: Feature decisions, UX design, performance targets all measured against terminal-only baseline.

### 2. Simplicity Over Features
**Rationale**: Stay focused on core session management and visualization. Avoid feature bloat that dilutes the primary value proposition.

**Application**: Reject features that don't directly serve the "context clarity" mission. Prefer removing complexity over adding configuration options.

### 3. Security First
**Rationale**: Terminal sessions may contain secrets, credentials, and sensitive data. Security is non-negotiable even in localhost-only v1.

**Application**: Secure session data handling, careful consideration of terminal history exposure, threat modeling for future network exposure.

### 4. Amazing UX
**Rationale**: trex competes with the efficiency of terminal workflows. The UI must be exceptional to justify the context switch.

**Components**:
- **Slick, polished UI**: Visual design matters for trust and adoption
- **Pro-level keyboard shortcuts**: Power users must stay in flow without mouse
- **Terminal customization**: Themes, fonts, visual preferences matter to developers
- **Dynamic session management**: Update terminal titles, reorganize on the fly, respect tmux conventions

---

## Technology Architecture

### Stack Decisions

**Backend**: Go
- **Rationale**: Leverage existing tmax codebase and shared libraries for tmux integration
- **Strategic alignment**: Code reuse across tmax (CLI) and trex (web UI)

**Frontend**: Vite + React
- **Rationale**: Fast build tooling, simple SPA architecture, excellent Electron support
- **Why not Next.js**: trex is a localhost tool with no SSR/SEO needs; Vite is simpler and faster
- **Requirements**: Browser-based terminal emulation (xterm.js or similar) with native terminal feel

**Distribution**: Dual Target (Web + Electron)
- **Web App**: Go binary serves static frontend; user opens browser to localhost
- **Electron App**: Native desktop app; clean "install and launch" experience
- **Shared codebase**: Same React components, same Go backend, same WebSocket protocol
- **Rationale**:
  - Web: Browser tabs enable multitasking alongside trex; no "fat app" for those who prefer lightweight
  - Electron: Clean install experience; native OS integration (system tray, global hotkeys)

**Communication Layer**: Hybrid Architecture
- **REST APIs**: Commands and actions (create session, attach, detach, list, etc.)
- **WebSockets**: Real-time bidirectional terminal I/O streaming
- **Requirements**:
  - Native terminal feel with <50ms input latency
  - Multiple simultaneous terminal sessions
  - Live session status updates from server
  - Idle session detection (leveraging tmax)
- **Note**: Same protocol for both Web and Electron; frontend connects to localhost Go server

### Component Boundaries & Dependencies

**tmax (upstream provider)**:
- Role: CLI tool + common tmux integration library
- Ownership: All tmux integration logic, session management, idle detection
- Location: `github.com/yourusername/tmax/pkg/*` (importable Go modules)

**trex (downstream consumer)**:
- Role: Web UI and HTTP/WebSocket server
- Responsibility: Browser interface, terminal rendering, user preferences, favorites
- Import Strategy: Uses tmax library via Go modules with semantic versioning

**Development Workflow**:
1. trex needs new tmux functionality → Create feature request in tmax GitHub issues
2. tmax implements in common library → Releases new version
3. trex updates Go module import → Consumes new functionality

**Boundary Rule**: trex does NOT implement tmux integration directly - that's tmax's responsibility.

### Agent Integration Philosophy

trex is a **UI layer**, not an agent integration layer.

**What trex sees**: tmux sessions (agnostic to what's running inside)
- Claude Code, Copilot CLI, Aider, plain bash - all just tmux sessions to trex
- No special detection or treatment needed

**Responsibility split**:
- **trex**: Browser UI, visual organization, favorites, session preview, user preferences
- **tmax**: Under-the-hood tmux management, any future agent detection, session operations

**Extension model**: Deferred to tmax
- If plugin/agent detection is ever needed, tmax will provide it
- trex consumes whatever tmax exposes

---

## Non-Functional Requirements

### Performance (v1)

**Terminal Latency**: <50ms for input/output
- **Rationale**: Typing must feel native, indistinguishable from direct terminal usage
- **Measurement**: Round-trip time from browser keypress to visual update

**Concurrent Sessions**: 10-20 sessions (single-user workload)
- **Rationale**: Typical developer workflow involves 5-15 active projects
- **Scalability**: Optimize for single-user, not multi-tenant

### Security (v1)

**Access Model**: Localhost only
- **Rationale**: Simplifies v1, no authentication complexity
- **Trust Model**: Local process has same privileges as user's terminal

**Data Sensitivity**: Terminal history may contain secrets
- **Consideration**: Handle session data carefully in UI (obscure passwords, provide clear controls)
- **Future**: Network exposure requires authentication, encryption, audit logging

### Scalability (v1)

**Deployment**: Single user per trex instance
- **Rationale**: v1 focuses on personal developer workflow
- **Future**: Multi-tenant requires authentication, isolation, resource limits

**Session Persistence**: tmux handles persistence; trex rediscovers
- **Implementation**: trex continuously discovers available tmux sessions
- **Reboot behavior**: tmux sessions may or may not survive (depends on host); trex rediscovers whatever is available

### Reliability (v1)

**Session Survival**: tmux sessions are independent
- **Guarantee**: trex crashes do not affect tmux sessions
- **Recovery**: trex rediscovers all existing tmux sessions on restart

---

## User Experience

### Interaction Model: Rich

- **Alt-tab style session preview**: See all sessions at a glance
- **Project-scoped view**: Sessions filtered by project/group
- **Global view**: ALL sessions across all projects
- **Quick selection**: Visual previews enable fast context switching

### Input Modality: Keyboard-First, Mouse-Friendly

**Keyboard (power users)**:
- tmux-like shortcuts (e.g., `Ctrl-B s` equivalent shows all sessions in rich UI)
- Command palette for quick actions
- Vim-style navigation where appropriate

**Mouse (fully supported)**:
- Click to select sessions
- Drag to organize/group
- Hover for previews
- Full functionality without keyboard

### Customization: Sensible Defaults + Power-User Depth

**Out of the box**: Works great with zero configuration
**Available customization**:
- Themes (terminal and UI)
- Fonts (terminal rendering)
- Layouts (panel arrangements)
- Keybindings (custom shortcuts)

**Philosophy**: "Simple by default, powerful when needed"

---

## Data Persistence

### Storage Location

**XDG-compliant paths**:
- Config: `~/.config/trex/`
- Data: `~/.local/share/trex/`
- Cache: `~/.cache/trex/`

**Format**: JSON

### What Gets Persisted

| Data | Description |
|------|-------------|
| **Favorites** | User-marked favorite sessions |
| **Projects/Groups** | User-defined session groupings (sessions can belong to multiple groups) |
| **UI Preferences** | Theme, layout, fonts, keybindings |
| **Session History** | Recently accessed sessions |
| **Custom Names/Labels** | User-defined names; also honors terminal title escape sequences |

### Reconnection Behavior

| Event | Behavior |
|-------|----------|
| **Browser refresh** | Restore UI state; terminals show live current state |
| **trex restart** | Rediscover sessions, restore favorites/groups/preferences |
| **Machine reboot** | tmux sessions may/may not survive; trex rediscovers available |

**Key Principle**: trex doesn't persist tmux sessions - it continuously discovers what's available. Persistence is for trex's own UI state, favorites, and preferences.

**Terminology**:
- "Bookmarks" = browser bookmarks (URL)
- "Favorites" = trex's starred sessions

---

## Distribution

### Dual Distribution: Web + Electron (v1)

Both distribution formats are supported from v1:

**Web App (`trex`)**:
- Single Go binary embeds Vite static build
- User runs `trex`, opens browser to `localhost:3000`
- Lightweight, no "fat app" overhead
- Leverage browser tabs for multitasking alongside trex
- Best for: Users who prefer minimal installs, already live in browser

**Electron App (`trex-desktop`)**:
- Native desktop application
- Bundles Electron shell + Go backend + frontend assets
- Clean "install and launch" experience (no browser step)
- Native OS integration:
  - System tray with quick session access
  - Global hotkeys (session picker even when app not focused)
  - Native notifications
  - Auto-start on login (optional)
- Best for: Users who want dedicated app, native feel

### Shared Architecture

Both distributions share:
- Same React components (100% code reuse)
- Same Go backend binary
- Same WebSocket/REST protocols
- Same configuration files (`~/.config/trex/`)

```
trex/
├── backend/           # Go server (shared)
├── frontend/          # Vite + React (shared)
├── electron/          # Electron wrapper (desktop only)
└── cmd/
    ├── trex/          # Web mode entry point
    └── trex-desktop/  # Electron mode entry point
```

### Update Mechanism: Self-Update

- `trex update` command for in-place updates
- Works for both web and Electron distributions
- No manual downloads after initial install

### First-Run Experience: Guided Setup Wizard

- Interactive wizard on first run (both distributions)
- Permission checks with clear messaging ("trex needs access to X, Y, Z")
- Folder configuration (project directories)
- Validation tests with user guidance
- Creates necessary config automatically
- No config file required upfront (wizard generates it)

**Future considerations**:
- Docker image (for remote tmux server scenarios)
- Package managers (brew, apt, winget)

---

## Observability

### Logging

- **Levels**: debug, info, warn, error
- **Format**: Structured JSON
- **Transport**: OpenTelemetry
- **Routing**: Configurable (stdout, file, external collectors)

### Metrics

- **Endpoint**: Health check endpoint with metrics
- **Internal metrics**: latency, connection count, memory usage
- **trex-specific**: current active sessions, total session count
- **Compatible with**: OpenTelemetry

### Error Tracking

- **Crash reporting**: Opt-in telemetry
- **Transport**: Via OpenTelemetry (not external services like Sentry)
- **Privacy**: Respects user preferences

### Startup Diagnostics: Fail-Fast

Pre-flight checks before starting server:
- tmux available in PATH
- tmux server accessible
- Port not already in use
- XDG directories writable
- tmax library functional

**Behavior**: Won't start if critical dependencies missing; clear console messages explaining what failed and why.

---

## Quality & Verification Strategy

### Testing Philosophy

**Test-Driven Development**: Strict TDD
- Test-first for everything where possible
- Write tests before implementation as standard practice
- Red-Green-Refactor cycles

**Mock Policy**: FAKES ONLY
- **No mocks** - use fakes everywhere
- Never ask about mocks - fakes are the policy
- This is non-negotiable

**Fake vs Real Strategy**:
- **Unit tests**: Use fakes (fake tmux, fake filesystem, fake WebSocket)
- **Integration tests**: Use real dependencies (real tmux, real filesystem)
- **Principle**: Use real dependencies where practical; fake only when impractical
- **Note**: tmax library may provide tmux fakes - don't duplicate

### Test Organization

Tests organized into **suites** for different execution stages:
- Fast local feedback (unit tests)
- Pre-commit checks (unit + fast integration)
- Full CI validation (all suites)

**Both unit AND integration tests are REQUIRED** - not either/or.

### Coverage Targets

- **Minimum**: 80% line coverage overall
- **Critical components**: Higher coverage required
  - Session management
  - WebSocket reliability
  - Data persistence
  - Terminal I/O

### Scratch → Promote Workflow

- Use `tests/scratch/` for exploration and TDD iteration
- **Promote working tests immediately** - don't leave them in scratch
- Philosophy: "More tests better as always"
- Scratch is for fast iteration, not permanent residence

### Test Documentation (TAD)

Promoted tests require Test Doc blocks with 5 fields:

```go
// Test Doc:
// - Why: <business/bug/regression reason>
// - Contract: <what invariant this asserts>
// - Usage Notes: <how to call, gotchas>
// - Quality Contribution: <what failures it catches>
// - Worked Example: <inputs/outputs summary>
```

---

## Quality Gates

### Automated CI Gates (all required)

| Gate | Requirement |
|------|-------------|
| **Tests** | All pass (unit + integration suites) |
| **Coverage** | 80%+ minimum |
| **Linting** | Go: gofmt + linter; JS: ESLint + Prettier |
| **Type checking** | TypeScript strict mode - no errors |
| **Security** | Dependency vulnerability scans pass |
| **Build** | Go binary + Next.js production build succeeds |

### Manual Gates

- **Code review**: 1 approver minimum required
- No specific role requirements (any team member can approve)

### Performance/Documentation Gates

- **Performance benchmarks**: Latency thresholds (to be documented)
- **Documentation**: Always required - update docs with code changes

---

## Delivery Practices

### Branching Model: GitHub Flow

- Feature branches created from `main`
- Short-lived branches, merge back to `main` via PR
- No long-lived develop/release branches

### Commit Conventions: Conventional Commits

**Format**: `type(scope): description`

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`

**Scopes**: `backend`, `frontend`, `api`, `ui`, `ws`, `config`, etc.

### Merge Strategy

- **Squash merges** to main (clean history)
- Full commit history preserved in PR for context

### PR Requirements

- ✅ Small, focused PRs preferred
- ✅ Linked issues **required** (no orphan PRs)
- ✅ Issues auto-generated at start of planning phases if missing
- ✅ PR template required (see `.github/pull_request_template.md`)

---

## Agent Workflow Status

### Terminal Title Convention

LLM agents working on this project MUST update the terminal title to reflect current work status. This provides at-a-glance visibility across multiple terminal sessions.

**Configuration**: `.config/project.json` contains project abbreviation and name.

**Scripts**:
- `scripts/project_title.sh` - Returns project abbreviation (auto-creates config if missing)
- `scripts/set_title.sh` - Sets terminal title with proper formatting

### Title States

| State | Format | Example |
|-------|--------|---------|
| **Idle** | `{project name}` | `trex` |
| **Active work** | `{AB}-{ord}:P{x}/{y}:T{n}/{m}` | `TR-008:P2/3:T3/25` |
| **Active (simple mode)** | `{AB}-{ord}:T{n}/{m}` | `TR-008:T3/9` |
| **Active (subtask)** | `...T{n}/{m}:S{a}/{b}` | `TR-008:P2/3:T5/25:S2/4` |
| **Waiting for input** | `? {active format}` | `? TR-008:P2/3:T3/25` |
| **Phase complete** | `→ {AB}-{ord}:P{next}/{y}` | `→ TR-008:P3/3` |
| **Plan complete** | `✓ {AB}-{ord}-{slug}` | `✓ TR-008-dynamic-session-titles` |

### Title Format Components

- `{AB}` - 2-letter project abbreviation from config (e.g., `TR`)
- `{ord}` - Plan ordinal number (e.g., `008`)
- `P{x}/{y}` - Phase x of y total phases
- `T{n}/{m}` - Task n of m total tasks
- `S{a}/{b}` - Subtask a of b total subtasks

### When to Update Title

| Event | Action |
|-------|--------|
| Starting work on a plan | Set to working state with plan/phase/task |
| Moving to next task | Update task counter |
| Completing a phase | Set `→` prefix, show next phase |
| Completing a plan | Set `✓` prefix with full plan slug |
| Waiting for user input | Set `?` prefix (any pause for input) |
| User responds | Remove `?` prefix, continue working state |
| All work complete | Set to idle (project name only) |

### Script Usage

```bash
# Get project abbreviation
./scripts/project_title.sh abbrev    # Returns: TR

# Set working status
./scripts/set_title.sh working 008 P2/3 T3/25       # TR-008:P2/3:T3/25
./scripts/set_title.sh working 008 P2/3 T5/25 S2/4  # TR-008:P2/3:T5/25:S2/4
./scripts/set_title.sh working 008 T3/9             # TR-008:T3/9 (simple mode)

# Set waiting status (any user input required)
./scripts/set_title.sh waiting 008 P2/3 T3/25       # ? TR-008:P2/3:T3/25

# Set phase complete
./scripts/set_title.sh phase-done 008 P3/3          # → TR-008:P3/3

# Set plan complete
./scripts/set_title.sh plan-done 008-dynamic-session-titles  # ✓ TR-008-dynamic-session-titles

# Set idle
./scripts/set_title.sh idle                         # trex
```

---

## Complexity Estimation

### CS 1-5 System (Strictly Adopted)

**Prohibition**: Never output or imply time estimates in any form.

**6 Factors** (0-2 points each):

| Factor | 0 | 1 | 2 |
|--------|---|---|---|
| **S**urface Area | One file | Multiple files | Many files/cross-cutting |
| **I**ntegration Breadth | Internal only | One external | Multiple externals |
| **D**ata & State | None | Minor tweaks | Non-trivial migration |
| **N**ovelty & Ambiguity | Well-specified | Some ambiguity | Significant discovery |
| **F**unctional Constraints | Standard | Moderate | Strict/critical |
| **T**esting & Rollout | Unit only | Integration/e2e | Flags/staged rollout |

**Score Mapping**:
- **CS-1** (0-2): Trivial
- **CS-2** (3-4): Small
- **CS-3** (5-7): Medium
- **CS-4** (8-9): Large
- **CS-5** (10-12): Epic

### CS ≥ 4 Requirements (Mandatory)

- ✅ Feature flags for staged rollout
- ✅ Rollback plan documented
- ✅ ADR for architectural decisions

---

## Documentation Standards

### Inline Documentation

**Go Backend**:
- Exported functions/types: godoc-style comments required
- Internal functions: Comment only when non-obvious (explain WHY)

**TypeScript Frontend**:
- Exported functions/components: JSDoc required
- Complex props: Document with JSDoc or inline comments

**Rule**: "If you need to re-read the code twice to understand it, add a comment."

### Project Documentation

| Document | When Required |
|----------|---------------|
| **README.md** | Update when user-facing behavior changes |
| **ADRs** | Significant architectural decisions |
| **API Docs (REST)** | All endpoints (OpenAPI 3.0) |
| **API Docs (WebSocket)** | Protocol spec |
| **CHANGELOG.md** | Every release |

---

## Dependency Policy

### Evaluation Criteria

- **Maturity**: Cutting-edge requires extra scrutiny; stable gets lighter review
- **Maintenance signals**: Check activity, responsiveness, maintainer count
- **License**: MIT preferred
- **Bundle size**: Keep frontend lean
- **Security**: Check for known vulnerabilities

### Dependency Hygiene

- **Update cadence**: Monthly minimum, with scripts to check
- **Vulnerability scanning**: Dependabot + `npm audit` / `govulncheck`
- **Lock files**: Always commit (`go.sum`, `package-lock.json`)

### Philosophy

- Prefer **fewer, well-chosen** dependencies
- **Leverage first, don't rebuild** - use existing libraries

---

## Governance

### Project Status

- **Single maintainer** project currently
- May extend to community as project matures

### Contribution Model

**External Contributors**:
- Open to contributions (MIT license, public repo)
- No CLA required
- Code of Conduct: Contributor Covenant

**Approval Process**:
- Maintainer-only merge
- Issues required before PRs (discuss before building)
- Feature proposals for CS ≥ 3
- Small fixes/typos: PR welcome without prior issue

**Communication**:
- GitHub Issues only
- Discussions tab for questions/ideas

**Expectations**:
- Response times may be slow (single maintainer)
- Not all contributions will be accepted
- Alignment with project vision matters

### Constitution Evolution

**Amendment Process**:
- Anyone can propose changes (via GitHub issues)
- Maintainer decision on approval
- Maintainer decides change level (constitution vs rules)

**Review Cadence**:
- As-needed (no scheduled reviews)
- Triggered by issues, friction, or learnings

**Versioning**:
- Semantic versioning for constitution
  - MAJOR: Breaking changes to principles or governance
  - MINOR: New sections, expanded guidance
  - PATCH: Clarifications, typo fixes
- Changelog maintained for doctrine changes

---

## Changelog

### v1.2.0 (2026-02-05)

- **Agent Workflow Status**: Added terminal title convention for LLM agents
  - Agents must update terminal title to reflect current work status
  - Provides at-a-glance visibility: working, waiting, phase complete, plan complete
  - Scripts: `scripts/project_title.sh`, `scripts/set_title.sh`
  - Config: `.config/project.json` for project abbreviation

### v1.1.0 (2026-02-04)

- **Frontend**: Changed from Next.js to Vite + React
  - Rationale: Simpler for SPA, no SSR needed, better Electron support
- **Distribution**: Added Electron as v1 target alongside Web
  - Web app (`trex`): Go binary serves frontend, user opens browser
  - Electron app (`trex-desktop`): Native desktop with system tray, global hotkeys
  - Both share 100% of React components and Go backend
- Updated architecture documentation to reflect dual distribution

### v1.0.0 (2026-02-04)

- Initial constitution ratified
- All 20 interview questions completed
- Core principles established: DevEx paramount, simplicity, security, amazing UX
- Technology stack defined: Go backend + React frontend
- Architecture documented: trex (UI) ↔ tmax (library) ↔ tmux
- Quality strategy: TDD, fakes-only, 80%+ coverage
- Distribution: Single binary with self-update and setup wizard
- Observability: OpenTelemetry, fail-fast startup diagnostics
- Governance: Single maintainer, as-needed reviews
