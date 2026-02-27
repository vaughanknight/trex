/**
 * PaneTitleBar — Title bar for terminal panes.
 *
 * Shows drag handle + session name + [—][|][⏏][X] buttons. Draggable.
 * Split buttons split the pane within the item's tree.
 * Eject button detaches the pane as a separate 1-pane item.
 * Close button closes the pane (or the entire item if last pane).
 *
 * @see /docs/plans/022-unified-layout-architecture/unified-layout-architecture-plan.md
 */

import { useCallback, useRef, useEffect, useState } from 'react'
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview'
import { Columns2, Rows2, GripVertical, ArrowUpFromLine, X, Monitor } from 'lucide-react'
import { useSessionStore } from '../stores/sessions'
import { useWorkspaceStore } from '../stores/workspace'
import { useSettingsStore } from '../stores/settings'
import { useCentralWebSocket } from '../hooks/useCentralWebSocket'
import { getAllPlugins, type VisualisationPlugin } from '../plugins/pluginRegistry'
import { PluginPanel } from './PluginPanel'
import { countTerminalPanes } from '../lib/layoutTree'

interface PaneTitleBarProps {
  /** Workspace item ID this pane belongs to */
  itemId: string
  paneId: string
  sessionId: string
  isFocused: boolean
  /** Render as translucent overlay with backdrop-blur */
  translucent?: boolean
}

export function PaneTitleBar({ itemId, paneId, sessionId, isFocused, translucent }: PaneTitleBarProps) {
  const dragRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [openPlugin, setOpenPlugin] = useState<VisualisationPlugin | null>(null)
  const [panelPinned, setPanelPinned] = useState(false)
  const sessionName = useSessionStore(
    (state) => state.sessions.get(sessionId)?.name ?? 'Session'
  )
  const tmuxSessionName = useSessionStore(
    (state) => state.sessions.get(sessionId)?.tmuxSessionName
  )
  const closePane = useWorkspaceStore((state) => state.closePane)
  const splitPane = useWorkspaceStore((state) => state.splitPane)
  const detachPane = useWorkspaceStore((state) => state.detachPane)
  const removeSession = useSessionStore((state) => state.removeSession)
  const { createSession, closeSession } = useCentralWebSocket()

  // Read pane count imperatively from the workspace item's tree
  const getItemPaneCount = () => {
    const item = useWorkspaceStore.getState().items.find(i => i.id === itemId)
    if (!item) return 0
    return countTerminalPanes(item.tree)
  }
  const atCap = getItemPaneCount() >= 8
  const isSinglePane = getItemPaneCount() <= 1

  // Make title bar draggable for pane rearrangement
  useEffect(() => {
    const el = dragRef.current
    if (!el) return

    return draggable({
      element: el,
      getInitialData() {
        return {
          type: 'pane',
          itemId,
          paneId,
          sessionId,
          sessionName,
        }
      },
      onGenerateDragPreview({ nativeSetDragImage }) {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          render({ container }) {
            const el = document.createElement('div')
            el.style.cssText = 'padding:4px 12px;background:#1e293b;color:#e2e8f0;border-radius:6px;font-size:13px;font-family:monospace;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.3);'
            el.textContent = sessionName
            container.appendChild(el)
          },
        })
      },
      onDragStart() {
        setIsDragging(true)
      },
      onDrop() {
        setIsDragging(false)
      },
    })
  }, [paneId, sessionId, sessionName, itemId])

  const handleClose = useCallback(() => {
    closePane(itemId, paneId)
    closeSession(sessionId)
    removeSession(sessionId)
  }, [closePane, closeSession, removeSession, itemId, paneId, sessionId])

  const addSession = useSessionStore((state) => state.addSession)

  const handleSplitH = useCallback(() => {
    if (atCap) return
    createSession((newSessionId: string, shellType: string) => {
      addSession({
        id: newSessionId,
        name: shellType,
        shellType,
        status: 'active',
        createdAt: Date.now(),
        userRenamed: false,
      })
      splitPane(itemId, paneId, 'h', newSessionId)
    })
  }, [atCap, createSession, addSession, splitPane, itemId, paneId])

  const handleSplitV = useCallback(() => {
    if (atCap) return
    createSession((newSessionId: string, shellType: string) => {
      addSession({
        id: newSessionId,
        name: shellType,
        shellType,
        status: 'active',
        createdAt: Date.now(),
        userRenamed: false,
      })
      splitPane(itemId, paneId, 'v', newSessionId)
    })
  }, [atCap, createSession, addSession, splitPane, itemId, paneId])

  const handleEject = useCallback(() => {
    detachPane(itemId, paneId)
  }, [detachPane, itemId, paneId])

  const titleBarOpacity = useSettingsStore((s) => s.titleBarOpacity)
  const titleBarHoverOpacity = useSettingsStore((s) => s.titleBarHoverOpacity)

  return (
    <>
    <div
      ref={dragRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        flex items-center h-6 px-2 gap-1 text-xs select-none shrink-0
        cursor-grab active:cursor-grabbing
        transition-opacity duration-200
        ${translucent
          ? 'absolute top-0 left-0 right-0 z-30 backdrop-blur-sm'
          : ''
        }
        ${isFocused
          ? `${translucent ? '' : 'bg-muted'} border-b-2 border-primary text-foreground`
          : `${translucent ? '' : 'bg-muted/50'} border-b border-border text-muted-foreground`
        }
      `}
      style={{
        opacity: isDragging ? 0.4 : translucent ? (isHovered ? titleBarHoverOpacity : titleBarOpacity) : 1,
        ...(translucent ? { backgroundColor: `color-mix(in srgb, var(--muted) ${Math.round((isHovered ? titleBarHoverOpacity : titleBarOpacity) * 100)}%, transparent)` } : {}),
      }}
    >
      <GripVertical className="size-3 text-muted-foreground/50 shrink-0" />
      {tmuxSessionName && (
        <span
          className="inline-flex items-center gap-0.5 px-1 rounded bg-green-500/20 text-green-500 text-[10px] shrink-0"
          title={`Attached to tmux: ${tmuxSessionName}`}
        >
          <Monitor className="size-2.5" />
          tmux
        </span>
      )}
      <span className="truncate flex-1 font-mono">{sessionName}</span>
      {/* Plugin widget slots — click to open panel */}
      {getAllPlugins().map(plugin => {
        const settings = useSettingsStore.getState().pluginSettings[plugin.id]
        if (settings && !settings.enabled) return null
        if (settings && !settings.titleBar) return null
        return (
          <button
            key={plugin.id}
            onClick={(e) => { e.stopPropagation(); setOpenPlugin(openPlugin?.id === plugin.id ? null : plugin) }}
            className="flex items-center hover:opacity-80 transition-opacity"
          >
            <plugin.TitleBarWidget sessionId={sessionId} paneId={paneId} />
          </button>
        )
      })}
      <button
        onClick={handleSplitH}
        disabled={atCap}
        className="hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-0.5"
        title={atCap ? 'Maximum 8 panes reached' : 'Split horizontal'}
      >
        <Columns2 className="size-3" />
      </button>
      <button
        onClick={handleSplitV}
        disabled={atCap}
        className="hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-0.5"
        title={atCap ? 'Maximum 8 panes reached' : 'Split vertical'}
      >
        <Rows2 className="size-3" />
      </button>
      {!isSinglePane && (
        <button
          onClick={handleEject}
          className="hover:text-foreground transition-colors px-0.5"
          title="Eject from layout"
        >
          <ArrowUpFromLine className="size-3" />
        </button>
      )}
      <button
        onClick={handleClose}
        className="hover:text-destructive transition-colors px-0.5"
        title="Close pane"
      >
        <X className="size-3" />
      </button>
    </div>
    {openPlugin && (
      <PluginPanel
        plugin={openPlugin}
        sessionId={sessionId}
        paneId={paneId}
        pinned={panelPinned}
        onTogglePin={() => setPanelPinned(!panelPinned)}
        onClose={() => { setOpenPlugin(null); setPanelPinned(false) }}
      />
    )}
    </>
  )
}
