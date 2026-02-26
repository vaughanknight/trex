/**
 * PluginPanel — Expandable detail panel for plugin data.
 *
 * Renders below the title bar as either:
 * - Overlay mode (default): floats over terminal, dismiss on click outside
 * - Pinned mode: pushes terminal down, persists until manually closed
 */

import { useRef, useEffect } from 'react'
import { Pin, PinOff, X } from 'lucide-react'
import type { VisualisationPlugin } from '../plugins/pluginRegistry'

interface PluginPanelProps {
  plugin: VisualisationPlugin
  sessionId: string
  paneId: string
  pinned: boolean
  onTogglePin: () => void
  onClose: () => void
}

export function PluginPanel({ plugin, sessionId, paneId, pinned, onTogglePin, onClose }: PluginPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Dismiss overlay on click outside (only in overlay mode)
  useEffect(() => {
    if (pinned) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid immediate close from the click that opened it
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [pinned, onClose])

  return (
    <div
      ref={panelRef}
      className={`
        bg-sidebar border-b border-border
        ${pinned ? '' : 'absolute left-0 right-0 z-30 shadow-lg'}
      `}
      style={{ maxHeight: pinned ? undefined : '60vh', overflow: 'auto' }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 text-xs">
        <span className="font-medium">{plugin.name}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onTogglePin}
            className="p-0.5 rounded hover:bg-accent transition-colors"
            title={pinned ? 'Unpin (overlay mode)' : 'Pin (push terminal down)'}
          >
            {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
          </button>
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-accent hover:text-destructive transition-colors"
            title="Close panel"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
      {/* Plugin content */}
      <div className="p-3">
        <plugin.PanelWidget sessionId={sessionId} paneId={paneId} />
      </div>
    </div>
  )
}
