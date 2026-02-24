# Research Report: tmux Session Reconnect & Full URL State Persistence

**Generated**: 2026-02-24T11:20:00Z
**Research Query**: "tmux sessions in layouts should reconnect on reload, store tmux metadata per-pane in URL"
**Mode**: Pre-Plan
**Location**: docs/plans/023-tmux-session-reconnect/
**Findings**: 30+

## Executive Summary

### What It Does (Current State)
On page reload, ALL sessions are brand new. The URL stores only shell type, layout structure, and tmux metadata at the item level. tmux sessions create new `tmux attach` sessions but the tmux server persists — reconnection is possible but not implemented per-pane.

### Key Insights
1. **tmux sessions persist server-side** — they survive trex restarts. Reconnection is just `tmux attach -t <name>`.
2. **Current URL encoding is prefix notation** (`H50bz`) — cannot store per-pane metadata. Moving to JSON trees solves this.
3. **Working directory can be detected** via `/proc/<pid>/cwd` (Linux) or `lsof` (macOS) — backend needs a periodic reporter.

## Q&A Summary (10 Questions)

| # | Topic | Decision |
|---|-------|----------|
| Q1 | Scope | tmux reconnects; regular sessions restore shell type + cwd |
| Q2 | UX | Silent reconnect, no confirmation |
| Q3 | Dead tmux | SessionEndedOverlay; recovery is future wishlist |
| Q4 | Metadata location | Per-pane in tree — each leaf independently stores tmux data |
| Q5 | Mixed layouts | Each pane reconnects independently; dead panes show overlay |
| Q6 | Tree encoding | **JSON for everything** — future-proof, clean, not human-readable |
| Q7 | Working directory | Yes — store cwd per-pane for regular sessions |
| Q8 | Schema version | No backward compat. Break anything. Clean up old code. Alpha. |
| Q9 | cwd detection | Backend reports on create + periodic poll, configurable interval |
| Q10 | Item persistence | Store ALL state in URL (name, userRenamed, everything) |

## What Changes

### URL Encoding: Prefix Notation → Full JSON

**Before** (current):
```json
{
  "v": 1,
  "a": 0,
  "i": [
    { "t": "l", "n": "Layout", "r": "H50bz" }
  ]
}
```

**After** (proposed):
```json
{
  "v": 2,
  "a": 0,
  "i": [
    {
      "n": "My Layout",
      "ur": true,
      "t": {
        "type": "split",
        "dir": "h",
        "ratio": 0.5,
        "first": { "type": "terminal", "shell": "bash", "cwd": "/home/user/project" },
        "second": { "type": "terminal", "shell": "tmux", "tm": "api-server", "tw": 0 }
      },
      "fp": 0
    }
  ]
}
```

### Backend Changes
- **cwd reporter**: Detect working directory per session, report on create + periodic interval
- **cwd in session_created message**: Include initial cwd in WebSocket response
- **cwd polling**: Configurable interval (e.g., 5s default)
- **cwd in session metadata API**: GET /api/sessions returns cwd per session

### Frontend Changes
- **workspaceCodec.ts**: Rewrite to JSON tree encoding (delete prefix notation codec)
- **layoutCodec.ts**: Delete or repurpose (no more prefix notation)
- **useURLSync.ts**: Update to create tmux sessions with `createTmuxSession()` per leaf metadata
- **Session store**: Track cwd per session
- **URL write**: Include cwd from session store in tree leaves

## Prior Learnings

- **PL-01**: Strip TMUX env var for nested prevention (already implemented)
- **PL-02**: TTY polling via `tmux list-clients` for session detection (6.5ms/call)
- **PL-07**: tmux sessions persist across trex restarts — handle dead sessions gracefully
- **PL-08**: tmux session names allow dots/hyphens/underscores but not colons

## Modification Risk Assessment

### Safe
- URL codec rewrite (no backward compat needed)
- Session store cwd field addition
- Frontend tree encoding changes

### Caution
- Backend cwd detection (platform-specific: Linux vs macOS)
- Periodic cwd polling (performance impact at scale)

### Danger
- Deleting layoutCodec.ts (used by 36+ tests — must update/remove all)
- tmux session reconnection failure handling (race conditions with tmux server)

## Next Steps

Run `/plan-1b-specify` to formalize the specification.

---

**Research Complete**: 2026-02-24T11:20:00Z
**Report Location**: docs/plans/023-tmux-session-reconnect/research-dossier.md
