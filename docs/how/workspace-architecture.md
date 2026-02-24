# Workspace Architecture

> **Last updated**: 2026-02-24 | **Plan**: [022-unified-layout-architecture](../plans/022-unified-layout-architecture/)

## Overview

Every workspace item is a **layout** — a container with a binary tree of 1 or more panes. There is no distinction between "standalone sessions" and "layouts." A single-terminal item is simply a layout with one leaf node in its tree.

## Data Model

```typescript
interface WorkspaceItem {
  id: string           // Unique workspace item ID
  name: string         // Display name (auto-derived or user-set)
  tree: PaneLayout     // Binary split tree (single leaf for 1-pane items)
  focusedPaneId: string | null  // Which pane has keyboard focus
  userRenamed: boolean  // Whether user explicitly renamed this item
}
```

### Tree Structure

The `PaneLayout` is a recursive binary tree:
- **Leaf nodes**: `{ type: 'terminal', paneId, sessionId }` or `{ type: 'preview', paneId, contentType, source }`
- **Split nodes**: `{ type: 'split', direction: 'h'|'v', ratio: 0.1-0.9, first, second }`

A 1-pane item has `tree = { type: 'terminal', paneId: '...', sessionId: '...' }`.

## Sidebar Rendering

Sidebar rendering adapts based on pane count:

| Pane Count | Icon | Name Source | Badge | Context Menu |
|------------|------|-------------|-------|--------------|
| 1 | TerminalSquare | Session store name (unless user-renamed) | Hidden | Rename, Close |
| 2+ | Columns2 (or dynamic preview) | Item name | Shown | Rename, Dissolve All, Close |

### Adaptive Name Rules

1. `userRenamed === false` → name auto-derived from first terminal pane's session name
2. `userRenamed === true` → user's chosen name persists regardless of pane count
3. Clearing a name resets `userRenamed` to `false` and reverts to pane[0]'s session name
4. If pane[0] is closed, name auto-updates to new pane[0]'s session name (when not user-renamed)

## Store Operations

### Creating Items

```typescript
// Convenience: create a 1-pane item from a session
store.addSessionItem(sessionId) → itemId

// Full control: create with any tree
store.addItem(name, tree, focusedPaneId) → itemId
```

### Splitting Panes

Every drop (whether on a 1-pane or multi-pane item) uses `splitPane()`:

```typescript
store.splitPane(itemId, paneId, direction, newSessionId, insertBefore?)
```

There is no `convertToLayout` — splitting a 1-pane item's single leaf creates a split node naturally.

### Dissolving

"Dissolve All" creates N separate 1-pane items:

```typescript
store.dissolveAll(itemId)  // Each terminal leaf → new 1-pane item
```

### Session Exit

When a backend session exits, the workspace item stays with a `SessionEndedOverlay`. Items are only removed by explicit user action ("Close").

## URL Encoding

All workspace state is encoded as **gzip-compressed JSON** in the `?w=` URL parameter (ADR-0012).

**Pipeline**: `WorkspaceState → JSON → fflate.gzip → base64url`

### Schema (v2)

```json
{
  "v": 2,
  "a": 0,
  "i": [
    {
      "n": "My Layout",
      "ur": true,
      "t": {
        "d": "h", "r": 0.5,
        "1": { "sh": "bash", "c": "/home/user/project" },
        "2": { "sh": "tmux", "tm": "api-server", "tw": 0 }
      },
      "fp": 0
    }
  ]
}
```

### Per-Pane Metadata

Each terminal leaf stores:
- `sh` — shell type (bash, zsh, fish, tmux, default)
- `c` — working directory (optional, restored on reload)
- `tm` — tmux session name (optional, triggers reconnection)
- `tw` — tmux window index (optional, default 0)

### Compression

fflate (gzip) achieves ~94.5% compression. Even 100 items (247 panes) produces only ~2,295 URL chars.

### Session Reconnection

On page reload:
- **tmux panes** silently reconnect to existing server-side sessions via `createTmuxSession(name, window)`
- **Regular panes** create fresh sessions with restored cwd via `createSession(callback, cwd)`
- **Dead tmux sessions** show `SessionEndedOverlay` per-pane

### Working Directory

Backend detects cwd per session:
- Initial cwd reported in `session_created` WebSocket message
- Periodic `cwd_update` messages sent at configurable interval (default 5s)
- Frontend stores cwd per session; encodes in URL per-pane

## Drag & Drop

- **1-pane items**: disappear from sidebar when dragged into another item
- **Multi-pane items**: stay in sidebar when dragged
- **Tmux items**: create new sessions on drop (unchanged)
- **All drops**: call `splitPane()` — no separate first-split flow

## Key Files

| File | Purpose |
|------|---------|
| `types/workspace.ts` | Unified `WorkspaceItem` type definition |
| `stores/workspace.ts` | Zustand store with all mutations and selectors |
| `stores/sessions.ts` | Session metadata (name, shellType, cwd, tmuxSessionName) |
| `lib/layoutTree.ts` | Pure binary tree functions (split, close, move, find) |
| `lib/workspaceCodec.ts` | Gzip-compressed JSON URL encode/decode (ADR-0012) |
| `hooks/useURLSync.ts` | URL ↔ workspace state synchronization with tmux reconnection |
| `hooks/useCentralWebSocket.ts` | WebSocket with session creation, cwd updates |
| `components/LayoutSidebarItem.tsx` | Universal sidebar item component |
| `components/PaneLayout.tsx` | Recursive tree renderer |
| `components/PaneContainer.tsx` | Individual pane wrapper |
