# tmux Session Tracking

**Mode**: Simple

> This specification incorporates findings from `research-dossier.md`

## Research Context

- **Components affected**: ~8 backend files (PTY, session, registry, server, messages, monitor), ~4 frontend files (session store, types, WebSocket handler, sidebar)
- **Critical dependencies**: creack/pty library (already present), tmux CLI (user-installed, graceful degradation when absent)
- **Key discovery**: PTY TTY device path + `tmux list-clients` output provides reliable outside-in detection of which tmux session each trex terminal is viewing
- **Modification risks**: PTY creation signature change (`pty.Open()` vs `pty.Start()`); must verify on macOS
- **Link**: See `research-dossier.md` for full analysis (65+ findings from 7 research subagents)

## Summary

Users run tmux inside trex terminal sessions. Multiple trex sessions can attach to the same tmux session (e.g., two terminals both viewing tmux session "work"). trex currently has no awareness of this relationship — the sidebar shows generic names like "bash-1" with no indication of what tmux session is behind each terminal.

This feature detects which tmux session each trex terminal is attached to and exposes that mapping to the rest of the system. The sidebar displays the tmux session name, and other features (like Plan 013's Session Metadata API) can use the mapping to target updates to all trex sessions viewing a given tmux session. When a user detaches from one tmux session and attaches to another, the tracking updates automatically.

This is the foundational "which trex sessions map to which tmux sessions?" capability that unlocks tmux-aware metadata targeting for Plan 013 and future features.

## Goals

- Detect which tmux session (if any) each trex terminal session is currently attached to
- Update detection automatically when users attach, detach, or switch tmux sessions
- Display the tmux session name in the sidebar, replacing the auto-generated session name (e.g., show "work" instead of "bash-1"); user renames still take priority
- Expose the tmux-to-trex session mapping via the REST API (`GET /api/sessions` includes `tmuxSessionName` field)
- Expose the mapping via WebSocket so the frontend receives real-time updates when tmux attachment changes
- Expose the tmux mapping so Plan 013's Session Metadata API can use it (Plan 013 decides targeting semantics)
- Degrade gracefully when tmux is not installed or no tmux server is running (no errors, monitoring simply disabled)
- Support multiple tmux servers (users may run `tmux -L custom_socket`)
- Tracking is transient (in-memory only, like sessions themselves)

## Non-Goals

- Persisting tmux session mapping to disk
- Creating, destroying, or managing tmux sessions from trex (that's tmax's responsibility per ADR-0001)
- Displaying tmux window/pane details (only the session name)
- Installing or configuring tmux hooks automatically (deferred enhancement)
- Replacing or wrapping the tmax library — this uses direct tmux CLI calls behind a clean interface that can be swapped for tmax later
- Detecting non-tmux multiplexers (screen, zellij, etc.)
- Defining how metadata API targets sessions by tmux name (deferred to Plan 013)

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=1, N=0, F=0, T=1
  - Surface Area (S=1): Backend changes span PTY, session, server (monitor goroutine); frontend touches session store and sidebar. Focused scope.
  - Integration (I=1): One external dependency — tmux CLI. Graceful degradation when absent.
  - Data/State (D=1): New field on Session struct and SessionInfo; new WebSocket message type. No persistence.
  - Novelty (N=0): Well-understood after research. `tmux list-clients` output format verified on this machine.
  - Non-Functional (F=0): Standard. Polling at configurable intervals (default 2s) with 6.5ms execution time is negligible.
  - Testing (T=1): Unit tests for monitor/parser logic, manual verification for sidebar display.
- **Confidence**: 0.85
- **Assumptions**:
  - `tmux list-clients -F '#{client_tty} #{session_name}'` reliably outputs the PTY TTY path on both macOS and Linux
  - `pty.Open()` + manual `cmd.Start()` correctly establishes a controlling terminal on macOS (to be validated)
  - Polling at configurable intervals (default 2s) provides acceptable responsiveness for UI updates
  - tmux is installed and on PATH for users who use tmux (reasonable for dev tool)
- **Dependencies**: Plan 013 (Session Metadata API) benefits from this but neither plan blocks the other
- **Risks**: PTY creation change (`pty.Open()` vs `pty.Start()`) affects all session creation; must be thoroughly tested
- **Phases**: Single phase (Simple mode)

## Acceptance Criteria

- AC-01: When a trex terminal session has `tmux attach -t <name>` running inside it, the sidebar replaces the auto-generated name with the tmux session name within the configured polling interval (default 2s)
- AC-02: When the user detaches from a tmux session (Ctrl-b d), the sidebar reverts to the auto-generated name within the polling interval
- AC-03: When the user switches tmux sessions (e.g., detach from "work", attach to "debug"), the sidebar reflects the new tmux session name within the polling interval
- AC-04: When multiple trex sessions are attached to the same tmux session, all sidebar entries show the same tmux session name
- AC-05: `GET /api/sessions` response includes a `tmuxSessionName` field for each session (empty string or omitted when not attached to tmux)
- AC-06: When tmux is not installed, trex starts normally with no errors and no tmux monitoring (graceful degradation)
- AC-07: When no tmux server is running, trex shows no tmux indicators and logs no errors
- AC-08: The session registry exposes a method to query "which trex sessions are attached to tmux session X?" for Plan 013's use
- AC-09: The tmux monitor does not noticeably affect backend performance (polling overhead < 10ms per cycle)
- AC-10: Frontend build passes with zero new errors (`npm run build`)
- AC-11: Backend Go tests pass (`go test ./...`)
- AC-12: The tmux session name display follows sidebar collapse behavior (hidden when collapsed to icon mode)
- AC-13: The polling interval is configurable via settings (default 2 seconds)
- AC-14: User-renamed sessions (`userRenamed: true`) retain the user's name; tmux name does not override manual renames

## Risks & Assumptions

- **Risk**: Changing PTY creation from `pty.Start()` to `pty.Open()` + manual wiring could introduce subtle issues with controlling terminal setup, especially on macOS. Mitigation: Test thoroughly; keep `pty.Start()` as fallback if `pty.Open()` has issues (just without tmux tracking).
- **Risk**: Users with many tmux servers could cause the polling goroutine to scan many sockets. Mitigation: Start with default socket only; scan all sockets only if feature flag enabled.
- **Assumption**: `tmux list-clients` output format is stable across tmux versions 2.x and 3.x. The `#{client_tty}` format variable has been available since tmux 1.8 (released 2013).
- **Assumption**: The PTY TTY device path (e.g., `/dev/ttys010`) is stable for the lifetime of the PTY process. It is assigned by the OS at creation and does not change.
- **Assumption**: tmux is installed and on the user's `$PATH`. This is reasonable for a developer tool.

## Open Questions

All resolved in clarification session 2026-02-10. See [Clarifications](#clarifications).

## ADR Seeds (Optional)

- **Decision Drivers**: Need outside-in detection (backend observes tmux without injecting code into tmux sessions); must work without user configuration; must be swappable for tmax library in the future
- **Candidate Alternatives**:
  - A: `tmux list-clients` polling (proposed) — reliable, cross-platform, no user setup
  - B: tmux hooks via `set-hook` — event-driven but requires hook installation
  - C: Process tree inspection — detects tmux presence but not session name
  - D: tmux control mode — powerful but over-engineered
- **Stakeholders**: Developer (primary user running Claude Code in tmux inside trex)

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: Go parser and monitor logic are cleanly unit-testable; sidebar UI and live tmux interaction are best verified manually
- **Focus Areas**:
  - `parseTmuxClients()` output parser: various formats, edge cases, empty output, malformed lines
  - Monitor change detection: detect attach, detach, session switch, no-change (idempotent)
  - PTY TTY path capture: verify `pty.Open()` returns valid path
  - Frontend session store: `tmuxSessionName` field updates via WebSocket message
- **Excluded**: Live tmux integration tests (requires running tmux server), sidebar visual rendering
- **Mock Usage**: Fakes only (per ADR-0004). `TmuxDetector` interface enables `FakeTmuxDetector` for monitor tests. Real `SessionRegistry` + `FakePTY` with `TtyPath` field.

## Documentation Strategy

- **Location**: docs/how/ only
- **Rationale**: Internal plumbing that future maintainers need to understand — how tmux detection works, the polling architecture, and how to swap for tmax library later
- **Target Audience**: Developers maintaining or extending the tmux detection subsystem
- **Maintenance**: Update when detection mechanism changes (e.g., switching from CLI polling to tmax library)

## Clarifications

### Session 2026-02-10

| # | Question | Answer | Sections Updated |
|---|----------|--------|-----------------|
| Q1 | Testing approach? | Hybrid — unit tests for parser/monitor/store, manual for sidebar UI and live tmux | Testing Strategy added |
| Q2 | Documentation location? | docs/how/ only — internal plumbing guide for maintainers | Documentation Strategy added |
| Q3 | UI placement for tmux session name? | Name replacement — tmux session name replaces auto-generated name (e.g., "work" instead of "bash-1"). Plan 013 will overhaul sidebar display further. | AC-01, Goals updated |
| Q4 | Polling interval? | Configurable — user-adjustable interval in settings. Default 2s. | AC-01 updated, new AC added |
| Q5 | Plan 013 API design for tmux targeting? | Defer to Plan 013 — Plan 014 builds tracking infrastructure only. Plan 013 decides how metadata API uses the tmux mapping. | Goals clarified, non-goal added |
| Q6 | Original name visibility when tmux replaces it? | Hidden for now — original auto-name not shown. Plan 013's sidebar overhaul will address this. | AC-01 updated |

**Coverage Summary**:
- **Resolved**: Testing, documentation, UI placement, polling configurability, Plan 013 API boundary, original name visibility
- **Deferred**: None
- **Outstanding**: None
