import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, FileText, BarChart2, Package, Clock, TrendingUp } from 'lucide-react'
import { ModeCard } from './components/ModeCard'
import { VerdictBadge, ScoreBadge } from './components/VerdictBadge'
import { MODE_LABELS } from './types'
import { useAmazonStore } from './store'

const WORKFLOW_LABELS = { chat: '对话', form: '表单' }

export function Amazon() {
  const navigate = useNavigate()
  const sessions = useAmazonStore((s) => s.sessions)
  const trackedProducts = useAmazonStore((s) => s.trackedProducts)
  const recentSessions = sessions.slice(0, 5)

  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.report)
    const passCount = completed.filter((s) => s.report?.verdict === 'pass').length
    const avgScore = completed.length > 0
      ? Math.round(completed.reduce((sum, s) => sum + (s.report?.overallScore ?? 0), 0) / completed.length)
      : 0
    return {
      total: sessions.length,
      passRate: completed.length > 0 ? Math.round((passCount / completed.length) * 100) : 0,
      avgScore,
      tracked: trackedProducts.filter((p) => p.status === 'active').length,
    }
  }, [sessions, trackedProducts])

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">选品助手</h1>
        </div>
        <p className="text-sm text-muted-foreground">基于亚马逊选品方法论，智能评估产品入场可行性</p>
      </div>

      {/* Stats row */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '历史分析', value: stats.total, unit: '次', icon: <FileText className="h-4 w-4" />, color: 'text-blue-600 dark:text-blue-400' },
            { label: '平均评分', value: stats.avgScore, unit: '分', icon: <TrendingUp className="h-4 w-4" />, color: 'text-purple-600 dark:text-purple-400' },
            { label: '建议入场', value: stats.passRate, unit: '%', icon: <BarChart2 className="h-4 w-4" />, color: 'text-green-600 dark:text-green-400' },
            { label: '跟踪中', value: stats.tracked, unit: '个', icon: <Clock className="h-4 w-4" />, color: 'text-orange-600 dark:text-orange-400' },
          ].map(({ label, value, unit, icon, color }) => (
            <div key={label} className="rounded-xl border bg-card p-3.5 space-y-1.5">
              <div className={`flex items-center gap-1.5 text-xs text-muted-foreground`}>
                <span className={color}>{icon}</span>
                {label}
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
                <span className="text-xs text-muted-foreground">{unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mode Cards */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">选择工作模式</h2>
        <div className="grid grid-cols-3 gap-3">
          <ModeCard
            icon={<MessageSquare className="h-5 w-5" />}
            title="对话模式"
            description="用自然语言描述需求，Agent 逐步引导提问并输出分析报告"
            tags={['灵活', '引导式', '适合新手']}
            onClick={() => navigate('/amazon/chat')}
            accent="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          />
          <ModeCard
            icon={<FileText className="h-5 w-5" />}
            title="表单模式"
            description="填写结构化参数，支持批量数据录入，快速生成标准化报告"
            tags={['结构化', '批量处理', '高效']}
            onClick={() => navigate('/amazon/form')}
            accent="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
          />
          <ModeCard
            icon={<BarChart2 className="h-5 w-5" />}
            title="跟踪模式"
            description="添加候选产品到监控池，定期自动重新评估，掌握市场动态"
            tags={['定时', '自动化', '趋势']}
            onClick={() => navigate('/amazon/tracker')}
            accent="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
          />
        </div>
      </section>

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">最近分析</h2>
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => navigate('/amazon/history')}
            >
              查看全部 →
            </button>
          </div>
          <div className="rounded-xl border bg-card divide-y overflow-hidden">
            {recentSessions.map((session) => (
              <button
                key={session.id}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                onClick={() => navigate(`/amazon/history?session=${session.id}`)}
              >
                {/* Status indicator */}
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  session.report?.verdict === 'pass' ? 'bg-green-500' :
                  session.report?.verdict === 'watch' ? 'bg-yellow-500' :
                  session.report?.verdict === 'reject' ? 'bg-red-500' :
                  'bg-muted-foreground'
                }`} />

                {/* Product info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{session.productName}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {MODE_LABELS[session.mode]}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {WORKFLOW_LABELS[session.workflowType]}
                    </span>
                  </div>
                </div>

                {/* Score + verdict + time */}
                <div className="flex items-center gap-3 shrink-0">
                  {session.report && (
                    <>
                      <ScoreBadge score={session.report.overallScore} />
                      <VerdictBadge verdict={session.report.verdict} />
                    </>
                  )}
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {Math.round((Date.now() - session.createdAt) / 86400000)} 天前
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
