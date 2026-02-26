/**
 * Copilot Todo Tracker — TitleBarWidget
 *
 * Phase pills (green) + task pills (blue) side by side, with count badge.
 */

import { selectPluginData } from '../../plugins/pluginStore'
import type { PluginWidgetProps } from '../../plugins/pluginRegistry'
import { copilotTodoStore } from './store'

interface PhaseInfo {
  name: string
  progress: { total: number; done: number; inProgress: number; blocked: number }
}

interface CopilotData {
  summary: { total: number; done: number; inProgress: number; blocked: number }
  phases?: PhaseInfo[]
}

const SEG_W = 6
const SEG_GAP = 2
const SEG_H = 8

function Pills({ items, doneColor }: { items: { done: boolean; inProgress: boolean; blocked: boolean }[]; doneColor: string }) {
  const width = items.length * (SEG_W + SEG_GAP) + 1
  return (
    <svg width={width} height={10} className="shrink-0">
      {items.map((item, i) => {
        let fill = 'none'
        let stroke = '#9ca3af'
        let strokeW = 1
        let opacity = 1
        if (item.done) { fill = doneColor; stroke = doneColor; strokeW = 0.5 }
        else if (item.inProgress) { fill = '#f59e0b'; stroke = '#f59e0b'; strokeW = 0.5 }
        else if (item.blocked) { fill = '#ef4444'; stroke = '#ef4444'; strokeW = 0.5 }
        return (
          <rect
            key={i}
            x={i * (SEG_W + SEG_GAP) + 1}
            y={1}
            width={SEG_W}
            height={SEG_H}
            rx={1.5}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeW}
            opacity={opacity}
          />
        )
      })}
    </svg>
  )
}

export function TitleBarWidget({ sessionId }: PluginWidgetProps) {
  const data = copilotTodoStore(selectPluginData(sessionId)) as CopilotData | undefined
  if (!data?.summary || data.summary.total === 0) return null

  const { total, done, inProgress, blocked } = data.summary
  const phases = data.phases

  // Phase pills (green for done)
  const phasePills = phases?.map(p => ({
    done: p.progress.done === p.progress.total && p.progress.total > 0,
    inProgress: p.progress.inProgress > 0,
    blocked: p.progress.blocked > 0,
  }))

  // Find the active phase (first non-complete phase, or last phase)
  const activePhase = phases?.find(p => p.progress.done < p.progress.total) ?? phases?.[phases.length - 1]

  // Task pills for active phase only (blue for done)
  const phaseTotal = activePhase?.progress.total ?? total
  const phaseDone = activePhase?.progress.done ?? done
  const phaseInProgress = activePhase?.progress.inProgress ?? inProgress
  const phaseBlocked = activePhase?.progress.blocked ?? blocked
  const taskCount = Math.min(phaseTotal, 20)
  const taskPills = Array.from({ length: taskCount }, (_, i) => ({
    done: i < phaseDone,
    inProgress: i >= phaseDone && i < phaseDone + phaseInProgress,
    blocked: i >= phaseDone + phaseInProgress && i < phaseDone + phaseInProgress + phaseBlocked,
  }))

  return (
    <div className="flex items-center gap-1.5 shrink-0" title={`${done}/${total} tasks done`}>
      {phasePills && phasePills.length > 1 && (
        <Pills items={phasePills} doneColor="#22c55e" />
      )}
      <Pills items={taskPills} doneColor="#3b82f6" />
      <span className="text-[9px] text-muted-foreground tabular-nums">{phaseDone}/{phaseTotal}</span>
    </div>
  )
}
