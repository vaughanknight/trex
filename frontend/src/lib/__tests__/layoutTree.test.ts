/**
 * Layout Tree Operations Tests
 *
 * TDD tests for pure tree mutation functions.
 * These are the RED tests — written before implementation.
 *
 * @see /docs/plans/015-pane-splitting/pane-splitting-plan.md § Phase 1
 */

import { describe, it, expect } from 'vitest'
import {
  splitPane,
  closePane,
  findPane,
  countPanes,
  getAllLeaves,
  movePane,
  deriveIsFocused,
} from '../layoutTree'
import type { PaneLayout, PaneLeaf, PaneSplit } from '../../types/layout'

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a simple 2-pane horizontal split */
function twoPane(): PaneSplit {
  return {
    type: 'split',
    direction: 'h',
    ratio: 0.5,
    first: { type: 'leaf', paneId: 'p1', sessionId: 's1' },
    second: { type: 'leaf', paneId: 'p2', sessionId: 's2' },
  }
}

/** Build a 3-pane L-shaped layout: H(leaf, V(leaf, leaf)) */
function threePane(): PaneSplit {
  return {
    type: 'split',
    direction: 'h',
    ratio: 0.5,
    first: { type: 'leaf', paneId: 'p1', sessionId: 's1' },
    second: {
      type: 'split',
      direction: 'v',
      ratio: 0.5,
      first: { type: 'leaf', paneId: 'p2', sessionId: 's2' },
      second: { type: 'leaf', paneId: 'p3', sessionId: 's3' },
    },
  }
}

/** Build an 8-pane tree (binary tree with 8 leaves) */
function eightPaneTree(): PaneLayout {
  // Build balanced 8-leaf binary tree:
  // H(V(H(p1,p2), H(p3,p4)), V(H(p5,p6), H(p7,p8)))
  const pair = (a: string, b: string, sA: string, sB: string): PaneSplit => ({
    type: 'split',
    direction: 'h',
    ratio: 0.5,
    first: { type: 'leaf', paneId: a, sessionId: sA },
    second: { type: 'leaf', paneId: b, sessionId: sB },
  })

  return {
    type: 'split',
    direction: 'h',
    ratio: 0.5,
    first: {
      type: 'split',
      direction: 'v',
      ratio: 0.5,
      first: pair('p1', 'p2', 's1', 's2'),
      second: pair('p3', 'p4', 's3', 's4'),
    },
    second: {
      type: 'split',
      direction: 'v',
      ratio: 0.5,
      first: pair('p5', 'p6', 's5', 's6'),
      second: pair('p7', 'p8', 's7', 's8'),
    },
  }
}

// ── splitPane ────────────────────────────────────────────────────────

describe('splitPane', () => {
  /*
  Test Doc:
  - Why: Core layout mutation — splitting is how panes are created
  - Contract: splitPane inserts a new leaf as sibling of target pane
  - Usage Notes: Returns unchanged tree if 8-pane cap reached. Generates new paneId via crypto.randomUUID()
  - Quality Contribution: Prevents invalid tree structures, enforces 8-pane cap
  - Worked Example: leaf(p1,s1) + split(p1,h,s2) → split(h,0.5,leaf(p1),leaf(new,s2))
  */

  it('splits a single leaf into two panes', () => {
    const leaf: PaneLeaf = { type: 'leaf', paneId: 'p1', sessionId: 's1' }
    const result = splitPane(leaf, 'p1', 'h', 's2')

    expect(result.type).toBe('split')
    if (result.type === 'split') {
      expect(result.direction).toBe('h')
      expect(result.ratio).toBe(0.5)
      expect(result.first).toEqual({ type: 'leaf', paneId: 'p1', sessionId: 's1' })
      expect(result.second.type).toBe('leaf')
      if (result.second.type === 'leaf') {
        expect(result.second.sessionId).toBe('s2')
        expect(result.second.paneId).not.toBe('p1') // new unique ID
      }
    }
  })

  it('splits a nested leaf in a 3-pane tree', () => {
    const tree = threePane()
    const result = splitPane(tree, 'p3', 'h', 's4')

    // p3 should now be a split node containing the original p3 and a new leaf
    expect(countPanes(result)).toBe(4)
  })

  it('returns tree unchanged when 8-pane cap is reached', () => {
    const tree = eightPaneTree()
    expect(countPanes(tree)).toBe(8)

    const result = splitPane(tree, 'p1', 'h', 's9')
    expect(countPanes(result)).toBe(8)
    expect(result).toBe(tree) // same reference — no mutation
  })

  it('returns tree unchanged when target pane not found', () => {
    const leaf: PaneLeaf = { type: 'leaf', paneId: 'p1', sessionId: 's1' }
    const result = splitPane(leaf, 'nonexistent', 'h', 's2')
    expect(result).toBe(leaf)
  })

  it('splits with vertical direction', () => {
    const leaf: PaneLeaf = { type: 'leaf', paneId: 'p1', sessionId: 's1' }
    const result = splitPane(leaf, 'p1', 'v', 's2')

    expect(result.type).toBe('split')
    if (result.type === 'split') {
      expect(result.direction).toBe('v')
    }
  })
})

// ── closePane ────────────────────────────────────────────────────────

describe('closePane', () => {
  /*
  Test Doc:
  - Why: Closing panes is the complementary operation to splitting
  - Contract: closePane removes a leaf and collapses its parent split to the sibling
  - Usage Notes: Returns null when closing the last pane. Preserves sibling subtree
  - Quality Contribution: Prevents orphaned nodes and memory leaks
  - Worked Example: split(h, leaf(p1), leaf(p2)) + close(p2) → leaf(p1)
  */

  it('closing one side of a split returns the other side', () => {
    const tree = twoPane()
    const result = closePane(tree, 'p2')

    expect(result).toEqual({ type: 'leaf', paneId: 'p1', sessionId: 's1' })
  })

  it('closing the other side of a split returns its sibling', () => {
    const tree = twoPane()
    const result = closePane(tree, 'p1')

    expect(result).toEqual({ type: 'leaf', paneId: 'p2', sessionId: 's2' })
  })

  it('closing the last pane returns null', () => {
    const leaf: PaneLeaf = { type: 'leaf', paneId: 'p1', sessionId: 's1' }
    const result = closePane(leaf, 'p1')

    expect(result).toBeNull()
  })

  it('closing a nested pane collapses the parent', () => {
    const tree = threePane()
    // Close p3 (right-bottom) → right side collapses to p2
    const result = closePane(tree, 'p3')

    expect(result).not.toBeNull()
    expect(countPanes(result!)).toBe(2)
    // The remaining tree should have p1 and p2
    const leaves = getAllLeaves(result!)
    const paneIds = leaves.map((l) => l.paneId).sort()
    expect(paneIds).toEqual(['p1', 'p2'])
  })

  it('returns tree unchanged when target pane not found', () => {
    const tree = twoPane()
    const result = closePane(tree, 'nonexistent')
    expect(result).toBe(tree) // same reference
  })
})

// ── findPane ─────────────────────────────────────────────────────────

describe('findPane', () => {
  /*
  Test Doc:
  - Why: Pane lookup is needed for focus management and derived state
  - Contract: findPane returns the leaf with matching paneId, or null
  - Usage Notes: Searches recursively through the entire tree
  - Quality Contribution: Prevents null pointer errors in focus derivation
  - Worked Example: findPane(threePane, 'p3') → leaf(p3, s3)
  */

  it('finds a leaf in a flat tree', () => {
    const leaf: PaneLeaf = { type: 'leaf', paneId: 'p1', sessionId: 's1' }
    const result = findPane(leaf, 'p1')
    expect(result).toEqual(leaf)
  })

  it('finds a nested leaf', () => {
    const tree = threePane()
    const result = findPane(tree, 'p3')
    expect(result).toEqual({ type: 'leaf', paneId: 'p3', sessionId: 's3' })
  })

  it('returns null when pane not found', () => {
    const tree = threePane()
    const result = findPane(tree, 'nonexistent')
    expect(result).toBeNull()
  })
})

// ── countPanes ───────────────────────────────────────────────────────

describe('countPanes', () => {
  /*
  Test Doc:
  - Why: Count is used for 8-pane cap enforcement and UI decisions
  - Contract: countPanes returns the number of leaf nodes in the tree
  - Usage Notes: A single leaf returns 1, a split adds children recursively
  - Quality Contribution: Prevents cap bypass and incorrect UI state
  - Worked Example: threePane → 3, eightPaneTree → 8
  */

  it('counts a single leaf as 1', () => {
    const leaf: PaneLeaf = { type: 'leaf', paneId: 'p1', sessionId: 's1' }
    expect(countPanes(leaf)).toBe(1)
  })

  it('counts a 2-pane split as 2', () => {
    expect(countPanes(twoPane())).toBe(2)
  })

  it('counts a 3-pane tree as 3', () => {
    expect(countPanes(threePane())).toBe(3)
  })

  it('counts an 8-pane tree as 8', () => {
    expect(countPanes(eightPaneTree())).toBe(8)
  })
})

// ── getAllLeaves ──────────────────────────────────────────────────────

describe('getAllLeaves', () => {
  /*
  Test Doc:
  - Why: Leaf extraction is needed for getSessionsInLayout and sidebar filtering
  - Contract: getAllLeaves returns all leaf nodes in the tree as a flat array
  - Usage Notes: Order is depth-first (first subtree before second subtree)
  - Quality Contribution: Prevents missing sessions in layout enumeration
  - Worked Example: threePane → [leaf(p1,s1), leaf(p2,s2), leaf(p3,s3)]
  */

  it('returns single leaf in array', () => {
    const leaf: PaneLeaf = { type: 'leaf', paneId: 'p1', sessionId: 's1' }
    expect(getAllLeaves(leaf)).toEqual([leaf])
  })

  it('returns all leaves from a nested tree', () => {
    const tree = threePane()
    const leaves = getAllLeaves(tree)
    expect(leaves).toHaveLength(3)
    expect(leaves.map((l) => l.paneId)).toEqual(['p1', 'p2', 'p3'])
  })

  it('returns all 8 leaves from a full tree', () => {
    const tree = eightPaneTree()
    const leaves = getAllLeaves(tree)
    expect(leaves).toHaveLength(8)
    expect(leaves.map((l) => l.paneId).sort()).toEqual(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
    )
  })
})

// ── movePane ─────────────────────────────────────────────────────────

describe('movePane', () => {
  /*
  Test Doc:
  - Why: Moving panes is needed for drag-and-drop rearrangement (Phase 5)
  - Contract: movePane removes source from tree (collapsing parent), then splits target with source's session
  - Usage Notes: Self-targeting returns tree unchanged. Source not found returns unchanged. Target not found returns unchanged
  - Quality Contribution: Prevents invalid rearrangements and tree corruption
  - Worked Example: H(p1,p2) + move(p1, p2, 'v') → V(p2, leaf(s1)) (p1 removed, p2 split with p1's session)
  */

  it('moves a pane to a sibling position', () => {
    const tree = twoPane()
    const result = movePane(tree, 'p1', 'p2', 'v')

    // p1 is removed, p2 is split vertically with p1's session
    expect(result.type).toBe('split')
    if (result.type === 'split') {
      expect(result.direction).toBe('v')
      // The original p2 should be first, new pane with s1 should be second
      expect(result.first).toEqual({ type: 'leaf', paneId: 'p2', sessionId: 's2' })
      if (result.second.type === 'leaf') {
        expect(result.second.sessionId).toBe('s1')
      }
    }
  })

  it('moves a pane to a nested target', () => {
    const tree = threePane()
    // Move p1 to p3 with horizontal direction
    const result = movePane(tree, 'p1', 'p3', 'h')

    // p1 removed from left → collapses to the V(p2, p3) subtree
    // Then p3 is split horizontally with p1's session
    expect(countPanes(result)).toBe(3) // same count, just rearranged
    const leaves = getAllLeaves(result)
    const sessionIds = leaves.map((l) => l.sessionId).sort()
    expect(sessionIds).toEqual(['s1', 's2', 's3']) // all sessions preserved
  })

  it('returns tree unchanged when source equals target (self-targeting)', () => {
    const tree = twoPane()
    const result = movePane(tree, 'p1', 'p1', 'h')
    expect(result).toBe(tree) // same reference
  })

  it('returns tree unchanged when source pane not found', () => {
    const tree = twoPane()
    const result = movePane(tree, 'nonexistent', 'p1', 'h')
    expect(result).toBe(tree)
  })

  it('returns tree unchanged when target pane not found', () => {
    const tree = twoPane()
    const result = movePane(tree, 'p1', 'nonexistent', 'h')
    expect(result).toBe(tree)
  })

  it('handles move that causes parent collapse', () => {
    const tree = threePane()
    // Move p2 to p1 → the V(p2, p3) split collapses to just p3
    const result = movePane(tree, 'p2', 'p1', 'v')

    expect(countPanes(result)).toBe(3) // still 3 panes
    const leaves = getAllLeaves(result)
    const sessionIds = leaves.map((l) => l.sessionId).sort()
    expect(sessionIds).toEqual(['s1', 's2', 's3'])
  })
})

// ── deriveIsFocused ─────────────────────────────────────────────────

describe('deriveIsFocused', () => {
  /*
  Test Doc:
  - Why: Focus derivation determines which pane gets WebGL (Finding 02)
  - Contract: Returns true only when focusedPaneId matches paneId; false otherwise
  - Usage Notes: Called by PaneContainer to pass isFocused to Terminal
  - Quality Contribution: Prevents multiple panes from acquiring WebGL simultaneously
  - Worked Example: deriveIsFocused('p1', 'p1') → true, deriveIsFocused('p1', 'p2') → false
  */

  it('returns true when paneId matches focusedPaneId', () => {
    expect(deriveIsFocused('p1', 'p1')).toBe(true)
  })

  it('returns false when paneId does not match focusedPaneId', () => {
    expect(deriveIsFocused('p1', 'p2')).toBe(false)
  })

  it('returns false when focusedPaneId is null', () => {
    expect(deriveIsFocused(null, 'p1')).toBe(false)
  })
})
