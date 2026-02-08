/**
 * EmptyState - Displayed when no terminal sessions exist.
 *
 * Shows a helpful message guiding users to create their first session.
 * Per AC-11a: Shows "No sessions" when sessions empty.
 */

import { Terminal } from 'lucide-react'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full text-muted-foreground">
      <Terminal className="size-16 mb-4 opacity-50" />
      <h2 className="text-xl font-semibold mb-2">No Sessions</h2>
      <p className="text-sm text-center max-w-xs">
        Click <strong>"New Session"</strong> in the sidebar to create your first terminal.
      </p>
    </div>
  )
}
