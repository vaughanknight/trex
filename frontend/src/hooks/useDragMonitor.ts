/**
 * useDragMonitor — Global drag state tracker.
 *
 * Wraps @atlaskit/pragmatic-drag-and-drop's monitorForElements()
 * to provide a React-friendly isDragActive flag and drag source data.
 * All DropZoneOverlay instances consume this to toggle pointer-events.
 *
 * @see /docs/plans/015-pane-splitting/pane-splitting-plan.md § Phase 4
 */

import { useState, useEffect } from 'react'
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'

export interface DragData {
  type: string
  sessionId?: string
  sessionName?: string
  paneId?: string
}

export interface DragMonitorState {
  isDragActive: boolean
  dragData: DragData | null
}

export function useDragMonitor(): DragMonitorState {
  const [state, setState] = useState<DragMonitorState>({
    isDragActive: false,
    dragData: null,
  })

  useEffect(() => {
    return monitorForElements({
      onDragStart({ source }) {
        const data = source.data as Record<string, unknown>
        if (data.type === 'sidebar-session' || data.type === 'pane') {
          setState({
            isDragActive: true,
            dragData: {
              type: data.type as string,
              sessionId: data.sessionId as string | undefined,
              sessionName: data.sessionName as string | undefined,
              paneId: data.paneId as string | undefined,
            },
          })
        }
      },
      onDrop() {
        setState({ isDragActive: false, dragData: null })
      },
    })
  }, [])

  return state
}
