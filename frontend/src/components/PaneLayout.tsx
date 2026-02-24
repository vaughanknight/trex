/**
 * PaneLayout — Recursive tree renderer for split pane layouts.
 *
 * Walks the binary tree from the workspace store and renders nested
 * Group/Panel/Separator structures from react-resizable-panels v4.
 *
 * Single leaf: renders PaneContainer directly (no panel wrapper).
 * Split node: renders Group with two Panels separated by a Separator.
 *
 * @see /docs/plans/016-sidebar-url-overhaul/sidebar-url-overhaul-plan.md § Phase 2
 */

import { Group, Panel, Separator } from 'react-resizable-panels'
import type { PaneLayout as PaneLayoutType } from '../types/layout'
import { deriveIsFocused } from '../lib/layoutTree'
import { PaneContainer } from './PaneContainer'
import { PreviewPaneContainer } from './PreviewPaneContainer'

interface PaneLayoutProps {
  /** Workspace item ID this layout belongs to */
  itemId: string
  /** The layout tree to render */
  layout: PaneLayoutType
  /** The currently focused pane ID (from layout store) */
  focusedPaneId: string | null
  /** Whether to show title bars (true when 2+ panes exist) */
  showTitleBar: boolean
}

export function PaneLayout({ itemId, layout, focusedPaneId, showTitleBar }: PaneLayoutProps) {
  return renderNode(itemId, layout, focusedPaneId, showTitleBar, [])
}

/**
 * Recursively render a layout tree node.
 *
 * @param itemId - Workspace item ID for scoped layout operations
 * @param node - Current tree node (leaf or split)
 * @param focusedPaneId - Currently focused pane
 * @param showTitleBar - Whether title bars should be shown
 * @param path - Path from root (used for stable React keys)
 */
function renderNode(
  itemId: string,
  node: PaneLayoutType,
  focusedPaneId: string | null,
  showTitleBar: boolean,
  path: string[],
): React.ReactElement {
  if (node.type === 'terminal') {
    return (
      <PaneContainer
        key={node.paneId}
        itemId={itemId}
        paneId={node.paneId}
        sessionId={node.sessionId}
        isFocused={deriveIsFocused(focusedPaneId, node.paneId)}
        showTitleBar={showTitleBar}
      />
    )
  }

  if (node.type === 'preview') {
    return (
      <PreviewPaneContainer
        key={node.paneId}
        itemId={itemId}
        paneId={node.paneId}
        contentType={node.contentType}
        source={node.source}
        showTitleBar={showTitleBar}
      />
    )
  }

  // Split node → Group with two Panels and a Separator
  const orientation = node.direction === 'h' ? 'horizontal' : 'vertical'
  const firstSize = `${node.ratio * 100}%`
  const secondSize = `${(1 - node.ratio) * 100}%`
  const groupKey = path.join('-') || 'root'

  return (
    <Group
      key={groupKey}
      orientation={orientation}
      style={{ width: '100%', height: '100%' }}
    >
      <Panel
        id={`${groupKey}-first`}
        defaultSize={firstSize}
        minSize="10%"
      >
        {renderNode(itemId, node.first, focusedPaneId, showTitleBar, [...path, 'first'])}
      </Panel>
      <Separator
        className={
          orientation === 'horizontal'
            ? 'w-1 bg-border hover:bg-primary transition-colors cursor-col-resize'
            : 'h-1 bg-border hover:bg-primary transition-colors cursor-row-resize'
        }
      />
      <Panel
        id={`${groupKey}-second`}
        defaultSize={secondSize}
        minSize="10%"
      >
        {renderNode(itemId, node.second, focusedPaneId, showTitleBar, [...path, 'second'])}
      </Panel>
    </Group>
  )
}
