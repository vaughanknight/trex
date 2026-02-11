/**
 * Layout Tree Operations — Pure functions for manipulating the pane layout binary tree.
 *
 * All functions are pure: they return new tree structures without mutating inputs.
 * The 8-pane hard cap is enforced at the tree level.
 *
 * @see /docs/plans/015-pane-splitting/pane-splitting-plan.md § Phase 1
 */

import type { PaneLayout, PaneLeaf, SplitDirection } from '../types/layout'

/** Maximum number of panes allowed in a layout */
const MAX_PANES = 8

/**
 * Count the number of leaf panes in a layout tree.
 *
 * @param tree - The layout tree to count
 * @returns Number of leaf nodes (panes)
 */
export function countPanes(tree: PaneLayout): number {
  if (tree.type === 'leaf') return 1
  return countPanes(tree.first) + countPanes(tree.second)
}

/**
 * Find a leaf pane by its paneId.
 *
 * @param tree - The layout tree to search
 * @param paneId - The pane ID to find
 * @returns The matching PaneLeaf, or null if not found
 */
export function findPane(tree: PaneLayout, paneId: string): PaneLeaf | null {
  if (tree.type === 'leaf') {
    return tree.paneId === paneId ? tree : null
  }
  return findPane(tree.first, paneId) ?? findPane(tree.second, paneId)
}

/**
 * Get all leaf nodes from a layout tree (depth-first order).
 *
 * @param tree - The layout tree to extract leaves from
 * @returns Array of all PaneLeaf nodes
 */
export function getAllLeaves(tree: PaneLayout): PaneLeaf[] {
  if (tree.type === 'leaf') return [tree]
  return [...getAllLeaves(tree.first), ...getAllLeaves(tree.second)]
}

/**
 * Split a pane into two, creating a new sibling with the given session.
 *
 * The target pane becomes the `first` child and the new pane becomes
 * the `second` child of a new split node with a 50/50 ratio.
 *
 * Returns the tree unchanged (same reference) if:
 * - The 8-pane cap would be exceeded
 * - The target pane is not found
 *
 * @param tree - The current layout tree
 * @param paneId - The pane to split
 * @param direction - 'h' for horizontal (side-by-side), 'v' for vertical (top-bottom)
 * @param newSessionId - Session ID for the new pane
 * @returns Updated layout tree
 */
export function splitPane(
  tree: PaneLayout,
  paneId: string,
  direction: SplitDirection,
  newSessionId: string,
): PaneLayout {
  // Enforce 8-pane cap
  if (countPanes(tree) >= MAX_PANES) return tree

  // Check target exists
  if (!findPane(tree, paneId)) return tree

  return splitPaneRecursive(tree, paneId, direction, newSessionId)
}

function splitPaneRecursive(
  tree: PaneLayout,
  paneId: string,
  direction: SplitDirection,
  newSessionId: string,
): PaneLayout {
  if (tree.type === 'leaf') {
    if (tree.paneId !== paneId) return tree

    const newLeaf: PaneLeaf = {
      type: 'leaf',
      paneId: crypto.randomUUID(),
      sessionId: newSessionId,
    }

    return {
      type: 'split',
      direction,
      ratio: 0.5,
      first: tree,
      second: newLeaf,
    }
  }

  // Recurse into children
  const newFirst = splitPaneRecursive(tree.first, paneId, direction, newSessionId)
  if (newFirst !== tree.first) {
    return { ...tree, first: newFirst }
  }

  const newSecond = splitPaneRecursive(tree.second, paneId, direction, newSessionId)
  if (newSecond !== tree.second) {
    return { ...tree, second: newSecond }
  }

  return tree
}

/**
 * Close (remove) a pane from the layout tree.
 *
 * When a pane is closed, its parent split collapses to the remaining sibling.
 * Returns null when closing the last pane.
 * Returns the tree unchanged (same reference) if the pane is not found.
 *
 * @param tree - The current layout tree
 * @param paneId - The pane to close
 * @returns Updated layout tree, or null if last pane was closed
 */
export function closePane(tree: PaneLayout, paneId: string): PaneLayout | null {
  if (tree.type === 'leaf') {
    return tree.paneId === paneId ? null : tree
  }

  // Check if the target is a direct child
  if (tree.first.type === 'leaf' && tree.first.paneId === paneId) {
    return tree.second
  }
  if (tree.second.type === 'leaf' && tree.second.paneId === paneId) {
    return tree.first
  }

  // Recurse into children
  const newFirst = closePane(tree.first, paneId)
  if (newFirst !== tree.first) {
    if (newFirst === null) return tree.second
    return { ...tree, first: newFirst }
  }

  const newSecond = closePane(tree.second, paneId)
  if (newSecond !== tree.second) {
    if (newSecond === null) return tree.first
    return { ...tree, second: newSecond }
  }

  return tree
}

/**
 * Move a pane from one position to another in the layout tree.
 *
 * Removes the source pane (collapsing its parent split to the remaining sibling),
 * then splits the target pane with the source's session in the given direction.
 *
 * Returns the tree unchanged (same reference) if:
 * - Source and target are the same pane
 * - Source pane is not found
 * - Target pane is not found
 *
 * @param tree - The current layout tree
 * @param sourcePaneId - The pane to move
 * @param targetPaneId - The pane to split with the source's session
 * @param direction - Direction of the new split at the target
 * @returns Updated layout tree
 */
/**
 * Derive whether a pane should be considered focused.
 *
 * Used by PaneContainer to pass `isFocused` to Terminal, which controls
 * WebGL acquisition. Only the focused pane gets WebGL rendering.
 *
 * @param focusedPaneId - The currently focused pane ID (from layout store)
 * @param paneId - The pane to check
 * @returns true if this pane is the focused pane
 */
export function deriveIsFocused(focusedPaneId: string | null, paneId: string): boolean {
  return focusedPaneId !== null && focusedPaneId === paneId
}

export function movePane(
  tree: PaneLayout,
  sourcePaneId: string,
  targetPaneId: string,
  direction: SplitDirection,
): PaneLayout {
  // Self-targeting is a no-op
  if (sourcePaneId === targetPaneId) return tree

  // Find source to get its sessionId
  const sourceLeaf = findPane(tree, sourcePaneId)
  if (!sourceLeaf) return tree

  // Check target exists
  if (!findPane(tree, targetPaneId)) return tree

  // Step 1: Remove source from tree
  const treeWithoutSource = closePane(tree, sourcePaneId)
  if (treeWithoutSource === null) return tree // shouldn't happen since target is different

  // Step 2: Split target with source's session
  return splitPane(treeWithoutSource, targetPaneId, direction, sourceLeaf.sessionId)
}
