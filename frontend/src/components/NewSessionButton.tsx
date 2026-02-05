/**
 * NewSessionButton - Creates new terminal session via WebSocket.
 *
 * Per Phase 5: Sends "create" message via central WebSocket.
 * On session_created response, adds session to store and sets as active.
 */
import { Plus } from 'lucide-react'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { useSessionStore } from '@/stores/sessions'
import { useUIStore } from '@/stores/ui'
import { useCentralWebSocket } from '@/hooks/useCentralWebSocket'

// Counter for generating unique session names when shellType is the same
const shellCounters = new Map<string, number>()

export function NewSessionButton() {
  const addSession = useSessionStore(state => state.addSession)
  const setActiveSession = useUIStore(state => state.setActiveSession)
  const { createSession } = useCentralWebSocket()

  const handleClick = () => {
    // Send "create" message via WebSocket
    // On session_created response, add to store and set as active
    createSession((sessionId, shellType) => {
      // Generate unique name based on shell type (bash-1, zsh-2, etc.)
      const count = (shellCounters.get(shellType) || 0) + 1
      shellCounters.set(shellType, count)

      const newSession = {
        id: sessionId,
        name: `${shellType}-${count}`,
        shellType,
        status: 'active' as const,
        createdAt: Date.now(),
        userRenamed: false, // Allow automatic title updates until user manually renames
      }

      addSession(newSession)
      setActiveSession(sessionId)
    })
  }

  return (
    <SidebarMenuButton onClick={handleClick} tooltip="New Session">
      <Plus className="size-4" />
      <span>New Session</span>
    </SidebarMenuButton>
  )
}
