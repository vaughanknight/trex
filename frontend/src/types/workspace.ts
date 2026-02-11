/**
 * Workspace Types — Data model for the multi-layout workspace.
 *
 * A workspace is an ordered list of items, each either:
 * - A standalone session (single terminal)
 * - A layout (named group of sessions in a split tree)
 *
 * Replaces the single-layout model from Plan 015.
 * Each layout owns its own split tree and focused pane.
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 1
 */

import type { PaneLayout, SplitDirection } from './layout'

/** A standalone session in the workspace */
export interface WorkspaceSessionItem {
  readonly type: 'session'
  /** Unique workspace item ID (not the sessionId) */
  readonly id: string
  /** Backend session ID this item displays */
  readonly sessionId: string
}

/** A named layout containing multiple sessions in a split arrangement */
export interface WorkspaceLayoutItem {
  readonly type: 'layout'
  /** Unique workspace item ID */
  readonly id: string
  /** User-visible layout name (auto-generated from first session, renameable) */
  name: string
  /** Binary split tree of panes */
  tree: PaneLayout
  /** Which pane has keyboard focus within this layout */
  focusedPaneId: string | null
}

/** A workspace item is either a standalone session or a layout */
export type WorkspaceItem = WorkspaceSessionItem | WorkspaceLayoutItem

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

  /** Add a standalone session item to the workspace */
  addSessionItem: (sessionId: string) => string
  /** Add a layout item to the workspace */
  addLayoutItem: (name: string, tree: PaneLayout, focusedPaneId?: string | null) => string
  /** Remove a workspace item by its item ID */
  removeItem: (itemId: string) => void
  /** Set which workspace item is active (visible) */
  setActiveItem: (itemId: string | null) => void
  /** Get the active workspace item */
  getActiveItem: () => WorkspaceItem | undefined

  // ── Reorder ────────────────────────────────────────────────────────

  /** Move an item from one position to another in the sidebar order */
  reorderItem: (fromIndex: number, toIndex: number) => void

  // ── Layout operations (scoped to a specific layout item) ──────────

  /** Split a pane within a layout, creating a new session pane */
  splitPane: (itemId: string, paneId: string, direction: SplitDirection, newSessionId: string) => void
  /** Close a pane within a layout. Auto-dissolves to standalone if 1 pane remains */
  closePane: (itemId: string, paneId: string) => void
  /** Move a pane within a layout */
  movePane: (itemId: string, sourcePaneId: string, targetPaneId: string, direction: SplitDirection) => void
  /** Set which pane is focused within a layout */
  setFocusedPane: (itemId: string, paneId: string | null) => void
  /** Update the ratio of a split node at the given path within a layout */
  setRatio: (itemId: string, path: ('first' | 'second')[], ratio: number) => void
  /** Detach a pane from a layout, returning it as a standalone session */
  detachPane: (itemId: string, paneId: string) => string | null
  /** Replace the session in a pane (for restarting dead sessions) */
  replaceSessionInPane: (itemId: string, paneId: string, newSessionId: string) => void

  // ── Layout lifecycle ───────────────────────────────────────────────

  /** Convert a standalone session to a layout by splitting it */
  convertToLayout: (itemId: string, direction: SplitDirection, newSessionId: string) => void
  /** Dissolve a layout: all panes become standalone sessions at the layout's position */
  dissolveLayout: (itemId: string) => void
  /** Close an entire layout: remove all sessions */
  closeLayout: (itemId: string) => string[]
  /** Rename a layout */
  renameLayout: (itemId: string, name: string) => void

  // ── Derived queries ────────────────────────────────────────────────

  /** Get all session IDs that are part of a specific layout */
  getSessionsInLayout: (itemId: string) => string[]
  /** Get the focused session ID within the active layout (or the active standalone session) */
  getActiveSessionId: () => string | null
  /** Find which workspace item contains a given session ID */
  findItemBySessionId: (sessionId: string) => WorkspaceItem | undefined
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions
