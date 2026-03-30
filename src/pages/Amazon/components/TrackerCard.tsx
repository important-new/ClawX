import { useState } from 'react'
import { Bell, BellOff, Pause, Play, Trash2, TrendingUp, TrendingDown, Minus, Clock, RefreshCw, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { VerdictBadge, ScoreBadge } from './VerdictBadge'
import { MODE_LABELS } from '../types'
import type { TrackedProduct } from '../types'

const INTERVAL_OPTIONS = [
  { label: '每3天', value: 3 },
  { label: '每周', value: 7 },
  { label: '每2周', value: 14 },
  { label: '每月', value: 30 },
]

function TrendIcon({ trend }: { trend: TrackedProduct['scoreTrend'] }) {
  if (trend === 'up') return <TrendingUp className="h-4 w-4 text-green-500" />
  if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />
  return <Minus className="h-4 w-4 text-muted-foreground" />
}

interface TrackerCardProps {
  product: TrackedProduct
  onPauseResume: (id: string) => void
  onRemove: (id: string) => void
  onToggleAlert: (id: string) => void
  onUpdateInterval: (id: string, days: number) => void
  onViewReport: (sessionId: string) => void
  onReanalyze: (id: string) => void
  reanalyzing?: boolean
}

export function TrackerCard({
  product, onPauseResume, onRemove, onToggleAlert, onUpdateInterval, onViewReport, onReanalyze, reanalyzing
}: TrackerCardProps) {
  const [showIntervalPicker, setShowIntervalPicker] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const daysUntilNext = Math.max(0, Math.round((product.nextCheckAt - Date.now()) / 86400000))
  const latestChange = product.history[product.history.length - 1]?.changeSummary ?? []
  const allHistory = [...product.history].reverse()

  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 space-y-3 transition-opacity',
      product.status === 'paused' && 'opacity-60'
    )}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[15px] truncate">{product.name}</h3>
            <TrendIcon trend={product.scoreTrend} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{MODE_LABELS[product.mode]}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleAlert(product.id)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={product.alertOnChange ? '关闭变化提醒' : '开启变化提醒'}
          >
            {product.alertOnChange ? <Bell className="h-3.5 w-3.5 text-primary" /> : <BellOff className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => onPauseResume(product.id)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={product.status === 'active' ? '暂停跟踪' : '恢复跟踪'}
          >
            {product.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => onRemove(product.id)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
            title="移除跟踪"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Score + Verdict row */}
      <div className="flex items-center gap-3">
        <ScoreBadge score={product.currentScore} />
        <VerdictBadge verdict={product.currentVerdict} />
        {product.scoreTrend === 'down' && product.alertOnChange && (
          <span className="text-[11px] text-yellow-600 dark:text-yellow-400 font-medium">⚠ 评分下降，建议复查</span>
        )}
      </div>

      {/* Changes */}
      {latestChange.length > 0 && (
        <div className="space-y-0.5">
          {latestChange.map((c, i) => (
            <p key={i} className="text-[12px] text-muted-foreground">▸ {c}</p>
          ))}
        </div>
      )}

      {/* Schedule + actions */}
      <div className="flex items-center justify-between pt-1 border-t">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {product.status === 'active'
            ? <span>{daysUntilNext === 0 ? '今天更新' : `${daysUntilNext} 天后更新`}</span>
            : <span>已暂停</span>
          }
          <span className="opacity-50">·</span>
          <button
            className="hover:text-foreground underline underline-offset-2 transition-colors"
            onClick={() => setShowIntervalPicker(!showIntervalPicker)}
          >
            每 {product.intervalDays} 天
          </button>
        </div>
        <div className="flex items-center gap-1">
          {product.history.length > 1 && (
            <Button
              variant="ghost" size="sm"
              className="h-6 text-[11px] px-2 gap-1"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="h-3 w-3" />
              {product.history.length} 次
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => onViewReport(product.sessionId)}>
            报告
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-6 text-[11px] px-2 gap-1 text-primary hover:text-primary"
            onClick={() => onReanalyze(product.id)}
            disabled={reanalyzing || product.status === 'paused'}
          >
            <RefreshCw className={cn('h-3 w-3', reanalyzing && 'animate-spin')} />
            {reanalyzing ? '评估中...' : '重评'}
          </Button>
        </div>
      </div>

      {/* History timeline */}
      {showHistory && (
        <div className="space-y-2 pt-1 border-t">
          <p className="text-[11px] font-semibold text-muted-foreground">评估历史</p>
          {allHistory.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <div className={cn('mt-0.5 w-1.5 h-1.5 rounded-full shrink-0',
                entry.verdict === 'pass' ? 'bg-green-500' :
                entry.verdict === 'watch' ? 'bg-yellow-500' : 'bg-red-500'
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{entry.score}分</span>
                  <span className="text-muted-foreground">{new Date(entry.checkedAt).toLocaleDateString('zh-CN')}</span>
                </div>
                {entry.changeSummary.length > 0 && (
                  <p className="text-muted-foreground truncate">{entry.changeSummary.join('，')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Interval picker */}
      {showIntervalPicker && (
        <div className="flex gap-1.5 flex-wrap pt-1">
          {INTERVAL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onUpdateInterval(product.id, opt.value); setShowIntervalPicker(false) }}
              className={cn(
                'text-[11px] px-2 py-1 rounded-md border transition-colors',
                product.intervalDays === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted hover:bg-muted/80 border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
