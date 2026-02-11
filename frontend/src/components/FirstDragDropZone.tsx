/**
 * FirstDragDropZone — Drop zone wrapper for single-session terminal view.
 *
 * When in single-session mode (no split layout), this wraps TerminalContainer
 * and accepts sidebar-session drops to convert standalone session to layout.
 * Uses workspace store's convertToLayout to bootstrap the first split.
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 1
 */

import { useRef, useEffect, useState, type ReactNode } from 'react'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { SplitIndicator, type Edge } from './SplitIndicator'
import { useDragMonitor } from '../hooks/useDragMonitor'
import { useWorkspaceStore } from '../stores/workspace'
import type { SplitDirection } from '../types/layout'

interface FirstDragDropZoneProps {
  /** Workspace item ID for the standalone session */
  itemId: string
  activeSessionId: string
  children: ReactNode
}

function edgeToDirection(edge: Edge): SplitDirection {
  return edge === 'left' || edge === 'right' ? 'h' : 'v'
}

export function FirstDragDropZone({ itemId, activeSessionId, children }: FirstDragDropZoneProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null)
  const { isDragActive } = useDragMonitor()
  const convertToLayout = useWorkspaceStore((state) => state.convertToLayout)

  // Use refs to avoid re-registering drop target
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const itemIdRef = useRef(itemId)
  itemIdRef.current = itemId

  useEffect(() => {
    const el = ref.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      canDrop({ source }) {
        const data = source.data as Record<string, unknown>
        if (data.type !== 'sidebar-session') return false
        // Don't drop the same session that's already active
        if (data.sessionId === activeSessionIdRef.current) return false
        return true
      },
      getData({ input, element }) {
        return attachClosestEdge(
          {},
          { input, element, allowedEdges: ['top', 'bottom', 'left', 'right'] },
        )
      },
      onDragEnter({ self }) {
        setClosestEdge(extractClosestEdge(self.data) as Edge | null)
      },
      onDrag({ self }) {
        setClosestEdge(extractClosestEdge(self.data) as Edge | null)
      },
      onDragLeave() {
        setClosestEdge(null)
      },
      onDrop({ source, self }) {
        const edge = extractClosestEdge(self.data) as Edge | null
        setClosestEdge(null)
        if (!edge) return

        const droppedSessionId = (source.data as Record<string, unknown>).sessionId as string
        const direction = edgeToDirection(edge)

        // Convert standalone session to layout using workspace store
        convertToLayout(itemIdRef.current, direction, droppedSessionId)
      },
    })
  }, [convertToLayout])

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {children}
      {isDragActive && (
        <div className="absolute inset-0 z-20" style={{ pointerEvents: 'none' }}>
          <SplitIndicator edge={closestEdge} />
        </div>
      )}
    </div>
  )
}
