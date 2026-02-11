/**
 * SplitIndicator — Visual feedback showing where a new pane will appear.
 *
 * Renders a semi-transparent accent overlay covering ~40% of the container
 * from the indicated edge. Used inside DropZoneOverlay during drag-over.
 *
 * @see /docs/plans/015-pane-splitting/pane-splitting-plan.md § Phase 4
 */

export type Edge = 'top' | 'bottom' | 'left' | 'right'

interface SplitIndicatorProps {
  edge: Edge | null
}

const EDGE_STYLES: Record<Edge, string> = {
  top: 'top-0 left-0 right-0 h-[40%]',
  bottom: 'bottom-0 left-0 right-0 h-[40%]',
  left: 'top-0 left-0 bottom-0 w-[40%]',
  right: 'top-0 right-0 bottom-0 w-[40%]',
}

export function SplitIndicator({ edge }: SplitIndicatorProps) {
  if (!edge) return null

  return (
    <div
      className={`absolute ${EDGE_STYLES[edge]} bg-primary/20 border-2 border-primary/40 rounded-sm pointer-events-none transition-all duration-100`}
    />
  )
}
