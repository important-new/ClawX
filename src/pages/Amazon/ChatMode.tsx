import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, ChevronDown, Sparkles, Bot, Zap, Package, Database, Loader2, X } from 'lucide-react'
import { AmazonBreadcrumbs } from './components/AmazonBreadcrumbs'
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
import { useMcpDataFetch } from './hooks/useMcpDataFetch'
import { useAIEnrichedAnalysis } from './hooks/useAIEnrichedAnalysis'
import { runAnalysis } from './engine'
import { usePipelineSession, formatSummaryForAI } from './hooks/usePipelineSession'

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

/** Detect if user wants to use pipeline/automated workflow */
function detectWorkflowIntent(text: string): boolean {
  const keywords = ['流程', '流水线', '串联', '自动运行', 'pipeline', 'workflow', '步骤', '批量采集', '自动化', '漏斗', '全链路'];
  return keywords.some(k => text.includes(k));
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

请在左侧数据面板中依次点击**"粘贴"**加载数据。数据加载完成后告诉我，我会立即开始分析。

💡 如需自动化批量采集数据，可前往 **Pipeline 向导** 一键执行完整流水线。`
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
1. 初选筛选 — 市场容量与供需比
2. 竞争格局分析 — CR10、头部护城河、新品空间
3. 全链路盈利核算 — FBA/FBM 费用、毛利率、ROI
4. 合规与风险排查 — 专利、认证、平台政策
5. 试销方案建议 — 备货量、推广节奏、止损线

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

const AI_SYSTEM_PROMPT = `你是 ClawX 选品助手内置的亚马逊跨境电商选品顾问 AI。你运行在 ClawX 桌面端，拥有以下能力：

## 你所在的系统
ClawX 选品助手提供一条完整的自动化选品流水线（Pipeline 向导），包含 6 个阶段：
1. **搜索采样** — 在 SellerSprite 上按筛选条件批量采集品类数据（月销量、价格、评分、BSR 等）
2. **卖家验证** — 自动打开每个 ASIN 的卖家页，验证卖家数量、地区、FBA/FBM 比例
3. **店铺分析** — 检查卖家店铺规模、Listing 数量、高销量占比，识别铺货型 vs 精品型店铺
4. **产品详情** — 抓取产品页的评论数、评分、上架时间、变体数量等详细信息
5. **关键词分析** — 查询核心关键词的月搜索量、PPC 竞价、竞品评论数等数据
6. **报告生成** — 汇总漏斗统计、利润核算，生成 Markdown 分析报告

## 筛选参数参考
Pipeline 支持丰富的筛选条件，用户可能会问到：
- 销售指标：月销量（默认 ≥300）、月销售额、BSR 及增长率
- 价格区间：默认 $50–$100
- 评论指标：评论数、月均新增评论、评分（默认 4.5–5）
- 竞品指标：卖家数量（默认 ≤1）、卖家地区（默认中国）、FBA/FBM 筛选
- 利润指标：FBA 费用、毛利率、PPC 竞价上限（默认 ≤$3.0）
- 产品属性：变体数、包裹重量/尺寸、上架时间（默认近半年）

## 四种运营模式
- **FBA 精铺**：高利润、品牌壁垒、严格质量标准，适合长期运营
- **FBA 铺货**：快速测款、广撒网、低试错成本，追求规模效益
- **FBM 精铺**：高客单价、定制化细分市场，无需 FBA 仓储费
- **FBM 铺货**：零库存、差价套利、低门槛入场

## 回答准则
- 使用中文，保持专业且易懂的语气
- 数据充足时给出量化建议（如"毛利率低于 35% 建议放弃"、"PPC ≤ $2.5 才有利润空间"）
- 数据不足时主动引导用户补充关键信息，或建议用户前往 Pipeline 向导执行自动化采集
- 当用户问到具体品类时，帮助推荐合适的筛选参数组合
- 避免模糊表述，尽量给出可操作的具体建议
- 如果用户的需求更适合跑完整流水线，主动建议"前往 Pipeline 向导"一键执行`

const WELCOME = `你好！我是 ClawX 选品助手。

你可以直接告诉我你想评估的产品或品类，例如：
- "帮我分析便携挂烫机在美国站的 FBA 精铺可行性"
- "月销 300+、价格 $50–100 的品类有哪些推荐？"
- "帮我设置关键词分析的筛选参数"

我会引导你完成评估。如果需要批量自动化采集，可以随时前往 **Pipeline 向导**。`

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
  const { fetchData: fetchMcpData, fetching: mcpFetching, errors: mcpErrors } = useMcpDataFetch()
  const { enrich: enrichWithAI } = useAIEnrichedAnalysis()
  const [showSkillPicker, setShowSkillPicker] = useState(false)
  // Mini-form for report generation in AI mode
  const [showReportForm, setShowReportForm] = useState(false)
  const [aiReportName, setAiReportName] = useState('')
  const [aiReportMode, setAiReportMode] = useState<SelectionMode>('fba-bulk')
  const [aiReportSession, setAiReportSession] = useState<AnalysisSession | null>(null)

  // ── Pipeline session loader ────────────────────────────────────────────────
  const pipelineSession = usePipelineSession()
  const [showSessionPicker, setShowSessionPicker] = useState(false)

  useEffect(() => {
    if (showSessionPicker && pipelineSession.sessions.length === 0) pipelineSession.scan()
  }, [showSessionPicker]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadSession = useCallback(async (sessionName: string) => {
    setShowSessionPicker(false)
    await pipelineSession.load(sessionName)
    toast.success(`已加载 Pipeline 会话「${sessionName}」`)

    // Context injection is handled by the useEffect watching pipelineSession.loaded
  }, [aiMode, pipelineSession])

  // ── Pipeline runtime event listeners ──────────────────────────────────────
  // Surface captcha interventions and soft-skipped ASINs (from amazon-side
  // PROGRESS: PAUSED / SKIP_ASIN signals) as inline assistant messages, so the
  // operator sees them in the chat rather than having to watch terminal logs.
  useEffect(() => {
    const ipc = (window as any).electron?.ipcRenderer
    if (!ipc?.on) return

    const skippedAsins: string[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    const flushSkipped = () => {
      if (skippedAsins.length === 0) return
      const list = skippedAsins.splice(0, skippedAsins.length)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ 已跳过 ${list.length} 个 ASIN（数据采集失败但流水线继续）：\n${list
            .map((s) => `- ${s}`)
            .join('\n')}\n\n这些 ASIN 在最终报告中不会出现；如需补爬，参考 \`SELECTION_LOGIC.md\` 中的 recrawl 命令。`,
        },
      ])
    }

    const onIntervention = (data: any) => {
      const kind = data?.type === 'captcha' ? '人机验证' : '中断'
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            `🛑 流水线遇到${kind}，需要你介入：\n\n` +
            `1. 切到 Chrome 完成 SellerSprite / Amazon 弹出的验证（"我不是机器人"或滑块）\n` +
            `2. 完成后点击"恢复"按钮（在 PipelineWizard 页面）\n` +
            `3. 已采集的数据不会丢失，恢复后会继续从断点跑\n\n` +
            `如果反复触发验证码，可以考虑加大 ASIN 间延迟或暂停流水线手动登录 sellersprite.com 后再续。`,
        },
      ])
    }

    const onSkipped = (data: any) => {
      if (!data?.asin) return
      skippedAsins.push(`${data.asin}${data.reason ? ` (${data.reason})` : ''}`)
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = setTimeout(flushSkipped, 1500) // batch within 1.5s window
    }

    const unInt = ipc.on('amazon:workflowIntervention', onIntervention)
    const unSkip = ipc.on('amazon:asinSkipped', onSkipped)
    return () => {
      if (typeof unInt === 'function') unInt()
      if (typeof unSkip === 'function') unSkip()
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushSkipped()
      }
    }
  }, [])

  // When session finishes loading, inject context into AI chat.
  // We extract a structured summary (Top-N + cost-ratio buckets + viability)
  // instead of dumping the raw markdown — for a 30+ product report this drops
  // ~200K tokens of noise to <100 tokens of signal.
  useEffect(() => {
    if (!pipelineSession.loaded || !aiMode) return
    const { name, stats, summary, report } = pipelineSession.loaded
    const statsLines = Object.entries(stats)
      .map(([, v]) => `- ${v.label}: ${v.count} 条`)
      .join('\n')
    const parts: string[] = [`[已加载 Pipeline 会话: ${name}]`]
    if (statsLines) parts.push(`\n漏斗统计:\n${statsLines}`)
    if (summary) {
      parts.push(`\n${formatSummaryForAI(summary)}`)
      parts.push(
        '\n（如需展开某 ASIN 的详细分析、关键词、店铺、Keepa 截图等，请直接提问；'
        + '若需要不可行产品名单或更深层关键词数据，也可以问我。）',
      )
    } else if (report) {
      // Fallback: report exists but couldn't be parsed (legacy format) — send a
      // tiny slice to avoid blowing up the prompt.
      parts.push(`\n报告摘要 (legacy, 前 1000 字):\n${report.slice(0, 1000)}`)
    } else {
      parts.push('\n(无报告文件)')
    }
    gatewayChat.send(`请基于以下 Pipeline 数据进行分析和解答：\n\n${parts.join('')}`)
  }, [pipelineSession.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleFetchData = useCallback(async (type: DataInput['type']) => {
    const state = agentState
    const content = await fetchMcpData(type, {
      productName: state.productName || '未指定',
      keywords: state.keywords.length ? state.keywords : [state.productName || '未指定'],
      market: state.market,
    })
    setAgentState((prev) => ({
      ...prev,
      dataInputs: prev.dataInputs.map((d) =>
        d.type === type
          ? { ...d, source: 'mcp' as const, loadedAt: Date.now(), content: content ?? '' }
          : d
      ),
    }))
  }, [agentState, fetchMcpData])

  const handleDataContentChange = useCallback((type: DataInput['type'], content: string) => {
    setAgentState((prev) => ({
      ...prev,
      dataInputs: prev.dataInputs.map((d) => d.type === type ? { ...d, content } : d),
    }))
  }, [])

  const runAnalysisAndReport = async (state: AgentState): Promise<AnalysisSession> => {
    await new Promise((r) => setTimeout(r, 1400))
    const engineInput = {
      mode: state.mode,
      productName: state.productName,
      keywords: state.keywords,
      market: state.market,
      dataInputs: state.dataInputs,
    }
    let report = runAnalysis(engineInput)

    // Enrich with AI if gateway is running and any data was loaded
    if (gatewayRunning && state.dataInputs.some((d) => d.source)) {
      const enriched = await enrichWithAI(report, engineInput)
      if (enriched.aiEnriched) report = enriched
    }

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

  const handleGoToPipeline = () => {
    toast.success('前往 Pipeline 向导')
    navigate('/amazon/pipeline-wizard')
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
    <div className="flex flex-col h-full">
      <AmazonBreadcrumbs currentMode="对话模式" />

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border rounded-2xl bg-card/50 backdrop-blur-sm shrink-0 mb-4">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">对话会话</span>
        </div>
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
          {/* Pipeline session loader */}
          {aiMode && (
            <div className="relative">
              <button
                onClick={() => { setShowSessionPicker(!showSessionPicker); setShowSkillPicker(false) }}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                  pipelineSession.loaded
                    ? 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                    : showSessionPicker
                    ? 'bg-teal-50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                title="加载 Pipeline 会话数据"
              >
                {pipelineSession.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
                {pipelineSession.loaded ? pipelineSession.loaded.name : 'Pipeline 数据'}
                {pipelineSession.loaded && (
                  <span
                    className="ml-0.5 hover:text-red-500"
                    onClick={(e) => { e.stopPropagation(); pipelineSession.clear(); toast('已卸载 Pipeline 数据') }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
              {showSessionPicker && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border bg-popover shadow-lg py-1">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b">
                    <p className="text-[10px] text-muted-foreground">选择 Pipeline 会话加载数据</p>
                    <button
                      onClick={() => pipelineSession.scan()}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {pipelineSession.scanning ? '扫描中...' : '刷新'}
                    </button>
                  </div>
                  {pipelineSession.sessions.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                      {pipelineSession.scanning ? '扫描中...' : '暂无 Pipeline 会话'}
                    </p>
                  ) : (
                    pipelineSession.sessions.map((s) => (
                      <button
                        key={s.name}
                        onClick={() => handleLoadSession(s.name)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground">{s.date} · {s.productCount} 条产品</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

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
          fetchingTypes={mcpFetching}
          fetchErrors={mcpErrors}
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
                      你好！我是 ClawX 选品 AI 助手，可以帮你分析产品可行性、推荐筛选参数、解读 Pipeline 数据。{'\n\n'}点击上方 **Pipeline 数据** 按钮可加载已爬取的会话，我会基于真实数据为你分析。也可以直接描述需求开始对话。
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
                {/* Workflow suggestion logic */}
                {gatewayChat.messages.length > 0 && !gatewayChat.sending && detectWorkflowIntent(gatewayChat.messages[gatewayChat.messages.length - 1].content) && (
                  <div className="flex justify-start px-4">
                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4 w-full max-w-[80%]">
                      <div className="flex items-center gap-2 mb-2 text-orange-700 dark:text-orange-300">
                        <Zap className="h-4 w-4" />
                        <span className="text-xs font-semibold">检测到自动化需求</span>
                      </div>
                      <p className="text-xs mb-3">Pipeline 向导支持 6 阶段全自动选品流水线：搜索采样 → 卖家验证 → 店铺分析 → 产品详情 → 关键词分析 → 报告生成。</p>
                      <Button
                        size="sm" variant="outline"
                        className="h-8 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100"
                        onClick={handleGoToPipeline}
                      >
                        前往 Pipeline 向导
                      </Button>
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
