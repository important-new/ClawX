import type { SelectionMode, DataInput, AnalysisReport, StepResult, StepStatus } from './types'

export interface EngineInput {
  mode: SelectionMode
  productName: string
  keywords: string[]
  market: string
  dataInputs: DataInput[]
  /** Re-analysis round index — changes the hash seed so periodic re-checks show market evolution */
  round?: number
}

// ─── Deterministic hash helpers ──────────────────────────────────────────────

function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/** Deterministic float [0, 1) from base hash + integer salt */
function derive(base: number, salt: number): number {
  const h = hash32(String(base ^ Math.imul(salt, 2654435761) >>> 0))
  return h / 4294967296
}

/** Deterministic float in [lo, hi] */
function rng(base: number, salt: number, lo: number, hi: number): number {
  return lo + derive(base, salt) * (hi - lo)
}

// ─── Mode thresholds ──────────────────────────────────────────────────────────

interface Thresholds {
  minSearchVolume: number
  minSupplyDemand: number
  minGrowthRate: number
  maxSeasonality: number
  maxCR10Share: number
  maxTopReview: number
  minNewProductShare: number
  minGrossMargin: number
  minNetMargin: number
  minROI: number
  minPrice: number
  maxPrice: number
}

const THRESHOLDS: Record<SelectionMode, Thresholds> = {
  'fba-refined': {
    minSearchVolume: 10000, minSupplyDemand: 100, minGrowthRate: 10, maxSeasonality: 40,
    maxCR10Share: 50, maxTopReview: 500, minNewProductShare: 20,
    minGrossMargin: 40, minNetMargin: 20, minROI: 2.0, minPrice: 20, maxPrice: 80,
  },
  'fba-bulk': {
    minSearchVolume: 50000, minSupplyDemand: 50, minGrowthRate: 5, maxSeasonality: 50,
    maxCR10Share: 60, maxTopReview: 1000, minNewProductShare: 15,
    minGrossMargin: 35, minNetMargin: 15, minROI: 1.5, minPrice: 10, maxPrice: 50,
  },
  'fbm-refined': {
    minSearchVolume: 5000, minSupplyDemand: 80, minGrowthRate: 10, maxSeasonality: 35,
    maxCR10Share: 40, maxTopReview: 300, minNewProductShare: 20,
    minGrossMargin: 50, minNetMargin: 25, minROI: 2.5, minPrice: 30, maxPrice: 120,
  },
  'fbm-bulk': {
    minSearchVolume: 20000, minSupplyDemand: 30, minGrowthRate: 5, maxSeasonality: 60,
    maxCR10Share: 70, maxTopReview: 2000, minNewProductShare: 10,
    minGrossMargin: 25, minNetMargin: 12, minROI: 1.3, minPrice: 8, maxPrice: 40,
  },
}

// ─── Content parsers ──────────────────────────────────────────────────────────

function parseFloat_(text: string, patterns: RegExp[]): number | null {
  for (const pat of patterns) {
    const m = pat.exec(text)
    if (m) {
      const raw = m[1].replace(/,/g, '').trim()
      const val = parseFloat(raw)
      return isNaN(val) ? null : val
    }
  }
  return null
}

function parseInt_(text: string, patterns: RegExp[]): number | null {
  const v = parseFloat_(text, patterns)
  if (v === null) return null
  // Handle Chinese 万 (10,000) suffix
  const hasWan = patterns.some((p) => {
    const m = p.exec(text)
    return m && m[0].includes('万')
  })
  return Math.round(hasWan ? v * 10000 : v)
}

function getContent(inputs: DataInput[], type: DataInput['type']): string {
  return inputs.find((d) => d.type === type)?.content ?? ''
}

function hasLoaded(inputs: DataInput[], type: DataInput['type']): boolean {
  return !!inputs.find((d) => d.type === type)?.source
}

// ─── Product hints from name ──────────────────────────────────────────────────

interface ProductHints {
  /** 0–1: how competitive the category likely is */
  competitive: number
  /** 0–1: is this an electronic/tech product (affects certification) */
  tech: number
  /** 0–1: is this a bulky/heavy item (affects logistics) */
  bulky: number
}

const COMPETITIVE_TERMS = ['收纳', 'storage', 'organizer', '厨', 'kitchen', 'cover', 'case',
  '手机', 'phone', '充电', 'charger', '数据线', 'cable', '支架', 'stand']
const LOW_COMP_TERMS = ['专业', 'professional', '医用', 'medical', '工业', 'industrial', '精密']
const TECH_TERMS = ['充电', 'charger', '蓝牙', 'bluetooth', '电子', 'electronic', '无线', 'wireless',
  '数字', 'digital', '智能', 'smart', 'led', 'usb']
const BULKY_TERMS = ['家具', 'furniture', '沙发', 'sofa', '床', 'bed', '桌', 'table', '椅', 'chair']

function productHints(name: string, keywords: string[]): ProductHints {
  const text = (name + ' ' + keywords.join(' ')).toLowerCase()
  const hasAny = (terms: string[]) => terms.some((t) => text.includes(t))
  return {
    competitive: hasAny(COMPETITIVE_TERMS) ? 0.72 : hasAny(LOW_COMP_TERMS) ? 0.18 : 0.45,
    tech: hasAny(TECH_TERMS) ? 0.82 : 0.25,
    bulky: hasAny(BULKY_TERMS) ? 0.85 : 0.2,
  }
}

// ─── Step helpers ─────────────────────────────────────────────────────────────

function stepStatus(score: number): StepStatus {
  if (score >= 70) return 'pass'
  if (score >= 50) return 'watch'
  return 'fail'
}

function fmt(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`
  return n.toLocaleString()
}

// ─── Step 1: 初选筛选 ─────────────────────────────────────────────────────────

function computeInitial(base: number, mode: SelectionMode, inputs: DataInput[], hints: ProductHints): StepResult {
  const th = THRESHOLDS[mode]
  const content = getContent(inputs, 'search-volume')

  const parsedVol = parseInt_(content, [
    /月搜索量[：:\s]*([\d,万.]+)/,
    /search\s*volume[：:\s]*([\d,]+)/i,
    /monthly[^:：\n]*[：:]\s*([\d,]+)/i,
    /^([\d,万.]+)\s*$/m,
  ])
  const parsedSDR = parseFloat_(content, [
    /供需比[：:\s]*([\d.]+)/,
    /bsr[：:\s]*([\d.]+)/i,
    /supply.demand[：:\s]*([\d.]+)/i,
  ])

  const searchVol = parsedVol ?? Math.round(
    rng(base, 1, th.minSearchVolume * 0.45, th.minSearchVolume * 2.8) * (1 - hints.competitive * 0.25)
  )
  const supplyDemand = parsedSDR ?? Math.round(
    rng(base, 2, th.minSupplyDemand * 0.3, th.minSupplyDemand * 3.2) * (1 + hints.competitive * 0.15)
  )
  const growthRate = Math.round(rng(base, 3, -8, 38) * (1 + hints.tech * 0.2))
  const seasonality = Math.round(rng(base, 4, 5, 68) * (1 - hints.bulky * 0.2))

  const volPass = searchVol >= th.minSearchVolume
  const sdrPass = supplyDemand >= th.minSupplyDemand
  const growthPass = growthRate >= th.minGrowthRate
  const seasonPass = seasonality <= th.maxSeasonality

  const passCount = [volPass, sdrPass, growthPass, seasonPass].filter(Boolean).length
  const score = Math.min(100, Math.round(35 + passCount * 14 + (volPass ? 4 : 0) + (sdrPass ? 5 : 0)))

  const notes: string[] = []
  if (!volPass) notes.push(`搜索量（${fmt(searchVol)}）低于 ${mode} 模式理想阈值，建议扩展长尾关键词补充流量`)
  if (!sdrPass) notes.push(`供需比偏低，市场供给已较充分，需差异化切入`)
  if (growthRate < 0) notes.push(`品类年增长为负，需评估是否为长期趋势`)

  return {
    status: stepStatus(score),
    score,
    metrics: {
      '月搜索量': { value: fmt(searchVol), threshold: `≥${fmt(th.minSearchVolume)}`, pass: volPass },
      '供需比': { value: String(supplyDemand), threshold: `≥${th.minSupplyDemand}`, pass: sdrPass },
      '年增长率': { value: `${growthRate >= 0 ? '+' : ''}${growthRate}%`, threshold: `≥${th.minGrowthRate}%`, pass: growthPass },
      '季节性波动': { value: `${seasonality}%`, threshold: `≤${th.maxSeasonality}%`, pass: seasonPass },
    },
    notes,
  }
}

// ─── Step 2: 竞争分析 ─────────────────────────────────────────────────────────

function computeCompetition(base: number, mode: SelectionMode, inputs: DataInput[], hints: ProductHints): StepResult {
  const th = THRESHOLDS[mode]
  const content = getContent(inputs, 'competitor')

  const parsedCR10 = parseFloat_(content, [
    /cr10[^:：\n]*[：:]\s*([\d.]+)/i,
    /头部占比[：:\s]*([\d.]+)/,
    /top\s*10[^:：\n]*[：:]\s*([\d.]+)/i,
  ])
  const parsedReview = parseInt_(content, [
    /评论中位数[：:\s]*([\d,]+)/,
    /头部评论[数量]?[：:\s]*([\d,]+)/,
    /median\s*review[^:：\n]*[：:]\s*([\d,]+)/i,
  ])
  const parsedNewShare = parseFloat_(content, [
    /新品占比[：:\s]*([\d.]+)/,
    /new\s*product[^:：\n]*[：:]\s*([\d.]+)/i,
  ])

  const cr10 = parsedCR10 ?? Math.round(
    rng(base, 10, th.maxCR10Share * 0.4, th.maxCR10Share * 1.65) * (1 + hints.competitive * 0.3)
  )
  const topReview = parsedReview ?? Math.round(
    rng(base, 11, th.maxTopReview * 0.15, th.maxTopReview * 2.6) * (1 + hints.competitive * 0.45)
  )
  const newShare = parsedNewShare ?? Math.round(
    rng(base, 12, th.minNewProductShare * 0.3, th.minNewProductShare * 3.2) * (1 - hints.competitive * 0.3)
  )

  const cr10Pass = cr10 <= th.maxCR10Share
  const reviewPass = topReview <= th.maxTopReview
  const newSharePass = newShare >= th.minNewProductShare

  const passCount = [cr10Pass, reviewPass, newSharePass].filter(Boolean).length
  const score = Math.min(100, Math.round(38 + passCount * 21))

  const notes: string[] = []
  if (!cr10Pass) notes.push(`头部集中度过高（${cr10}%），新卖家突破难度大，需制造明确差异点`)
  if (!reviewPass) notes.push(`头部评论壁垒高（${fmt(topReview)}条），入场前需明确核心差异化`)
  if (cr10Pass && reviewPass && newSharePass) notes.push(`竞争格局健康，新品入场机会明显`)

  return {
    status: stepStatus(score),
    score,
    metrics: {
      'CR10 销量占比': { value: `${cr10}%`, threshold: `≤${th.maxCR10Share}%`, pass: cr10Pass },
      '头部评论中位数': { value: `${fmt(topReview)}条`, threshold: `≤${fmt(th.maxTopReview)}`, pass: reviewPass },
      '新品销量占比': { value: `${newShare}%`, threshold: `≥${th.minNewProductShare}%`, pass: newSharePass },
    },
    notes,
  }
}

// ─── Step 3: 盈利核算 ─────────────────────────────────────────────────────────

function computeProfit(base: number, mode: SelectionMode, inputs: DataInput[], hints: ProductHints): StepResult {
  const th = THRESHOLDS[mode]
  const content = getContent(inputs, 'logistics')

  const logAdj = hints.bulky ? 0.83 : 1.0
  const compAdj = 1 - hints.competitive * 0.12

  const parsedGM = parseFloat_(content, [
    /毛利率[：:\s]*([\d.]+)/,
    /gross\s*margin[：:\s]*([\d.]+)/i,
    /gpm[：:\s]*([\d.]+)/i,
  ])

  const grossMargin = parsedGM ?? Math.round(
    rng(base, 20, th.minGrossMargin * 0.52, th.minGrossMargin * 1.82) * logAdj * compAdj
  )
  const netMargin = Math.round(grossMargin * rng(base, 21, 0.38, 0.62))
  const roi = Math.round(rng(base, 22, th.minROI * 0.58, th.minROI * 2.1) * (hints.tech ? 0.88 : 1.0) * 10) / 10
  const price = Math.round(rng(base, 23, th.minPrice, th.maxPrice))

  const gmPass = grossMargin >= th.minGrossMargin
  const nmPass = netMargin >= th.minNetMargin
  const roiPass = roi >= th.minROI
  const pricePass = price >= th.minPrice && price <= th.maxPrice

  const passCount = [gmPass, nmPass, roiPass, pricePass].filter(Boolean).length
  const score = Math.min(100, Math.round(33 + passCount * 17))

  const notes: string[] = []
  if (!gmPass) notes.push(`毛利率（${grossMargin}%）低于目标 ${th.minGrossMargin}%，建议降低采购成本或提价`)
  if (!nmPass && gmPass) notes.push(`净利润率偏低，需压缩广告和仓储等运营成本`)
  if (hints.bulky && !hasLoaded(inputs, 'logistics')) notes.push(`体积偏大的产品建议补充头程物流报价精确核算`)

  return {
    status: stepStatus(score),
    score,
    metrics: {
      '毛利率': { value: `${grossMargin}%`, threshold: `≥${th.minGrossMargin}%`, pass: gmPass },
      '净利润率': { value: `${netMargin}%`, threshold: `≥${th.minNetMargin}%`, pass: nmPass },
      'ROI': { value: `1:${roi}`, threshold: `≥1:${th.minROI}`, pass: roiPass },
      '客单价': { value: `$${price}`, threshold: `$${th.minPrice}-${th.maxPrice}`, pass: pricePass },
    },
    notes,
  }
}

// ─── Step 4: 合规排查 ─────────────────────────────────────────────────────────

function computeCompliance(base: number, _mode: SelectionMode, inputs: DataInput[], hints: ProductHints): StepResult {
  const hasIP = hasLoaded(inputs, 'ip-check')
  const content = getContent(inputs, 'ip-check')

  const ipRisk = content.includes('侵权') || content.includes('风险') || content.toLowerCase().includes('risk')
  const needsCert = hints.tech > 0.5
  const certIssue = needsCert && derive(base, 30) < 0.18
  const reviewIssue = derive(base, 31) < 0.08

  const ipPass = !ipRisk
  const certPass = !certIssue
  const reviewPass = !reviewIssue

  const passCount = [ipPass, certPass || !needsCert, reviewPass].filter(Boolean).length
  const score = Math.min(100, Math.round(52 + passCount * 16))

  const notes: string[] = []
  if (!hasIP) notes.push(`未提供 IP 查询报告，建议上架前完成商标/专利排查`)
  if (certIssue) notes.push(`技术类产品可能需要 FCC/CE 等强制认证，建议提前确认申请周期（通常 4-8 周）`)
  if (ipRisk) notes.push(`内容中检测到侵权关键词，请仔细核查是否存在商标/专利冲突`)

  const metrics: StepResult['metrics'] = {
    '侵权风险': { value: ipRisk ? '存在风险' : (hasIP ? '已排查无风险' : '未查'), threshold: '无侵权', pass: ipPass },
    '类目审核': { value: reviewPass ? '免审' : '需审核', threshold: '无强制审核', pass: reviewPass },
  }
  if (needsCert) {
    metrics['强制认证'] = { value: certPass ? '可获取' : '存在障碍', threshold: '可获取认证', pass: certPass }
  }

  return { status: stepStatus(score), score, metrics, notes }
}

// ─── Action items ─────────────────────────────────────────────────────────────

function buildActionItems(
  steps: AnalysisReport['steps'],
  mode: SelectionMode,
  hints: ProductHints,
): AnalysisReport['actionItems'] {
  const th = THRESHOLDS[mode]
  const items: AnalysisReport['actionItems'] = []

  const gm = steps.profit.metrics['毛利率']
  if (gm && !gm.pass) {
    items.push({ priority: 'high', text: `毛利率偏低（${gm.value}），建议将采购成本压缩 15-20%，或目标售价提高至满足 ≥${th.minGrossMargin}% 毛利要求` })
  }

  const cr10 = steps.competition.metrics['CR10 销量占比']
  if (cr10 && !cr10.pass) {
    items.push({ priority: 'high', text: `头部竞争激烈（${cr10.value}），需要明确差异化卖点（功能升级、外观、套装内容等）才能突围` })
  }

  if (steps.compliance.notes.some((n) => n.includes('认证'))) {
    items.push({ priority: 'high', text: `认证申请需提前 4-8 周启动，避免因证书延误影响上架节点` })
  }

  if (!steps.initial.metrics['月搜索量']?.pass) {
    items.push({ priority: 'medium', text: `关键词搜索量不足，建议扩展长尾词矩阵，提高 listing 流量覆盖` })
  }

  if (hints.tech > 0.5) {
    items.push({ priority: 'medium', text: `技术类产品建议在量产前申请专利，构建壁垒防止竞品抄袭` })
  }

  if (steps.competition.metrics['新品销量占比']?.pass && steps.profit.status === 'pass') {
    items.push({ priority: 'low', text: `市场新品活跃、利润健康，上架初期建议加大广告投入抢占新品流量窗口期` })
  }

  if (!steps.compliance.notes.some((n) => n.includes('IP'))) {
    items.push({ priority: 'low', text: `建议申请商标注册和外观设计专利，强化品牌保护` })
  }

  return items.slice(0, 4)
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runAnalysis(input: EngineInput): AnalysisReport {
  const base = hash32(input.productName + '|' + input.mode + '|' + input.market + '|' + (input.round ?? 0))
  const hints = productHints(input.productName, input.keywords)
  const hasAllRequired = input.dataInputs.filter((d) => d.required).every((d) => d.source)
  const hasAnyData = input.dataInputs.some((d) => d.source)

  const initial = computeInitial(base, input.mode, input.dataInputs, hints)
  const competition = computeCompetition(base, input.mode, input.dataInputs, hints)
  const profit = computeProfit(base, input.mode, input.dataInputs, hints)
  const compliance = computeCompliance(base, input.mode, input.dataInputs, hints)
  const trial: StepResult = {
    status: 'skip', score: 0, metrics: {},
    notes: ['尚未执行试销，建议获批后安排小批量测款（50-100 件）'],
  }

  const steps = { initial, competition, profit, compliance, trial }

  // Weighted overall score (trial excluded until executed)
  const W = { initial: 0.2, competition: 0.25, profit: 0.35, compliance: 0.2 }
  const overallScore = Math.min(98, Math.max(10, Math.round(
    W.initial * initial.score +
    W.competition * competition.score +
    W.profit * profit.score +
    W.compliance * compliance.score
  )))

  const verdict: AnalysisReport['verdict'] =
    overallScore >= 70 ? 'pass' : overallScore >= 50 ? 'watch' : 'reject'
  const confidenceLevel: AnalysisReport['confidenceLevel'] =
    hasAllRequired ? 'high' : hasAnyData ? 'medium' : 'low'

  return {
    overallScore,
    verdict,
    confidenceLevel,
    steps,
    actionItems: buildActionItems(steps, input.mode, hints),
  }
}
