/**
 * PaneTitleBar — Title bar for terminal panes.
 *
 * Two variants:
 * - standalone: Shows session name + [—][|][X] buttons. Not draggable.
 *   Split buttons convert standalone session to layout via workspace store.
 *   Close button closes the entire session.
 *
 * - layout: Shows drag handle + session name + [—][|][⏏][X] buttons. Draggable.
 *   Split buttons split the pane within the layout.
 *   Eject button detaches the pane as a standalone session.
 *   Close button closes just the pane.
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 2
 */

import { useCallback, useRef, useEffect, useState } from 'react'
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'
import { Columns2, Rows2, GripVertical, ArrowUpFromLine, X } from 'lucide-react'
import { useSessionStore } from '../stores/sessions'
import { useWorkspaceStore } from '../stores/workspace'
import { useCentralWebSocket } from '../hooks/useCentralWebSocket'
import { countPanes } from '../lib/layoutTree'

interface PaneTitleBarProps {
  /** Workspace item ID this pane belongs to */
  itemId: string
  paneId: string
  sessionId: string
  isFocused: boolean
  /** 'standalone' shows [—][|][X]; 'layout' shows drag handle + [—][|][⏏][X] */
  variant?: 'standalone' | 'layout'
}

export function PaneTitleBar({ itemId, paneId, sessionId, isFocused, variant = 'layout' }: PaneTitleBarProps) {
  const dragRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const sessionName = useSessionStore(
    (state) => state.sessions.get(sessionId)?.name ?? 'Session'
  )
  const closePane = useWorkspaceStore((state) => state.closePane)
  const splitPane = useWorkspaceStore((state) => state.splitPane)
  const convertToLayout = useWorkspaceStore((state) => state.convertToLayout)
  const detachPane = useWorkspaceStore((state) => state.detachPane)
  const removeSession = useSessionStore((state) => state.removeSession)
  const { createSession, closeSession } = useCentralWebSocket()

  // Read pane count imperatively from the workspace item's tree (layout only)
  const getItemPaneCount = () => {
    if (variant !== 'layout') return 0
    const item = useWorkspaceStore.getState().items.find(i => i.id === itemId)
    if (item?.type === 'layout') return countPanes(item.tree)
    return 0
  }
  const atCap = variant === 'layout' && getItemPaneCount() >= 8

  // Make title bar draggable for pane rearrangement (layout variant only)
  useEffect(() => {
    if (variant !== 'layout') return
    const el = dragRef.current
    if (!el) return

    return draggable({
      element: el,
      getInitialData() {
        return {
          type: 'pane',
          itemId,
          paneId,
          sessionId,
          sessionName,
        }
      },
      onGenerateDragPreview({ nativeSetDragImage }) {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          render({ container }) {
            const el = document.createElement('div')
            el.style.cssText = 'padding:4px 12px;background:#1e293b;color:#e2e8f0;border-radius:6px;font-size:13px;font-family:monospace;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.3);'
            el.textContent = sessionName
            container.appendChild(el)
          },
        })
      },
      onDragStart() {
        setIsDragging(true)
      },
      onDrop() {
        setIsDragging(false)
      },
    })
  }, [variant, paneId, sessionId, sessionName, itemId])

  const handleClose = useCallback(() => {
    if (variant === 'standalone') {
      // Close the entire session
      closeSession(sessionId)
      removeSession(sessionId)
      useWorkspaceStore.getState().removeItem(itemId)
    } else {
      // Close just this pane within the layout
      closePane(itemId, paneId)
    }
  }, [variant, closeSession, removeSession, closePane, itemId, paneId, sessionId])

  const addSession = useSessionStore((state) => state.addSession)

  const handleSplitH = useCallback(() => {
    if (atCap) return
    createSession((newSessionId: string, shellType: string) => {
      addSession({
        id: newSessionId,
        name: shellType,
        shellType,
        status: 'active',
        createdAt: Date.now(),
        userRenamed: false,
      })
      if (variant === 'standalone') {
        convertToLayout(itemId, 'h', newSessionId)
      } else {
        splitPane(itemId, paneId, 'h', newSessionId)
      }
    })
  }, [atCap, variant, createSession, addSession, convertToLayout, splitPane, itemId, paneId])

  const handleSplitV = useCallback(() => {
    if (atCap) return
    createSession((newSessionId: string, shellType: string) => {
      addSession({
        id: newSessionId,
        name: shellType,
        shellType,
        status: 'active',
        createdAt: Date.now(),
        userRenamed: false,
      })
      if (variant === 'standalone') {
        convertToLayout(itemId, 'v', newSessionId)
      } else {
        splitPane(itemId, paneId, 'v', newSessionId)
      }
    })
  }, [atCap, variant, createSession, addSession, convertToLayout, splitPane, itemId, paneId])

  const handleEject = useCallback(() => {
    detachPane(itemId, paneId)
  }, [detachPane, itemId, paneId])

  return (
    <div
      ref={dragRef}
      className={`
        flex items-center h-6 px-2 gap-1 text-xs select-none shrink-0
        ${variant === 'layout' ? 'cursor-grab active:cursor-grabbing' : ''}
        ${isFocused
          ? 'bg-muted border-b-2 border-primary text-foreground'
          : 'bg-muted/50 border-b border-border text-muted-foreground'
        }
      `}
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      {variant === 'layout' && (
        <GripVertical className="size-3 text-muted-foreground/50 shrink-0" />
      )}
      <span className="truncate flex-1 font-mono">{sessionName}</span>
      <button
        onClick={handleSplitH}
        disabled={atCap}
        className="hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-0.5"
        title={atCap ? 'Maximum 8 panes reached' : 'Split horizontal'}
      >
        <Columns2 className="size-3" />
      </button>
      <button
        onClick={handleSplitV}
        disabled={atCap}
        className="hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-0.5"
        title={atCap ? 'Maximum 8 panes reached' : 'Split vertical'}
      >
        <Rows2 className="size-3" />
      </button>
      {variant === 'layout' && (
        <button
          onClick={handleEject}
          className="hover:text-foreground transition-colors px-0.5"
          title="Eject from layout"
        >
          <ArrowUpFromLine className="size-3" />
        </button>
      )}
      <button
        onClick={handleClose}
        className="hover:text-destructive transition-colors px-0.5"
        title={variant === 'standalone' ? 'Close session' : 'Close pane'}
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
