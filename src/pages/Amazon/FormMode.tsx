import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Plus, Zap, X, ChevronDown, Sparkles, ChevronUp, Loader2, Package } from 'lucide-react'
import { AmazonBreadcrumbs } from './components/AmazonBreadcrumbs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ReportView } from './components/ReportView'
import { SkillInvoker } from './components/SkillInvoker'
import { MODE_LABELS } from './types'
import { useAmazonStore } from './store'
import { useGatewayStore } from '@/stores/gateway'
import { useGatewayRequest } from './hooks/useGatewayAI'
import { useInstalledSkills } from './hooks/useInstalledSkills'
import { useMcpDataFetch } from './hooks/useMcpDataFetch'
import { useAIEnrichedAnalysis } from './hooks/useAIEnrichedAnalysis'
import { runAnalysis } from './engine'
import type { SelectionMode, DataInput, AnalysisSession } from './types'

type Step = 1 | 2 | 3

const MODES: { value: SelectionMode; desc: string }[] = [
  { value: 'fba-refined', desc: '长期爆款 · 品牌壁垒 · 高利润' },
  { value: 'fba-bulk', desc: '快速测款 · 广撒网 · 低试错成本' },
  { value: 'fbm-refined', desc: '高客单价 · 低竞争 · 定制化细分' },
  { value: 'fbm-bulk', desc: '零库存 · 低门槛 · 差价套利' },
]

const MARKETS = ['美国站', '德国站', '英国站', '日本站', '加拿大站']

const DATA_TYPES: Array<{ type: DataInput['type']; label: string; required: boolean; hint: string; placeholder: string }> = [
  {
    type: 'search-volume', label: '搜索量 / 供需比', required: true,
    hint: '卖家精灵 / JS / H10 导出',
    placeholder: '粘贴数据，例如：\n月搜索量: 45,000\n供需比: 120\n年增长率: +18%',
  },
  {
    type: 'competitor', label: '竞品评论分布', required: true,
    hint: 'CR10、头部评论数、新品占比',
    placeholder: '粘贴数据，例如：\nCR10: 48%\n头部评论中位数: 380条\n新品占比: 22%',
  },
  {
    type: 'logistics', label: '头程物流报价', required: false,
    hint: '用于精确核算盈利模型',
    placeholder: '粘贴数据，例如：\n头程运费: $2.5/kg\n毛利率: 38%\n客单价: $35',
  },
  {
    type: 'ip-check', label: '知识产权查询结果', required: false,
    hint: '商标/专利查询报告',
    placeholder: '粘贴查询结论，例如：\n商标查询：无冲突\n专利排查：无相关专利\n侵权风险：低',
  },
]

function StepIndicator({ current }: { current: Step }) {
  const steps = ['基础配置', '数据录入', '分析报告']
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const step = (i + 1) as Step
        const active = current === step
        const done = current > step
        return (
          <div key={step} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                done ? 'bg-primary text-primary-foreground' :
                active ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'
              )}>
                {done ? <Check className="h-3.5 w-3.5" /> : step}
              </div>
              <span className={cn('text-sm', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
            </div>
            {i < 2 && <div className="w-8 h-px bg-border mx-3" />}
          </div>
        )
      })}
    </div>
  )
}

interface DataItemProps {
  dt: typeof DATA_TYPES[0]
  input: DataInput
  onMarkLoaded: (type: DataInput['type'], source: 'manual' | 'mcp', content?: string) => void
  onRemove: (type: DataInput['type']) => void
  onContentChange: (type: DataInput['type'], content: string) => void
  onFetchMcp?: () => void
  fetchingMcp?: boolean
  fetchError?: string
  gatewayAvailable?: boolean
}

function DataItem({ dt, input, onMarkLoaded, onRemove, onContentChange, onFetchMcp, fetchingMcp, fetchError, gatewayAvailable }: DataItemProps) {
  const [expanded, setExpanded] = useState(false)
  const isLoaded = !!input.source

  return (
    <div className={cn(
      'rounded-xl border transition-colors',
      isLoaded ? 'bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-800' :
      dt.required ? 'bg-yellow-50/50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800' :
      'bg-card border-border'
    )}>
      <div className="flex items-center justify-between p-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{dt.label}</span>
            {dt.required
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 font-medium">必填</span>
              : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">可选</span>
            }
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">{dt.hint}</p>
        </div>

        {isLoaded ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {input.source === 'mcp' ? 'MCP 已抓取' : '已粘贴'} ✓
              <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
            </button>
            <button onClick={() => onRemove(dt.type)} className="p-1 rounded hover:bg-muted text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => { onMarkLoaded(dt.type, 'manual'); setExpanded(true) }}
            >
              <Plus className="h-3 w-3" /> 粘贴数据
            </Button>
            {gatewayAvailable && (
              <Button
                variant="outline" size="sm"
                className="gap-1.5 h-7 text-xs text-primary hover:text-primary"
                onClick={onFetchMcp}
                disabled={fetchingMcp}
              >
                {fetchingMcp
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> 抓取中</>
                  : <><Zap className="h-3 w-3" /> MCP 抓取</>
                }
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Expandable content area */}
      {(isLoaded || expanded) && input.source !== 'mcp' && (
        <div className="px-3.5 pb-3.5">
          <Textarea
            value={input.content ?? ''}
            onChange={(e) => onContentChange(dt.type, e.target.value)}
            placeholder={dt.placeholder}
            className="min-h-[80px] text-xs font-mono resize-none bg-background/70"
          />
          {input.content && (
            <p className="text-[11px] text-green-600 dark:text-green-400 mt-1">
              ✓ 数据已录入，引擎将解析其中的数值指标
            </p>
          )}
        </div>
      )}

      {isLoaded && input.source === 'mcp' && expanded && input.content && (
        <div className="px-3.5 pb-3">
          <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap bg-muted/40 rounded p-2">
            {input.content}
          </pre>
        </div>
      )}

      {fetchError && (
        <div className="px-3.5 pb-2 text-[11px] text-red-500">⚠ {fetchError}</div>
      )}
    </div>
  )
}

export function FormMode() {
  const navigate = useNavigate()
  const { addSession, updateSession, addTracked, trackedProducts } = useAmazonStore()
  const gatewayRunning = useGatewayStore((s) => s.status.state === 'running')
  const aiRequest = useGatewayRequest()
  const skillRequest = useGatewayRequest()
  const { skills } = useInstalledSkills()
  const { fetchData, fetching: mcpFetching, errors: mcpErrors } = useMcpDataFetch()
  const { enrich: enrichWithAI, enriching: aiEnriching } = useAIEnrichedAnalysis()
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [showAiInsight, setShowAiInsight] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [mode, setMode] = useState<SelectionMode>('fba-bulk')
  const [productName, setProductName] = useState('')
  const [keywords, setKeywords] = useState('')
  const [market, setMarket] = useState('美国站')
  const [dataInputs, setDataInputs] = useState<DataInput[]>(
    DATA_TYPES.map((d) => ({ type: d.type, label: d.label, required: d.required }))
  )
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [completedSession, setCompletedSession] = useState<AnalysisSession | null>(null)

  const loadedCount = dataInputs.filter((d) => d.source).length
  const missingRequired = dataInputs.filter((d) => d.required && !d.source)

  const handleMarkLoaded = (type: DataInput['type'], source: 'manual' | 'mcp', content?: string) => {
    setDataInputs((prev) => prev.map((d) =>
      d.type === type ? { ...d, source, loadedAt: Date.now(), content: content ?? d.content ?? '' } : d
    ))
  }

  const handleRemoveData = (type: DataInput['type']) => {
    setDataInputs((prev) => prev.map((d) =>
      d.type === type ? { ...d, source: undefined, loadedAt: undefined, content: '' } : d
    ))
  }

  const handleContentChange = (type: DataInput['type'], content: string) => {
    setDataInputs((prev) => prev.map((d) => d.type === type ? { ...d, content } : d))
  }

  const handleFetchMcp = async (type: DataInput['type']) => {
    const kws = keywords.split(/[,，\s]+/).map((k) => k.trim()).filter(Boolean)
    const content = await fetchData(type, { productName, keywords: kws, market })
    if (content) handleMarkLoaded(type, 'mcp', content)
  }

  const handleStartAnalysis = async () => {
    setAnalyzing(true)
    const steps: [number, string][] = [
      [20, '步骤 1/5：初选筛选...'],
      [40, '步骤 2/5：竞争格局分析...'],
      [60, '步骤 3/5：全链路盈利核算...'],
      [80, '步骤 4/5：合规与风险排查...'],
      [100, '步骤 5/5：生成分析报告...'],
    ]
    for (const [p, label] of steps) {
      await new Promise((r) => setTimeout(r, 700))
      setProgress(p)
      setProgressLabel(label)
    }
    await new Promise((r) => setTimeout(r, 300))

    // Run the local analysis engine
    const kws = keywords.split(/[,，\s]+/).map((k) => k.trim()).filter(Boolean)
    const engineInput = { mode, productName, keywords: kws, market, dataInputs }
    let report = runAnalysis(engineInput)

    // Show step 3 immediately with local results
    const sessionId = `f-${Date.now()}`
    const baseSession: AnalysisSession = {
      id: sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workflowType: 'form',
      mode,
      productName,
      keywords: kws,
      market,
      dataInputs,
      status: 'completed',
      report,
    }
    addSession(baseSession)
    setCompletedSession(baseSession)
    setStep(3)
    setAnalyzing(false)

    // If gateway is running and any data was loaded, enrich with AI in background
    if (gatewayRunning && dataInputs.some((d) => d.source)) {
      const enriched = await enrichWithAI(report, engineInput)
      if (enriched.aiEnriched) {
        const enrichedSession = { ...baseSession, report: enriched, updatedAt: Date.now() }
        updateSession(sessionId, { report: enriched, updatedAt: Date.now() })
        setCompletedSession(enrichedSession)
      }
    }
  }

  const isTracked = completedSession
    ? trackedProducts.some((p) => p.sessionId === completedSession.id)
    : false

  const handleAddToTracker = () => {
    if (completedSession?.report && !isTracked) {
      addTracked({
        id: `t-${Date.now()}`,
        sessionId: completedSession.id,
        name: completedSession.productName,
        mode: completedSession.mode,
        intervalDays: 14,
        lastCheckedAt: Date.now(),
        nextCheckAt: Date.now() + 14 * 86400000,
        alertOnChange: true,
        status: 'active',
        currentScore: completedSession.report.overallScore,
        currentVerdict: completedSession.report.verdict,
        scoreTrend: 'stable',
        history: [{
          checkedAt: Date.now(),
          score: completedSession.report.overallScore,
          verdict: completedSession.report.verdict,
          sessionId: completedSession.id,
          changeSummary: ['首次评估'],
        }],
      })
      toast.success(`"${completedSession.productName}" 已添加到跟踪看板`)
    }
    navigate('/amazon/tracker')
  }

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto w-full">
      <AmazonBreadcrumbs currentMode="表单模式" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold">表单分析模式</h1>
          <p className="text-[11px] text-muted-foreground">通过标准化流程引导，完成高质量的一站式选品评估</p>
        </div>
      </div>

      <StepIndicator current={step} />

      {/* Step 1: Config */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <Label className="text-sm font-semibold mb-3 block">选品运营模式</Label>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map(({ value, desc }) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'text-left rounded-xl border p-3.5 transition-all',
                    mode === value
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{MODE_LABELS[value]}</span>
                    {mode === value && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <p className="text-[12px] text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pname" className="text-sm font-medium mb-1.5 block">产品名称</Label>
              <Input id="pname" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="如：折叠收纳盒" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">目标站点</Label>
              <div className="flex flex-wrap gap-1.5">
                {MARKETS.map((m) => (
                  <button key={m} onClick={() => setMarket(m)} className={cn(
                    'text-xs px-2.5 py-1 rounded-lg border transition-colors',
                    market === m ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted text-muted-foreground'
                  )}>{m}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="kw" className="text-sm font-medium mb-1.5 block">目标关键词</Label>
            <Input id="kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="折叠收纳盒, collapsible storage box（逗号分隔）" />
          </div>

          <Button
            className="w-full gap-2"
            onClick={() => setStep(2)}
            disabled={!productName.trim() || !keywords.trim()}
          >
            下一步：数据录入 <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2: Data Input */}
      {step === 2 && !analyzing && (
        <div className="space-y-5">
          <div>
            <h2 className="text-sm font-semibold mb-1">数据录入</h2>
            <p className="text-xs text-muted-foreground">粘贴原始数据后引擎会自动解析关键指标。跳过非必填项会降低报告置信度。</p>
          </div>

          <div className="space-y-2">
            {DATA_TYPES.map((dt) => {
              const input = dataInputs.find((d) => d.type === dt.type)!
              return (
                <DataItem
                  key={dt.type}
                  dt={dt}
                  input={input}
                  onMarkLoaded={handleMarkLoaded}
                  onRemove={handleRemoveData}
                  onContentChange={handleContentChange}
                  onFetchMcp={() => handleFetchMcp(dt.type)}
                  fetchingMcp={mcpFetching.has(dt.type)}
                  fetchError={mcpErrors[dt.type]}
                  gatewayAvailable={gatewayRunning}
                />
              )
            })}
          </div>

          {missingRequired.length > 0 && (
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 px-3 py-2">
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                ⚠ {missingRequired.length} 项必填数据缺失，报告置信度将标记为「低」
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> 上一步
            </Button>
            <Button className="flex-1 gap-2" onClick={handleStartAnalysis}>
              开始分析 <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">已加载 {loadedCount}/{DATA_TYPES.length} 项数据</p>
        </div>
      )}

      {/* Analyzing */}
      {analyzing && (
        <div className="rounded-xl border bg-card p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <p className="font-medium text-sm mb-1">{progressLabel}</p>
            <p className="text-xs text-muted-foreground">五步评估模型运行中...</p>
          </div>
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground tabular-nums">{progress}%</p>
        </div>
      )}

      {/* Step 3: Report */}
      {step === 3 && completedSession?.report && (
        <div className="space-y-4">
          {aiEnriching && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              AI 正在基于真实数据深度分析，完成后将自动更新评分与结论…
            </div>
          )}
          <ReportView session={completedSession} report={completedSession.report} onExport={() => {}} />

          {/* AI 深度解读 */}
          {gatewayRunning && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                onClick={async () => {
                  if (aiInsight) { setShowAiInsight(!showAiInsight); return }
                  const r = completedSession.report!
                  const prompt = `请以专业亚马逊选品顾问角度，对以下评估结果提供2-3条深度洞察（每条不超过50字，用中文）：
产品：${completedSession.productName}，模式：${completedSession.mode}，站点：${completedSession.market}
综合评分：${r.overallScore}，结论：${r.verdict}，置信度：${r.confidenceLevel}
各步得分：初选${r.steps.initial.score}，竞争${r.steps.competition.score}，盈利${r.steps.profit.score}，合规${r.steps.compliance.score}
主要问题：${[...r.steps.initial.notes, ...r.steps.competition.notes, ...r.steps.profit.notes].slice(0, 3).join('；') || '无'}
现有建议：${r.actionItems.map(a => a.text).join('；')}`
                  const result = await aiRequest.request(prompt)
                  if (result) { setAiInsight(result); setShowAiInsight(true) }
                }}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className={`h-4 w-4 ${aiRequest.loading ? 'text-primary animate-pulse' : 'text-primary'}`} />
                  AI 深度解读
                  {aiRequest.loading && <span className="text-xs text-muted-foreground">分析中...</span>}
                </div>
                {aiInsight && (showAiInsight ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />)}
              </button>
              {showAiInsight && aiInsight && (
                <div className="px-4 pb-4 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap border-t bg-primary/5">
                  <div className="pt-3">{aiInsight}</div>
                </div>
              )}
              {aiRequest.error && (
                <div className="px-4 pb-3 text-xs text-red-600 dark:text-red-400 border-t">
                  ⚠ {aiRequest.error}
                </div>
              )}
            </div>
          )}

          {/* Skill 专项分析 */}
          {gatewayRunning && skills.length > 0 && (
            <SkillInvoker
              skills={skills}
              productName={completedSession.productName}
              mode={completedSession.mode}
              market={completedSession.market}
              reportContext={`综合评分：${completedSession.report.overallScore}，结论：${completedSession.report.verdict}，置信度：${completedSession.report.confidenceLevel}`}
              onInvoke={(msg) => skillRequest.request(msg)}
              invoking={skillRequest.loading}
              result={skillRequest.result}
              error={skillRequest.error}
            />
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => {
              setStep(1)
              setAnalyzing(false)
              setProgress(0)
              setCompletedSession(null)
              setAiInsight(null)
              setShowAiInsight(false)
              aiRequest.reset()
              skillRequest.reset()
              setDataInputs(DATA_TYPES.map((d) => ({ type: d.type, label: d.label, required: d.required })))
            }}>
              重新分析
            </Button>
            <Button className="flex-1" onClick={handleAddToTracker}>
              {isTracked ? '查看跟踪 →' : '添加到跟踪 →'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
