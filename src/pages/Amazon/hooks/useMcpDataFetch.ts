/**
 * useMcpDataFetch — sends a gateway AI request to fetch real market data
 * for a given DataInput type using configured MCP tools (e.g. SellerSprite).
 *
 * The gateway AI has access to any MCP servers configured in openclaw.json.
 * If no MCP tool is available the AI will fall back to experience-based estimates
 * and clearly label them as such.
 */
import { useCallback, useState } from 'react'
import { useGatewayStore } from '@/stores/gateway'
import type { DataInput } from '../types'

// ── Prompt builders ────────────────────────────────────────────────────────────

function buildPrompt(
  type: DataInput['type'],
  productName: string,
  keywords: string[],
  market: string,
): string {
  const kw = keywords.filter(Boolean).join('、') || productName
  switch (type) {
    case 'search-volume':
      return `请使用 MCP 工具查询关键词「${kw}」在 ${market} 的搜索数据，需要以下指标：
- 月搜索量
- 供需比（搜索量/在售商品数）
- 年增长率
- 季节性波动幅度

如无 MCP 工具可用，请基于电商经验给出估算值，并在回复开头注明「（经验估算）」。请直接输出数据，格式简洁。`

    case 'competitor':
      return `请使用 MCP 工具分析关键词「${kw}」在 ${market} 的竞品格局，需要以下指标：
- CR10 销量占比（前 10 名卖家销量占比）
- 头部卖家评论数中位数
- 新品（上架 6 个月内）销量占比
- 头部 3 个竞品的月销量区间

如无 MCP 工具可用，请基于电商经验给出估算值，并在回复开头注明「（经验估算）」。请直接输出数据，格式简洁。`

    case 'logistics':
      return `请估算产品「${productName}」（关键词：${kw}）从中国发往 ${market} 的 FBA 物流成本与盈利模型，包括：
- 头程运费（参考 $/kg 或 $/件）
- FBA 配送费 + 月仓储费（参考）
- 建议客单价区间
- 预估毛利率范围

请直接输出数据，格式简洁。`

    case 'ip-check':
      return `请查询关键词「${kw}」和产品「${productName}」的知识产权风险，包括：
- 相关商标注册状态（是否有活跃商标）
- 已知专利风险（外观/实用新型）
- 该类目常见侵权陷阱
- 综合侵权风险评级：低 / 中 / 高

请直接输出结论，格式简洁。`

    default:
      return `请查询「${kw}」在 ${market} 的相关市场数据。`
  }
}

// ── Shared polling helper (inline to avoid cross-file dependency) ──────────────

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
      .join('')
  }
  return ''
}

async function pollForReply(
  rpc: <T>(method: string, params?: unknown) => Promise<T>,
  sessionKey: string,
  baselineCount: number,
  timeoutMs = 90000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1800))
    try {
      const data = await rpc<{ messages?: Array<{ role: string; content: unknown }> }>(
        'chat.history',
        { sessionKey, limit: 100 },
      )
      const msgs = data?.messages ?? []
      if (msgs.length > baselineCount) {
        for (let i = msgs.length - 1; i >= baselineCount; i--) {
          if (msgs[i].role === 'assistant') return extractText(msgs[i].content)
        }
      }
    } catch { /* ignore transient errors */ }
  }
  return null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface McpFetchContext {
  productName: string
  keywords: string[]
  market: string
}

export interface McpDataFetchState {
  /** Currently-fetching data types */
  fetching: Set<DataInput['type']>
  /** Per-type fetch errors */
  errors: Partial<Record<DataInput['type'], string>>
  /**
   * Fetch real market data for `type` via gateway AI + MCP tools.
   * Returns the content string on success, null on failure.
   */
  fetchData: (type: DataInput['type'], ctx: McpFetchContext) => Promise<string | null>
  clearError: (type: DataInput['type']) => void
}

export function useMcpDataFetch(): McpDataFetchState {
  const [fetching, setFetching] = useState<Set<DataInput['type']>>(new Set())
  const [errors, setErrors] = useState<Partial<Record<DataInput['type'], string>>>({})

  const fetchData = useCallback(async (
    type: DataInput['type'],
    ctx: McpFetchContext,
  ): Promise<string | null> => {
    const { rpc } = useGatewayStore.getState()
    const sessionKey = `amazon-mcp:${type}:${Date.now()}`

    setFetching((prev) => new Set([...prev, type]))
    setErrors((prev) => { const n = { ...prev }; delete n[type]; return n })

    try {
      // Get baseline message count
      const before = await rpc<{ messages?: unknown[] }>(
        'chat.history', { sessionKey, limit: 100 },
      ).catch(() => ({ messages: [] }))
      const baselineCount = (before.messages ?? []).length

      // Send the data-fetch prompt
      const prompt = buildPrompt(type, ctx.productName, ctx.keywords, ctx.market)
      await rpc('chat.send', {
        sessionKey,
        message: prompt,
        deliver: false,
        idempotencyKey: crypto.randomUUID(),
      })

      const reply = await pollForReply(rpc, sessionKey, baselineCount)
      if (reply) return reply

      setErrors((prev) => ({ ...prev, [type]: 'AI 未在规定时间内响应，请重试' }))
      return null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrors((prev) => ({ ...prev, [type]: msg }))
      return null
    } finally {
      setFetching((prev) => {
        const n = new Set(prev)
        n.delete(type)
        return n
      })
    }
  }, [])

  const clearError = useCallback((type: DataInput['type']) => {
    setErrors((prev) => { const n = { ...prev }; delete n[type]; return n })
  }, [])

  return { fetching, errors, fetchData, clearError }
}
