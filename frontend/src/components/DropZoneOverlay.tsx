/**
 * DropZoneOverlay — Drop target overlay for pane splitting via drag-and-drop.
 *
 * Sits above the terminal canvas. pointer-events: none by default,
 * switches to pointer-events: auto when a drag is active (Finding 04).
 * Uses @atlaskit/pragmatic-drag-and-drop hitbox for quadrant detection.
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 1
 */

import { useRef, useEffect, useState } from 'react'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { SplitIndicator, type Edge } from './SplitIndicator'
import { useDragMonitor } from '../hooks/useDragMonitor'
import { useWorkspaceStore } from '../stores/workspace'
import { countTerminalPanes } from '../lib/layoutTree'
import type { SplitDirection } from '../types/layout'

interface DropZoneOverlayProps {
  /** Workspace item ID this pane belongs to */
  itemId: string
  paneId: string
  onDrop: (sessionId: string, direction: SplitDirection, insertBefore: boolean) => void
  /** Handler for tmux session drops — creates session then splits */
  onTmuxDrop?: (tmuxSessionName: string, tmuxWindowIndex: number, direction: SplitDirection, insertBefore: boolean) => void
}

function edgeToDirection(edge: Edge): SplitDirection {
  return edge === 'left' || edge === 'right' ? 'h' : 'v'
}

function edgeIsInsertBefore(edge: Edge): boolean {
  return edge === 'left' || edge === 'top'
}

export function DropZoneOverlay({ itemId, paneId, onDrop, onTmuxDrop }: DropZoneOverlayProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null)
  const { isDragActive } = useDragMonitor()
  const movePane = useWorkspaceStore((state) => state.movePane)

  // Read pane count imperatively from workspace item's tree
  const getTreePaneCount = () => {
    const item = useWorkspaceStore.getState().items.find(i => i.id === itemId)
    if (!item) return 0
    return countTerminalPanes(item.tree)
  }
  const atCap = getTreePaneCount() >= 8

  // Stable callback refs to avoid re-registering drop target
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop
  const onTmuxDropRef = useRef(onTmuxDrop)
  onTmuxDropRef.current = onTmuxDrop

  useEffect(() => {
    const el = ref.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      canDrop({ source }) {
        const data = source.data as Record<string, unknown>
        if (data.type === 'sidebar-session') {
          // Read imperatively to avoid subscription to new array refs
          const currentSessionsInLayout = useWorkspaceStore.getState().getSessionsInLayout(itemId)
          // Reject sessions already in layout (prevent duplicate panes)
          if (currentSessionsInLayout.includes(data.sessionId as string)) return false
          // Reject when at 8-pane cap
          if (atCap) return false
          return true
        }
        if (data.type === 'sidebar-tmux-session') {
          // tmux sessions: enforce pane cap but allow multi-attach (no duplicate check)
          if (atCap) return false
          return true
        }
        if (data.type === 'pane') {
          // Can't drop on self (AC-18)
          if (data.paneId === paneId) return false
          return true
        }
        return false
      },
      getData({ input, element }) {
        return attachClosestEdge(
          { paneId },
          { input, element, allowedEdges: ['top', 'bottom', 'left', 'right'] },
        )
      },
      onDragEnter({ self }) {
        const edge = extractClosestEdge(self.data) as Edge | null
        setClosestEdge(edge)
      },
      onDrag({ self }) {
        const edge = extractClosestEdge(self.data) as Edge | null
        setClosestEdge(edge)
      },
      onDragLeave() {
        setClosestEdge(null)
      },
      onDrop({ source, self }) {
        const edge = extractClosestEdge(self.data) as Edge | null
        setClosestEdge(null)
        if (!edge) return
        const data = source.data as Record<string, unknown>
        const direction = edgeToDirection(edge)
        const insertBefore = edgeIsInsertBefore(edge)
        if (data.type === 'sidebar-session') {
          onDropRef.current(data.sessionId as string, direction, insertBefore)
          // Remove the source standalone workspace item (orphan guard: itemId may be undefined)
          const sourceItemId = data.itemId as string | undefined
          if (sourceItemId) {
            useWorkspaceStore.getState().removeItem(sourceItemId)
          }
        } else if (data.type === 'sidebar-tmux-session') {
          onTmuxDropRef.current?.(
            data.tmuxSessionName as string,
            data.tmuxWindowIndex as number,
            direction,
            insertBefore,
          )
        } else if (data.type === 'pane') {
          movePane(itemId, data.paneId as string, paneId, direction)
        }
      },
    })
  }, [itemId, paneId, atCap, movePane])

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-20"
      style={{ pointerEvents: isDragActive ? 'auto' : 'none' }}
    >
      {isDragActive && <SplitIndicator edge={closestEdge} />}
    </div>
  )
}
