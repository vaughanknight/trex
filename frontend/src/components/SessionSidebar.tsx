/**
 * SessionSidebar - Main sidebar container with floating variant for terminal session management.
 *
 * Features:
 * - Floating sidebar overlays terminal content
 * - Icon collapsible mode (48px collapsed)
 * - Header with "New Session" button
 * - Content area for SessionList
 * - Footer with Settings link and Pin toggle
 * - Hover/pin behavior (T011): Hover expands with 300ms collapse delay, pin keeps expanded
 *
 * Uses shadcn/ui Sidebar with variant="floating" and collapsible="icon"
 */
import { useRef, useCallback } from 'react'
import { Settings, Pin, PinOff } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { SessionList } from './SessionList'
import { NewSessionButton } from './NewSessionButton'
import { useUIStore, selectSidebarPinned } from '@/stores/ui'

function SettingsButton() {
  return (
    <SidebarMenuButton tooltip="Settings">
      <Settings className="size-4" />
      <span>Settings</span>
    </SidebarMenuButton>
  )
}

function PinButton() {
  const pinned = useUIStore(selectSidebarPinned)
  const togglePin = useUIStore(state => state.toggleSidebarPin)

  return (
    <SidebarMenuButton onClick={togglePin} tooltip={pinned ? 'Unpin sidebar' : 'Pin sidebar'}>
      {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
      <span>{pinned ? 'Unpin' : 'Pin'}</span>
    </SidebarMenuButton>
  )
}

/**
 * Wrapper that adds hover behavior with 300ms collapse delay.
 * When pinned, hover behavior is disabled.
 */
function SidebarWithHover({ children }: { children: React.ReactNode }) {
  const { setOpen } = useSidebar()
  const pinned = useUIStore(selectSidebarPinned)
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = useCallback(() => {
    if (pinned) return
    // Cancel any pending collapse
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current)
      collapseTimeoutRef.current = null
    }
    setOpen(true)
  }, [pinned, setOpen])

  const handleMouseLeave = useCallback(() => {
    if (pinned) return
    // Delay collapse by 300ms
    collapseTimeoutRef.current = setTimeout(() => {
      setOpen(false)
      collapseTimeoutRef.current = null
    }, 300)
  }, [pinned, setOpen])

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="h-full"
    >
      {children}
    </div>
  )
}

export function SessionSidebar() {
  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarWithHover>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <NewSessionButton />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SessionList />
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <PinButton />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SettingsButton />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </SidebarWithHover>
    </Sidebar>
  )
}
