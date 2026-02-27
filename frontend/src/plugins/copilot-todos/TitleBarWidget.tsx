/**
 * Copilot Todo Tracker — TitleBarWidget
 *
 * Phase pills (theme green) + active phase task pills (theme cyan) side by side.
 * Uses terminal theme ANSI colors for consistency across themes.
 */

import { selectPluginData } from '../../plugins/pluginStore'
import type { PluginWidgetProps } from '../../plugins/pluginRegistry'
import { copilotTodoStore } from './store'
import { useSettingsStore } from '../../stores/settings'
import { themes } from '../../themes'

interface PhaseInfo {
  name: string
  progress: { total: number; done: number; inProgress: number; blocked: number }
}

interface PlanContext {
  activity?: string
  planName?: string
  workflowPhase?: string
  phaseHeading?: string
  phaseNumber?: string
  totalPhases?: string
}

interface CopilotData {
  summary: { total: number; done: number; inProgress: number; blocked: number }
  phases?: PhaseInfo[]
  context?: PlanContext
}

const SEG_W = 6
const SEG_GAP = 2
const SEG_H = 8

function useThemeColors() {
  const themeId = useSettingsStore((s) => s.theme)
  const themeInfo = themes.find(t => t.id === themeId)
  const th = themeInfo?.theme
  return {
    done: th?.green ?? '#22c55e',
    taskDone: th?.cyan ?? th?.brightBlue ?? '#3b82f6',
    inProgress: th?.yellow ?? '#f59e0b',
    blocked: th?.red ?? '#ef4444',
    pendingStroke: th?.white ?? '#9ca3af',
  }
}

interface PillsProps {
  items: { done: boolean; inProgress: boolean; blocked: boolean }[]
  doneColor: string
  colors: ReturnType<typeof useThemeColors>
}

function Pills({ items, doneColor, colors }: PillsProps) {
  const width = items.length * (SEG_W + SEG_GAP) + 1
  return (
    <svg width={width} height={10} className="shrink-0">
      {items.map((item, i) => {
        let fill = 'none'
        let stroke = colors.pendingStroke
        let strokeW = 1
        if (item.done) { fill = doneColor; stroke = doneColor; strokeW = 0.5 }
        else if (item.inProgress) { fill = colors.inProgress; stroke = colors.inProgress; strokeW = 0.5 }
        else if (item.blocked) { fill = colors.blocked; stroke = colors.blocked; strokeW = 0.5 }
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
          />
        )
      })}
    </svg>
  )
}

export function TitleBarWidget({ sessionId }: PluginWidgetProps) {
  const data = copilotTodoStore(selectPluginData(sessionId)) as CopilotData | undefined
  const colors = useThemeColors()
  if (!data?.summary || data.summary.total === 0) return null

  const { total, done, inProgress, blocked } = data.summary
  const phases = data.phases

  const phasePills = phases?.map(p => ({
    done: p.progress.done === p.progress.total && p.progress.total > 0,
    inProgress: p.progress.inProgress > 0,
    blocked: p.progress.blocked > 0,
  }))

  const activePhase = phases?.find(p => p.progress.done < p.progress.total) ?? phases?.[phases.length - 1]
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

  const activity = data.context?.activity
  const planName = data.context?.planName

  return (
    <div className="flex items-center gap-1.5 shrink-0" title={`${planName ? planName + ' — ' : ''}${phaseDone}/${phaseTotal} tasks done`}>
      {activity && (
        <span className="text-[9px] text-muted-foreground truncate max-w-[120px]">{activity}</span>
      )}
      {phasePills && phasePills.length > 1 && (
        <Pills items={phasePills} doneColor={colors.done} colors={colors} />
      )}
      <Pills items={taskPills} doneColor={colors.taskDone} colors={colors} />
      <span className="text-[9px] text-muted-foreground tabular-nums">{phaseDone}/{phaseTotal}</span>
    </div>
  )
}
