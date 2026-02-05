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
 *
 * Per Phase 5: Close sends 'close' message to backend to terminate PTY.
 */
import { useState, useRef, useEffect } from 'react'
import { X, Terminal } from 'lucide-react'
import { useUIStore, selectActiveSessionId } from '@/stores/ui'
import { useSessionStore, type Session, type SessionStatus } from '@/stores/sessions'
import { useSettingsStore, selectIdleThresholds, selectIdleIndicatorsEnabled } from '@/stores/settings'
import { useCentralWebSocket } from '@/hooks/useCentralWebSocket'
import { useIdleState } from '@/hooks/useIdleState'
import { formatIdleDuration, type IdleState } from '@/utils/idleState'
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
} from '@/components/ui/sidebar'
import { SessionContextMenu } from './SessionContextMenu'
import { cn } from '@/lib/utils'

/**
 * Color mapping for idle states.
 * Per AC-03, AC-04: Dot, icon, and background tint colors per state.
 */
const IDLE_STATE_COLORS: Record<IdleState, { dot: string; icon: string; tint: string }> = {
  active: { dot: 'bg-blue-500', icon: 'text-blue-500', tint: 'bg-blue-500/10' },
  recent: { dot: 'bg-green-500', icon: 'text-green-500', tint: 'bg-green-500/10' },
  short: { dot: 'bg-green-400', icon: 'text-green-400', tint: 'bg-green-400/5' },
  medium: { dot: 'bg-amber-500', icon: 'text-amber-500', tint: 'bg-amber-500/10' },
  long: { dot: 'bg-red-500', icon: 'text-red-500', tint: 'bg-red-500/10' },
  dormant: { dot: 'bg-gray-400', icon: 'text-gray-400', tint: 'bg-gray-400/5' },
} as const

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
  const { closeSession } = useCentralWebSocket()

  // Get settings for idle indicators (Phase 4: Settings Integration)
  const idleEnabled = useSettingsStore(selectIdleIndicatorsEnabled)
  const thresholds = useSettingsStore(selectIdleThresholds)

  // Get idle state for this session (Phase 3: Visual Indicators)
  // Pass custom thresholds from settings (Phase 4)
  const idleState = useIdleState(session.id, thresholds)

  // Determine colors based on whether idle indicators are enabled
  // When disabled, fall back to static green/grey based on session status
  const idleColors = idleEnabled
    ? IDLE_STATE_COLORS[idleState.state]
    : session.status === 'active'
      ? { dot: 'bg-green-500', icon: 'text-green-500', tint: '' }
      : { dot: 'bg-gray-400', icon: 'text-gray-400', tint: '' }

  const idleTooltip = idleEnabled
    ? formatIdleDuration(idleState.idleMs, thresholds.active)
    : statusLabels[session.status]

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
    // Send close message to backend to terminate PTY
    closeSession(session.id)
    // Remove from store
    removeSession(session.id)
    // If closing the active session, clear selection
    if (isActive) {
      setActiveSession(null)
    }
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
          tooltip={isEditing ? undefined : `${session.name} - ${idleTooltip}`}
          className={cn(
            idleColors.tint,
            'transition-colors duration-200 ease-linear'
          )}
        >
          <Terminal className={cn('size-4', idleColors.icon, 'transition-colors duration-200 ease-linear')} />
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
              'size-2 rounded-full transition-colors duration-200 ease-linear',
              idleColors.dot
            )}
            title={idleTooltip}
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
