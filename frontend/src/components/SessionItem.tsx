/**
 * SessionItem - Individual session row in sidebar.
 *
 * Features:
 * - Session name display
 * - Status indicator (● connected, ○ disconnected)
 * - X button on hover to close session
 * - Click to select as active session
 * - Active session highlighting
 * - Right-click context menu with Rename and Close
 * - Inline rename editing (T009)
 */
import { useState, useRef, useEffect } from 'react'
import { X, Terminal } from 'lucide-react'
import { useUIStore, selectActiveSessionId } from '@/stores/ui'
import { useSessionStore, type Session, type SessionStatus } from '@/stores/sessions'
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
} from '@/components/ui/sidebar'
import { SessionContextMenu } from './SessionContextMenu'
import { cn } from '@/lib/utils'

interface SessionItemProps {
  session: Session
}

const statusLabels: Record<SessionStatus, string> = {
  connecting: 'Connecting...',
  active: 'Connected',
  paused: 'Paused',
  exited: 'Exited',
}

export function SessionItem({ session }: SessionItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(session.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const activeSessionId = useUIStore(selectActiveSessionId)
  const setActiveSession = useUIStore(state => state.setActiveSession)
  const removeSession = useSessionStore(state => state.removeSession)
  const updateName = useSessionStore(state => state.updateName)

  const isActive = activeSessionId === session.id

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleClick = () => {
    if (!isEditing) {
      setActiveSession(session.id)
    }
  }

  const handleClose = () => {
    // If closing the active session, clear selection
    if (isActive) {
      setActiveSession(null)
    }
    removeSession(session.id)
  }

  const handleCloseButton = (e: React.MouseEvent) => {
    e.stopPropagation()
    handleClose()
  }

  const handleRename = () => {
    setEditValue(session.name)
    setIsEditing(true)
  }

  const handleRenameSubmit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== session.name) {
      updateName(session.id, trimmed)
    }
    setIsEditing(false)
  }

  const handleRenameCancel = () => {
    setEditValue(session.name)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      handleRenameCancel()
    }
  }

  return (
    <SessionContextMenu onRename={handleRename} onClose={handleClose}>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isActive}
          onClick={handleClick}
          tooltip={isEditing ? undefined : `${session.name} - ${statusLabels[session.status]}`}
        >
          <Terminal className="size-4" />
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleRenameSubmit}
              className="flex-1 bg-transparent border-none outline-none text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate">{session.name}</span>
          )}
          <span
            className={cn(
              'size-2 rounded-full',
              session.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
            )}
            title={statusLabels[session.status]}
          />
        </SidebarMenuButton>
        {!isEditing && (
          <SidebarMenuAction
            showOnHover
            onClick={handleCloseButton}
            title="Close session"
          >
            <X className="size-4" />
          </SidebarMenuAction>
        )}
      </SidebarMenuItem>
    </SessionContextMenu>
  )
}
