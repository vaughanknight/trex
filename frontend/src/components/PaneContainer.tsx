/**
 * PaneContainer — Wraps a Terminal inside a resizable pane.
 *
 * Handles click-to-focus, title bar, session exit overlay, and drop zones.
 * Terminal.tsx has its own ResizeObserver for container size changes.
 *
 * Every workspace item has a tree with 1+ panes. All panes render with
 * drag handle, eject, split, close, and drop zone overlay.
 *
 * @see /docs/plans/022-unified-layout-architecture/unified-layout-architecture-plan.md
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal } from './Terminal'
import { PaneTitleBar } from './PaneTitleBar'
import { SessionEndedOverlay } from './SessionEndedOverlay'
import { DropZoneOverlay } from './DropZoneOverlay'
import { useWorkspaceStore } from '../stores/workspace'
import { useSessionStore } from '../stores/sessions'
import { useSettingsStore } from '../stores/settings'
import { useCentralWebSocket } from '../hooks/useCentralWebSocket'
import type { SplitDirection } from '../types/layout'

interface PaneContainerProps {
  /** Workspace item ID this pane belongs to */
  itemId: string
  /** Unique pane ID from layout tree */
  paneId: string
  /** Backend session ID this pane is connected to */
  sessionId: string
  /** Whether this pane is the focused pane (controls WebGL acquisition) */
  isFocused: boolean
  /** Whether to show the title bar (defaults to true per Phase 2) */
  showTitleBar?: boolean
}

export function PaneContainer({ itemId, paneId, sessionId, isFocused, showTitleBar = true }: PaneContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const setFocusedPane = useWorkspaceStore((state) => state.setFocusedPane)
  const closePane = useWorkspaceStore((state) => state.closePane)
  const replaceSessionInPane = useWorkspaceStore((state) => state.replaceSessionInPane)
  const addSession = useSessionStore((state) => state.addSession)
  const { createSession, createTmuxSession } = useCentralWebSocket()
  const translucentTitleBar = useSettingsStore((s) => s.translucentTitleBar)

  // Track session exit state for overlay (DYK-01)
  const [exitCode, setExitCode] = useState<number | null>(null)

  // Reset exit state when sessionId changes (e.g. after restart)
  useEffect(() => {
    setExitCode(null)
  }, [sessionId])

  const handleSessionExit = useCallback((code: number) => {
    setExitCode(code)
  }, [])

  // Click-to-focus: clicking anywhere in the pane sets it as focused
  const handleClick = useCallback(() => {
    if (!isFocused) {
      setFocusedPane(itemId, paneId)
    }
  }, [isFocused, itemId, paneId, setFocusedPane])

  const splitPane = useWorkspaceStore((state) => state.splitPane)

  // Drop handler for sidebar-to-pane drag
  const handleDrop = useCallback((droppedSessionId: string, direction: SplitDirection, insertBefore: boolean) => {
    splitPane(itemId, paneId, direction, droppedSessionId, insertBefore)
  }, [splitPane, itemId, paneId])

  // Drop handler for tmux sidebar-to-pane drag: create session then split
  const handleTmuxDrop = useCallback((tmuxSessionName: string, tmuxWindowIndex: number, direction: SplitDirection, insertBefore: boolean) => {
    createTmuxSession(tmuxSessionName, tmuxWindowIndex, (newSessionId, shellType, returnedTmuxName) => {
      addSession({
        id: newSessionId,
        name: returnedTmuxName || tmuxSessionName,
        shellType,
        status: 'active',
        createdAt: Date.now(),
        userRenamed: false,
        tmuxSessionName: returnedTmuxName || tmuxSessionName,
      })
      splitPane(itemId, paneId, direction, newSessionId, insertBefore)
    })
  }, [createTmuxSession, addSession, splitPane, itemId, paneId])

  // Close handler for session exit overlay
  const handleOverlayClose = useCallback(() => {
    closePane(itemId, paneId)
  }, [closePane, itemId, paneId])

  // Restart handler for session exit overlay
  const handleOverlayRestart = useCallback(() => {
    createSession((newSessionId: string, shellType: string) => {
      addSession({
        id: newSessionId,
        name: shellType,
        shellType,
        status: 'active',
        createdAt: Date.now(),
        userRenamed: false,
      })
      // Replace the session in the pane
      replaceSessionInPane(itemId, paneId, newSessionId)
    })
  }, [createSession, addSession, replaceSessionInPane, itemId, paneId])

  return (
    <div
      ref={containerRef}
      data-pane-id={paneId}
      onClick={handleClick}
      style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      {showTitleBar && translucentTitleBar && (
        <PaneTitleBar
          itemId={itemId}
          paneId={paneId}
          sessionId={sessionId}
          isFocused={isFocused}
          translucent
        />
      )}
      {showTitleBar && !translucentTitleBar && (
        <PaneTitleBar
          itemId={itemId}
          paneId={paneId}
          sessionId={sessionId}
          isFocused={isFocused}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Terminal
          sessionId={sessionId}
          isFocused={isFocused}
          onSessionExit={showTitleBar ? handleSessionExit : undefined}
        />
        {showTitleBar && exitCode !== null && (
          <SessionEndedOverlay
            exitCode={exitCode}
            closeLabel="Close Pane"
            onClose={handleOverlayClose}
            onRestart={handleOverlayRestart}
          />
        )}
        <DropZoneOverlay itemId={itemId} paneId={paneId} onDrop={handleDrop} onTmuxDrop={handleTmuxDrop} />
      </div>
    </div>
  )
}
