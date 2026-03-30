import { cn } from '@/lib/utils'
import type { Verdict, StepStatus } from '../types'

const VERDICT_CONFIG: Record<Verdict, { label: string; className: string }> = {
  pass: { label: '建议入场', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  watch: { label: '待观察', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  reject: { label: '排除', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
}

const STEP_STATUS_CONFIG: Record<StepStatus, { icon: string; className: string; label: string }> = {
  pass: { icon: '✓', className: 'text-green-600 dark:text-green-400', label: '通过' },
  watch: { icon: '⚠', className: 'text-yellow-600 dark:text-yellow-400', label: '待观察' },
  fail: { icon: '✕', className: 'text-red-600 dark:text-red-400', label: '不通过' },
  skip: { icon: '—', className: 'text-muted-foreground', label: '未执行' },
}

interface VerdictBadgeProps {
  verdict: Verdict
  className?: string
}

export function VerdictBadge({ verdict, className }: VerdictBadgeProps) {
  const config = VERDICT_CONFIG[verdict]
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold', config.className, className)}>
      {config.label}
    </span>
  )
}

interface StepStatusIconProps {
  status: StepStatus
  showLabel?: boolean
  className?: string
}

export function StepStatusIcon({ status, showLabel, className }: StepStatusIconProps) {
  const config = STEP_STATUS_CONFIG[status]
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium text-sm', config.className, className)}>
      <span className="w-5 h-5 flex items-center justify-center text-base leading-none">{config.icon}</span>
      {showLabel && <span className="text-xs">{config.label}</span>}
    </span>
  )
}

interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'lg'
}

export function ScoreBadge({ score, size = 'sm' }: ScoreBadgeProps) {
  const color = score >= 71 ? 'text-green-600 dark:text-green-400'
    : score >= 51 ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-red-600 dark:text-red-400'

  if (size === 'lg') {
    return (
      <div className="flex flex-col items-center">
        <span className={cn('text-5xl font-bold tabular-nums', color)}>{score}</span>
        <span className="text-xs text-muted-foreground mt-1">综合评分</span>
      </div>
    )
  }
  return (
    <span className={cn('text-sm font-bold tabular-nums', color)}>{score}</span>
  )
}
