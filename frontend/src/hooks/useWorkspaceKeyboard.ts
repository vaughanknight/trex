/**
 * useWorkspaceKeyboard — Global keyboard shortcuts for workspace navigation.
 *
 * Shortcuts:
 * - Alt+[ / Alt+] : Cycle through workspace items (previous/next)
 * - Ctrl+1-8      : Focus pane N within the active layout
 *
 * Per Plan 016 Phase 7.
 */

import { useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { getAllLeaves } from '@/lib/layoutTree'

export function useWorkspaceKeyboard(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ws = useWorkspaceStore.getState()

      // Alt+[ or Alt+] — cycle workspace items
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        const { items, activeItemId } = ws
        if (items.length === 0) return

        const currentIdx = activeItemId
          ? items.findIndex(i => i.id === activeItemId)
          : -1

        let nextIdx: number
        if (e.key === ']') {
          nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1
        }

        ws.setActiveItem(items[nextIdx].id)
        return
      }

      // Ctrl+1-8 — focus pane N in active layout
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        const num = parseInt(e.key, 10)
        if (num >= 1 && num <= 8) {
          const { items, activeItemId } = ws
          const activeItem = items.find(i => i.id === activeItemId)
          if (!activeItem || activeItem.type !== 'layout') return

          const leaves = getAllLeaves(activeItem.tree)
          const targetLeaf = leaves[num - 1]
          if (!targetLeaf) return

          e.preventDefault()
          ws.setFocusedPane(activeItem.id, targetLeaf.paneId)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
