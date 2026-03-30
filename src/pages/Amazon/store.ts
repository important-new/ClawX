import { create } from 'zustand'
import type { AnalysisSession, TrackedProduct } from './types'

// ─── localStorage persistence ─────────────────────────────────────────────────

const STORE_KEY = 'amazon-selection-store'

function loadPersistedState(): { sessions: AnalysisSession[]; trackedProducts: TrackedProduct[] } | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as { sessions: AnalysisSession[]; trackedProducts: TrackedProduct[] }
  } catch {
    return null
  }
}

function persistState(sessions: AnalysisSession[], trackedProducts: TrackedProduct[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ sessions, trackedProducts }))
  } catch {
    // ignore quota errors
  }
}

const now = Date.now()
const day = 86400000

const MOCK_SESSIONS: AnalysisSession[] = [
  {
    id: 's1', createdAt: now - 2 * day, updatedAt: now - 2 * day,
    workflowType: 'form', mode: 'fba-bulk', productName: '折叠收纳盒',
    keywords: ['折叠收纳盒', 'collapsible storage box'], market: '美国站',
    dataInputs: [
      { type: 'search-volume', label: '搜索量/供需比', required: true, source: 'manual', loadedAt: now - 2 * day, content: '' },
      { type: 'competitor', label: '竞品评论分布', required: true, source: 'mcp', loadedAt: now - 2 * day, content: '' },
      { type: 'logistics', label: '头程物流报价', required: false, source: 'manual', loadedAt: now - 2 * day, content: '' },
    ],
    status: 'completed',
    report: {
      overallScore: 74, verdict: 'pass', confidenceLevel: 'high',
      steps: {
        initial: {
          status: 'watch', score: 70,
          metrics: {
            '月搜索量': { value: '38,000', threshold: '≥50,000', pass: false },
            '供需比': { value: '112', threshold: '≥50', pass: true },
            '年增长率': { value: '+15%', threshold: '≥5%', pass: true },
            '季节性波动': { value: '22%', threshold: '≤40%', pass: true },
          },
          notes: ['搜索量略低于铺货理想阈值，可扩展长尾关键词补充流量'],
        },
        competition: {
          status: 'pass', score: 82,
          metrics: {
            'CR10 销量占比': { value: '43%', threshold: '≤60%', pass: true },
            '头部评论中位数': { value: '380条', threshold: '≤1000', pass: true },
            '新品销量占比': { value: '24%', threshold: '≥15%', pass: true },
          },
          notes: ['竞争格局健康，新品入场机会明显'],
        },
        profit: {
          status: 'watch', score: 65,
          metrics: {
            '毛利率': { value: '32%', threshold: '≥35%', pass: false },
            '净利润率': { value: '16%', threshold: '≥15%', pass: true },
            'ROI': { value: '1:1.7', threshold: '≥1:1.5', pass: true },
            '客单价': { value: '$28', threshold: '$15-50', pass: true },
          },
          notes: ['毛利率偏低，建议优化采购成本或适当提价'],
        },
        compliance: {
          status: 'pass', score: 95,
          metrics: {
            '侵权风险': { value: '无', threshold: '无侵权', pass: true },
            '类目审核': { value: '免审', threshold: '无强制审核', pass: true },
            '强制认证': { value: '无', threshold: '无强制认证', pass: true },
          },
          notes: [],
        },
        trial: {
          status: 'skip', score: 0,
          metrics: {},
          notes: ['尚未执行试销'],
        },
      },
      actionItems: [
        { priority: 'high', text: '毛利率偏低，建议将采购成本降至 ¥18 以内，或目标售价提高至 $31' },
        { priority: 'medium', text: '扩展关键词矩阵，补充 "storage bin with lid" 等长尾词提升搜索覆盖' },
        { priority: 'low', text: '建议申请外观设计专利，防止同款抄袭' },
      ],
    },
  },
  {
    id: 's2', createdAt: now - 5 * day, updatedAt: now - 5 * day,
    workflowType: 'chat', mode: 'fba-refined', productName: '便携充电宝',
    keywords: ['portable charger', '便携充电宝'], market: '美国站',
    dataInputs: [
      { type: 'search-volume', label: '搜索量/供需比', required: true, source: 'mcp', loadedAt: now - 5 * day, content: '' },
      { type: 'competitor', label: '竞品评论分布', required: true, source: 'mcp', loadedAt: now - 5 * day, content: '' },
      { type: 'logistics', label: '头程物流报价', required: false, source: 'manual', loadedAt: now - 5 * day, content: '' },
      { type: 'ip-check', label: '知识产权查询', required: true, source: 'manual', loadedAt: now - 5 * day, content: '' },
    ],
    status: 'completed',
    report: {
      overallScore: 81, verdict: 'pass', confidenceLevel: 'high',
      steps: {
        initial: { status: 'pass', score: 88, metrics: { '月搜索量': { value: '95,000', threshold: '≥10,000', pass: true }, '供需比': { value: '165', threshold: '≥100', pass: true }, '年增长率': { value: '+22%', threshold: '≥10%', pass: true } }, notes: [] },
        competition: { status: 'pass', score: 78, metrics: { 'CR10 销量占比': { value: '51%', threshold: '≤50%', pass: false }, '头部评论中位数': { value: '420条', threshold: '≤500', pass: true }, '新品销量占比': { value: '22%', threshold: '≥20%', pass: true } }, notes: ['头部集中度略高，需做明确差异化'] },
        profit: { status: 'pass', score: 80, metrics: { '毛利率': { value: '44%', threshold: '≥40%', pass: true }, '净利润率': { value: '22%', threshold: '≥20%', pass: true }, 'ROI': { value: '1:2.1', threshold: '≥1:2', pass: true } }, notes: [] },
        compliance: { status: 'pass', score: 90, metrics: { '侵权风险': { value: '无', threshold: '无侵权', pass: true }, 'FCC认证': { value: '已确认可办', threshold: '可获取认证', pass: true } }, notes: [] },
        trial: { status: 'skip', score: 0, metrics: {}, notes: ['尚未执行试销'] },
      },
      actionItems: [
        { priority: 'high', text: '需做明确差异化，建议主打"超薄+大容量"组合卖点，区别头部产品' },
        { priority: 'medium', text: 'FCC 认证需提前 6 周办理，避免上架延误' },
      ],
    },
  },
  {
    id: 's3', createdAt: now - 7 * day, updatedAt: now - 7 * day,
    workflowType: 'form', mode: 'fbm-bulk', productName: '硅胶厨具套装',
    keywords: ['silicone kitchen set', '硅胶厨具'], market: '美国站',
    dataInputs: [
      { type: 'search-volume', label: '搜索量/供需比', required: true, source: 'manual', loadedAt: now - 7 * day, content: '' },
      { type: 'ip-check', label: '知识产权查询', required: true, source: 'manual', loadedAt: now - 7 * day, content: '' },
    ],
    status: 'completed',
    report: {
      overallScore: 48, verdict: 'reject', confidenceLevel: 'medium',
      steps: {
        initial: { status: 'pass', score: 72, metrics: { '月搜索量': { value: '62,000', threshold: '≥30,000', pass: true }, '供需比': { value: '45', threshold: '≥50', pass: false } }, notes: [] },
        competition: { status: 'fail', score: 35, metrics: { 'CR10 销量占比': { value: '78%', threshold: '≤60%', pass: false }, '头部评论中位数': { value: '3,200条', threshold: '≤1,000', pass: false } }, notes: ['头部垄断严重，评论壁垒极高，新卖家难以突破'] },
        profit: { status: 'fail', score: 38, metrics: { '毛利率': { value: '28%', threshold: '≥50%', pass: false }, '国际物流成本': { value: '$12/件', threshold: '≤$8', pass: false } }, notes: ['FBM 模式下物流成本侵蚀利润空间'] },
        compliance: { status: 'pass', score: 80, metrics: { '侵权风险': { value: '无', threshold: '无侵权', pass: true } }, notes: [] },
        trial: { status: 'skip', score: 0, metrics: {}, notes: [] },
      },
      actionItems: [
        { priority: 'high', text: '竞争壁垒过高，不建议以 FBM 模式入场此类目' },
      ],
    },
  },
  {
    id: 's4', createdAt: now - 10 * day, updatedAt: now - 10 * day,
    workflowType: 'form', mode: 'fba-refined', productName: '车载香薰',
    keywords: ['car air freshener', '车载香薰'], market: '美国站',
    dataInputs: [],
    status: 'completed',
    report: {
      overallScore: 67, verdict: 'watch', confidenceLevel: 'low',
      steps: {
        initial: { status: 'pass', score: 75, metrics: { '月搜索量': { value: '45,000', threshold: '≥10,000', pass: true } }, notes: [] },
        competition: { status: 'watch', score: 62, metrics: { 'CR10 销量占比': { value: '55%', threshold: '≤50%', pass: false } }, notes: [] },
        profit: { status: 'watch', score: 70, metrics: { '毛利率': { value: '38%', threshold: '≥40%', pass: false } }, notes: [] },
        compliance: { status: 'pass', score: 85, metrics: {}, notes: [] },
        trial: { status: 'skip', score: 0, metrics: {}, notes: [] },
      },
      actionItems: [
        { priority: 'medium', text: '建议补充完整数据后重新评估，当前置信度偏低' },
      ],
    },
  },
]

const MOCK_TRACKED: TrackedProduct[] = [
  {
    id: 't1', sessionId: 's1', name: '折叠收纳盒', mode: 'fba-bulk',
    intervalDays: 14, lastCheckedAt: now - 2 * day, nextCheckAt: now + 12 * day,
    alertOnChange: true, status: 'active', currentScore: 74, currentVerdict: 'pass', scoreTrend: 'up',
    history: [
      { checkedAt: now - 16 * day, score: 68, verdict: 'watch', sessionId: 'sx1', changeSummary: ['搜索量 +8%'] },
      { checkedAt: now - 2 * day, score: 74, verdict: 'pass', sessionId: 's1', changeSummary: ['竞争格局改善', '新品占比 +4%'] },
    ],
  },
  {
    id: 't2', sessionId: 's2', name: '便携充电宝', mode: 'fba-refined',
    intervalDays: 7, lastCheckedAt: now - 5 * day, nextCheckAt: now + 2 * day,
    alertOnChange: false, status: 'active', currentScore: 81, currentVerdict: 'pass', scoreTrend: 'stable',
    history: [
      { checkedAt: now - 12 * day, score: 80, verdict: 'pass', sessionId: 'sx2', changeSummary: [] },
      { checkedAt: now - 5 * day, score: 81, verdict: 'pass', sessionId: 's2', changeSummary: ['评分微涨'] },
    ],
  },
  {
    id: 't3', sessionId: 's4', name: '车载香薰', mode: 'fba-refined',
    intervalDays: 14, lastCheckedAt: now - 10 * day, nextCheckAt: now + 4 * day,
    alertOnChange: true, status: 'active', currentScore: 52, currentVerdict: 'watch', scoreTrend: 'down',
    history: [
      { checkedAt: now - 24 * day, score: 67, verdict: 'watch', sessionId: 's4', changeSummary: [] },
      { checkedAt: now - 10 * day, score: 52, verdict: 'watch', sessionId: 'sx3', changeSummary: ['新竞品入场 5 个', 'CR10 上升至 62%'] },
    ],
  },
]

interface AmazonStore {
  sessions: AnalysisSession[]
  trackedProducts: TrackedProduct[]
  addSession: (session: AnalysisSession) => void
  updateSession: (id: string, updates: Partial<AnalysisSession>) => void
  removeSession: (id: string) => void
  addTracked: (product: TrackedProduct) => void
  updateTracked: (id: string, updates: Partial<TrackedProduct>) => void
  removeTracked: (id: string) => void
}

const persisted = loadPersistedState()
const initialSessions = persisted?.sessions ?? MOCK_SESSIONS
const initialTracked = persisted?.trackedProducts ?? MOCK_TRACKED

export const useAmazonStore = create<AmazonStore>((set) => ({
  sessions: initialSessions,
  trackedProducts: initialTracked,
  addSession: (session) => set((s) => {
    const sessions = [session, ...s.sessions]
    persistState(sessions, s.trackedProducts)
    return { sessions }
  }),
  updateSession: (id, updates) => set((s) => {
    const sessions = s.sessions.map((x) => (x.id === id ? { ...x, ...updates, updatedAt: Date.now() } : x))
    persistState(sessions, s.trackedProducts)
    return { sessions }
  }),
  removeSession: (id) => set((s) => {
    const sessions = s.sessions.filter((x) => x.id !== id)
    persistState(sessions, s.trackedProducts)
    return { sessions }
  }),
  addTracked: (product) => set((s) => {
    const trackedProducts = [product, ...s.trackedProducts]
    persistState(s.sessions, trackedProducts)
    return { trackedProducts }
  }),
  updateTracked: (id, updates) => set((s) => {
    const trackedProducts = s.trackedProducts.map((p) => (p.id === id ? { ...p, ...updates } : p))
    persistState(s.sessions, trackedProducts)
    return { trackedProducts }
  }),
  removeTracked: (id) => set((s) => {
    const trackedProducts = s.trackedProducts.filter((p) => p.id !== id)
    persistState(s.sessions, trackedProducts)
    return { trackedProducts }
  }),
}))
