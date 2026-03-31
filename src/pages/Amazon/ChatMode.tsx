import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, ChevronDown, Sparkles, Bot, Zap, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { DataPanel } from './components/DataPanel'
import { ReportView } from './components/ReportView'
import { MODE_LABELS } from './types'
import type { SelectionMode, DataInput, AnalysisSession } from './types'
import { useAmazonStore } from './store'
import { useGatewayStore } from '@/stores/gateway'
import { useGatewayChat } from './hooks/useGatewayAI'
import { useInstalledSkills } from './hooks/useInstalledSkills'
import { runAnalysis } from './engine'

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  role: 'user' | 'assistant'
  content: string
  reportSession?: AnalysisSession
}

type AgentStage =
  | 'greeting'          // Waiting for product description
  | 'confirm-mode'      // Confirm mode + market
  | 'collect-data'      // Guide data collection
  | 'confirm-analyze'   // Ready to analyze, waiting for go-ahead
  | 'analyzing'         // Running engine
  | 'done'              // Report ready

interface AgentState {
  stage: AgentStage
  productName: string
  mode: SelectionMode
  market: string
  keywords: string[]
  dataInputs: DataInput[]
  awaitingInput: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODES: SelectionMode[] = ['fba-refined', 'fba-bulk', 'fbm-refined', 'fbm-bulk']

const DEFAULT_INPUTS: DataInput[] = [
  { type: 'search-volume', label: '搜索量/供需比', required: true },
  { type: 'competitor', label: '竞品评论分布', required: true },
  { type: 'logistics', label: '头程物流报价', required: false },
  { type: 'ip-check', label: '知识产权查询', required: false },
]

/** Extract a product name from natural language */
function extractProductName(text: string): string | null {
  const patterns = [
    /帮我(?:分析|评估|看看|做一下)\s*["「『]?([^」』"，。\n]{2,20})["」』]?/,
    /(?:分析|评估|看看)\s*["「『]?([^」』"，。\n]{2,20})["」』]?\s*(?:的|这个)?/,
    /我想(?:做|卖|选)\s*["「『]?([^」』"，。\n]{2,20})["」』]?/,
    /产品[：:是]\s*["「『]?([^」』"，。\n]{2,20})["」』]?/,
    /["「『]([^」』"，。\n]{2,20})["」』]/,
  ]
  for (const p of patterns) {
    const m = p.exec(text)
    if (m?.[1]) return m[1].trim()
  }
  // Fallback: if the message is short (< 30 chars) and looks like a product description
  if (text.length < 30 && text.length > 2) return text.trim()
  return null
}

function extractMode(text: string): SelectionMode | null {
  if (text.includes('fba精铺') || text.includes('FBA精铺') || text.includes('精铺') && text.includes('fba')) return 'fba-refined'
  if (text.includes('fba铺货') || text.includes('FBA铺货') || (text.includes('铺货') && text.includes('fba'))) return 'fba-bulk'
  if (text.includes('fbm精铺') || text.includes('FBM精铺') || text.includes('精铺') && text.includes('fbm')) return 'fbm-refined'
  if (text.includes('fbm铺货') || text.includes('FBM铺货') || (text.includes('铺货') && text.includes('fbm'))) return 'fbm-bulk'
  if (text.includes('精铺') || text.includes('精品') || text.includes('品牌')) return 'fba-refined'
  if (text.includes('铺货') || text.includes('测款')) return 'fba-bulk'
  if (text.includes('fbm') || text.includes('FBM')) return 'fbm-bulk'
  return null
}

function extractMarket(text: string): string | null {
  const markets = ['美国站', '德国站', '英国站', '日本站', '加拿大站', '法国站', '意大利站', '西班牙站']
  return markets.find((m) => text.includes(m)) ?? null
}

function extractKeywords(text: string, productName: string): string[] {
  // Split by commas, spaces; filter out noise
  const raw = text
    .replace(/[，,、]/g, ' ')
    .split(/\s+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 1 && k.length < 40 && !/^[0-9]+$/.test(k))

  const kws = raw.length > 0 ? raw : [productName]
  return [...new Set(kws)].slice(0, 6)
}

function isPositiveAck(text: string): boolean {
  const pos = ['是', '好', '开始', '确认', '可以', '没问题', 'ok', 'yes', '行', '继续', '分析吧', '准备好了']
  const lc = text.toLowerCase()
  return pos.some((p) => lc.includes(p))
}

// ─── Agent response generator ─────────────────────────────────────────────────

function buildAgentResponse(
  _state: AgentState,
  _userText: string,
  newState: AgentState,
): string {
  switch (newState.stage) {
    case 'confirm-mode': {
      const name = newState.productName
      const mode = MODE_LABELS[newState.mode]
      return `好的，我来帮你评估 **${name}** 的市场可行性。

我理解你想采用 **${mode}** 模式，目标站点为 **${newState.market}**。

关键词我初步提取为：${newState.keywords.map((k) => `\`${k}\``).join('、')}

这些信息准确吗？如果需要调整模式或关键词，请告诉我；如果没问题，回复"确认"后我会引导你完成数据录入。`
    }

    case 'collect-data': {
      const loaded = newState.dataInputs.filter((d) => d.source).length
      const total = newState.dataInputs.length
      const missing = newState.dataInputs.filter((d) => d.required && !d.source)

      if (loaded === 0) {
        return `信息已确认！接下来进入数据录入阶段。

五步评估模型需要以下数据：

**必填（影响置信度）**
- 搜索量/供需比 — 推荐通过卖家精灵、Jungle Scout 或 Helium 10 导出
- 竞品评论分布 — 重点：CR10 占比、头部评论中位数、新品占比

**可选（提升精度）**
- 头程物流报价（用于精确盈利核算）
- 知识产权查询结果（排查侵权风险）

请在左侧数据面板中依次点击**"粘贴"**加载数据。数据加载完成后告诉我，我会立即开始分析。`
      }

      if (missing.length === 0) {
        return `已加载 ${loaded}/${total} 项数据，必填项已全部准备好！

如需加载可选数据（物流报价、IP 查询），可以继续补充；否则回复**"开始分析"**，我马上生成评估报告。`
      }

      return `已加载 ${loaded}/${total} 项数据。还缺少以下必填数据：

${missing.map((d) => `- **${d.label}**`).join('\n')}

请通过左侧数据面板补充，或者回复**"跳过，直接分析"**以低置信度模式继续。`
    }

    case 'confirm-analyze': {
      const loaded = newState.dataInputs.filter((d) => d.source).length
      return `好的！当前已加载 **${loaded}** 项数据。

即将对 **${newState.productName}**（${MODE_LABELS[newState.mode]}）执行五步评估：
1. 初选筛选
2. 竞争格局分析
3. 全链路盈利核算
4. 合规与风险排查
5. 报告生成

回复**"开始"**或**"确认"**启动分析。`
    }

    case 'analyzing':
      return `正在运行五步评估模型，请稍候...`

    case 'done':
      return `分析完成！报告已生成，详见下方。

如需进一步了解某个步骤的细节，或想对比不同模式的评估结果，请继续提问。`

    default:
      return `我没有理解你的意思，请描述你想评估的产品或品类，例如："帮我分析便携挂烫机的 FBA 精铺可行性"`
  }
}

// ─── State machine transition ─────────────────────────────────────────────────

function transition(state: AgentState, userText: string): AgentState {
  const lc = userText.toLowerCase()

  switch (state.stage) {
    case 'greeting': {
      const name = extractProductName(userText) ?? userText.trim()
      const mode = extractMode(userText) ?? state.mode
      const market = extractMarket(userText) ?? state.market
      const keywords = extractKeywords(userText, name)
      return { ...state, stage: 'confirm-mode', productName: name, mode, market, keywords }
    }

    case 'confirm-mode': {
      if (isPositiveAck(userText)) {
        return { ...state, stage: 'collect-data', awaitingInput: true }
      }
      // Allow mode change
      const newMode = extractMode(userText)
      const newMarket = extractMarket(userText)
      const newName = extractProductName(userText)
      return {
        ...state,
        mode: newMode ?? state.mode,
        market: newMarket ?? state.market,
        productName: newName ?? state.productName,
        // Stay in confirm-mode to re-confirm
        stage: 'confirm-mode',
      }
    }

    case 'collect-data': {
      const wantsSkip = lc.includes('跳过') || lc.includes('直接分析') || lc.includes('不需要')
      const wantsAnalyze = lc.includes('开始分析') || lc.includes('可以分析') || isPositiveAck(userText)
      const allRequired = state.dataInputs.filter((d) => d.required).every((d) => d.source)

      if (wantsSkip || (wantsAnalyze && !allRequired)) {
        return { ...state, stage: 'confirm-analyze' }
      }
      if (wantsAnalyze && allRequired) {
        return { ...state, stage: 'analyzing' }
      }
      // Any other message: stay, check data status again
      return { ...state }
    }

    case 'confirm-analyze': {
      if (isPositiveAck(userText) || lc.includes('开始')) {
        return { ...state, stage: 'analyzing' }
      }
      return { ...state }
    }

    case 'analyzing':
    case 'done':
      return { ...state }
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `你是一位专业的亚马逊跨境电商选品顾问，专注于帮助卖家评估产品的市场可行性。你熟悉以下四种运营模式及其差异：
- FBA 精铺：高利润、品牌壁垒、严格质量标准，适合长期运营
- FBA 铺货：快速测款、广撒网、低试错成本，追求规模效益
- FBM 精铺：高客单价、定制化细分市场，无需 FBA 仓储费
- FBM 铺货：零库存、差价套利、低门槛入场

你的评估框架分五步：
1. **初选筛选** — 搜索量、供需比、市场容量是否达标
2. **竞争格局分析** — CR10 评论分布、头部竞品护城河、新品切入空间
3. **全链路盈利核算** — FBA/FBM 费用、毛利率、ROI、资金回转周期
4. **合规与风险排查** — 专利侵权、产品认证要求、平台政策限制
5. **试销方案建议** — 首批备货量、推广节奏、亏损止损线

回答要求：
- 使用中文，保持专业且易懂的语气
- 数据充足时给出量化建议（如"毛利率低于 35% 建议放弃"）
- 数据不足时主动引导用户补充关键信息
- 避免模糊表述，尽量给出可操作的具体建议`

const WELCOME = `你好！我是亚马逊选品助手。

请告诉我你想评估的产品或品类，例如：
- "帮我分析便携式挂烫机的 FBA 精铺可行性"
- "我想做折叠收纳盒铺货，评估一下竞争情况"

我会通过五步评估模型逐步引导你完成分析。`

export function ChatMode() {
  const navigate = useNavigate()
  const { addSession, addTracked, trackedProducts } = useAmazonStore()
  const gatewayRunning = useGatewayStore((s) => s.status.state === 'running')

  // ── Local state machine mode ──────────────────────────────────────────────
  const [agentState, setAgentState] = useState<AgentState>({
    stage: 'greeting',
    productName: '',
    mode: 'fba-bulk',
    market: '美国站',
    keywords: [],
    dataInputs: DEFAULT_INPUTS,
    awaitingInput: false,
  })
  const [panelCollapsed, setPanelCollapsed] = useState(true)
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: WELCOME }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── AI mode (gateway-powered) ─────────────────────────────────────────────
  const [aiMode, setAiMode] = useState(false)
  const gatewayChat = useGatewayChat({ systemPrompt: AI_SYSTEM_PROMPT })
  const { skills } = useInstalledSkills()
  const [showSkillPicker, setShowSkillPicker] = useState(false)
  // Mini-form for report generation in AI mode
  const [showReportForm, setShowReportForm] = useState(false)
  const [aiReportName, setAiReportName] = useState('')
  const [aiReportMode, setAiReportMode] = useState<SelectionMode>('fba-bulk')
  const [aiReportSession, setAiReportSession] = useState<AnalysisSession | null>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, gatewayChat.messages])

  // Keep agent mode in sync with panel
  const mode = agentState.mode

  const handleAddData = useCallback((type: DataInput['type']) => {
    setAgentState((prev) => ({
      ...prev,
      dataInputs: prev.dataInputs.map((d) =>
        d.type === type ? { ...d, source: 'manual' as const, loadedAt: Date.now(), content: '' } : d
      ),
    }))
  }, [])

  const handleAddToTracker = useCallback((session: AnalysisSession) => {
    if (!session.report) return
    const alreadyTracked = trackedProducts.some((p) => p.sessionId === session.id)
    if (!alreadyTracked) {
      addTracked({
        id: `t-${Date.now()}`,
        sessionId: session.id,
        name: session.productName,
        mode: session.mode,
        intervalDays: 14,
        lastCheckedAt: Date.now(),
        nextCheckAt: Date.now() + 14 * 86400000,
        alertOnChange: true,
        status: 'active',
        currentScore: session.report.overallScore,
        currentVerdict: session.report.verdict,
        scoreTrend: 'stable',
        history: [{
          checkedAt: Date.now(),
          score: session.report.overallScore,
          verdict: session.report.verdict,
          sessionId: session.id,
          changeSummary: ['首次评估'],
        }],
      })
      toast.success(`"${session.productName}" 已添加到跟踪看板`)
    }
    navigate('/amazon/tracker')
  }, [addTracked, trackedProducts, navigate])

  const handleFetchData = useCallback((type: DataInput['type']) => {
    setAgentState((prev) => ({
      ...prev,
      dataInputs: prev.dataInputs.map((d) =>
        d.type === type ? { ...d, source: 'mcp' as const, loadedAt: Date.now(), content: '' } : d
      ),
    }))
  }, [])

  const handleDataContentChange = useCallback((type: DataInput['type'], content: string) => {
    setAgentState((prev) => ({
      ...prev,
      dataInputs: prev.dataInputs.map((d) => d.type === type ? { ...d, content } : d),
    }))
  }, [])

  const runAnalysisAndReport = async (state: AgentState): Promise<AnalysisSession> => {
    await new Promise((r) => setTimeout(r, 1400))
    const report = runAnalysis({
      mode: state.mode,
      productName: state.productName,
      keywords: state.keywords,
      market: state.market,
      dataInputs: state.dataInputs,
    })
    const session: AnalysisSession = {
      id: `c-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workflowType: 'chat',
      mode: state.mode,
      productName: state.productName,
      keywords: state.keywords,
      market: state.market,
      dataInputs: state.dataInputs,
      status: 'completed',
      report,
    }
    addSession(session)
    return session
  }

  // ── AI mode: generate structured report from AI conversation ─────────────
  const handleAiGenerateReport = async () => {
    if (!aiReportName.trim()) return
    setShowReportForm(false)
    const kws = [aiReportName.trim()]
    const report = runAnalysis({
      mode: aiReportMode,
      productName: aiReportName.trim(),
      keywords: kws,
      market: '美国站',
      dataInputs: agentState.dataInputs,
    })
    const session: AnalysisSession = {
      id: `ai-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workflowType: 'chat',
      mode: aiReportMode,
      productName: aiReportName.trim(),
      keywords: kws,
      market: '美国站',
      dataInputs: agentState.dataInputs,
      status: 'completed',
      report,
    }
    addSession(session)
    setAiReportSession(session)
    toast.success(`"${aiReportName}" 报告已生成`)
  }

  const handleSend = async () => {
    if (!input.trim() || sending || (aiMode && gatewayChat.sending)) return
    const userText = input.trim()
    setInput('')

    // ── AI mode: route to gateway ──────────────────────────────────────────
    if (aiMode) {
      setShowSkillPicker(false)
      await gatewayChat.send(userText)
      return
    }

    setSending(true)

    setMessages((prev) => [...prev, { role: 'user', content: userText }])

    // Transition the agent state
    const nextState = transition(agentState, userText)
    setAgentState(nextState)

    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400))

    if (nextState.stage === 'analyzing') {
      const thinkingMsg = buildAgentResponse(agentState, userText, nextState)
      setMessages((prev) => [...prev, { role: 'assistant', content: thinkingMsg }])
      setSending(false)

      // Run async analysis
      setSending(true)
      await new Promise((r) => setTimeout(r, 400))
      const session = await runAnalysisAndReport(nextState)
      const doneState = { ...nextState, stage: 'done' as AgentStage }
      setAgentState(doneState)
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: buildAgentResponse(nextState, '', doneState),
        reportSession: session,
      }])
      setSending(false)
    } else {
      const reply = buildAgentResponse(agentState, userText, nextState)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background shrink-0">
        <button onClick={() => navigate('/amazon')} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">对话模式</span>
        <div className="h-4 w-px bg-border" />

        {/* Mode selector */}
        <div className="relative">
          <select
            value={mode}
            onChange={(e) => setAgentState((s) => ({ ...s, mode: e.target.value as SelectionMode }))}
            className="text-sm bg-muted/60 border border-border rounded-md pl-2.5 pr-7 py-1 appearance-none cursor-pointer hover:bg-muted transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Skill picker — only shown in AI mode with skills available */}
          {aiMode && skills.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSkillPicker(!showSkillPicker)}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                  showSkillPicker
                    ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                title="选择 Skill 插入到输入框"
              >
                <Zap className="h-3 w-3" />
                Skills
                <span className="bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full px-1 text-[10px]">
                  {skills.length}
                </span>
              </button>
              {showSkillPicker && (
                <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border bg-popover shadow-lg py-1">
                  <p className="text-[10px] text-muted-foreground px-3 py-1.5 border-b">选择后将插入调用提示到输入框</p>
                  {skills.map((skill) => (
                    <button
                      key={skill.slug}
                      onClick={() => {
                        const name = agentState.productName || '当前产品'
                        const msg = `请调用 Skill「${skill.name}」，对产品「${name}」进行专项分析。`
                        setInput(msg)
                        setShowSkillPicker(false)
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors"
                    >
                      <Package className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{skill.name}</p>
                        {skill.description && (
                          <p className="text-[10px] text-muted-foreground truncate">{skill.description}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {gatewayRunning && (
            <button
              onClick={() => { setAiMode(!aiMode); if (!aiMode) { gatewayChat.reset(); setShowSkillPicker(false) } }}
              className={cn(
                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                aiMode
                  ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
              title={aiMode ? '切换回引导模式' : '切换到真实 AI 对话模式'}
            >
              {aiMode ? <Sparkles className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
              {aiMode ? 'AI 模式' : '引导模式'}
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            {agentState.dataInputs.filter((d) => d.source).length}/{agentState.dataInputs.length} 项数据
          </span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Data panel */}
        <DataPanel
          inputs={agentState.dataInputs}
          collapsed={panelCollapsed}
          onToggle={() => setPanelCollapsed(!panelCollapsed)}
          onAdd={handleAddData}
          onFetch={handleFetchData}
          onContentChange={handleDataContentChange}
        />

        {/* Chat area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── AI mode messages ── */}
            {aiMode && (
              <>
                {gatewayChat.messages.length === 0 && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed max-w-[80%]">
                      <div className="flex items-center gap-1.5 mb-1 text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">AI 模式已启用</span>
                      </div>
                      你好！我是 ClawX AI 助手。请告诉我你想评估的亚马逊产品，我会帮你分析市场可行性。{'\n\n'}完成对话后，点击"生成报告"可生成结构化的五步评估报告。
                    </div>
                  </div>
                )}
                {gatewayChat.messages.map((msg, i) => (
                  <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {gatewayChat.error && (
                  <div className="flex justify-start">
                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[80%]">
                      ⚠ {gatewayChat.error}
                    </div>
                  </div>
                )}
                {gatewayChat.sending && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {/* AI mode: generated report */}
                {aiReportSession?.report && (
                  <div className="mt-3 bg-card border rounded-2xl p-4">
                    <p className="text-xs text-muted-foreground mb-3">基于对话生成的结构化报告：</p>
                    <ReportView session={aiReportSession} report={aiReportSession.report} onExport={() => {}} />
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate('/amazon/history')}>查看历史</Button>
                      <Button size="sm" onClick={() => handleAddToTracker(aiReportSession)}>
                        {trackedProducts.some((p) => p.sessionId === aiReportSession.id) ? '查看跟踪 →' : '添加到跟踪 →'}
                      </Button>
                    </div>
                  </div>
                )}
                {/* AI mode: report generation form */}
                {showReportForm && (
                  <div className="bg-card border rounded-2xl p-4 space-y-3">
                    <p className="text-sm font-medium">生成结构化报告</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">产品名称</label>
                        <Input
                          value={aiReportName}
                          onChange={(e) => setAiReportName(e.target.value)}
                          placeholder="如：便携挂烫机"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">运营模式</label>
                        <select
                          value={aiReportMode}
                          onChange={(e) => setAiReportMode(e.target.value as SelectionMode)}
                          className="w-full h-8 text-sm bg-background border border-input rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          {MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setShowReportForm(false)}>取消</Button>
                      <Button size="sm" onClick={handleAiGenerateReport} disabled={!aiReportName.trim()}>
                        生成报告
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Local mode messages ── */}
            {!aiMode && messages.map((msg, i) => (
              <div key={i}>
                <div className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  )}>
                    {msg.content}
                  </div>
                </div>

                {/* Embedded report */}
                {msg.reportSession?.report && (
                  <div className="mt-3 bg-card border rounded-2xl p-4">
                    <p className="text-xs text-muted-foreground mb-3">分析报告已生成：</p>
                    <ReportView
                      session={msg.reportSession}
                      report={msg.reportSession.report}
                      onExport={() => {}}
                    />
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate('/amazon/history')}>
                        查看历史
                      </Button>
                      <Button size="sm" onClick={() => msg.reportSession && handleAddToTracker(msg.reportSession)}>
                        {msg.reportSession && trackedProducts.some((p) => p.sessionId === msg.reportSession!.id) ? '查看跟踪 →' : '添加到跟踪 →'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {!aiMode && sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t p-3">
            {aiMode && !showReportForm && !aiReportSession && (
              <div className="mb-2">
                <Button
                  size="sm" variant="outline"
                  className="w-full gap-2 text-primary border-primary/30 hover:bg-primary/5"
                  onClick={() => setShowReportForm(true)}
                  disabled={gatewayChat.messages.length < 2}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  基于此对话生成结构化报告
                </Button>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  aiMode ? '与 AI 自由对话，描述产品或提问...' :
                  agentState.stage === 'greeting' ? '描述你想评估的产品...' :
                  agentState.stage === 'collect-data' ? '数据加载后告诉我（或"直接分析"）...' :
                  '回复消息...'
                }
                className="min-h-[44px] max-h-32 resize-none text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              />
              <Button
                size="icon" className="shrink-0 h-11 w-11"
                onClick={handleSend}
                disabled={!input.trim() || sending || (aiMode && gatewayChat.sending)}
              >
                {aiMode ? <Sparkles className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 px-1">Enter 发送，Shift+Enter 换行</p>
          </div>
        </div>
      </div>
    </div>
  )
}
