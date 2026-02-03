# trex Project Constitution

**Version**: 1.0.0-draft
**Ratified**: TBD (In Progress - Interview Phase)
**Last Amended**: 2026-02-04
**Status**: DRAFT - Interview in progress (Questions 1-6 completed, 7-20 pending)

---

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

**Frontend**: Next.js with React
- **Rationale**: Rich UI capabilities, excellent developer tooling, Server Components for performance
- **Requirements**: Browser-based terminal emulation (xterm.js or similar) with native terminal feel

**Communication Layer**: Hybrid Architecture
- **REST APIs**: Commands and actions (create session, attach, detach, list, etc.)
- **WebSockets**: Real-time bidirectional terminal I/O streaming
- **Requirements**:
  - Native terminal feel with <50ms input latency
  - Multiple simultaneous terminal sessions
  - Live session status updates from server
  - Idle session detection (leveraging tmax)

### Component Boundaries & Dependencies

**tmax (upstream provider)**:
- Role: CLI tool + common tmux integration library
- Ownership: All tmux integration logic, session management, idle detection
- Location: `github.com/yourusername/tmax/pkg/*` (importable Go modules)

**trex (downstream consumer)**:
- Role: Web UI and HTTP/WebSocket server
- Responsibility: Browser interface, terminal rendering, user preferences, bookmarks
- Import Strategy: Uses tmax library via Go modules with semantic versioning

**Development Workflow**:
1. trex needs new tmux functionality → Create feature request in tmax GitHub issues
2. tmax implements in common library → Releases new version
3. trex updates Go module import → Consumes new functionality

**Boundary Rule**: trex does NOT implement tmux integration directly - that's tmax's responsibility.

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

**Session Persistence**: Sessions survive reboots
- **Implementation**: tmux handles session persistence; trex rediscovers on restart

### Reliability (v1)

**Session Survival**: tmux sessions are independent
- **Guarantee**: trex crashes do not affect tmux sessions
- **Recovery**: trex rediscovers all existing tmux sessions on restart

**Data Persistence** (TODO - Future Exploration):
- Session configs (bookmarks, custom names, groupings)
- History (recent sessions, command history)
- UI state (themes, layouts, preferences)
- **Action**: Design persistence layer in future planning phase

---

## Quality & Verification Strategy

**TODO**: Questions 7-9 will define:
- Testing approach (TDD policy, test types, coverage)
- Scratch → promote workflow for trex
- Quality gates and CI requirements

---

## Delivery Practices

**TODO**: Questions 10-12 will define:
- Branching and commit strategy
- Complexity estimation (CS 1-5 system)
- Documentation requirements

---

## Governance

**TODO**: Questions 19-20 will define:
- Contribution model
- Constitution amendment process

---

## Outstanding Questions

The following areas require completion through continued interview (Q7-Q20):

- **Testing Philosophy** (Q7): TDD approach, test balance, coverage targets
- **Scratch → Promote Workflow** (Q8): Test exploration and promotion criteria
- **Quality Gates** (Q9): CI checks, review requirements, merge criteria
- **Branching Strategy** (Q10): Git workflow, commit conventions, PR standards
- **Complexity Estimation** (Q11): CS 1-5 application for trex
- **Documentation Standards** (Q12): Comment policy, README, ADRs, API docs
- **Dependency Policy** (Q13): External library evaluation criteria
- **Agent Integration** (Q14): Claude Code compatibility, plugin model
- **UX Priorities** (Q15): Speed vs features, keyboard vs mouse, customization
- **State Management** (Q16): Persistence location, reconnection, multi-device
- **Distribution** (Q17): Installation method, updates, deployment options
- **Observability** (Q18): Logging, metrics, error tracking
- **Contribution Model** (Q19): External contributors, approval process
- **Constitution Evolution** (Q20): Amendment process, review cadence

---

**Next Steps**: Resume interview at Question 7 to complete constitution.
