import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clock, FileSpreadsheet, FileText, GitCompare, Search, Trash2 } from 'lucide-react'
import { AmazonBreadcrumbs } from './components/AmazonBreadcrumbs'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { VerdictBadge, ScoreBadge } from './components/VerdictBadge'
import { ReportView } from './components/ReportView'
import { CompareTable } from './components/CompareTable'
import { MODE_LABELS, STEP_LABELS, VERDICT_LABELS } from './types'
import { useAmazonStore } from './store'
import { invokeIpc } from '@/lib/api-client'
import type { Verdict, SelectionMode, AnalysisSession } from './types'

function generateReportText(session: AnalysisSession): string {
  const report = session.report
  if (!report) return `${session.productName} — 无报告数据`
  const confidenceLabels = { high: '高', medium: '中', low: '低' }
  const lines = [
    `# 选品分析报告 — ${session.productName}`,
    `模式：${MODE_LABELS[session.mode]}  站点：${session.market}  日期：${new Date(session.createdAt).toLocaleDateString('zh-CN')}`,
    `综合评分：${report.overallScore}  结论：${VERDICT_LABELS[report.verdict]}  置信度：${confidenceLabels[report.confidenceLevel]}`,
    '',
    '## 五步评估',
  ]
  for (const [key, label] of Object.entries(STEP_LABELS) as [keyof typeof STEP_LABELS, string][]) {
    const step = report.steps[key]
    lines.push(`\n### ${label}（${step.score > 0 ? step.score + ' 分' : '跳过'}）`)
    for (const [metric, v] of Object.entries(step.metrics)) {
      lines.push(`- ${metric}: ${v.value}（${v.threshold}）${v.pass ? '✓' : '✗'}`)
    }
    for (const note of step.notes) lines.push(`  > ${note}`)
  }
  if (report.actionItems.length > 0) {
    lines.push('\n## 可操作建议')
    const pMap = { high: '高', medium: '中', low: '低' }
    for (const item of report.actionItems) {
      lines.push(`- [${pMap[item.priority]}] ${item.text}`)
    }
  }
  return lines.join('\n')
}

const VERDICT_FILTER: Array<{ value: 'all' | Verdict; label: string }> = [
  { value: 'all', label: '全部结论' },
  { value: 'pass', label: '建议入场' },
  { value: 'watch', label: '待观察' },
  { value: 'reject', label: '排除' },
]

export function History() {
  const [searchParams] = useSearchParams()
  const sessions = useAmazonStore((s) => s.sessions)
  const removeSession = useAmazonStore((s) => s.removeSession)

  const initialId = searchParams.get('session')
  const [selectedId, setSelectedId] = useState<string | null>(initialId)
  const [compareMode, setCompareMode] = useState(false)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [verdictFilter, setVerdictFilter] = useState<'all' | Verdict>('all')
  const [modeFilter, setModeFilter] = useState<'all' | SelectionMode>('all')

  const selected = sessions.find((s) => s.id === selectedId)
  const compareSessions = sessions.filter((s) => compareIds.includes(s.id))

  const filtered = sessions.filter((s) => {
    if (search && !s.productName.toLowerCase().includes(search.toLowerCase()) && !s.keywords.join(',').toLowerCase().includes(search.toLowerCase())) return false
    if (verdictFilter !== 'all' && s.report?.verdict !== verdictFilter) return false
    if (modeFilter !== 'all' && s.mode !== modeFilter) return false
    return true
  })

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev
    )
  }


  const handleExportCsv = async () => {
    const rows = filtered.filter((s) => s.report)
    if (rows.length === 0) { toast.error('没有可导出的记录'); return }
    const header = ['产品名称', '分析模式', '站点', '综合评分', '结论', '置信度', '初选得分', '竞争分析得分', '盈利核算得分', '合规排查得分', '创建时间']
    const confidenceLabels: Record<string, string> = { high: '高', medium: '中', low: '低' }
    const csvLines = [header.join(',')]
    for (const s of rows) {
      const r = s.report!
      csvLines.push([
        `"${s.productName.replace(/"/g, '""')}"`,
        MODE_LABELS[s.mode],
        s.market,
        r.overallScore,
        VERDICT_LABELS[r.verdict],
        confidenceLabels[r.confidenceLevel] ?? r.confidenceLevel,
        r.steps.initial.score,
        r.steps.competition.score,
        r.steps.profit.score,
        r.steps.compliance.score,
        new Date(s.createdAt).toLocaleDateString('zh-CN'),
      ].join(','))
    }
    const csvContent = csvLines.join('\n')
    const defaultName = `amazon-analysis-${new Date().toISOString().slice(0, 10)}.csv`
    const result = await invokeIpc<{ success: boolean; canceled?: boolean; error?: string }>('amazon:exportCsv', csvContent, defaultName)
    if (result?.success) toast.success('CSV 已导出')
    else if (!result?.canceled) toast.error(result?.error ?? '导出失败')
  }

  const handleExportPdf = async () => {
    if (!selected?.report) { toast.error('请先选择一条记录'); return }
    const defaultName = `${selected.productName}-report-${new Date().toISOString().slice(0, 10)}.pdf`
    const result = await invokeIpc<{ success: boolean; canceled?: boolean; error?: string }>('amazon:exportPdf', defaultName)
    if (result?.success) toast.success('PDF 已导出')
    else if (!result?.canceled) toast.error(result?.error ?? '导出失败')
  }

  const handleExportOne = async (session: AnalysisSession) => {
    try {
      await navigator.clipboard.writeText(generateReportText(session))
      toast.success('报告已复制到剪贴板')
    } catch {
      toast.error('复制失败，请重试')
    }
  }

  const handleDeleteSession = (id: string) => {
    removeSession(id)
    if (selectedId === id) setSelectedId(null)
    setSessionToDelete(null)
    toast.success('记录已删除')
  }

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto w-full">
      <AmazonBreadcrumbs currentMode="历史记录" />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">历史报告</h1>
            <p className="text-[11px] text-muted-foreground">共 {sessions.length} 条分析记录</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={compareMode ? 'default' : 'outline'}
            size="sm"
            className="gap-2 rounded-xl"
            onClick={() => { setCompareMode(!compareMode); setCompareIds([]) }}
          >
            <GitCompare className="h-4 w-4" />
            {compareMode ? `对比中 (${compareIds.length})` : '对比模式'}
          </Button>
          <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={handleExportCsv} title="导出 CSV">
            <FileSpreadsheet className="h-4 w-4" /> 导出 CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={handleExportPdf} title="将选中报告导出为 PDF">
            <FileText className="h-4 w-4" /> 导出 PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索产品名称或关键词"
            className="pl-8 h-8 text-xs w-44"
          />
        </div>

        <div className="flex gap-1">
          {VERDICT_FILTER.map(({ value, label }) => (
            <button key={value} onClick={() => setVerdictFilter(value)} className={cn(
              'text-xs px-2.5 py-1 rounded-md border transition-colors',
              verdictFilter === value ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted text-muted-foreground'
            )}>{label}</button>
          ))}
        </div>

        <div className="flex gap-1">
          {([['all', '全部模式'], ...Object.entries(MODE_LABELS)] as [string, string][]).map(([value, label]) => (
            <button key={value} onClick={() => setModeFilter(value as 'all' | SelectionMode)} className={cn(
              'text-xs px-2.5 py-1 rounded-md border transition-colors',
              modeFilter === value ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted text-muted-foreground'
            )}>{label}</button>
          ))}
        </div>
      </div>

      {/* Compare instructions */}
      {compareMode && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary">
          点击列表中的记录添加到对比（最多 4 条）{compareIds.length > 0 && `，已选 ${compareIds.length} 条`}
        </div>
      )}

      {/* Compare table */}
      {compareMode && compareIds.length >= 2 && (
        <CompareTable sessions={compareSessions} onRemove={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))} />
      )}

      {/* Main layout */}
      <div className={cn('flex gap-4', selected && !compareMode ? 'items-start' : '')}>
        {/* Session list */}
        <div className={cn('rounded-xl border bg-card overflow-hidden', selected && !compareMode ? 'w-72 shrink-0' : 'flex-1')}>
          <div className="divide-y">
            {filtered.map((session) => {
              const isSelected = selectedId === session.id
              const inCompare = compareIds.includes(session.id)
              return (
                <div key={session.id} className="group relative">
                  <button
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors pr-8',
                      isSelected && !compareMode ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-muted/40',
                      inCompare && compareMode ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''
                    )}
                    onClick={() => {
                      if (compareMode) { toggleCompare(session.id) }
                      else { setSelectedId(isSelected ? null : session.id) }
                    }}
                  >
                    {compareMode && (
                      <div className={cn('w-4 h-4 rounded border shrink-0 flex items-center justify-center',
                        inCompare ? 'bg-primary border-primary' : 'border-border'
                      )}>
                        {inCompare && <span className="text-[10px] text-primary-foreground font-bold">{compareIds.indexOf(session.id) + 1}</span>}
                      </div>
                    )}
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      session.report?.verdict === 'pass' ? 'bg-green-500' :
                      session.report?.verdict === 'watch' ? 'bg-yellow-500' :
                      session.report?.verdict === 'reject' ? 'bg-red-500' : 'bg-muted'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{session.productName}</p>
                      <p className="text-[11px] text-muted-foreground">{MODE_LABELS[session.mode]} · {new Date(session.createdAt).toLocaleDateString('zh-CN')}</p>
                    </div>
                    {session.report && (
                      <div className="flex items-center gap-2 shrink-0">
                        <ScoreBadge score={session.report.overallScore} />
                        <VerdictBadge verdict={session.report.verdict} />
                      </div>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSessionToDelete(session.id) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    aria-label="删除记录"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">无匹配记录</div>
            )}
          </div>
        </div>

        {/* Report detail */}
        {selected && !compareMode && selected.report && (
          <div className="flex-1 min-w-0">
            <ReportView session={selected} report={selected.report} onExport={() => handleExportOne(selected)} />
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {sessionToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSessionToDelete(null)}>
          <div className="bg-card border rounded-xl p-6 max-w-sm mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-2">删除分析记录</h3>
            <p className="text-sm text-muted-foreground mb-4">
              确定删除「{sessions.find((s) => s.id === sessionToDelete)?.productName}」的分析记录？此操作不可撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setSessionToDelete(null)}>取消</Button>
              <Button variant="destructive" size="sm" onClick={() => handleDeleteSession(sessionToDelete)}>删除</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
