/**
 * Workspace Store Tests
 *
 * TDD tests for the workspace store that replaces the layout store.
 * Covers: item CRUD, active item switching, layout operations,
 * convertToLayout, auto-dissolve, reorder, and derived queries.
 *
 * Test Doc:
 * - Why: Workspace store is the central state for multi-layout workspace management
 * - Contract: Store manages ordered workspace items (sessions + layouts); each layout owns its own tree + focus
 * - Usage Notes: Store is transient (not persisted). Use createWorkspaceStore() factory for testing
 * - Quality Contribution: Prevents data model regressions, infinite loops, orphaned items
 * - Worked Example: createWorkspaceStore() → {items: [], activeItemId: null}
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 1
 */

import { describe, it, expect } from 'vitest'
import { createWorkspaceStore } from '../workspace'
import type { PaneLeaf, PaneSplit } from '../../types/layout'

// ── Helpers ──────────────────────────────────────────────────────────

function leaf(paneId: string, sessionId: string): PaneLeaf {
  return { type: 'leaf', paneId, sessionId }
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
    it('adds a standalone session item to the workspace', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addSessionItem('session-1')

      expect(store.getState().items).toHaveLength(1)
      const item = store.getState().items[0]
      expect(item.type).toBe('session')
      expect(item.id).toBe(itemId)
      if (item.type === 'session') {
        expect(item.sessionId).toBe('session-1')
      }
    })

    it('preserves item order when adding multiple items', () => {
      const store = createWorkspaceStore()
      store.getState().addSessionItem('s1')
      store.getState().addSessionItem('s2')
      store.getState().addSessionItem('s3')

      const items = store.getState().items
      expect(items).toHaveLength(3)
      expect(items.map(i => i.type === 'session' ? i.sessionId : '')).toEqual(['s1', 's2', 's3'])
    })
  })

  // ── addLayoutItem ──────────────────────────────────────────────────

  describe('addLayoutItem', () => {
    it('adds a layout item to the workspace', () => {
      const store = createWorkspaceStore()
      const tree = twoPane()
      const itemId = store.getState().addLayoutItem('my-layout', tree, 'p1')

      expect(store.getState().items).toHaveLength(1)
      const item = store.getState().items[0]
      expect(item.type).toBe('layout')
      expect(item.id).toBe(itemId)
      if (item.type === 'layout') {
        expect(item.name).toBe('my-layout')
        expect(item.tree).toEqual(tree)
        expect(item.focusedPaneId).toBe('p1')
      }
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
      expect(remaining.type).toBe('session')
      if (remaining.type === 'session') expect(remaining.sessionId).toBe('s2')
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

  describe('layout operations (scoped to layout item)', () => {
    it('splitPane adds a new pane to a layout', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', leaf('p1', 's1'), 'p1')

      store.getState().splitPane(itemId, 'p1', 'h', 's2')

      const item = store.getState().items[0]
      expect(item.type).toBe('layout')
      if (item.type === 'layout') {
        expect(item.tree.type).toBe('split')
      }
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
      const itemId = store.getState().addLayoutItem('test', eightPanes, 'p1')
      store.getState().splitPane(itemId, 'p1', 'h', 's9')

      // Should still be 8 panes (rejected)
      const item = store.getState().items[0]
      if (item.type === 'layout') {
        expect(item.tree).toEqual(eightPanes)
      }
    })

    it('closePane removes a pane from a layout', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p1')

      store.getState().closePane(itemId, 'p2')

      const item = store.getState().items[0]
      if (item.type === 'layout') {
        expect(item.tree.type).toBe('leaf')
      }
    })

    it('closePane auto-focuses sibling when focused pane is closed', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p2')

      store.getState().closePane(itemId, 'p2')

      const item = store.getState().items[0]
      if (item.type === 'layout') {
        expect(item.focusedPaneId).toBe('p1')
      }
    })

    it('movePane rearranges panes within a layout', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', threePane(), 'p1')

      store.getState().movePane(itemId, 'p3', 'p1', 'v')

      const item = store.getState().items[0]
      expect(item.type).toBe('layout')
    })

    it('setFocusedPane updates the focused pane within a layout', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p1')

      store.getState().setFocusedPane(itemId, 'p2')

      const item = store.getState().items[0]
      if (item.type === 'layout') {
        expect(item.focusedPaneId).toBe('p2')
      }
    })

    it('setRatio updates split ratio within a layout', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p1')

      store.getState().setRatio(itemId, [], 0.7)

      const item = store.getState().items[0]
      if (item.type === 'layout') {
        expect(item.tree.type).toBe('split')
        if (item.tree.type === 'split') {
          expect(item.tree.ratio).toBe(0.7)
        }
      }
    })

    it('detachPane removes pane from layout and returns sessionId', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p1')

      const sessionId = store.getState().detachPane(itemId, 'p2')
      expect(sessionId).toBe('s2')

      const item = store.getState().items[0]
      if (item.type === 'layout') {
        expect(item.tree.type).toBe('leaf')
      }
    })

    it('replaceSessionInPane swaps the session in a pane', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p1')

      store.getState().replaceSessionInPane(itemId, 'p2', 'new-session')

      const item = store.getState().items[0]
      if (item.type === 'layout') {
        const sessions = store.getState().getSessionsInLayout(itemId)
        expect(sessions).toContain('new-session')
        expect(sessions).toContain('s1')
        expect(sessions).not.toContain('s2')
      }
    })
  })

  // ── convertToLayout ────────────────────────────────────────────────

  describe('convertToLayout', () => {
    it('converts a standalone session to a layout with 2 panes', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addSessionItem('s1')
      store.getState().setActiveItem(itemId)

      store.getState().convertToLayout(itemId, 'h', 'new-session')

      const item = store.getState().items[0]
      expect(item.type).toBe('layout')
      if (item.type === 'layout') {
        expect(item.tree.type).toBe('split')
        expect(item.id).toBe(itemId) // same item ID preserved
      }
    })

    it('preserves sidebar position when converting', () => {
      const store = createWorkspaceStore()
      store.getState().addSessionItem('s0')
      const itemId = store.getState().addSessionItem('s1')
      store.getState().addSessionItem('s2')

      store.getState().convertToLayout(itemId, 'v', 'new-session')

      expect(store.getState().items[1].id).toBe(itemId)
      expect(store.getState().items[1].type).toBe('layout')
    })

    it('no-op when item is already a layout', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p1')

      store.getState().convertToLayout(itemId, 'h', 'new-session')

      // Should still be the same layout (not double-converted)
      const item = store.getState().items[0]
      if (item.type === 'layout') {
        expect(item.tree).toEqual(twoPane())
      }
    })
  })

  // ── Auto-dissolve ──────────────────────────────────────────────────

  describe('auto-dissolve', () => {
    it('layout with 1 pane remaining auto-dissolves to standalone session', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p1')
      store.getState().setActiveItem(itemId)

      store.getState().closePane(itemId, 'p2')

      // After closing p2, only p1 remains — should auto-dissolve
      const item = store.getState().items[0]
      expect(item.type).toBe('session')
      if (item.type === 'session') {
        expect(item.sessionId).toBe('s1')
      }
      // Item ID should be preserved
      expect(item.id).toBe(itemId)
    })

    it('auto-dissolve preserves activeItemId', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p1')
      store.getState().setActiveItem(itemId)

      store.getState().closePane(itemId, 'p2')

      expect(store.getState().activeItemId).toBe(itemId)
    })

    it('detachPane triggers auto-dissolve when 1 pane remains', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p1')

      store.getState().detachPane(itemId, 'p2')

      const item = store.getState().items[0]
      expect(item.type).toBe('session')
      if (item.type === 'session') {
        expect(item.sessionId).toBe('s1')
      }
    })
  })

  // ── dissolveLayout ─────────────────────────────────────────────────

  describe('dissolveLayout', () => {
    it('converts all layout panes to standalone sessions at layout position', () => {
      const store = createWorkspaceStore()
      store.getState().addSessionItem('s0')
      const layoutId = store.getState().addLayoutItem('test', threePane(), 'p1')
      store.getState().addSessionItem('s99')

      store.getState().dissolveLayout(layoutId)

      const items = store.getState().items
      // s0, then 3 dissolved sessions (s1, s2, s3), then s99
      expect(items).toHaveLength(5)
      expect(items[0].type).toBe('session')
      expect(items[1].type).toBe('session')
      expect(items[2].type).toBe('session')
      expect(items[3].type).toBe('session')
      expect(items[4].type).toBe('session')
    })
  })

  // ── closeLayout ────────────────────────────────────────────────────

  describe('closeLayout', () => {
    it('removes the layout and returns all session IDs', () => {
      const store = createWorkspaceStore()
      const layoutId = store.getState().addLayoutItem('test', threePane(), 'p1')

      const sessionIds = store.getState().closeLayout(layoutId)

      expect(sessionIds.sort()).toEqual(['s1', 's2', 's3'])
      expect(store.getState().items).toHaveLength(0)
    })
  })

  // ── renameLayout ───────────────────────────────────────────────────

  describe('renameLayout', () => {
    it('updates a layout name', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('old-name', twoPane(), 'p1')

      store.getState().renameLayout(itemId, 'new-name')

      const item = store.getState().items[0]
      if (item.type === 'layout') {
        expect(item.name).toBe('new-name')
      }
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
    it('getSessionsInLayout returns all session IDs in a layout', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', threePane(), 'p1')

      const sessions = store.getState().getSessionsInLayout(itemId)
      expect(sessions.sort()).toEqual(['s1', 's2', 's3'])
    })

    it('getSessionsInLayout returns empty array for non-layout item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addSessionItem('s1')
      expect(store.getState().getSessionsInLayout(itemId)).toEqual([])
    })

    it('getActiveSessionId returns session ID for active standalone session', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addSessionItem('s1')
      store.getState().setActiveItem(itemId)

      expect(store.getState().getActiveSessionId()).toBe('s1')
    })

    it('getActiveSessionId returns focused session ID for active layout', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p2')
      store.getState().setActiveItem(itemId)

      expect(store.getState().getActiveSessionId()).toBe('s2')
    })

    it('getActiveSessionId returns null when no item is active', () => {
      const store = createWorkspaceStore()
      expect(store.getState().getActiveSessionId()).toBeNull()
    })

    it('findItemBySessionId finds standalone session item', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addSessionItem('s1')

      const found = store.getState().findItemBySessionId('s1')
      expect(found?.id).toBe(itemId)
    })

    it('findItemBySessionId finds layout containing session', () => {
      const store = createWorkspaceStore()
      const itemId = store.getState().addLayoutItem('test', twoPane(), 'p1')

      const found = store.getState().findItemBySessionId('s2')
      expect(found?.id).toBe(itemId)
    })

    it('findItemBySessionId returns undefined for unknown session', () => {
      const store = createWorkspaceStore()
      expect(store.getState().findItemBySessionId('nonexistent')).toBeUndefined()
    })
  })
})
