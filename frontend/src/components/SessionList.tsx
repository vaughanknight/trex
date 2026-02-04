/**
 * SessionList - Displays list of terminal sessions from Zustand store.
 *
 * Uses useShallow to prevent infinite re-renders when mapping sessions.
 * See scratch/02-session-store-integration.test.tsx for discovery details.
 *
 * Per High Finding 07: Uses selector pattern for performance isolation.
 */
import { useShallow } from 'zustand/shallow'
import { useSessionStore } from '@/stores/sessions'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar'
import { SessionItem } from './SessionItem'

export function SessionList() {
  // useShallow prevents infinite re-render when converting Map to array
  const sessions = useSessionStore(useShallow(state =>
    Array.from(state.sessions.values()).sort((a, b) => a.createdAt - b.createdAt)
  ))

  if (sessions.length === 0) {
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
      <SidebarGroupLabel>Sessions ({sessions.length})</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {sessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
