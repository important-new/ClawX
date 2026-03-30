import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VerdictBadge, StepStatusIcon } from './VerdictBadge'
import { MODE_LABELS, STEP_LABELS } from '../types'
import type { AnalysisSession } from '../types'

interface CompareTableProps {
  sessions: AnalysisSession[]
  onRemove: (id: string) => void
}

export function CompareTable({ sessions, onRemove }: CompareTableProps) {
  if (sessions.length === 0) return null

  const stepKeys = Object.keys(STEP_LABELS) as (keyof typeof STEP_LABELS)[]

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground w-28">对比维度</th>
            {sessions.map((s) => (
              <th key={s.id} className="px-4 py-3 text-left min-w-40">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground text-[13px]">{s.productName}</p>
                    <p className="text-[11px] text-muted-foreground font-normal mt-0.5">{MODE_LABELS[s.mode]}</p>
                  </div>
                  <button
                    onClick={() => onRemove(s.id)}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors mt-0.5 shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {/* Overall score */}
          <tr className="hover:bg-muted/20">
            <td className="px-4 py-3 text-xs text-muted-foreground font-medium">综合评分</td>
            {sessions.map((s) => (
              <td key={s.id} className="px-4 py-3">
                {s.report ? (
                  <span className={cn('font-bold text-base tabular-nums',
                    s.report.overallScore >= 71 ? 'text-green-600 dark:text-green-400' :
                    s.report.overallScore >= 51 ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-red-600 dark:text-red-400'
                  )}>
                    {s.report.overallScore}
                  </span>
                ) : <span className="text-muted-foreground">—</span>}
              </td>
            ))}
          </tr>

          {/* Verdict */}
          <tr className="hover:bg-muted/20">
            <td className="px-4 py-3 text-xs text-muted-foreground font-medium">结论</td>
            {sessions.map((s) => (
              <td key={s.id} className="px-4 py-3">
                {s.report ? <VerdictBadge verdict={s.report.verdict} /> : <span className="text-muted-foreground">—</span>}
              </td>
            ))}
          </tr>

          {/* Each step */}
          {stepKeys.map((key) => (
            <tr key={key} className="hover:bg-muted/20">
              <td className="px-4 py-3 text-xs text-muted-foreground font-medium">{STEP_LABELS[key]}</td>
              {sessions.map((s) => (
                <td key={s.id} className="px-4 py-3">
                  {s.report ? (
                    <div className="flex items-center gap-1.5">
                      <StepStatusIcon status={s.report.steps[key].status} showLabel />
                      {s.report.steps[key].status !== 'skip' && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          ({s.report.steps[key].score})
                        </span>
                      )}
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
              ))}
            </tr>
          ))}

          {/* Market */}
          <tr className="hover:bg-muted/20">
            <td className="px-4 py-3 text-xs text-muted-foreground font-medium">目标站点</td>
            {sessions.map((s) => (
              <td key={s.id} className="px-4 py-3 text-sm">{s.market}</td>
            ))}
          </tr>

          {/* Date */}
          <tr className="hover:bg-muted/20">
            <td className="px-4 py-3 text-xs text-muted-foreground font-medium">分析日期</td>
            {sessions.map((s) => (
              <td key={s.id} className="px-4 py-3 text-xs text-muted-foreground">
                {new Date(s.createdAt).toLocaleDateString('zh-CN')}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
