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
import { Settings, ChevronLeft, ChevronRight } from 'lucide-react'
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
import { useUIStore, selectSidebarCollapsed } from '@/stores/ui'

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
        <SessionList />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ToggleButton />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SettingsButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
