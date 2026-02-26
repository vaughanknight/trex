/**
 * Copilot Todo Tracker Plugin
 *
 * Visualises Copilot CLI task progress:
 * - Title bar: battery-pill phase indicators + count badge
 * - Sidebar: Apple Watch activity ring
 * - Panel: full task list with status
 *
 * Data source: Copilot CLI session SQLite database (~/.copilot/session-state/)
 * Activation: detects 'copilot' in process tree
 */

import { registerPlugin } from '../../plugins/pluginRegistry'
import { TitleBarWidget } from './TitleBarWidget'
import { SidebarWidget } from './SidebarWidget'
import { PanelWidget } from './PanelWidget'
import { copilotTodoStore } from './store'

registerPlugin({
  id: 'copilot-todos',
  name: 'Copilot Todo Tracker',
  processMatch: ['copilot', 'github-copilot'],
  TitleBarWidget,
  SidebarWidget,
  PanelWidget,
  useStore: copilotTodoStore,
})
