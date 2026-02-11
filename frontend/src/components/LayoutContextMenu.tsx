/**
 * LayoutContextMenu - Right-click menu for layout workspace items.
 *
 * Options:
 * - Rename: triggers inline edit mode
 * - Dissolve: breaks layout into standalone sessions
 * - Close Layout: kills all sessions in layout
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 4
 */
import { Edit2, X, Ungroup } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface LayoutContextMenuProps {
  children: React.ReactNode
  onRename: () => void
  onDissolve: () => void
  onCloseLayout: () => void
}

export function LayoutContextMenu({
  children,
  onRename,
  onDissolve,
  onCloseLayout,
}: LayoutContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRename}>
          <Edit2 className="mr-2 size-4" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onClick={onDissolve}>
          <Ungroup className="mr-2 size-4" />
          Dissolve
        </ContextMenuItem>
        <ContextMenuItem onClick={onCloseLayout} variant="destructive">
          <X className="mr-2 size-4" />
          Close Layout
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
