/**
 * SessionSidebar - Main sidebar container with floating variant for terminal session management.
 *
 * Features:
 * - Floating sidebar overlays terminal content
 * - Icon collapsible mode (48px collapsed)
 * - Header with "New Session" button
 * - Content area for SessionList
 * - Footer with Settings link and Toggle button for explicit expand/collapse
 *
 * Uses shadcn/ui Sidebar with variant="floating" and collapsible="icon"
 */
import { useRef, useEffect, useState } from 'react'
import { Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from '@/components/ui/sidebar'
import { SessionList } from './SessionList'
import { NewSessionButton } from './NewSessionButton'
import { AuthButton } from './AuthButton'
import { useUIStore, selectSidebarCollapsed } from '@/stores/ui'
import { useWorkspaceStore } from '@/stores/workspace'
import { useDragMonitor } from '@/hooks/useDragMonitor'

function SettingsButton() {
  const toggleSettings = useUIStore(state => state.toggleSettingsPanel)

  return (
    <SidebarMenuButton onClick={toggleSettings} tooltip="Settings">
      <Settings className="size-4" />
      <span>Settings</span>
    </SidebarMenuButton>
  )
}

function ToggleButton() {
  const collapsed = useUIStore(selectSidebarCollapsed)
  const toggleSidebar = useUIStore(state => state.toggleSidebar)

  return (
    <SidebarMenuButton onClick={toggleSidebar} tooltip={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
      {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      <span>{collapsed ? 'Expand' : 'Collapse'}</span>
    </SidebarMenuButton>
  )
}

export function SessionSidebar() {
  const dropRef = useRef<HTMLDivElement>(null)
  const [isDropTarget, setIsDropTarget] = useState(false)
  const detachPane = useWorkspaceStore((state) => state.detachPane)
  const { isDragActive, dragData } = useDragMonitor()
  const isPaneDrag = isDragActive && dragData?.type === 'pane'

  // Make sidebar content a drop target for pane-back-to-sidebar (AC-19)
  useEffect(() => {
    const el = dropRef.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      canDrop({ source }) {
        const data = source.data as Record<string, unknown>
        return data.type === 'pane'
      },
      onDragEnter() {
        setIsDropTarget(true)
      },
      onDragLeave() {
        setIsDropTarget(false)
      },
      onDrop({ source }) {
        setIsDropTarget(false)
        const paneId = (source.data as Record<string, unknown>).paneId as string
        const itemIdFromDrag = (source.data as Record<string, unknown>).itemId as string | undefined
        if (itemIdFromDrag) {
          detachPane(itemIdFromDrag, paneId)
        }
      },
    })
  }, [detachPane])

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <NewSessionButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <div
          ref={dropRef}
          className={`flex-1 min-h-0 ${isPaneDrag && isDropTarget ? 'ring-2 ring-primary/40 ring-inset rounded' : ''}`}
        >
          <SessionList />
        </div>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AuthButton />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SettingsButton />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ToggleButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
