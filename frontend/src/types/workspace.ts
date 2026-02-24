/**
 * Workspace Types — Data model for the unified workspace.
 *
 * Every workspace item is a layout — a container with a binary tree of
 * 1 or more panes. A single-terminal item is simply a layout with one pane.
 *
 * Replaces the two-type model (session/layout) from Plan 016.
 * Each item owns its own split tree and focused pane.
 *
 * @see /docs/plans/022-unified-layout-architecture/unified-layout-architecture-plan.md
 */

import type { PaneLayout, SplitDirection, LeafFactory } from './layout'

/** A workspace item — always a layout with 1+ panes */
export interface WorkspaceItem {
  /** Unique workspace item ID */
  readonly id: string
  /** User-visible name (auto-derived from first session, renameable) */
  name: string
  /** Binary split tree of panes (single leaf for 1-pane items) */
  tree: PaneLayout
  /** Which pane has keyboard focus within this item */
  focusedPaneId: string | null
  /** Whether the user explicitly renamed this item */
  userRenamed: boolean
}

/** Workspace store state */
export interface WorkspaceState {
  /** Ordered list of workspace items (sidebar order) */
  items: WorkspaceItem[]
  /** Which item is currently visible in the terminal area */
  activeItemId: string | null
}

/** Workspace store actions */
export interface WorkspaceActions {
  // ── Item CRUD ──────────────────────────────────────────────────────

  /** Add a new workspace item */
  addItem: (name: string, tree: PaneLayout, focusedPaneId?: string | null) => string
  /** Convenience: add a 1-pane item for a session */
  addSessionItem: (sessionId: string) => string
  /** Remove a workspace item by its item ID */
  removeItem: (itemId: string) => void
  /** Set which workspace item is active (visible) */
  setActiveItem: (itemId: string | null) => void
  /** Get the active workspace item */
  getActiveItem: () => WorkspaceItem | undefined

  // ── Reorder ────────────────────────────────────────────────────────

  /** Move an item from one position to another in the sidebar order */
  reorderItem: (fromIndex: number, toIndex: number) => void

  // ── Layout operations (scoped to a specific item) ──────────────────

  /** Split a pane within an item, creating a new session pane */
  splitPane: (itemId: string, paneId: string, direction: SplitDirection, newSessionId: string, insertBefore?: boolean) => void
  /** Split a pane with a custom leaf factory (DYK-08: content-agnostic) */
  splitPaneWith: (itemId: string, paneId: string, direction: SplitDirection, createLeaf: LeafFactory, insertBefore?: boolean) => void
  /** Close a pane within an item */
  closePane: (itemId: string, paneId: string) => void
  /** Move a pane within an item */
  movePane: (itemId: string, sourcePaneId: string, targetPaneId: string, direction: SplitDirection) => void
  /** Set which pane is focused within an item */
  setFocusedPane: (itemId: string, paneId: string | null) => void
  /** Update the ratio of a split node at the given path */
  setRatio: (itemId: string, path: ('first' | 'second')[], ratio: number) => void
  /** Detach a pane, returning it as a new 1-pane item */
  detachPane: (itemId: string, paneId: string) => string | null
  /** Replace the session in a pane (for restarting dead sessions) */
  replaceSessionInPane: (itemId: string, paneId: string, newSessionId: string) => void

  // ── Item lifecycle ─────────────────────────────────────────────────

  /** Dissolve All: each terminal pane becomes a separate 1-pane item */
  dissolveAll: (itemId: string) => void
  /** Close an entire item: remove all sessions */
  closeLayout: (itemId: string) => string[]
  /** Rename an item */
  renameItem: (itemId: string, name: string) => void
  /** Clear a renamed item back to auto-derived name */
  clearItemName: (itemId: string) => void

  // ── Derived queries ────────────────────────────────────────────────

  /** Get all session IDs in an item's tree */
  getSessionsInLayout: (itemId: string) => string[]
  /** Get the focused session ID within the active item */
  getActiveSessionId: () => string | null
  /** Find which workspace item contains a given session ID */
  findItemBySessionId: (sessionId: string) => WorkspaceItem | undefined
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions
