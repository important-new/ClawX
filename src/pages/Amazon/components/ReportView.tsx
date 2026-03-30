import { Download, ChevronDown, ChevronRight } from 'lucide-react'
import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { VerdictBadge, StepStatusIcon, ScoreBadge } from './VerdictBadge'
import { MODE_LABELS, STEP_LABELS } from '../types'
import type { AnalysisReport, AnalysisSession, StepResult, StepStatus } from '../types'

const PRIORITY_CONFIG = {
  high: { label: '高优先级', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  medium: { label: '中', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  low: { label: '低', className: 'bg-muted text-muted-foreground' },
}

function StepRow({ label, result }: { label: string; result: StepResult }) {
  const [open, setOpen] = useState(false)
  const hasDetails = Object.keys(result.metrics).length > 0 || result.notes.length > 0

  return (
    <div className="border-b last:border-b-0">
      <button
        className="w-full flex items-center gap-3 py-3 px-4 hover:bg-muted/40 transition-colors text-left"
        onClick={() => hasDetails && setOpen(!open)}
        disabled={!hasDetails}
      >
        <StepStatusIcon status={result.status as StepStatus} />
        <span className="flex-1 text-sm font-medium">{label}</span>
        {result.status !== 'skip' && (
          <span className={cn('text-xs font-semibold tabular-nums w-8 text-right',
            result.score >= 70 ? 'text-green-600 dark:text-green-400' :
            result.score >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
          )}>
            {result.score}
          </span>
        )}
        {hasDetails && (
          <span className="text-muted-foreground ml-1">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {open && hasDetails && (
        <div className="px-4 pb-3 space-y-2">
          {Object.entries(result.metrics).map(([key, metric]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{key}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{metric.value}</span>
                <span className="text-muted-foreground/60">（{metric.threshold}）</span>
                <span className={metric.pass ? 'text-green-500' : 'text-red-500'}>{metric.pass ? '✓' : '✗'}</span>
              </div>
            </div>
          ))}
          {result.notes.map((note, i) => (
            <p key={i} className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">{note}</p>
          ))}
        </div>
      )}
    </div>
  )
}

interface ReportViewProps {
  session: AnalysisSession
  report: AnalysisReport
  onExport?: (format: 'excel' | 'pdf') => void
}

export function ReportView({ session, report, onExport }: ReportViewProps) {
  const [exportCopied, setExportCopied] = useState(false)

  const handleExport = useCallback(async (format: 'excel' | 'pdf') => {
    if (onExport) {
      onExport(format)
      return
    }
    // Default: copy as text
    const CONFIDENCE = { high: '高', medium: '中', low: '低' }
    const VERDICTS = { pass: '建议入场', watch: '待观察', reject: '排除' }
    const PRIORITIES = { high: '高', medium: '中', low: '低' }
    const lines = [
      `# 选品分析报告 — ${session.productName}`,
      `模式：${MODE_LABELS[session.mode]}  站点：${session.market}`,
      `综合评分：${report.overallScore}  结论：${VERDICTS[report.verdict]}  置信度：${CONFIDENCE[report.confidenceLevel]}`,
      '', '## 五步评估',
    ]
    for (const [key, label] of Object.entries(STEP_LABELS) as [keyof typeof STEP_LABELS, string][]) {
      const step = report.steps[key]
      lines.push(`\n### ${label}（${step.score > 0 ? step.score + ' 分' : '跳过'}）`)
      for (const [m, v] of Object.entries(step.metrics)) lines.push(`- ${m}: ${v.value}（${v.threshold}）${v.pass ? '✓' : '✗'}`)
      for (const n of step.notes) lines.push(`  > ${n}`)
    }
    if (report.actionItems.length > 0) {
      lines.push('\n## 可操作建议')
      for (const item of report.actionItems) lines.push(`- [${PRIORITIES[item.priority]}] ${item.text}`)
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setExportCopied(true)
      setTimeout(() => setExportCopied(false), 2000)
    } catch { /* ignore */ }
  }, [session, report, onExport])
  const stepEntries = Object.entries(STEP_LABELS) as [keyof typeof STEP_LABELS, string][]
  const confidenceLabels = { high: '高', medium: '中', low: '低' }
  const confidenceColors = {
    high: 'text-green-600 dark:text-green-400',
    medium: 'text-yellow-600 dark:text-yellow-400',
    low: 'text-muted-foreground',
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{session.productName}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {MODE_LABELS[session.mode]} · {session.market} · {new Date(session.createdAt).toLocaleDateString('zh-CN')}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleExport('excel')}>
          <Download className="h-3.5 w-3.5" /> {exportCopied ? '已复制' : '导出报告'}
        </Button>
      </div>

      {/* Score + Verdict */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4 flex flex-col items-center justify-center gap-2">
          <ScoreBadge score={report.overallScore} size="lg" />
        </div>
        <div className="rounded-xl border bg-card p-4 flex flex-col items-center justify-center gap-2">
          <VerdictBadge verdict={report.verdict} className="text-sm px-3 py-1.5" />
          <span className="text-xs text-muted-foreground">综合结论</span>
        </div>
        <div className="rounded-xl border bg-card p-4 flex flex-col items-center justify-center gap-2">
          <span className={cn('text-lg font-bold', confidenceColors[report.confidenceLevel])}>
            {confidenceLabels[report.confidenceLevel]}
          </span>
          <span className="text-xs text-muted-foreground">数据置信度</span>
        </div>
      </div>

      {/* Step Results */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <h3 className="text-sm font-semibold">五步评估详情</h3>
        </div>
        {stepEntries.map(([key, label]) => (
          <StepRow key={key} label={label} result={report.steps[key]} />
        ))}
      </div>

      {/* Action Items */}
      {report.actionItems.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-semibold">可操作建议</h3>
          </div>
          <div className="divide-y">
            {report.actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <span className={cn('shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5', PRIORITY_CONFIG[item.priority].className)}>
                  {PRIORITY_CONFIG[item.priority].label}
                </span>
                <p className="text-sm text-foreground/90 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
