/**
 * Copilot Todo Tracker — SidebarWidget
 *
 * Concentric activity rings: outer = task completion, inner = phase completion.
 */

import { selectPluginData } from '../../plugins/pluginStore'
import type { PluginWidgetProps } from '../../plugins/pluginRegistry'
import { copilotTodoStore } from './store'

interface PhaseInfo {
  name: string
  progress: { total: number; done: number; inProgress: number }
}

interface CopilotData {
  summary: { total: number; done: number; inProgress: number }
  phases?: PhaseInfo[]
}

function Ring({ cx, cy, radius, ratio, color, strokeWidth }: {
  cx: number; cy: number; radius: number; ratio: number; color: string; strokeWidth: number
}) {
  const circumference = 2 * Math.PI * radius
  return (
    <>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity={0.1} />
      {ratio > 0 && (
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
    </>
  )
}

export function SidebarWidget({ sessionId }: PluginWidgetProps) {
  const data = copilotTodoStore(selectPluginData(sessionId)) as CopilotData | undefined
  if (!data?.summary || data.summary.total === 0) return null

  const phases = data.phases
  const phasesDone = phases ? phases.filter(p => p.progress.done === p.progress.total && p.progress.total > 0).length : 0
  const phasesTotal = phases?.length ?? 0
  const phaseRatio = phasesTotal > 0 ? phasesDone / phasesTotal : 0

  // Active phase task ratio (same logic as title bar)
  const activePhase = phases?.find(p => p.progress.done < p.progress.total) ?? phases?.[phases.length - 1]
  const taskRatio = activePhase ? (activePhase.progress.total > 0 ? activePhase.progress.done / activePhase.progress.total : 0) : (data.summary.done / data.summary.total)

  const size = 18
  const center = size / 2

  return (
    <svg width={size} height={size} className="shrink-0" aria-label={`${activePhase?.progress.done ?? data.summary.done}/${activePhase?.progress.total ?? data.summary.total} tasks`}>
      {/* Outer ring: active phase tasks (blue) */}
      <Ring cx={center} cy={center} radius={7} ratio={taskRatio} color="#3b82f6" strokeWidth={2} />
      {/* Inner ring: phases (green) */}
      {phasesTotal > 1 && (
        <Ring cx={center} cy={center} radius={4} ratio={phaseRatio} color="#22c55e" strokeWidth={2} />
      )}
    </svg>
  )
}
