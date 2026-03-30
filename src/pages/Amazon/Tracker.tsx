import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, BarChart2, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TrackerCard } from './components/TrackerCard'
import { useAmazonStore } from './store'
import { runAnalysis } from './engine'
import type { AnalysisSession } from './types'

export function Tracker() {
  const navigate = useNavigate()
  const { trackedProducts, sessions, addSession, updateTracked, removeTracked } = useAmazonStore()
  const [reanalyzingIds, setReanalyzingIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all')

  const filtered = trackedProducts.filter((p) => filter === 'all' || p.status === filter)
  const alertCount = trackedProducts.filter((p) => p.status === 'active' && p.scoreTrend === 'down' && p.alertOnChange).length

  const handleReanalyze = async (id: string) => {
    const product = trackedProducts.find((p) => p.id === id)
    if (!product || reanalyzingIds.has(id)) return

    const originalSession = sessions.find((s) => s.id === product.sessionId) ?? sessions[0]
    if (!originalSession) return

    setReanalyzingIds((prev) => new Set([...prev, id]))
    // Simulate async analysis
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 600))

    const round = product.history.length
    const newReport = runAnalysis({
      mode: product.mode,
      productName: product.name,
      keywords: originalSession.keywords,
      market: originalSession.market,
      dataInputs: originalSession.dataInputs,
      round,
    })

    const newSession: AnalysisSession = {
      id: `rc-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workflowType: 'form',
      mode: product.mode,
      productName: product.name,
      keywords: originalSession.keywords,
      market: originalSession.market,
      dataInputs: originalSession.dataInputs,
      status: 'completed',
      report: newReport,
    }
    addSession(newSession)

    // Build change summary by comparing to last entry
    const oldScore = product.currentScore
    const newScore = newReport.overallScore
    const scoreDiff = newScore - oldScore
    const changeSummary: string[] = []
    if (Math.abs(scoreDiff) >= 1) {
      changeSummary.push(`综合评分 ${scoreDiff >= 0 ? '+' : ''}${scoreDiff}`)
    }
    // Compare step scores to last session
    const STEP_NAMES = { initial: '初选', competition: '竞争分析', profit: '盈利核算', compliance: '合规排查' } as const
    const prevSession = sessions.find((s) => s.id === product.history[product.history.length - 1]?.sessionId)
    if (prevSession?.report) {
      for (const [key, label] of Object.entries(STEP_NAMES) as [keyof typeof STEP_NAMES, string][]) {
        const diff = newReport.steps[key].score - prevSession.report.steps[key].score
        if (Math.abs(diff) >= 5) changeSummary.push(`${label} ${diff >= 0 ? '+' : ''}${diff}分`)
      }
    }
    if (changeSummary.length === 0) changeSummary.push('市场状况基本稳定')

    const trend = newScore > oldScore + 2 ? 'up' : newScore < oldScore - 2 ? 'down' : 'stable'

    updateTracked(id, {
      currentScore: newScore,
      currentVerdict: newReport.verdict,
      scoreTrend: trend,
      lastCheckedAt: Date.now(),
      nextCheckAt: Date.now() + product.intervalDays * 86400000,
      sessionId: newSession.id,
      history: [...product.history, {
        checkedAt: Date.now(),
        score: newScore,
        verdict: newReport.verdict,
        sessionId: newSession.id,
        changeSummary,
      }],
    })

    setReanalyzingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    const trendText = trend === 'up' ? '↑上升' : trend === 'down' ? '↓下降' : '→持平'
    toast.success(`"${product.name}" 重新评估完成 · ${newScore}分 ${trendText}`)
  }

  const handlePauseResume = (id: string) => {
    const p = trackedProducts.find((p) => p.id === id)
    if (p) updateTracked(id, { status: p.status === 'active' ? 'paused' : 'active' })
  }

  const handleToggleAlert = (id: string) => {
    const p = trackedProducts.find((p) => p.id === id)
    if (p) updateTracked(id, { alertOnChange: !p.alertOnChange })
  }

  const handleUpdateInterval = (id: string, intervalDays: number) => {
    updateTracked(id, {
      intervalDays,
      nextCheckAt: Date.now() + intervalDays * 86400000,
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/amazon')} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">跟踪看板</h1>
            <p className="text-xs text-muted-foreground">
              {trackedProducts.filter((p) => p.status === 'active').length} 个产品跟踪中
              {alertCount > 0 && <span className="ml-2 text-yellow-600 dark:text-yellow-400">· {alertCount} 个评分下降</span>}
            </p>
          </div>
        </div>
        <Button className="gap-2" size="sm" onClick={() => navigate('/amazon/form')}>
          <Plus className="h-4 w-4" /> 添加产品
        </Button>
      </div>

      {/* Alerts banner */}
      {alertCount > 0 && (
        <div className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3 flex items-center gap-3">
          <Bell className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            <strong>{alertCount}</strong> 个产品评分出现下降，建议及时复查。
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {([['all', '全部'], ['active', '跟踪中'], ['paused', '已暂停']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              filter === val ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            <span className="ml-1.5 tabular-nums opacity-60">
              {val === 'all' ? trackedProducts.length : trackedProducts.filter((p) => p.status === val).length}
            </span>
          </button>
        ))}
      </div>

      {/* Cards grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((product) => (
            <TrackerCard
              key={product.id}
              product={product}
              onPauseResume={handlePauseResume}
              onRemove={removeTracked}
              onToggleAlert={handleToggleAlert}
              onUpdateInterval={handleUpdateInterval}
              onViewReport={(sessionId) => navigate(`/amazon/history?session=${sessionId}`)}
              onReanalyze={handleReanalyze}
              reanalyzing={reanalyzingIds.has(product.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center">
          <BarChart2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">暂无{filter !== 'all' ? (filter === 'active' ? '跟踪中' : '已暂停') : ''}产品</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">完成选品分析后，可将产品添加到跟踪看板</p>
          <Button size="sm" variant="outline" onClick={() => navigate('/amazon/form')}>去做分析</Button>
        </div>
      )}
    </div>
  )
}
