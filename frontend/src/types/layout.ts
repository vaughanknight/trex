/**
 * Layout Tree Types — Binary tree structure for split pane layouts.
 *
 * The layout is modeled as a recursive binary tree where:
 * - Leaf nodes represent individual terminal panes with a session
 * - Split nodes represent a division (horizontal or vertical) with a ratio
 *
 * This is the runtime tree shape — leaves reference sessionIds.
 * Phase 6 introduces a separate URL tree shape with shell-based leaves.
 *
 * @see /docs/plans/015-pane-splitting/pane-splitting-plan.md § Phase 1
 */

/** Direction of a pane split: 'h' for horizontal (side-by-side), 'v' for vertical (top-bottom) */
export type SplitDirection = 'h' | 'v'

/**
 * A leaf node in the layout tree — represents a single terminal pane.
 *
 * Each leaf has a unique `paneId` (used for focus management and drag targeting)
 * and a `sessionId` linking it to a backend terminal session.
 */
export interface PaneLeaf {
  readonly type: 'leaf'
  /** Unique identifier for this pane (generated via crypto.randomUUID()) */
  readonly paneId: string
  /** Backend session ID this pane is connected to */
  readonly sessionId: string
}

/**
 * A split node in the layout tree — divides space between two children.
 *
 * The `ratio` determines how space is divided between `first` and `second`:
 * - For 'h' (horizontal): ratio is the width fraction of `first` (left pane)
 * - For 'v' (vertical): ratio is the height fraction of `first` (top pane)
 */
export interface PaneSplit {
  readonly type: 'split'
  /** Direction of the split */
  readonly direction: SplitDirection
  /** Fraction of space allocated to `first` child (0-1 exclusive) */
  readonly ratio: number
  /** Left (h) or top (v) child */
  readonly first: PaneLayout
  /** Right (h) or bottom (v) child */
  readonly second: PaneLayout
}

/**
 * A node in the layout tree — either a terminal pane (leaf) or a split (branch).
 *
 * The tree is always a valid binary tree:
 * - A single pane is just a `PaneLeaf`
 * - Multiple panes form a tree of `PaneSplit` nodes with `PaneLeaf` leaves
 * - Maximum 8 leaves (enforced by tree mutation functions)
 */
export type PaneLayout = PaneLeaf | PaneSplit
