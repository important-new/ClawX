import { useState, useCallback } from 'react'
import { invokeIpc } from '@/lib/api-client'
import {
  readAmazonSessionFile,
  getAmazonSessionStats,
} from '@/lib/host-api'

export interface PipelineSessionMeta {
  name: string
  productCount: number
  date: string
}

export interface ProductSummary {
  rank: number
  asin: string
  title: string
  /** purchase cost ratio in percent; can be negative for loss-making */
  ratioPct: number | null
  /** semantic tag: 充裕 / 健康 / 偏紧 / 风险高 / 亏损 / null */
  ratioTag: string | null
  /** estimated monthly profit in USD */
  monthlyProfit: number | null
  /** true if viable (OK), false otherwise */
  viable: boolean
}

export interface ReportSummary {
  totalProducts: number
  viableCount: number
  unviableCount: number
  /** Top-N products in display order (already sorted by purchase ratio desc in markdown) */
  top: ProductSummary[]
  /** all products (could be large) */
  products: ProductSummary[]
  /** distribution by ratioTag */
  byTag: Record<string, number>
}

export interface LoadedSession {
  name: string
  stats: Record<string, { count: number; label: string }>
  report: string | null
  /** Parsed structured summary extracted from the markdown report. Null if parsing fails. */
  summary: ReportSummary | null
}

/**
 * Parse Product_Selection_Report.md to extract structured per-product info.
 *
 * The markdown layout (produced by gen_selection_report + insert_profit) is:
 *   ### #N/M 产品分析: TITLE ([ASIN](https://...))
 *   ...
 *   | **采购成本占比** | **N.N%（充裕|健康|偏紧|风险高|亏损）** |
 *   | **月利润估算** | **$N,NNN** |
 *   | **可行性** | **OK** / **不可行** |
 */
export function parsePipelineReport(md: string): ReportSummary | null {
  if (!md) return null

  const headerRe = /^### #(\d+)\/\d+ 产品分析:\s*(.+?)\s*\(\[([A-Z0-9]{10})\]/gm
  const blocks: { rank: number; title: string; asin: string; start: number }[] = []
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(md))) {
    blocks.push({
      rank: parseInt(m[1], 10),
      title: m[2].replace(/\.\.\.$/, '').trim(),
      asin: m[3],
      start: m.index,
    })
  }
  if (blocks.length === 0) return null

  const ratioRe = /\*\*采购成本占比\*\*\s*\|\s*\*\*([\-\d.]+)%[（(]\s*(\S+?)\s*[)）]\*\*/
  const profitRe = /\*\*月利润估算\*\*\s*\|\s*\*\*\$([\-\d,]+)\*\*/
  const viableRe = /\*\*可行性\*\*\s*\|\s*\*\*(\S+?)\*\*/

  const products: ProductSummary[] = blocks.map((b, i) => {
    const next = i + 1 < blocks.length ? blocks[i + 1].start : md.length
    const body = md.slice(b.start, next)

    const ratioM = body.match(ratioRe)
    const profitM = body.match(profitRe)
    const viableM = body.match(viableRe)

    return {
      rank: b.rank,
      asin: b.asin,
      title: b.title,
      ratioPct: ratioM ? parseFloat(ratioM[1]) : null,
      ratioTag: ratioM ? ratioM[2] : null,
      monthlyProfit: profitM ? parseInt(profitM[1].replace(/,/g, ''), 10) : null,
      viable: viableM ? viableM[1] === 'OK' : false,
    }
  })

  const byTag: Record<string, number> = {}
  for (const p of products) {
    if (p.ratioTag) byTag[p.ratioTag] = (byTag[p.ratioTag] || 0) + 1
  }
  const viableCount = products.filter((p) => p.viable).length

  return {
    totalProducts: products.length,
    viableCount,
    unviableCount: products.length - viableCount,
    top: products.slice(0, Math.min(5, products.length)),
    products,
    byTag,
  }
}

/** Build a compact AI-friendly context block from a ReportSummary. */
export function formatSummaryForAI(summary: ReportSummary): string {
  const lines: string[] = []
  lines.push(
    `产品池: ${summary.totalProducts} 款（可行 ${summary.viableCount} / 不可行 ${summary.unviableCount}）`,
  )
  if (Object.keys(summary.byTag).length > 0) {
    const tagOrder = ['充裕', '健康', '偏紧', '风险高', '亏损']
    const dist = tagOrder
      .filter((t) => summary.byTag[t])
      .map((t) => `${t} ${summary.byTag[t]}`)
      .join(' / ')
    if (dist) lines.push(`采购成本占比分布: ${dist}`)
  }
  if (summary.top.length > 0) {
    lines.push('')
    lines.push('Top 候选（已按 采购占比 desc + 月利润 desc 排序）:')
    for (const p of summary.top) {
      const ratio = p.ratioPct !== null ? `${p.ratioPct.toFixed(1)}%` : 'N/A'
      const tag = p.ratioTag ? `[${p.ratioTag}]` : ''
      const profit = p.monthlyProfit !== null ? `$${p.monthlyProfit.toLocaleString()}` : 'N/A'
      const status = p.viable ? '✓' : '✗'
      lines.push(
        `  #${p.rank} ${status} ${p.asin} 占比${ratio}${tag} 月利润${profit} — ${p.title.slice(0, 50)}`,
      )
    }
  }
  return lines.join('\n')
}

export function usePipelineSession() {
  const [sessions, setSessions] = useState<PipelineSessionMeta[]>([])
  const [scanning, setScanning] = useState(false)
  const [loaded, setLoaded] = useState<LoadedSession | null>(null)
  const [loading, setLoading] = useState(false)

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const result = await invokeIpc<PipelineSessionMeta[]>('amazon:scanSessions')
      setSessions(result ?? [])
    } finally {
      setScanning(false)
    }
  }, [])

  const load = useCallback(async (sessionName: string) => {
    setLoading(true)
    try {
      const [statsResult, reportResult] = await Promise.all([
        getAmazonSessionStats(sessionName),
        readAmazonSessionFile(sessionName, 'Product_Selection_Report.md'),
      ])
      const report = reportResult?.success ? (reportResult.content ?? null) : null

      setLoaded({
        name: sessionName,
        stats: statsResult?.success ? statsResult.stats : {},
        report,
        summary: report ? parsePipelineReport(report) : null,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => setLoaded(null), [])

  return { sessions, scanning, scan, loaded, loading, load, clear }
}
