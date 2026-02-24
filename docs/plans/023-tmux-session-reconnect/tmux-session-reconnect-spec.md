# Session Reconnect & Full URL State Persistence

**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md` and the 10-question interactive Q&A.

## Research Context

- **Components affected**: URL codec (`workspaceCodec.ts`, `layoutCodec.ts`), `useURLSync.ts`, session store, workspace store, `PaneContainer.tsx`, backend terminal handler, backend session registry
- **Critical dependencies**: tmux server persistence, platform-specific cwd detection (`/proc/<pid>/cwd` on Linux, `lsof` on macOS), WebSocket message protocol
- **Modification risks**: Complete URL codec rewrite (no backward compat needed), backend Go changes for cwd reporting, 85+ codec tests to rewrite
- **Link**: See `research-dossier.md` for full analysis

## Summary

Make workspace state fully persistent across page reloads. tmux sessions silently reconnect to their existing server-side sessions. Regular sessions restore their shell type and working directory. The URL encoding moves from compact prefix notation to compressed JSON, storing complete per-pane metadata (tmux session name, window index, shell type, working directory) and item-level state (name, userRenamed, focusedPaneId). The JSON payload is compressed before base64url encoding to keep URLs compact despite richer data.

**WHY**: Users lose all terminal context on every page reload. tmux sessions survive on the server but trex creates fresh terminals instead of reconnecting. Working directories reset to `$HOME`. Layout names disappear. This makes trex feel disposable rather than persistent. Reconnection transforms trex from "terminal launcher" to "terminal workspace manager."

## Goals

1. **tmux session reconnection** — tmux panes silently reconnect to their existing server-side tmux sessions on page reload. No confirmation dialog.
2. **Per-pane metadata in URL** — Each tree leaf independently stores shell type, tmux session name, tmux window index, and working directory.
3. **Working directory persistence** — Backend detects and reports cwd per session. Frontend stores cwd in URL per-pane. Regular sessions start in their restored cwd.
4. **Full JSON URL encoding** — Replace prefix notation with compressed JSON trees. Entire workspace state (item names, userRenamed, focusedPaneId, tree structure, per-pane metadata) encoded in a single `?w=` parameter.
5. **URL compression** — JSON payload compressed (e.g., gzip/deflate) before base64url encoding to keep URLs compact despite richer data.
6. **Independent pane lifecycle** — Each pane in a mixed layout (tmux + regular) reconnects or creates independently. Dead tmux sessions show SessionEndedOverlay for just that pane.
7. **Configurable cwd polling** — Backend cwd detection interval is configurable (default 5s). Reported on session creation and periodically thereafter.
8. **Item-level state persistence** — Workspace item name, userRenamed flag, and focused pane survive page reload.

## Non-Goals

- **Session ID preservation** — Backend assigns new IDs on every reload. Session IDs are ephemeral.
- **Terminal scrollback persistence** — Terminal output/history is not stored or restored.
- **tmux session creation on dead session** — If a tmux session was killed, show overlay. Auto-recreation is future wishlist.
- **Backward-compatible URLs** — Old `?w=` format URLs will stop working. Alpha, single user.
- **Human-readable URLs** — JSON is compressed/encoded; not intended for manual editing.
- **Regular session reconnection** — Regular (non-tmux) sessions always create fresh terminals (with restored cwd). Only tmux sessions truly reconnect.

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=2, N=1, F=1, T=1
  - Surface Area (S=2): Frontend codec, URL sync, session store + Backend Go terminal handler, session registry, WebSocket messages
  - Integration (I=1): Platform-specific cwd detection (Linux `/proc` vs macOS `lsof`)
  - Data/State (D=2): Complete URL schema rewrite, new per-pane metadata model, backend cwd field
  - Novelty (N=1): cwd detection is well-understood but platform-specific; JSON compression for URLs needs sizing validation
  - Non-Functional (F=1): URL length limits (~2000 chars for universal compat), cwd polling performance
  - Testing/Rollout (T=1): Integration tests for reconnection flow; 85+ codec tests to rewrite
- **Confidence**: 0.80
- **Assumptions**:
  - Backend can detect cwd reliably on macOS and Linux
  - Compressed JSON URLs stay within ~2000 char limit for typical workspaces (5 items × 3 panes)
  - tmux server is always local (no remote tmux reconnection)
- **Dependencies**: None external. Backend Go changes required alongside frontend.
- **Risks**:
  - URL length with full JSON + compression may exceed browser limits for large workspaces
  - Platform-specific cwd detection may fail for some shell configurations
  - Race condition between tmux session death and page reload
- **Phases**: 4-5 phases suggested (backend cwd → URL codec rewrite → tmux reconnect → regular session cwd restore → polish)

## Acceptance Criteria

**AC-01: tmux pane reconnection**
A layout with a tmux pane ("api-server", window 0) encodes tmux metadata in the URL. On page reload, that pane silently reconnects to the existing tmux session "api-server" instead of creating a new terminal.

**AC-02: Dead tmux session handling**
If a tmux session was killed between page loads, the pane shows SessionEndedOverlay with a message indicating the tmux session was not found. Other panes in the same layout continue normally.

**AC-03: Per-pane metadata encoding**
A 3-pane layout with pane 1 (bash, cwd=/home/user/api), pane 2 (tmux "frontend", window 1), pane 3 (zsh, cwd=/tmp) encodes all metadata independently per leaf in the URL.

**AC-04: Working directory persistence**
A regular session with cwd=/home/user/project encodes the cwd in the URL. On reload, the new session starts in /home/user/project instead of $HOME.

**AC-05: Backend cwd reporting**
Backend reports the current working directory for each session in the `session_created` WebSocket message and periodically (configurable interval, default 5s).

**AC-06: JSON tree encoding**
The URL `?w=` parameter contains compressed JSON encoding the full workspace state. Prefix notation (`H50bz`) is completely removed from the codebase.

**AC-07: URL compression**
JSON payload is compressed before base64url encoding. A workspace with 5 items × 3 panes each stays within 2000 characters.

**AC-08: Item state persistence**
Workspace item name, userRenamed flag, and focusedPaneId survive page reload. An item renamed to "API Work" with focusedPaneId on pane 2 restores identically.

**AC-09: Mixed layout independence**
A 3-pane layout where pane 1 is tmux (reconnects), pane 2 is bash (creates fresh with cwd), pane 3 is dead tmux (shows overlay) — all three behave independently and correctly.

**AC-10: Configurable cwd polling**
Backend cwd polling interval is configurable via settings/environment. Setting interval to 0 disables polling.

**AC-11: Round-trip fidelity**
Encoding a workspace to URL and decoding it back produces identical workspace state (item names, tree structure, per-pane metadata, active item, focused panes).

**AC-12: All existing tests pass**
After codec rewrite, all test files pass with updated expectations. Old prefix notation tests replaced with JSON encoding tests.

## Risks & Assumptions

### Risks
1. **URL length** — Full JSON with cwd paths may create very long URLs. Compression mitigates but may not be sufficient for 8-pane layouts with long paths. Mitigation: truncate/omit cwds that exceed a threshold.
2. **Platform cwd detection** — `/proc/<pid>/cwd` not available on macOS; `lsof -p <pid>` is slower. Mitigation: platform-specific detection with graceful fallback.
3. **tmux race condition** — tmux session could die between URL encode and page reload. Mitigation: SessionEndedOverlay with clear error message.
4. **Compression compatibility** — Browser `CompressionStream` API may not be available in all contexts. Mitigation: fallback to uncompressed JSON.

### Assumptions
1. Alpha product, single user — no migration path needed
2. tmux server is always local (same machine as trex backend)
3. `/proc/<pid>/cwd` works on Linux; `lsof` or similar works on macOS
4. Browser `CompressionStream`/`DecompressionStream` available (or use pako/fflate library)
5. Backend Go can access child process cwd via `/proc` or `os.Readlink`

## Open Questions

All open questions resolved in Clarifications session 2026-02-24. See `## Clarifications` section.

## ADR Seeds (Optional)

- **Decision Drivers**: Full state persistence, URL compactness, future extensibility, platform portability
- **Candidate Alternatives**:
  - A: Compressed JSON trees (chosen) — maximum flexibility, not human-readable
  - B: Extended prefix notation with metadata markers — compact but limited extensibility
  - C: Server-side workspace storage with short URL tokens — requires persistence layer
- **Stakeholders**: Single developer (alpha)

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| JSON Tree Schema Design | Data Model | Per-pane metadata model affects URL size, codec complexity, and future extensibility | What's the minimal JSON schema? How to handle optional fields (cwd, tmux)? Compression ratio estimates? |
| Platform cwd Detection | Integration Pattern | Linux `/proc` vs macOS `lsof` vs Go `os.Readlink` — different APIs, error modes, performance | Which Go APIs work cross-platform? How to handle permission errors? What polling strategy minimizes overhead? |

## Testing & Documentation Strategy

### Testing Strategy
- **Approach**: Hybrid — TDD for codec/backend (cwd detection, JSON encoding, round-trips); Lightweight for UI components
- **Rationale**: Codec rewrite and backend cwd detection are high regression risk; UI changes are straightforward
- **Focus Areas**: JSON codec round-trips, gzip compression fidelity, tmux reconnection flow, cwd detection cross-platform, dead tmux session handling
- **Excluded**: Visual styling changes, sidebar rendering (manual verification)
- **Mock Usage**: Avoid mocks entirely — fakes only (per ADR-0004). Create `FakeCwdDetector` for backend tests.

### Documentation Strategy
- **Location**: docs/how/ only — update existing `workspace-architecture.md`
- **Rationale**: Extends existing architecture guide with URL encoding v2 and reconnection behavior
- **Target Audience**: Future contributors understanding workspace persistence
- **Maintenance**: Update when URL schema or reconnection behavior changes

## Clarifications

### Session 2026-02-24

**C1 — Workflow Mode**: Full mode (multi-phase). CS-4 with backend+frontend changes warrants comprehensive gates.

**C2 — Testing Strategy**: Hybrid — TDD for codec/backend, Lightweight for UI.

**C3 — Mock Usage**: Fakes only (ADR-0004). Create `FakeCwdDetector` for Go backend tests.

**C4 — Documentation Strategy**: docs/how/ only — update `workspace-architecture.md`.

**C5 — Compression Library**: Use bundled library (fflate, ~13KB) for guaranteed compatibility in browser + Vitest/Node tests.

**C6 — cwd Fallback**: Store last known cwd. If cwd doesn't exist on restore, session starts in `$HOME`.

**C7 — URL Length Limit**: No limit. Gzip compression keeps URLs naturally short (5-10 items = 462-598 chars; 100 items with 247 panes = 2,295 chars). Compression spike confirmed 94.5% reduction.

### Compression Spike Results

| Items | Panes | Raw JSON | Gzipped | URL chars |
|-------|-------|----------|---------|-----------|
| 1 | 1 | 107 B | 114 B | 152 |
| 5 | 13 | 1.6 KB | 346 B | 462 |
| 10 | 26 | 3.2 KB | 448 B | 598 |
| 50 | 116 | 14.6 KB | 1.0 KB | 1,371 |
| 100 | 247 | 31 KB | 1.7 KB | 2,295 |

### Coverage Summary

| Area | Status |
|------|--------|
| Workflow Mode | ✅ Resolved — Full |
| Testing Strategy | ✅ Resolved — Hybrid (TDD + Lightweight) |
| Mock Usage | ✅ Resolved — Fakes only (ADR-0004) |
| Documentation | ✅ Resolved — docs/how/ update |
| Compression Library | ✅ Resolved — fflate bundled library |
| cwd Fallback | ✅ Resolved — last known cwd, fallback to $HOME |
| URL Length Limit | ✅ Resolved — no limit, compression sufficient |
| Open Questions | 0 remaining |
