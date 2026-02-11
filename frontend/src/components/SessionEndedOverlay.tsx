/**
 * SessionEndedOverlay — Overlay for dead sessions inside panes.
 *
 * Displays exit code and provides "Close" and "Restart Session" buttons.
 * Scrollback remains visible behind the semi-transparent overlay (DYK-01).
 *
 * Takes callbacks for close/restart so parent (PaneContainer) can provide
 * variant-specific behavior (standalone session close vs layout pane close).
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 2
 */

interface SessionEndedOverlayProps {
  exitCode: number
  /** Label for close button (e.g., "Close Pane" or "Close Session") */
  closeLabel?: string
  onClose: () => void
  onRestart: () => void
}

export function SessionEndedOverlay({ exitCode, closeLabel = 'Close Pane', onClose, onRestart }: SessionEndedOverlayProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/70 z-10">
      <div className="flex flex-col items-center gap-3 p-4 rounded-md bg-muted border border-border text-sm">
        <span className="text-muted-foreground">
          Process exited with code <span className="font-mono font-bold text-foreground">{exitCode}</span>
        </span>
        <div className="flex gap-2">
          <button
            onClick={onRestart}
            className="px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs"
          >
            Restart Session
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-muted-foreground/20 text-foreground hover:bg-muted-foreground/30 transition-colors text-xs"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
