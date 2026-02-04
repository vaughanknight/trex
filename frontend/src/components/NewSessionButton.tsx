/**
 * NewSessionButton - Creates new terminal session.
 *
 * Phase 3: Creates a mock session and adds to store for UI demonstration.
 * Phase 5: Will send "create" message via WebSocket and handle session_created response.
 */
import { Plus } from 'lucide-react'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { useSessionStore } from '@/stores/sessions'
import { useUIStore } from '@/stores/ui'

// Counter for generating unique session names
let sessionCounter = 0

export function NewSessionButton() {
  const addSession = useSessionStore(state => state.addSession)
  const setActiveSession = useUIStore(state => state.setActiveSession)

  const handleClick = () => {
    // TODO Phase 5: Send "create" message via WebSocket
    // const msg: ClientMessage = { type: 'create' }
    // webSocket.send(JSON.stringify(msg))
    // Handle session_created response to get real sessionId and shellType

    // For now, create a mock session for UI demonstration
    sessionCounter++
    const newSession = {
      id: `mock-${Date.now()}`,
      name: `bash-${sessionCounter}`,
      shellType: 'bash',
      status: 'active' as const,
      createdAt: Date.now(),
    }

    addSession(newSession)
    setActiveSession(newSession.id)
  }

  return (
    <SidebarMenuButton onClick={handleClick} tooltip="New Session">
      <Plus className="size-4" />
      <span>New Session</span>
    </SidebarMenuButton>
  )
}
