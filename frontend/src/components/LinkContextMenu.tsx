/**
 * LinkContextMenu — Context menu for detected terminal links.
 *
 * Rendered as a positioned overlay at click coordinates via React portal.
 * Uses a plain div instead of Radix ContextMenu because xterm.js captures
 * mouse events internally — Radix's trigger-based approach doesn't work
 * with native contextmenu events attached to the xterm container.
 *
 * DYK-06: Auto-dismisses on scroll, resize, blur, and keypress.
 *
 * @see /docs/plans/017-clickable-terminal-links/clickable-terminal-links-plan.md Phase 2
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ExternalLink,
  Copy,
  FileCode,
  Mail,
  Globe,
  FileText,
  Eye,
} from 'lucide-react'
import type { LinkData } from '../lib/linkProvider'
import {
  activateLink,
  copyToClipboard,
  copyAsMarkdown,
  getLinkUrl,
  parseFilePath,
} from '../lib/linkActions'
import { useWorkspaceStore } from '../stores/workspace'
import type { PreviewLeaf } from '../types/layout'

interface LinkContextMenuProps {
  link: LinkData
  position: { x: number; y: number }
  onClose: () => void
}

export function LinkContextMenu({ link, position, onClose }: LinkContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Auto-close on outside click, keydown, or scroll
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = () => onClose()
    const handleScroll = () => onClose()
    const handleBlur = () => onClose()

    // Small delay to avoid the triggering right-click from immediately closing
    const timerId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
      window.addEventListener('scroll', handleScroll, true)
      window.addEventListener('blur', handleBlur)
    }, 0)

    return () => {
      clearTimeout(timerId)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [onClose])

  // Keep menu within viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    if (rect.right > vw) {
      menuRef.current.style.left = `${vw - rect.width - 8}px`
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${vh - rect.height - 8}px`
    }
  }, [position])

  const url = getLinkUrl(link)

  const handleOpen = () => {
    activateLink(link)
    onClose()
  }

  const handleCopyUrl = async () => {
    await copyToClipboard(url)
    onClose()
  }

  const handleCopyAsMarkdown = async () => {
    await copyAsMarkdown(link.text, url)
    onClose()
  }

  const handleOpenPreview = () => {
    const ws = useWorkspaceStore.getState()
    const activeItem = ws.getActiveItem()
    const { path } = parseFilePath(link.text)
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const contentType: PreviewLeaf['contentType'] = ext === 'md' || ext === 'markdown' ? 'markdown' : 'text'

    const createPreviewLeaf = (paneId: string): PreviewLeaf => ({
      type: 'preview',
      paneId,
      contentType,
      source: path,
    })

    if (activeItem?.focusedPaneId) {
      ws.splitPaneWith(activeItem.id, activeItem.focusedPaneId, 'h', createPreviewLeaf)
    }
    onClose()
  }

  const canPreview = link.type === 'file' || link.type === 'url'

  const getOpenLabel = () => {
    switch (link.type) {
      case 'url': return 'Open in Browser'
      case 'file': return 'Open in VS Code'
      case 'ip': return 'Open in Browser'
      case 'email': return 'Send Email'
      case 'custom': return 'Open Link'
      default: return 'Open'
    }
  }

  const getOpenIcon = () => {
    switch (link.type) {
      case 'url': return <Globe className="size-4" />
      case 'file': return <FileCode className="size-4" />
      case 'ip': return <Globe className="size-4" />
      case 'email': return <Mail className="size-4" />
      case 'custom': return <ExternalLink className="size-4" />
      default: return <ExternalLink className="size-4" />
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[12rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{
        left: position.x,
        top: position.y,
      }}
      role="menu"
      aria-label="Link actions"
    >
      {/* Primary action */}
      <button
        className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
        onClick={handleOpen}
        role="menuitem"
      >
        {getOpenIcon()}
        {getOpenLabel()}
      </button>

      {/* Copy URL */}
      <button
        className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
        onClick={handleCopyUrl}
        role="menuitem"
      >
        <Copy className="size-4" />
        Copy URL
      </button>

      {/* Copy as Markdown */}
      <button
        className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
        onClick={handleCopyAsMarkdown}
        role="menuitem"
      >
        <FileText className="size-4" />
        Copy as Markdown
      </button>

      {/* Open Preview — for file and URL links */}
      {canPreview && (
        <button
          className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
          onClick={handleOpenPreview}
          role="menuitem"
        >
          <Eye className="size-4" />
          Open Preview
        </button>
      )}

      {/* File-specific: open in VS Code */}
      {link.type === 'file' && (
        <>
          <div className="bg-border -mx-1 my-1 h-px" />
          <button
            className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
            onClick={handleOpen}
            role="menuitem"
          >
            <FileCode className="size-4" />
            Open in VS Code
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
