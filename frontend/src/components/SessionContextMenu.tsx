/**
 * SessionContextMenu - Right-click menu for session management.
 *
 * Features:
 * - Rename option (triggers inline edit mode)
 * - Close option (removes session from store)
 *
 * Uses shadcn/ui ContextMenu
 */
import { Edit2, X } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface SessionContextMenuProps {
  children: React.ReactNode
  onRename: () => void
  onClose: () => void
}

export function SessionContextMenu({
  children,
  onRename,
  onClose,
}: SessionContextMenuProps) {
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
        <ContextMenuItem onClick={onClose} variant="destructive">
          <X className="mr-2 size-4" />
          Close
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
