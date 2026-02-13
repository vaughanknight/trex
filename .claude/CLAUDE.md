# Claude Code Instructions for trex

This file contains Claude-specific instructions for working on the trex project.

## Terminal Title Updates (REQUIRED)

You MUST update the terminal title to reflect your current work status. This provides visibility across multiple terminal sessions.

### How to Update Title

Use the provided scripts. **IMPORTANT: Always run title updates as fire-and-forget** — use `run_in_background: true` on the Bash tool and batch the title update in parallel with your next tool call. Title updates should NEVER block your workflow or consume a dedicated round-trip.

```bash
# When starting work on a plan
./scripts/set_title.sh working 008 P2/3 T3/25

# When waiting for user input (questions, confirmations, "what's next?")
./scripts/set_title.sh waiting 008 P2/3 T3/25

# When a phase is complete and ready for next
./scripts/set_title.sh phase-done 008 P3/3

# When a plan is complete
./scripts/set_title.sh plan-done 008-dynamic-session-titles

# When all work is done (idle)
./scripts/set_title.sh idle
```

### Execution Rules

1. **Always background**: Use `run_in_background: true` — never wait for the result
2. **Batch when possible**: Send the title update in the same message as your next tool call (e.g., title update + file read in parallel)
3. **Exception — completion states**: `plan-done`, `phase-done`, and `idle` may be the final action with nothing to batch against. A standalone background call is fine in this case.

### Title States

| State | When to Use | Example |
|-------|-------------|---------|
| `TR-008:P2/3:T3/25` | Actively working on task | Phase 2 of 3, Task 3 of 25 |
| `TR-008:T3/9` | Simple mode (no phases) | Task 3 of 9 |
| `TR-008:P2/3:T5/25:S2/4` | Working on subtask | Subtask 2 of 4 |
| `? TR-008:P2/3:T3/25` | Waiting for ANY user input | Questions, confirmations, "ready?" |
| `→ TR-008:P3/3` | Phase complete, ready for next | Arrow indicates "ready to proceed" |
| `✓ TR-008-dynamic-session-titles` | Plan complete | Checkmark with full slug |
| `trex` | Idle, no active work | Project name only |

### When to Update

1. **Starting a plan**: Set working state immediately
2. **Each task transition**: Update task counter (T3/25 → T4/25)
3. **Asking ANY question**: Add `?` prefix BEFORE asking
4. **User responds**: Remove `?` prefix, resume working state
5. **Phase complete**: Set `→` prefix
6. **Plan complete**: Set `✓` prefix with full slug
7. **All done**: Set idle state

### The `?` Prefix Rule

Add the `?` prefix whenever you stop and wait for user input, including:
- Using AskUserQuestion tool
- Asking "What's next?"
- Asking "Ready to continue?"
- Asking for clarification
- Waiting for approval
- Any pause that requires human response

Remove the `?` as soon as the user responds and you resume work.

## Development Setup (REQUIRED — READ THIS CAREFULLY)

### Vite Dev Server + ngrok (for live development)

During development, the user runs the **Vite dev server** on port 5173 with hot module reload (HMR). ngrok points to port **5173**, NOT the Go backend on port 3000.

**CRITICAL**: When the user wants to see changes in the browser:
- Frontend changes are **automatically hot-reloaded** by Vite — NO rebuild or restart needed
- Just save the file and the browser updates instantly
- **DO NOT** run `make copy-frontend` or restart the dev server for frontend changes
- **DO NOT** point ngrok to port 3000 — it MUST point to port 5173

```bash
# The user's typical dev setup (already running):
# Terminal 1: cd frontend && npm run dev     → Vite on http://localhost:5173
# Terminal 2: ./scripts/dev-server.sh start  → Go backend on http://localhost:3000
# Terminal 3: ngrok http 5173 --url=...      → Public URL → Vite (port 5173)
```

Vite proxies API/WebSocket requests to the Go backend automatically (configured in `vite.config.ts`).

### Go Backend Dev Server

When the user asks to start, stop, or restart the **backend** server, use the dev-server script:

```bash
./scripts/dev-server.sh start    # Start Go backend on port 3000
./scripts/dev-server.sh stop     # Stop
./scripts/dev-server.sh restart  # Restart
./scripts/dev-server.sh status   # Check status
./scripts/dev-server.sh logs     # Tail logs
```

The script uses `nohup` so the server survives if the parent process exits. Logs go to `backend/dev-server.log`, PID tracked in `backend/dev-server.pid`.

**NEVER** use raw `go run`, `make dev-backend`, or manual process management. Always use the script.

### Production Build (for deployment only)

Only use `make copy-frontend` when building for production/deployment (NOT for development):

```bash
make copy-frontend        # Builds frontend + copies to backend/internal/static/dist
./scripts/dev-server.sh restart
```

## Zustand Store Selectors (REQUIRED — CAUSES INFINITE LOOPS IF WRONG)

Zustand selectors that return **new object/array references** on every call cause React infinite re-render loops (`Maximum update depth exceeded`). This is the most common bug in this codebase.

### Rules

1. **NEVER subscribe to a store method that returns a new array/object**:
   ```tsx
   // BAD — getSessionsInLayout() creates a new array every render → infinite loop
   const sessions = useLayoutStore((state) => state.getSessionsInLayout())

   // GOOD — wrap with useShallow for shallow equality comparison
   const sessions = useLayoutStore(useShallow((state) => state.getSessionsInLayout()))

   // GOOD — read imperatively inside callbacks (no subscription at all)
   const sessions = useLayoutStore.getState().getSessionsInLayout()
   ```

2. **Prefer scalar selectors** (string, number, boolean, null) — they use `===` comparison and never cause loops:
   ```tsx
   // GOOD — scalar values are safe
   const layout = useLayoutStore((state) => state.layout)
   const focusedPaneId = useLayoutStore((state) => state.focusedPaneId)
   ```

3. **For arrays/objects in subscriptions**, always use `useShallow` from `zustand/shallow`:
   ```tsx
   import { useShallow } from 'zustand/shallow'
   const sessions = useSessionStore(useShallow(state =>
     Array.from(state.sessions.values())
   ))
   ```

4. **For values only needed inside callbacks** (not for rendering), use `getState()` imperatively:
   ```tsx
   // Inside useEffect, event handlers, or @atlaskit callbacks:
   const currentSessions = useLayoutStore.getState().getSessionsInLayout()
   ```

### Common Offenders
- `getSessionsInLayout()` — returns `string[]`, new ref every call
- `Array.from(state.sessions.values())` — new array every call
- Any `.map()`, `.filter()`, or spread in a selector

## Terminal Resize Architecture (REQUIRED — DO NOT USE window.resize)

Each Terminal component manages its own resize via a **per-terminal ResizeObserver** on its container div. There is NO global `window.resize` broadcast.

### Rules

1. **Each Terminal has its own ResizeObserver** — observes `containerRef.current` directly
2. **PaneContainer has NO ResizeObserver** — Terminal handles all resize detection
3. **Dimension caching** — ResizeObserver callback checks `contentRect` against cached values; skips entirely if unchanged
4. **cols/rows caching** — `sendResize()` only fires when terminal dimensions actually change
5. **NEVER dispatch `window.dispatchEvent(new Event('resize'))`** — this was the old pattern and caused N×N resize storms

### WebGL Pool

All terminals acquire WebGL on **mount** (not on focus change). The pool (`stores/webglPool.ts`) has `maxSize=4`.

```tsx
// GOOD — acquire on mount, release on unmount
// In the init effect:
const pool = useWebGLPoolStore.getState()
const addon = pool.acquire(sessionId, terminal)

// BAD — acquire/release on focus change (causes WebGL churn + DOM renderer fallback)
useEffect(() => { if (isFocused) pool.acquire(...) }, [isFocused])
```

### TypeScript Config

`erasableSyntaxOnly` is enabled. **DO NOT** use `private`, `public`, or `protected` keywords in classes. Use `#private` syntax or omit access modifiers.

## Pre-Push CI Check (REQUIRED)

You MUST run the full build locally before pushing to ensure CI will pass. Do NOT rely on `tsc --noEmit` alone — it is less strict than `tsc -b` and misses errors like unused imports (TS6196).

```bash
# Frontend (same command as CI)
cd frontend && npm run build

# Backend
cd backend && go test ./...
```

Run both before every push. If either fails, fix the issue before pushing.

## Project Configuration

The project config lives at `.config/project.json`:

```json
{
  "abbreviation": "TR",
  "name": "trex"
}
```

If the config doesn't exist, `scripts/project_title.sh` will auto-create it from the folder name.

## Reference

See `docs/project-rules/constitution.md` § Agent Workflow Status for the full specification.
