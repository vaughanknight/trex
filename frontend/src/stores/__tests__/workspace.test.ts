/**
 * Workspace Store Tests
 *
 * TDD tests for the workspace store with unified WorkspaceItem model.
 * Covers: item CRUD, active item switching, layout operations,
 * splitPane on 1-pane items, no-auto-dissolve, reorder, and derived queries.
 *
 * Test Doc:
 * - Why: Workspace store is the central state for multi-layout workspace management
 * - Contract: Store manages ordered workspace items; each item owns its own tree + focus
 * - Usage Notes: Store is transient (not persisted). Use createWorkspaceStore() factory for testing
 * - Quality Contribution: Prevents data model regressions, infinite loops, orphaned items
 * - Worked Example: createWorkspaceStore() → {items: [], activeItemId: null}
 *
 * @see /docs/plans/022-unified-layout-architecture/unified-layout-architecture-plan.md
 */

import { describe, it, expect } from 'vitest'
import { createWorkspaceStore } from '../workspace'
import type { PaneLeaf, PaneSplit } from '../../types/layout'

// ── Helpers ──────────────────────────────────────────────────────────

function leaf(paneId: string, sessionId: string): PaneLeaf {
  return { type: 'terminal', paneId, sessionId }
}

function twoPane(): PaneSplit {
  return {
    type: 'split',
    direction: 'h',
    ratio: 0.5,
    first: leaf('p1', 's1'),
    second: leaf('p2', 's2'),
  }
}

function threePane(): PaneSplit {
  return {
    type: 'split',
    direction: 'h',
    ratio: 0.5,
    first: leaf('p1', 's1'),
    second: {
      type: 'split',
      direction: 'v',
      ratio: 0.5,
      first: leaf('p2', 's2'),
      second: leaf('p3', 's3'),
    },
  }
}

// ── Initial State ────────────────────────────────────────────────────

describe('Workspace Store', () => {
  it('starts with empty items and null activeItemId', () => {
    const store = createWorkspaceStore()
    expect(store.getState().items).toEqual([])
    expect(store.getState().activeItemId).toBeNull()
  })

  // ── addSessionItem ─────────────────────────────────────────────────

  describe('addSessionItem', () => {
    it('adds a 1-pane item with a terminal leaf tree', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addSessionItem('session-1')

      expect(store.getState().items).toHaveLength(1)
      const item = store.getState().items[0]
      expect(item.id).toBe(itemId)
      expect(item.tree.type).toBe('terminal')
      if (item.tree.type === 'terminal') {
        expect(item.tree.sessionId).toBe('session-1')
      }
      expect(item.focusedPaneId).toBeTruthy()
      expect(item.userRenamed).toBe(false)
    })

    it('preserves item order when adding multiple items', () => {
      const store = createWorkspaceStore()
      store.getState().addSessionItem('s1')
      store.getState().addSessionItem('s2')
      store.getState().addSessionItem('s3')

      const items = store.getState().items
      expect(items).toHaveLength(3)
      // All items have trees; extract sessionId from terminal leaf
      const sessionIds = items.map(i => i.tree.type === 'terminal' ? i.tree.sessionId : '')
      expect(sessionIds).toEqual(['s1', 's2', 's3'])
    })
  })

  // ── addItem ────────────────────────────────────────────────────────

  describe('addItem', () => {
    it('adds an item with a multi-pane tree', () => {
      const store = createWorkspaceStore()
      const tree = twoPane()
      const itemId = store.getState().addItem('my-layout', tree, 'p1')

      expect(store.getState().items).toHaveLength(1)
      const item = store.getState().items[0]
      expect(item.id).toBe(itemId)
      expect(item.name).toBe('my-layout')
      expect(item.tree).toEqual(tree)
      expect(item.focusedPaneId).toBe('p1')
      expect(item.userRenamed).toBe(false)
    })
  })

  // ── removeItem ─────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('removes a workspace item by ID', () => {
      const store = createWorkspaceStore()
      const id1 = store.getState().addSessionItem('s1')
      store.getState().addSessionItem('s2')

      store.getState().removeItem(id1)
      expect(store.getState().items).toHaveLength(1)
      const remaining = store.getState().items[0]
      expect(remaining.tree.type).toBe('terminal')
      if (remaining.tree.type === 'terminal') {
        expect(remaining.tree.sessionId).toBe('s2')
      }
    })

    it('auto-selects next item when active item is removed', () => {
      const store = createWorkspaceStore()
      const id1 = store.getState().addSessionItem('s1')
      const id2 = store.getState().addSessionItem('s2')

      store.getState().setActiveItem(id1)
      store.getState().removeItem(id1)

      expect(store.getState().activeItemId).toBe(id2)
    })

    it('clears activeItemId when last item is removed', () => {
      const store = createWorkspaceStore()
      const id1 = store.getState().addSessionItem('s1')
      store.getState().setActiveItem(id1)
      store.getState().removeItem(id1)

      expect(store.getState().activeItemId).toBeNull()
    })

    it('no-op when removing non-existent item', () => {
      const store = createWorkspaceStore()
      store.getState().addSessionItem('s1')
      store.getState().removeItem('nonexistent')
      expect(store.getState().items).toHaveLength(1)
    })
  })

  // ── setActiveItem / getActiveItem ──────────────────────────────────

  describe('active item switching', () => {
    it('setActiveItem updates activeItemId', () => {
      const store = createWorkspaceStore()
      const id = store.getState().addSessionItem('s1')
      store.getState().setActiveItem(id)
      expect(store.getState().activeItemId).toBe(id)
    })

    it('setActiveItem(null) clears active item', () => {
      const store = createWorkspaceStore()
      const id = store.getState().addSessionItem('s1')
      store.getState().setActiveItem(id)
      store.getState().setActiveItem(null)
      expect(store.getState().activeItemId).toBeNull()
    })

    it('getActiveItem returns the active workspace item', () => {
      const store = createWorkspaceStore()
      const id = store.getState().addSessionItem('s1')
      store.getState().setActiveItem(id)

      const active = store.getState().getActiveItem()
      expect(active).toBeDefined()
      expect(active?.id).toBe(id)
    })

    it('getActiveItem returns undefined when no item is active', () => {
      const store = createWorkspaceStore()
      store.getState().addSessionItem('s1')
      expect(store.getState().getActiveItem()).toBeUndefined()
    })
  })

  // ── Layout operations ──────────────────────────────────────────────

  describe('layout operations', () => {
    it('splitPane adds a new pane to a 1-pane item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', leaf('p1', 's1'), 'p1')

      store.getState().splitPane(itemId, 'p1', 'h', 's2')

      const item = store.getState().items[0]
      expect(item.tree.type).toBe('split')
    })

    it('splitPane respects 8-pane cap', () => {
      const store = createWorkspaceStore()
      const pair = (a: string, b: string, sA: string, sB: string): PaneSplit => ({
        type: 'split', direction: 'h', ratio: 0.5,
        first: leaf(a, sA), second: leaf(b, sB),
      })
      const eightPanes: PaneSplit = {
        type: 'split', direction: 'h', ratio: 0.5,
        first: { type: 'split', direction: 'v', ratio: 0.5, first: pair('p1', 'p2', 's1', 's2'), second: pair('p3', 'p4', 's3', 's4') },
        second: { type: 'split', direction: 'v', ratio: 0.5, first: pair('p5', 'p6', 's5', 's6'), second: pair('p7', 'p8', 's7', 's8') },
      }
      const itemId = store.getState().addItem('test', eightPanes, 'p1')
      store.getState().splitPane(itemId, 'p1', 'h', 's9')

      // Should still be 8 panes (rejected)
      const item = store.getState().items[0]
      expect(item.tree).toEqual(eightPanes)
    })

    it('closePane removes a pane from a multi-pane item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p1')

      store.getState().closePane(itemId, 'p2')

      const item = store.getState().items[0]
      expect(item.tree.type).toBe('terminal')
    })

    it('closePane auto-focuses sibling when focused pane is closed', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p2')

      store.getState().closePane(itemId, 'p2')

      const item = store.getState().items[0]
      expect(item.focusedPaneId).toBe('p1')
    })

    it('movePane rearranges panes within an item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', threePane(), 'p1')

      store.getState().movePane(itemId, 'p3', 'p1', 'v')

      const item = store.getState().items[0]
      expect(item.tree.type).toBe('split')
    })

    it('setFocusedPane updates the focused pane', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p1')

      store.getState().setFocusedPane(itemId, 'p2')

      const item = store.getState().items[0]
      expect(item.focusedPaneId).toBe('p2')
    })

    it('setRatio updates split ratio', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p1')

      store.getState().setRatio(itemId, [], 0.7)

      const item = store.getState().items[0]
      expect(item.tree.type).toBe('split')
      if (item.tree.type === 'split') {
        expect(item.tree.ratio).toBe(0.7)
      }
    })

    it('detachPane removes pane and returns sessionId', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p1')

      const sessionId = store.getState().detachPane(itemId, 'p2')
      expect(sessionId).toBe('s2')

      const item = store.getState().items[0]
      expect(item.tree.type).toBe('terminal')
    })

    it('replaceSessionInPane swaps the session in a pane', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p1')

      store.getState().replaceSessionInPane(itemId, 'p2', 'new-session')

      const sessions = store.getState().getSessionsInLayout(itemId)
      expect(sessions).toContain('new-session')
      expect(sessions).toContain('s1')
      expect(sessions).not.toContain('s2')
    })
  })

  // ── splitPane on 1-pane items ──────────────────────────────────────

  describe('splitPane on 1-pane items', () => {
    it('splits a 1-pane item created via addSessionItem into 2 panes', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addSessionItem('s1')
      store.getState().setActiveItem(itemId)

      // Get the paneId from the 1-pane item's tree
      const item = store.getState().items[0]
      expect(item.tree.type).toBe('terminal')
      const paneId = item.tree.type === 'terminal' ? item.tree.paneId : ''

      store.getState().splitPane(itemId, paneId, 'h', 'new-session')

      const updated = store.getState().items[0]
      expect(updated.tree.type).toBe('split')
      expect(updated.id).toBe(itemId) // same item ID preserved
    })

    it('preserves sidebar position when splitting', () => {
      const store = createWorkspaceStore()
      store.getState().addSessionItem('s0')
      const itemId = store.getState().addSessionItem('s1')
      store.getState().addSessionItem('s2')

      const item = store.getState().items[1]
      const paneId = item.tree.type === 'terminal' ? item.tree.paneId : ''

      store.getState().splitPane(itemId, paneId, 'v', 'new-session')

      expect(store.getState().items[1].id).toBe(itemId)
      expect(store.getState().items[1].tree.type).toBe('split')
    })
  })

  // ── No auto-dissolve (closing to 1 pane keeps item) ───────────────

  describe('closing panes keeps item as-is', () => {
    it('item with 1 pane remaining stays as a 1-pane item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p1')
      store.getState().setActiveItem(itemId)

      store.getState().closePane(itemId, 'p2')

      // After closing p2, only p1 remains — item stays with tree as single leaf
      const item = store.getState().items[0]
      expect(item.tree.type).toBe('terminal')
      if (item.tree.type === 'terminal') {
        expect(item.tree.sessionId).toBe('s1')
        expect(item.tree.paneId).toBe('p1')
      }
      expect(item.focusedPaneId).toBe('p1')
      // Item ID should be preserved
      expect(item.id).toBe(itemId)
    })

    it('closing to 1 pane preserves activeItemId', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p1')
      store.getState().setActiveItem(itemId)

      store.getState().closePane(itemId, 'p2')

      expect(store.getState().activeItemId).toBe(itemId)
    })

    it('detachPane to 1 pane keeps item as a 1-pane item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p1')

      store.getState().detachPane(itemId, 'p2')

      const item = store.getState().items[0]
      expect(item.tree.type).toBe('terminal')
      if (item.tree.type === 'terminal') {
        expect(item.tree.sessionId).toBe('s1')
      }
    })
  })

  // ── dissolveAll ────────────────────────────────────────────────────

  describe('dissolveAll', () => {
    it('creates N 1-pane items at the original position', () => {
      const store = createWorkspaceStore()
      store.getState().addSessionItem('s0')
      const layoutId = store.getState().addItem('test', threePane(), 'p1')
      store.getState().addSessionItem('s99')

      store.getState().dissolveAll(layoutId)

      const items = store.getState().items
      // s0, then 3 dissolved 1-pane items (s1, s2, s3), then s99
      expect(items).toHaveLength(5)
      // All items have tree as terminal leaf
      for (const item of items) {
        expect(item.tree.type).toBe('terminal')
      }
      // Verify session IDs of the dissolved items
      const dissolved = items.slice(1, 4)
      const sessionIds = dissolved.map(i => i.tree.type === 'terminal' ? i.tree.sessionId : '')
      expect(sessionIds.sort()).toEqual(['s1', 's2', 's3'])
    })
  })

  // ── closeLayout ────────────────────────────────────────────────────

  describe('closeLayout', () => {
    it('removes the item and returns all session IDs', () => {
      const store = createWorkspaceStore()
      const layoutId = store.getState().addItem('test', threePane(), 'p1')

      const sessionIds = store.getState().closeLayout(layoutId)

      expect(sessionIds.sort()).toEqual(['s1', 's2', 's3'])
      expect(store.getState().items).toHaveLength(0)
    })
  })

  // ── renameItem ─────────────────────────────────────────────────────

  describe('renameItem', () => {
    it('updates an item name and sets userRenamed', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('old-name', twoPane(), 'p1')

      store.getState().renameItem(itemId, 'new-name')

      const item = store.getState().items[0]
      expect(item.name).toBe('new-name')
      expect(item.userRenamed).toBe(true)
    })
  })

  // ── reorderItem ────────────────────────────────────────────────────

  describe('reorderItem', () => {
    it('moves an item from one position to another', () => {
      const store = createWorkspaceStore()
      const id1 = store.getState().addSessionItem('s1')
      store.getState().addSessionItem('s2')
      store.getState().addSessionItem('s3')

      // Move s1 (index 0) to index 2
      store.getState().reorderItem(0, 2)

      const items = store.getState().items
      expect(items[2].id).toBe(id1)
      expect(items[0].id !== id1).toBe(true)
    })

    it('no-op when indices are equal', () => {
      const store = createWorkspaceStore()
      store.getState().addSessionItem('s1')
      store.getState().addSessionItem('s2')

      const before = store.getState().items.map(i => i.id)
      store.getState().reorderItem(0, 0)
      const after = store.getState().items.map(i => i.id)

      expect(after).toEqual(before)
    })

    it('handles boundary conditions', () => {
      const store = createWorkspaceStore()
      store.getState().addSessionItem('s1')
      store.getState().addSessionItem('s2')

      // Out of range — should not crash
      store.getState().reorderItem(-1, 0)
      store.getState().reorderItem(0, 10)
      expect(store.getState().items).toHaveLength(2)
    })
  })

  // ── Derived queries ────────────────────────────────────────────────

  describe('derived queries', () => {
    it('getSessionsInLayout returns all session IDs in a multi-pane item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', threePane(), 'p1')

      const sessions = store.getState().getSessionsInLayout(itemId)
      expect(sessions.sort()).toEqual(['s1', 's2', 's3'])
    })

    it('getSessionsInLayout returns session for a 1-pane item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addSessionItem('s1')
      const sessions = store.getState().getSessionsInLayout(itemId)
      expect(sessions).toHaveLength(1)
      expect(sessions[0]).toBe('s1')
    })

    it('getActiveSessionId returns session ID for active 1-pane item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addSessionItem('s1')
      store.getState().setActiveItem(itemId)

      expect(store.getState().getActiveSessionId()).toBe('s1')
    })

    it('getActiveSessionId returns focused session ID for active multi-pane item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p2')
      store.getState().setActiveItem(itemId)

      expect(store.getState().getActiveSessionId()).toBe('s2')
    })

    it('getActiveSessionId returns null when no item is active', () => {
      const store = createWorkspaceStore()
      expect(store.getState().getActiveSessionId()).toBeNull()
    })

    it('findItemBySessionId finds 1-pane item by session', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addSessionItem('s1')

      const found = store.getState().findItemBySessionId('s1')
      expect(found?.id).toBe(itemId)
    })

    it('findItemBySessionId finds multi-pane item containing session', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addItem('test', twoPane(), 'p1')

      const found = store.getState().findItemBySessionId('s2')
      expect(found?.id).toBe(itemId)
    })

    it('findItemBySessionId returns undefined for unknown session', () => {
      const store = createWorkspaceStore()
      expect(store.getState().findItemBySessionId('nonexistent')).toBeUndefined()
    })
  })

  // ── Drag-to-layout source item removal ─────────────────────────────

  describe('drag-to-layout source item removal', () => {
    it('removeItem cleans up source item after splitPane', () => {
      const store = createWorkspaceStore()
      const layoutId = store.getState().addItem('layout', leaf('p1', 's1'), 'p1')
      const sourceId = store.getState().addSessionItem('s2')

      store.getState().splitPane(layoutId, 'p1', 'h', 's2')
      store.getState().removeItem(sourceId)

      expect(store.getState().items).toHaveLength(1)
      expect(store.getState().items[0].id).toBe(layoutId)
      const sessions = store.getState().getSessionsInLayout(layoutId)
      expect(sessions).toContain('s2')
      expect(sessions).toContain('s1')
    })

    it('removeItem cleans up source item after splitting a 1-pane item', () => {
      const store = createWorkspaceStore()
      const targetId = store.getState().addSessionItem('s1')
      const sourceId = store.getState().addSessionItem('s2')

      // Get the paneId from the target's 1-pane tree
      const target = store.getState().items[0]
      const paneId = target.tree.type === 'terminal' ? target.tree.paneId : ''

      store.getState().splitPane(targetId, paneId, 'h', 's2')
      store.getState().removeItem(sourceId)

      expect(store.getState().items).toHaveLength(1)
      expect(store.getState().items[0].tree.type).toBe('split')
      expect(store.getState().items[0].id).toBe(targetId)
    })
  })
})
