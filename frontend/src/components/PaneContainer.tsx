/**
 * PaneContainer — Wraps a Terminal inside a resizable pane.
 *
 * Handles click-to-focus, title bar, session exit overlay, and drop zones.
 * Terminal.tsx has its own ResizeObserver for container size changes.
 *
 * Supports two variants:
 * - 'standalone': Title bar with split buttons (no drag, no drop zone overlay).
 *   Session exit overlay closes the entire session.
 * - 'layout': Title bar with drag handle, eject, split, close pane.
 *   Drop zone overlay for drag-and-drop pane splitting.
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 2
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal } from './Terminal'
import { PaneTitleBar } from './PaneTitleBar'
import { SessionEndedOverlay } from './SessionEndedOverlay'
import { DropZoneOverlay } from './DropZoneOverlay'
import { useWorkspaceStore } from '../stores/workspace'
import { useSessionStore } from '../stores/sessions'
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
  /** 'standalone' for single-session, 'layout' for split-pane layout */
  variant?: 'standalone' | 'layout'
}

export function PaneContainer({ itemId, paneId, sessionId, isFocused, showTitleBar = true, variant = 'layout' }: PaneContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const setFocusedPane = useWorkspaceStore((state) => state.setFocusedPane)
  const closePane = useWorkspaceStore((state) => state.closePane)
  const replaceSessionInPane = useWorkspaceStore((state) => state.replaceSessionInPane)
  const removeSession = useSessionStore((state) => state.removeSession)
  const { createSession, closeSession } = useCentralWebSocket()

  // Track session exit state for overlay (DYK-01)
  const [exitCode, setExitCode] = useState<number | null>(null)

  // Reset exit state when sessionId changes (e.g. after restart)
  useEffect(() => {
    setExitCode(null)
  }, [sessionId])

  const handleSessionExit = useCallback((code: number) => {
    setExitCode(code)
  }, [])

  // Click-to-focus: clicking anywhere in the pane sets it as focused (layout only)
  const handleClick = useCallback(() => {
    if (variant === 'layout' && !isFocused) {
      setFocusedPane(itemId, paneId)
    }
  }, [variant, isFocused, itemId, paneId, setFocusedPane])

  const splitPane = useWorkspaceStore((state) => state.splitPane)

  // Drop handler for sidebar-to-pane drag (layout variant only)
  const handleDrop = useCallback((droppedSessionId: string, direction: SplitDirection) => {
    splitPane(itemId, paneId, direction, droppedSessionId)
  }, [splitPane, itemId, paneId])

  // Close handler for session exit overlay
  const handleOverlayClose = useCallback(() => {
    if (variant === 'standalone') {
      // Close the entire session and workspace item
      closeSession(sessionId)
      removeSession(sessionId)
      useWorkspaceStore.getState().removeItem(itemId)
    } else {
      // Close just this pane within the layout
      closePane(itemId, paneId)
    }
  }, [variant, closeSession, removeSession, closePane, itemId, paneId, sessionId])

  // Restart handler for session exit overlay
  const handleOverlayRestart = useCallback(() => {
    createSession((newSessionId: string) => {
      if (variant === 'standalone') {
        // Remove old workspace item, add new one, set active
        const ws = useWorkspaceStore.getState()
        ws.removeItem(itemId)
        const newItemId = ws.addSessionItem(newSessionId)
        ws.setActiveItem(newItemId)
      } else {
        // Replace the session in the pane (existing behavior)
        replaceSessionInPane(itemId, paneId, newSessionId)
      }
    })
  }, [variant, createSession, replaceSessionInPane, itemId, paneId])

  return (
    <div
      ref={containerRef}
      data-pane-id={paneId}
      onClick={handleClick}
      style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {showTitleBar && (
        <PaneTitleBar
          itemId={itemId}
          paneId={paneId}
          sessionId={sessionId}
          isFocused={isFocused}
          variant={variant}
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
            closeLabel={variant === 'standalone' ? 'Close Session' : 'Close Pane'}
            onClose={handleOverlayClose}
            onRestart={handleOverlayRestart}
          />
        )}
        {variant === 'layout' && (
          <DropZoneOverlay itemId={itemId} paneId={paneId} onDrop={handleDrop} />
        )}
      </div>
    </div>
  )
}
