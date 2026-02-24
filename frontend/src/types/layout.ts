/**
 * Layout Tree Types — Binary tree structure for split pane layouts.
 *
 * The layout is modeled as a recursive binary tree where:
 * - Leaf nodes represent individual panes (terminal or preview)
 * - Split nodes represent a division (horizontal or vertical) with a ratio
 *
 * This is the runtime tree shape — terminal leaves reference sessionIds,
 * preview leaves reference content sources.
 *
 * @see /docs/plans/015-pane-splitting/pane-splitting-plan.md § Phase 1
 * @see /docs/plans/017-clickable-terminal-links/clickable-terminal-links-plan.md § Phase 4
 */

/** Direction of a pane split: 'h' for horizontal (side-by-side), 'v' for vertical (top-bottom) */
export type SplitDirection = 'h' | 'v'

/**
 * A terminal leaf node in the layout tree — represents a single terminal pane.
 *
 * Each leaf has a unique `paneId` (used for focus management and drag targeting)
 * and a `sessionId` linking it to a backend terminal session.
 *
 * DYK-09: type renamed from 'leaf' to 'terminal' to disambiguate from PreviewLeaf.
 */
export interface PaneLeaf {
  readonly type: 'terminal'
  /** Unique identifier for this pane (generated via crypto.randomUUID()) */
  readonly paneId: string
  /** Backend session ID this pane is connected to */
  readonly sessionId: string
}

/**
 * A preview leaf node — renders file/URL content in a pane.
 *
 * Preview leaves have no session — they display static content.
 * DYK-01: Preview leaves are excluded from the 8-terminal-pane cap.
 */
export interface PreviewLeaf {
  readonly type: 'preview'
  /** Unique identifier for this pane */
  readonly paneId: string
  /** What kind of content is being previewed */
  readonly contentType: 'markdown' | 'text' | 'url'
  /** Source path or URL to preview */
  readonly source: string
}

/** Any leaf node in the layout tree */
export type LayoutLeaf = PaneLeaf | PreviewLeaf

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
 * A node in the layout tree — a leaf (terminal or preview) or a split (branch).
 *
 * The tree is always a valid binary tree:
 * - A single pane is just a leaf node
 * - Multiple panes form a tree of `PaneSplit` nodes with leaf nodes
 * - Maximum 8 terminal panes (enforced by tree mutation functions)
 * - Preview panes are excluded from the cap (DYK-01)
 */
export type PaneLayout = PaneLeaf | PreviewLeaf | PaneSplit

/**
 * Factory function for creating leaf nodes.
 * DYK-08: Keeps workspace store content-agnostic — callers provide factories
 * that create any leaf type (terminal or preview).
 */
export type LeafFactory = (paneId: string) => PaneLeaf | PreviewLeaf
