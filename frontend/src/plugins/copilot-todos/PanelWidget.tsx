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

interface PhaseInfo {
  name: string
  progress: { total: number; done: number; inProgress: number; blocked: number; pending: number }
}

interface CopilotData {
  tasks: TodoItem[]
  phases?: PhaseInfo[]
  summary: { total: number; done: number; inProgress: number; blocked: number; pending: number }
  context?: { activity?: string; planName?: string; workflowPhase?: string; phaseHeading?: string; currentSkill?: string }
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
      {/* Plan context header */}
      {data.context && (data.context.planName || data.context.activity) && (
        <div className="border-b border-border/50 pb-2 space-y-0.5">
          {data.context.planName && (
            <div className="font-medium text-foreground">{data.context.planName}</div>
          )}
          {data.context.phaseHeading && (
            <div className="text-muted-foreground">{data.context.phaseHeading}</div>
          )}
          {data.context.activity && data.context.activity !== data.context.phaseHeading && (
            <div className="text-muted-foreground/70 italic">{data.context.activity}</div>
          )}
        </div>
      )}

      {/* Overall progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-muted-foreground tabular-nums shrink-0">{summary.done}/{summary.total} ({pct}%)</span>
      </div>

      {/* Tasks grouped by phase */}
      {data.phases && data.phases.length > 1 ? (
        <div className="space-y-3">
          {data.phases.map((phase) => {
            const phasePct = phase.progress.total > 0 ? Math.round((phase.progress.done / phase.progress.total) * 100) : 0
            const isComplete = phase.progress.done === phase.progress.total && phase.progress.total > 0
            const hasInProgress = phase.progress.inProgress > 0
            const hasBlocked = phase.progress.blocked > 0
            const phaseTasks = tasks.filter(t => t.id.startsWith(phase.name + '-'))
            const phaseIconColor = isComplete ? 'text-green-500' : hasBlocked ? 'text-red-500' : hasInProgress ? 'text-amber-500' : 'text-muted-foreground'
            const phaseBarColor = isComplete ? 'bg-green-500' : hasBlocked ? 'bg-red-500' : hasInProgress ? 'bg-amber-500' : 'bg-muted-foreground'
            return (
              <div key={phase.name}>
                {/* Phase header */}
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`shrink-0 ${phaseIconColor}`}>
                    {isComplete ? '✓' : hasInProgress ? '◐' : hasBlocked ? '✕' : '○'}
                  </span>
                  <span className={`font-medium ${isComplete ? 'text-green-500' : ''}`}>{phase.name}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">{phase.progress.done}/{phase.progress.total}</span>
                </div>
                <div className="pl-5 mb-1">
                  <div className="w-24 h-1 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${phaseBarColor}`} style={{ width: `${phasePct}%` }} />
                  </div>
                </div>
                {/* Phase tasks */}
                <div className="pl-5 space-y-0.5">
                  {phaseTasks.map(task => (
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
              </div>
            )
          })}
        </div>
      ) : (
        /* Flat task list (no phases) */
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
      )}

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
