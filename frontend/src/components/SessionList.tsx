/**
 * SessionList - Flat list of workspace items (sessions + layouts).
 *
 * Per Plan 016 Phase 3: Single flat list of workspace items.
 * Sessions show Terminal icon + name. Layouts show Columns2 icon + name + pane count badge.
 * Clicking any item activates it (wrapped in startTransition for smooth switching).
 *
 * Phase 5: Sidebar items are reorderable via drag-and-drop.
 * A global monitor listens for reorder drops and calls workspace.reorderItem().
 *
 * Orphan sessions (in session store but not yet in workspace) are shown at the bottom
 * and get a workspace item created on first click.
 *
 * Uses useShallow to prevent infinite re-renders from array selectors.
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 5
 */
import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { useSessionStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
import { getAllLeaves } from '@/lib/layoutTree'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar'
import { SessionItem } from './SessionItem'
import { LayoutSidebarItem } from './LayoutSidebarItem'

export function SessionList() {
  // useShallow prevents infinite re-render when converting Map to array
  const sessions = useSessionStore(useShallow(state =>
    Array.from(state.sessions.values()).sort((a, b) => a.createdAt - b.createdAt)
  ))

  // Workspace items — useShallow since items is an array
  const items = useWorkspaceStore(useShallow((state) => state.items))
  const reorderItem = useWorkspaceStore((state) => state.reorderItem)

  // Build session lookup for names
  const sessionMap = new Map(sessions.map(s => [s.id, s]))

  // Collect all session IDs in workspace items
  const sessionsInWorkspace = new Set<string>()
  for (const item of items) {
    if (item.type === 'session') {
      sessionsInWorkspace.add(item.sessionId)
    } else if (item.type === 'layout') {
      for (const leaf of getAllLeaves(item.tree)) {
        sessionsInWorkspace.add(leaf.sessionId)
      }
    }
  }

  // Orphan sessions not yet in workspace
  const orphanSessions = sessions.filter(s => !sessionsInWorkspace.has(s.id))

  // Global monitor for sidebar reorder drops
  useEffect(() => {
    return monitorForElements({
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0]
        if (!target) return

        const targetData = target.data as Record<string, unknown>
        // Only handle sidebar reorder drops (identified by reorderTarget flag)
        if (targetData.reorderTarget !== true) return

        const sourceData = source.data as Record<string, unknown>
        if (sourceData.index == null || sourceData.itemId == null) return

        const edge = extractClosestEdge(target.data) as 'top' | 'bottom' | null
        if (!edge) return

        const fromIndex = sourceData.index as number
        const targetIndex = targetData.index as number

        // Compute insertion index accounting for removal of source
        let toIndex = edge === 'top' ? targetIndex : targetIndex + 1
        if (fromIndex < toIndex) toIndex -= 1

        if (fromIndex !== toIndex) {
          reorderItem(fromIndex, toIndex)
        }
      },
    })
  }, [reorderItem])

  if (sessions.length === 0 && items.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Sessions</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No sessions yet.
            <br />
            Click "New Session" to start.
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Sessions ({items.length + orphanSessions.length})</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {/* Workspace items in sidebar order */}
          {items.map((item, index) => {
            if (item.type === 'session') {
              const session = sessionMap.get(item.sessionId)
              if (!session) return null
              return <SessionItem key={item.id} session={session} itemId={item.id} index={index} />
            }

            if (item.type === 'layout') {
              return <LayoutSidebarItem key={item.id} item={item} index={index} />
            }

            return null
          })}

          {/* Orphan sessions — get workspace item created on click */}
          {orphanSessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
