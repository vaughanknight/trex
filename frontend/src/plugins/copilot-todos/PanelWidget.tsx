/**
 * Copilot Todo Tracker — PanelWidget
 *
 * Full task list grouped by status, with colored indicators.
 */

import { selectPluginData } from '../../plugins/pluginStore'
import type { PluginWidgetProps } from '../../plugins/pluginRegistry'
import { copilotTodoStore } from './store'

interface TodoItem {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
}

interface CopilotData {
  tasks: TodoItem[]
  summary: { total: number; done: number; inProgress: number; blocked: number; pending: number }
}

const STATUS_COLORS: Record<string, string> = {
  done: 'text-green-500',
  in_progress: 'text-amber-500',
  blocked: 'text-red-500',
  pending: 'text-muted-foreground',
}

const STATUS_ICONS: Record<string, string> = {
  done: '✓',
  in_progress: '◐',
  blocked: '✕',
  pending: '○',
}

export function PanelWidget({ sessionId }: PluginWidgetProps) {
  const data = copilotTodoStore(selectPluginData(sessionId)) as CopilotData | undefined
  if (!data?.tasks) return <p className="text-xs text-muted-foreground">No todo data available</p>

  const { summary, tasks } = data
  const pct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0

  return (
    <div className="space-y-3 text-xs">
      {/* Summary bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-muted-foreground tabular-nums shrink-0">{summary.done}/{summary.total} ({pct}%)</span>
      </div>

      {/* Task list */}
      <div className="space-y-1">
        {tasks.map(task => (
          <div key={task.id} className="flex items-center gap-2">
            <span className={`shrink-0 ${STATUS_COLORS[task.status]}`}>
              {STATUS_ICONS[task.status]}
            </span>
            <span className={task.status === 'done' ? 'line-through text-muted-foreground' : ''}>
              {task.title}
            </span>
          </div>
        ))}
      </div>

      {/* Status legend */}
      <div className="flex gap-3 text-[10px] text-muted-foreground border-t border-border/50 pt-2">
        <span className="text-green-500">✓ {summary.done}</span>
        <span className="text-amber-500">◐ {summary.inProgress}</span>
        <span className="text-red-500">✕ {summary.blocked}</span>
        <span>○ {summary.pending}</span>
      </div>
    </div>
  )
}
