/**
 * LayoutSidebarItem - Layout workspace item in sidebar with drag-and-drop reorder.
 *
 * Features:
 * - Layout name + pane count badge
 * - Click to activate
 * - Draggable for reorder
 * - Drop target for reorder (insertion indicator)
 * - Right-click context menu (Rename, Dissolve, Close)
 * - Inline rename editing
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 5
 */

import { useState, useRef, useEffect, startTransition } from 'react'
import { Columns2, Terminal, X } from 'lucide-react'
import { LayoutIcon } from './LayoutIcon'
import { useSettingsStore } from '@/stores/settings'
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { useWorkspaceStore, selectActiveItemId } from '@/stores/workspace'
import { useSessionStore } from '@/stores/sessions'
import { useCentralWebSocket } from '@/hooks/useCentralWebSocket'
import { getAllLeaves, getTerminalLeaves } from '@/lib/layoutTree'
import type { WorkspaceItem } from '@/types/workspace'
import {
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { LayoutContextMenu } from './LayoutContextMenu'
import { cn } from '@/lib/utils'

interface LayoutSidebarItemProps {
  item: WorkspaceItem
  index: number
}

export function LayoutSidebarItem({ item, index }: LayoutSidebarItemProps) {
  const ref = useRef<HTMLLIElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [closestEdge, setClosestEdge] = useState<'top' | 'bottom' | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  const activeItemId = useWorkspaceStore(selectActiveItemId)
  const setActiveItem = useWorkspaceStore((state) => state.setActiveItem)
  const dissolveAll = useWorkspaceStore((state) => state.dissolveAll)
  const closeLayout = useWorkspaceStore((state) => state.closeLayout)
  const renameItem = useWorkspaceStore((state) => state.renameItem)
  const removeSession = useSessionStore((state) => state.removeSession)
  const { closeSession } = useCentralWebSocket()

  const layoutIconsEnabled = useSettingsStore((s) => s.layoutIconsEnabled)

  const isActive = item.id === activeItemId
  const leaves = getAllLeaves(item.tree)
  const terminalLeaves = getTerminalLeaves(item.tree)
  const isSinglePane = terminalLeaves.length === 1

  // Refs for stable callbacks
  const itemRef = useRef(item)
  itemRef.current = item
  const indexRef = useRef(index)
  indexRef.current = index

  // Register draggable + drop target
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const cleanupDrag = draggable({
      element: el,
      canDrag() {
        return !isRenaming
      },
      getInitialData() {
        const currentItem = itemRef.current
        const tLeaves = getTerminalLeaves(currentItem.tree)
        const data: Record<string, unknown> = {
          type: tLeaves.length === 1 ? 'sidebar-session' : 'sidebar-layout',
          itemId: currentItem.id,
          index: indexRef.current,
          name: currentItem.name,
        }
        // For single-pane items, include sessionId so drop zones can use it
        if (tLeaves.length === 1) {
          data.sessionId = tLeaves[0].sessionId
        }
        return data
      },
      onGenerateDragPreview({ nativeSetDragImage }) {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          render({ container }) {
            const el = document.createElement('div')
            el.style.cssText = 'padding:4px 12px;background:#1e293b;color:#e2e8f0;border-radius:6px;font-size:13px;font-family:monospace;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.3);'
            el.textContent = itemRef.current.name
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

    const cleanupDrop = dropTargetForElements({
      element: el,
      canDrop({ source }) {
        const data = source.data as Record<string, unknown>
        if (!data.itemId) return false
        if (data.itemId === itemRef.current.id) return false
        return data.type === 'sidebar-session' || data.type === 'sidebar-layout'
      },
      getData({ input, element }) {
        return attachClosestEdge(
          { reorderTarget: true, itemId: itemRef.current.id, index: indexRef.current },
          { input, element, allowedEdges: ['top', 'bottom'] },
        )
      },
      onDragEnter({ self }) {
        setClosestEdge(extractClosestEdge(self.data) as 'top' | 'bottom' | null)
      },
      onDrag({ self }) {
        setClosestEdge(extractClosestEdge(self.data) as 'top' | 'bottom' | null)
      },
      onDragLeave() {
        setClosestEdge(null)
      },
      onDrop() {
        setClosestEdge(null)
      },
    })

    return () => {
      cleanupDrag()
      cleanupDrop()
    }
  }, [isRenaming])

  const handleClick = () => {
    if (!isRenaming) {
      startTransition(() => {
        setActiveItem(item.id)
      })
    }
  }

  const handleDissolve = () => {
    dissolveAll(item.id)
  }

  const handleCloseLayout = () => {
    const sessionIds = closeLayout(item.id)
    for (const sessionId of sessionIds) {
      closeSession(sessionId)
      removeSession(sessionId)
    }
  }

  const handleRenameStart = () => {
    setRenameValue(item.name)
    setIsRenaming(true)
  }

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim()
    if (trimmed) {
      renameItem(item.id, trimmed)
    }
    setIsRenaming(false)
  }

  const handleRenameCancel = () => {
    setIsRenaming(false)
  }

  return (
    <LayoutContextMenu
      onRename={handleRenameStart}
      onDissolve={handleDissolve}
      onCloseLayout={handleCloseLayout}
    >
      <SidebarMenuItem ref={ref} style={{ opacity: isDragging ? 0.4 : 1 }}>
        <SidebarMenuButton
          isActive={isActive}
          onClick={handleClick}
          tooltip={isRenaming ? undefined : `${item.name} (${leaves.length} panes)`}
        >
          {layoutIconsEnabled ? (
            <LayoutIcon tree={item.tree} focusedPaneId={item.focusedPaneId ?? undefined} />
          ) : isSinglePane ? (
            <Terminal className="size-4 text-muted-foreground" />
          ) : (
            <Columns2 className="size-4 text-muted-foreground" />
          )}
          {isRenaming ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit()
                else if (e.key === 'Escape') handleRenameCancel()
              }}
              onBlur={handleRenameSubmit}
              autoFocus
              className="flex-1 bg-transparent border-none outline-none text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate">{item.name}</span>
          )}
          {!isSinglePane && (
            <span className="text-xs text-muted-foreground tabular-nums">{leaves.length}</span>
          )}
        </SidebarMenuButton>
        <button
          onClick={(e) => { e.stopPropagation(); handleCloseLayout() }}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover/menu-item:opacity-100 hover:text-destructive transition-all"
          title="Close"
        >
          <X className="size-3" />
        </button>
        {closestEdge && (
          <div
            className={cn(
              'absolute left-2 right-2 h-0.5 bg-blue-500 rounded-full pointer-events-none z-10',
              closestEdge === 'top' ? '-top-px' : '-bottom-px',
            )}
          />
        )}
      </SidebarMenuItem>
    </LayoutContextMenu>
  )
}
