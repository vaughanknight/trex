/**
 * Workspace Store — Manages the unified workspace state.
 *
 * Every workspace item is a layout with a binary tree of 1+ panes.
 * A single-terminal item is simply a layout with one leaf node.
 *
 * This store is TRANSIENT — not persisted to localStorage.
 * Workspace is reconstructed from URL on page load.
 *
 * WARNING: Selectors returning arrays/objects (items, getActiveItem, etc.)
 * create new references on every call. Consumers MUST use `useShallow`
 * or `getState()` imperatively. Scalar selectors (activeItemId, items.length)
 * are safe for direct subscription.
 *
 * @see /docs/plans/022-unified-layout-architecture/unified-layout-architecture-plan.md
 */

import { create, type StoreApi } from 'zustand'
import type { PaneLayout } from '../types/layout'
import { useSessionStore } from './sessions'
import type {
  WorkspaceItem,
  WorkspaceStore,
} from '../types/workspace'
import {
  splitPane as treeSplitPane,
  splitPaneWith as treeSplitPaneWith,
  closePane as treeClosePane,
  movePane as treeMovePane,
  findPane,
  getAllLeaves,
  getTerminalLeaves,
} from '../lib/layoutTree'

/** Replace the sessionId of a terminal leaf pane by paneId (pure, immutable) */
function replaceSession(tree: PaneLayout, paneId: string, newSessionId: string): PaneLayout {
  if (tree.type === 'terminal') {
    return tree.paneId === paneId ? { ...tree, sessionId: newSessionId } : tree
  }
  if (tree.type === 'preview') return tree
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

/** Get the session name for the first terminal leaf in a tree */
function getFirstLeafSessionName(tree: PaneLayout): string {
  const leaves = getTerminalLeaves(tree)
  if (leaves.length === 0) return 'Terminal'
  const session = useSessionStore.getState().sessions.get(leaves[0].sessionId)
  return session?.name ?? leaves[0].sessionId
}

function createStoreImpl(
  set: StoreApi<WorkspaceStore>['setState'],
  get: StoreApi<WorkspaceStore>['getState'],
): WorkspaceStore {
  return {
    items: [],
    activeItemId: null,

    // ── Item CRUD ──────────────────────────────────────────────────

    addItem: (name, tree, focusedPaneId = null) => {
      const id = crypto.randomUUID()
      const item: WorkspaceItem = { id, name, tree, focusedPaneId, userRenamed: false }
      set(state => ({ items: [...state.items, item] }))
      return id
    },

    addSessionItem: (sessionId) => {
      const paneId = crypto.randomUUID()
      const tree: PaneLayout = { type: 'terminal', paneId, sessionId }
      const session = useSessionStore.getState().sessions.get(sessionId)
      const name = session?.name ?? sessionId
      const id = crypto.randomUUID()
      const item: WorkspaceItem = { id, name, tree, focusedPaneId: paneId, userRenamed: false }
      set(state => ({ items: [...state.items, item] }))
      return id
    },

    removeItem: (itemId) => {
      set(state => {
        const newItems = state.items.filter(i => i.id !== itemId)
        let newActiveItemId = state.activeItemId
        if (state.activeItemId === itemId) {
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

    splitPane: (itemId, paneId, direction, newSessionId, insertBefore) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          const newTree = treeSplitPane(item.tree, paneId, direction, newSessionId, insertBefore)
          if (newTree === item.tree) return item
          // Auto-derive name from first leaf if not user-renamed
          const name = item.userRenamed ? item.name : getFirstLeafSessionName(newTree)
          return { ...item, tree: newTree, name }
        }),
      }))
    },

    splitPaneWith: (itemId, paneId, direction, createLeaf, insertBefore) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          const newTree = treeSplitPaneWith(item.tree, paneId, direction, createLeaf, insertBefore)
          if (newTree === item.tree) return item
          return { ...item, tree: newTree }
        }),
      }))
    },

    closePane: (itemId, paneId) => {
      set(state => {
        const originalItem = state.items.find(i => i.id === itemId)
        if (!originalItem) return state

        const newTree = treeClosePane(originalItem.tree, paneId)

        // Last pane closed — remove the item entirely
        if (newTree === null) {
          const newItems = state.items.filter(i => i.id !== itemId)
          const newActiveItemId = state.activeItemId === itemId
            ? (newItems.length > 0 ? newItems[0].id : null)
            : state.activeItemId
          return { items: newItems, activeItemId: newActiveItemId }
        }

        // Tree unchanged (paneId not found)
        if (newTree === originalItem.tree) return state

        // Auto-focus sibling if focused pane was closed
        let newFocusedPaneId = originalItem.focusedPaneId
        if (originalItem.focusedPaneId === paneId) {
          const leaves = getAllLeaves(newTree)
          newFocusedPaneId = leaves[0]?.paneId ?? null
        }

        // Update name from first leaf if not user-renamed
        const name = originalItem.userRenamed ? originalItem.name : getFirstLeafSessionName(newTree)

        const newItems = updateItem(state.items, itemId, () => ({
          ...originalItem,
          tree: newTree,
          focusedPaneId: newFocusedPaneId,
          name,
        }))

        return { items: newItems }
      })
    },

    movePane: (itemId, sourcePaneId, targetPaneId, direction) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          const newTree = treeMovePane(item.tree, sourcePaneId, targetPaneId, direction)
          if (newTree === item.tree) return item
          return { ...item, tree: newTree }
        }),
      }))
    },

    setFocusedPane: (itemId, paneId) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          return { ...item, focusedPaneId: paneId }
        }),
      }))
    },

    setRatio: (itemId, path, ratio) => {
      const clampedRatio = Math.max(0.1, Math.min(0.9, ratio))
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          if (item.tree.type !== 'split') return item
          const newTree = setRatioAtPath(item.tree, path, clampedRatio)
          if (newTree === item.tree) return item
          return { ...item, tree: newTree }
        }),
      }))
    },

    detachPane: (itemId, paneId) => {
      const { items } = get()
      const item = items.find(i => i.id === itemId)
      if (!item) return null

      const leaf = findPane(item.tree, paneId)
      if (!leaf) return null
      if (leaf.type !== 'terminal') return null

      const sessionId = leaf.sessionId
      const newTree = treeClosePane(item.tree, paneId)

      set(state => {
        let newItems: WorkspaceItem[]

        if (newTree === null) {
          // Last pane — remove item entirely
          newItems = state.items.filter(i => i.id !== itemId)
        } else {
          let newFocusedPaneId = item.focusedPaneId
          if (item.focusedPaneId === paneId) {
            const leaves = getAllLeaves(newTree)
            newFocusedPaneId = leaves[0]?.paneId ?? null
          }

          const name = item.userRenamed ? item.name : getFirstLeafSessionName(newTree)

          newItems = updateItem(state.items, itemId, () => ({
            ...item,
            tree: newTree,
            focusedPaneId: newFocusedPaneId,
            name,
          }))

          // No auto-dissolve — 1-pane items stay as-is
        }

        return { items: newItems }
      })

      return sessionId
    },

    replaceSessionInPane: (itemId, paneId, newSessionId) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          const newTree = replaceSession(item.tree, paneId, newSessionId)
          if (newTree === item.tree) return item
          return { ...item, tree: newTree }
        }),
      }))
    },

    // ── Item lifecycle ───────────────────────────────────────────

    dissolveAll: (itemId) => {
      set(state => {
        const itemIndex = state.items.findIndex(i => i.id === itemId)
        if (itemIndex === -1) return state

        const item = state.items[itemIndex]
        const terminalLeaves = getTerminalLeaves(item.tree)

        // Each terminal leaf becomes a 1-pane layout
        const newItems: WorkspaceItem[] = terminalLeaves.map(leaf => {
          const paneId = crypto.randomUUID()
          const session = useSessionStore.getState().sessions.get(leaf.sessionId)
          return {
            id: crypto.randomUUID(),
            name: session?.name ?? leaf.sessionId,
            tree: { type: 'terminal' as const, paneId, sessionId: leaf.sessionId },
            focusedPaneId: paneId,
            userRenamed: false,
          }
        })

        const allItems = [
          ...state.items.slice(0, itemIndex),
          ...newItems,
          ...state.items.slice(itemIndex + 1),
        ]

        const newActiveItemId = state.activeItemId === itemId && newItems.length > 0
          ? newItems[0].id
          : state.activeItemId

        return { items: allItems, activeItemId: newActiveItemId }
      })
    },

    closeLayout: (itemId) => {
      const { items } = get()
      const item = items.find(i => i.id === itemId)
      if (!item) return []

      const sessionIds = getTerminalLeaves(item.tree).map(l => l.sessionId)

      set(state => {
        const newItems = state.items.filter(i => i.id !== itemId)
        const newActiveItemId = state.activeItemId === itemId
          ? (newItems.length > 0 ? newItems[0].id : null)
          : state.activeItemId
        return { items: newItems, activeItemId: newActiveItemId }
      })

      return sessionIds
    },

    renameItem: (itemId, name) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          return { ...item, name, userRenamed: true }
        }),
      }))
    },

    clearItemName: (itemId) => {
      set(state => ({
        items: updateItem(state.items, itemId, item => {
          const autoName = getFirstLeafSessionName(item.tree)
          return { ...item, name: autoName, userRenamed: false }
        }),
      }))
    },

    // ── Derived queries ──────────────────────────────────────────

    getSessionsInLayout: (itemId) => {
      const { items } = get()
      const item = items.find(i => i.id === itemId)
      if (!item) return []
      return getTerminalLeaves(item.tree).map(l => l.sessionId)
    },

    getActiveSessionId: () => {
      const { items, activeItemId } = get()
      if (!activeItemId) return null
      const item = items.find(i => i.id === activeItemId)
      if (!item) return null

      if (!item.focusedPaneId) return null
      const leaf = findPane(item.tree, item.focusedPaneId)
      if (!leaf || leaf.type !== 'terminal') return null
      return leaf.sessionId
    },

    findItemBySessionId: (sessionId) => {
      const { items } = get()
      for (const item of items) {
        const leaves = getTerminalLeaves(item.tree)
        if (leaves.some(l => l.sessionId === sessionId)) return item
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
// Per C6: when a session exits, the workspace item stays with
// SessionEndedOverlay. Items are only removed by explicit user action.
// No auto-removal of workspace items on session exit.
useSessionStore.subscribe((state, prevState) => {
  if (state.sessions === prevState.sessions) return
  // No cleanup needed — panes show SessionEndedOverlay for dead sessions
})

// ── Selectors ────────────────────────────────────────────────────────

/** Safe scalar selector: active item ID */
export const selectActiveItemId = (state: WorkspaceStore) => state.activeItemId

/** Safe scalar selector: number of workspace items */
export const selectItemCount = (state: WorkspaceStore) => state.items.length

/**
 * Derived scalar selector: active session ID.
 * Returns the focused pane's session ID within the active item.
 * Returns null if nothing is active.
 */
export const selectActiveSessionId = (state: WorkspaceStore): string | null => {
  const { items, activeItemId } = state
  if (!activeItemId) return null
  const item = items.find(i => i.id === activeItemId)
  if (!item) return null
  if (!item.focusedPaneId) return null
  const leaf = findPane(item.tree, item.focusedPaneId)
  if (!leaf || leaf.type !== 'terminal') return null
  return leaf.sessionId
}
