/**
 * Workspace Store — Manages the multi-layout workspace state.
 *
 * Replaces layout.ts (deleted) and UI store's activeSessionId.
 * This store is TRANSIENT — not persisted to localStorage.
 * Workspace is reconstructed from URL on page load.
 *
 * The workspace is an ordered list of items, each either:
 * - A standalone session (single terminal)
 * - A layout (named group of sessions in a split tree)
 *
 * Each layout owns its own split tree and focused pane, enabling
 * multiple simultaneous layouts with independent state.
 *
 * WARNING: Selectors returning arrays/objects (items, getActiveItem, etc.)
 * create new references on every call. Consumers MUST use `useShallow`
 * or `getState()` imperatively. Scalar selectors (activeItemId, items.length)
 * are safe for direct subscription.
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 1
 */

import { create, type StoreApi } from 'zustand'
import type { PaneLayout } from '../types/layout'
import { useSessionStore } from './sessions'
import type {
  WorkspaceItem,
  WorkspaceSessionItem,
  WorkspaceLayoutItem,
  WorkspaceStore,
} from '../types/workspace'
import {
  splitPane as treeSplitPane,
  closePane as treeClosePane,
  movePane as treeMovePane,
  findPane,
  getAllLeaves,
} from '../lib/layoutTree'

/** Replace the sessionId of a leaf pane by paneId (pure, immutable) */
function replaceSession(tree: PaneLayout, paneId: string, newSessionId: string): PaneLayout {
  if (tree.type === 'leaf') {
    return tree.paneId === paneId ? { ...tree, sessionId: newSessionId } : tree
  }
  const newFirst = replaceSession(tree.first, paneId, newSessionId)
  if (newFirst !== tree.first) return { ...tree, first: newFirst }
  const newSecond = replaceSession(tree.second, paneId, newSessionId)
  if (newSecond !== tree.second) return { ...tree, second: newSecond }
  return tree
}

/** Navigate to a split node at path and update its ratio */
function setRatioAtPath(
  tree: PaneLayout,
  path: ('first' | 'second')[],
  ratio: number,
): PaneLayout {
  if (tree.type !== 'split') return tree
  if (path.length === 0) return { ...tree, ratio }
  const [head, ...rest] = path
  if (head === 'first') {
    const newFirst = setRatioAtPath(tree.first, rest, ratio)
    return newFirst !== tree.first ? { ...tree, first: newFirst } : tree
  } else {
    const newSecond = setRatioAtPath(tree.second, rest, ratio)
    return newSecond !== tree.second ? { ...tree, second: newSecond } : tree
  }
}

/** Update a specific item in the items array by ID */
function updateItem(
  items: WorkspaceItem[],
  itemId: string,
  updater: (item: WorkspaceItem) => WorkspaceItem,
): WorkspaceItem[] {
  return items.map(item => item.id === itemId ? updater(item) : item)
}

/** Check if a layout should auto-dissolve (1 pane remaining → standalone session) */
function maybeAutoDissolve(
  items: WorkspaceItem[],
  itemId: string,
): WorkspaceItem[] {
  return items.map(item => {
    if (item.id !== itemId || item.type !== 'layout') return item
    const tree = item.tree
    if (tree.type === 'leaf') {
      // Auto-dissolve: convert layout with 1 pane back to standalone session
      return {
        type: 'session' as const,
        id: item.id,
        sessionId: tree.sessionId,
      }
    }
    return item
  })
}

function createStoreImpl(
  set: StoreApi<WorkspaceStore>['setState'],
  get: StoreApi<WorkspaceStore>['getState'],
): WorkspaceStore {
  return {
    items: [],
    activeItemId: null,

    // ── Item CRUD ──────────────────────────────────────────────────

    addSessionItem: (sessionId) => {
      const id = crypto.randomUUID()
      const item: WorkspaceSessionItem = { type: 'session', id, sessionId }
      set(state => ({ items: [...state.items, item] }))
      return id
    },

    addLayoutItem: (name, tree, focusedPaneId = null) => {
      const id = crypto.randomUUID()
      const item: WorkspaceLayoutItem = { type: 'layout', id, name, tree, focusedPaneId }
      set(state => ({ items: [...state.items, item] }))
      return id
    },

    removeItem: (itemId) => {
      set(state => {
        const newItems = state.items.filter(i => i.id !== itemId)
        let newActiveItemId = state.activeItemId
        if (state.activeItemId === itemId) {
          // Auto-select next item (or previous, or null)
          const removedIndex = state.items.findIndex(i => i.id === itemId)
          if (newItems.length === 0) {
            newActiveItemId = null
          } else if (removedIndex < newItems.length) {
            newActiveItemId = newItems[removedIndex].id
          } else {
            newActiveItemId = newItems[newItems.length - 1].id
          }
        }
        return { items: newItems, activeItemId: newActiveItemId }
      })
    },

    setActiveItem: (itemId) => set({ activeItemId: itemId }),

    getActiveItem: () => {
      const { items, activeItemId } = get()
      if (!activeItemId) return undefined
      return items.find(i => i.id === activeItemId)
    },

    // ── Reorder ──────────────────────────────────────────────────

    reorderItem: (fromIndex, toIndex) => {
      set(state => {
        const { items } = state
        if (fromIndex < 0 || fromIndex >= items.length) return state
        if (toIndex < 0 || toIndex >= items.length) return state
        if (fromIndex === toIndex) return state

        const newItems = [...items]
        const [moved] = newItems.splice(fromIndex, 1)
        newItems.splice(toIndex, 0, moved)
        return { items: newItems }
      })
    },

    // ── Layout operations ────────────────────────────────────────

    splitPane: (itemId, paneId, direction, newSessionId) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          if (item.type !== 'layout') return item
          const newTree = treeSplitPane(item.tree, paneId, direction, newSessionId)
          if (newTree === item.tree) return item
          return { ...item, tree: newTree }
        }),
      }))
    },

    closePane: (itemId, paneId) => {
      set(state => {
        let newItems = updateItem(state.items, itemId, item => {
          if (item.type !== 'layout') return item
          const newTree = treeClosePane(item.tree, paneId)
          if (newTree === item.tree) return item

          if (newTree === null) {
            // Last pane closed — remove the layout entirely
            // This will be handled by removeItem below
            return item
          }

          // Auto-focus sibling if focused pane was closed
          let newFocusedPaneId = item.focusedPaneId
          if (item.focusedPaneId === paneId) {
            const leaves = getAllLeaves(newTree)
            newFocusedPaneId = leaves[0]?.paneId ?? null
          }

          return { ...item, tree: newTree, focusedPaneId: newFocusedPaneId }
        })

        // Check if the layout's tree became null (last pane)
        const originalItem = state.items.find(i => i.id === itemId)
        if (originalItem?.type === 'layout') {
          const tree = treeClosePane(originalItem.tree, paneId)
          if (tree === null) {
            // Last pane was closed — remove the item
            newItems = newItems.filter(i => i.id !== itemId)
            const newActiveItemId = state.activeItemId === itemId
              ? (newItems.length > 0 ? newItems[0].id : null)
              : state.activeItemId
            return { items: newItems, activeItemId: newActiveItemId }
          }
        }

        // Auto-dissolve check
        newItems = maybeAutoDissolve(newItems, itemId)
        return { items: newItems }
      })
    },

    movePane: (itemId, sourcePaneId, targetPaneId, direction) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          if (item.type !== 'layout') return item
          const newTree = treeMovePane(item.tree, sourcePaneId, targetPaneId, direction)
          if (newTree === item.tree) return item
          return { ...item, tree: newTree }
        }),
      }))
    },

    setFocusedPane: (itemId, paneId) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          if (item.type !== 'layout') return item
          return { ...item, focusedPaneId: paneId }
        }),
      }))
    },

    setRatio: (itemId, path, ratio) => {
      const clampedRatio = Math.max(0.1, Math.min(0.9, ratio))
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          if (item.type !== 'layout' || item.tree.type !== 'split') return item
          const newTree = setRatioAtPath(item.tree, path, clampedRatio)
          if (newTree === item.tree) return item
          return { ...item, tree: newTree }
        }),
      }))
    },

    detachPane: (itemId, paneId) => {
      const { items } = get()
      const item = items.find(i => i.id === itemId)
      if (!item || item.type !== 'layout') return null

      const leaf = findPane(item.tree, paneId)
      if (!leaf) return null

      const sessionId = leaf.sessionId
      const newTree = treeClosePane(item.tree, paneId)

      set(state => {
        let newItems: WorkspaceItem[]

        if (newTree === null) {
          // Last pane — remove layout entirely
          newItems = state.items.filter(i => i.id !== itemId)
        } else {
          let newFocusedPaneId = item.focusedPaneId
          if (item.focusedPaneId === paneId) {
            const leaves = getAllLeaves(newTree)
            newFocusedPaneId = leaves[0]?.paneId ?? null
          }

          newItems = updateItem(state.items, itemId, () => ({
            ...item,
            tree: newTree,
            focusedPaneId: newFocusedPaneId,
          }))

          // Auto-dissolve check
          newItems = maybeAutoDissolve(newItems, itemId)
        }

        return { items: newItems }
      })

      return sessionId
    },

    replaceSessionInPane: (itemId, paneId, newSessionId) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          if (item.type !== 'layout') return item
          const newTree = replaceSession(item.tree, paneId, newSessionId)
          if (newTree === item.tree) return item
          return { ...item, tree: newTree }
        }),
      }))
    },

    // ── Layout lifecycle ─────────────────────────────────────────

    convertToLayout: (itemId, direction, newSessionId) => {
      set(state => {
        const itemIndex = state.items.findIndex(i => i.id === itemId)
        if (itemIndex === -1) return state

        const item = state.items[itemIndex]
        if (item.type !== 'session') return state // Only convert standalone sessions

        const existingPaneId = crypto.randomUUID()
        const newPaneId = crypto.randomUUID()

        const tree: PaneLayout = {
          type: 'split',
          direction,
          ratio: 0.5,
          first: { type: 'leaf', paneId: existingPaneId, sessionId: item.sessionId },
          second: { type: 'leaf', paneId: newPaneId, sessionId: newSessionId },
        }

        // Auto-name layout from the session's display name
        const session = useSessionStore.getState().sessions.get(item.sessionId)
        const layoutName = session?.name ?? item.sessionId

        const layoutItem: WorkspaceLayoutItem = {
          type: 'layout',
          id: item.id, // Preserve the workspace item ID
          name: layoutName,
          tree,
          focusedPaneId: existingPaneId,
        }

        const newItems = [...state.items]
        newItems[itemIndex] = layoutItem
        return { items: newItems }
      })
    },

    dissolveLayout: (itemId) => {
      set(state => {
        const itemIndex = state.items.findIndex(i => i.id === itemId)
        if (itemIndex === -1) return state

        const item = state.items[itemIndex]
        if (item.type !== 'layout') return state

        const leaves = getAllLeaves(item.tree)
        const standaloneItems: WorkspaceSessionItem[] = leaves.map(leaf => ({
          type: 'session',
          id: crypto.randomUUID(),
          sessionId: leaf.sessionId,
        }))

        const newItems = [
          ...state.items.slice(0, itemIndex),
          ...standaloneItems,
          ...state.items.slice(itemIndex + 1),
        ]

        // If this was the active item, activate the first dissolved session
        const newActiveItemId = state.activeItemId === itemId && standaloneItems.length > 0
          ? standaloneItems[0].id
          : state.activeItemId

        return { items: newItems, activeItemId: newActiveItemId }
      })
    },

    closeLayout: (itemId) => {
      const { items } = get()
      const item = items.find(i => i.id === itemId)
      if (!item || item.type !== 'layout') return []

      const sessionIds = getAllLeaves(item.tree).map(l => l.sessionId)

      set(state => {
        const newItems = state.items.filter(i => i.id !== itemId)
        const newActiveItemId = state.activeItemId === itemId
          ? (newItems.length > 0 ? newItems[0].id : null)
          : state.activeItemId
        return { items: newItems, activeItemId: newActiveItemId }
      })

      return sessionIds
    },

    renameLayout: (itemId, name) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          if (item.type !== 'layout') return item
          return { ...item, name }
        }),
      }))
    },

    // ── Derived queries ──────────────────────────────────────────

    getSessionsInLayout: (itemId) => {
      const { items } = get()
      const item = items.find(i => i.id === itemId)
      if (!item || item.type !== 'layout') return []
      return getAllLeaves(item.tree).map(l => l.sessionId)
    },

    getActiveSessionId: () => {
      const { items, activeItemId } = get()
      if (!activeItemId) return null
      const item = items.find(i => i.id === activeItemId)
      if (!item) return null

      if (item.type === 'session') return item.sessionId
      if (item.type === 'layout') {
        if (!item.focusedPaneId) return null
        const leaf = findPane(item.tree, item.focusedPaneId)
        return leaf?.sessionId ?? null
      }
      return null
    },

    findItemBySessionId: (sessionId) => {
      const { items } = get()
      for (const item of items) {
        if (item.type === 'session' && item.sessionId === sessionId) return item
        if (item.type === 'layout') {
          const leaves = getAllLeaves(item.tree)
          if (leaves.some(l => l.sessionId === sessionId)) return item
        }
      }
      return undefined
    },
  }
}

/**
 * Create a workspace store instance.
 * Exported as factory for testing (ADR-0004: fakes only pattern).
 */
export function createWorkspaceStore() {
  return create<WorkspaceStore>()((set, get) => createStoreImpl(set, get))
}

/** Singleton store instance for the app */
export const useWorkspaceStore = createWorkspaceStore()

// ── Session Lifecycle Subscription ────────────────────────────────────
// When a session is removed from the session store, clean up any
// workspace items that reference it. For standalone session items,
// remove the item. For layout items, close the pane containing that session.
useSessionStore.subscribe((state, prevState) => {
  if (state.sessions === prevState.sessions) return

  // Find session IDs that were removed
  const currentIds = new Set(state.sessions.keys())
  const removedIds: string[] = []
  for (const id of prevState.sessions.keys()) {
    if (!currentIds.has(id)) removedIds.push(id)
  }

  if (removedIds.length === 0) return

  const ws = useWorkspaceStore.getState()
  for (const sessionId of removedIds) {
    const item = ws.findItemBySessionId(sessionId)
    if (!item) continue
    if (item.type === 'session') {
      ws.removeItem(item.id)
    }
    // For layouts: panes with dead sessions keep their session overlay
    // (SessionEndedOverlay handles restart/close for individual panes)
  }
})

// ── Selectors ────────────────────────────────────────────────────────
// Scalar selectors are safe for direct subscription (no new references).
// Array/object selectors MUST use useShallow or getState().

/** Safe scalar selector: active item ID */
export const selectActiveItemId = (state: WorkspaceStore) => state.activeItemId

/** Safe scalar selector: number of workspace items */
export const selectItemCount = (state: WorkspaceStore) => state.items.length

/**
 * Derived scalar selector: active session ID.
 * Returns the session ID of the active standalone session, or the focused
 * pane's session ID within the active layout. Returns null if nothing is active.
 * This is scalar (string | null) so safe for direct subscription.
 */
export const selectActiveSessionId = (state: WorkspaceStore): string | null => {
  const { items, activeItemId } = state
  if (!activeItemId) return null
  const item = items.find(i => i.id === activeItemId)
  if (!item) return null
  if (item.type === 'session') return item.sessionId
  if (item.type === 'layout') {
    if (!item.focusedPaneId) return null
    const leaf = findPane(item.tree, item.focusedPaneId)
    return leaf?.sessionId ?? null
  }
  return null
}
