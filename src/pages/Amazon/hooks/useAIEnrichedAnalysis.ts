/**
 * useAIEnrichedAnalysis — enriches a local engine report with Gateway AI judgment.
 *
 * When real MCP data is available, this hook sends the collected data along with
 * the local engine's preliminary scores to the AI, which returns:
 *   - A revised verdict (pass / watch / reject)
 *   - A revised overall score
 *   - Specific, data-backed action items
 *
 * The local engine's step-by-step metrics structure is preserved; only the
 * top-level judgment and action items are overwritten by the AI.
 * Falls back to the original report silently if parsing fails.
 */
import { useCallback, useState } from 'react'
import { useGatewayStore } from '@/stores/gateway'
import { MODE_LABELS } from '../types'
import type { AnalysisReport } from '../types'
import type { EngineInput } from '../engine'

// ── Prompt builder ─────────────────────────────────────────────────────────────

function buildEnrichPrompt(report: AnalysisReport, input: EngineInput): string {
  const { productName, mode, market, dataInputs } = input
  const r = report

  const dataSection = dataInputs
    .filter((d) => d.source && d.content?.trim())
    .map((d) => `### ${d.label}\n${d.content}`)
    .join('\n\n')

  return `你是亚马逊跨境电商选品专家。请基于以下真实市场数据，对产品「${productName}」的 ${MODE_LABELS[mode]} 模式入场可行性给出专业判断。

## 产品信息
- 产品：${productName}
- 运营模式：${MODE_LABELS[mode]}
- 目标市场：${market}
- 关键词：${input.keywords.join('、')}

## 市场数据（真实数据，来自 MCP 工具或人工录入）
${dataSection || '（无实际数据，请基于产品类目经验判断）'}

## 初步算法评分（供参考）
- 初选筛选：${r.steps.initial.score} 分
- 竞争分析：${r.steps.competition.score} 分
- 盈利核算：${r.steps.profit.score} 分
- 合规排查：${r.steps.compliance.score} 分
- 综合评分：${r.overallScore} 分

请综合以上数据给出你的最终判断。**只返回如下 JSON，不要输出任何其他内容：**

\`\`\`json
{
  "overallScore": 75,
  "verdict": "pass",
  "actionItems": [
    {"priority": "high", "text": "具体、可操作的高优先级建议"},
    {"priority": "medium", "text": "具体、可操作的中优先级建议"},
    {"priority": "low", "text": "具体、可操作的低优先级建议"}
  ]
}
\`\`\`

verdict 只能是 "pass"（建议入场）、"watch"（待观察）、"reject"（排除）之一。
overallScore 为 0-100 整数。actionItems 给出 2-4 条具体可操作建议，结合以上真实数据。`
}

// ── JSON parser — extract first JSON block from AI response ──────────────────

interface AiVerdict {
  overallScore: number
  verdict: 'pass' | 'watch' | 'reject'
  actionItems: Array<{ priority: 'high' | 'medium' | 'low'; text: string }>
}

function parseAiResponse(text: string): AiVerdict | null {
  // Try to find a JSON code block first, then bare JSON object
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = codeBlock ? codeBlock[1].trim() : text.trim()

  // Find the outermost {...}
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start === -1 || end === -1) return null

  try {
    const parsed = JSON.parse(jsonStr.slice(start, end + 1)) as Partial<AiVerdict>

    const score = Number(parsed.overallScore)
    if (!Number.isFinite(score) || score < 0 || score > 100) return null
    if (!['pass', 'watch', 'reject'].includes(parsed.verdict ?? '')) return null
    if (!Array.isArray(parsed.actionItems) || parsed.actionItems.length === 0) return null

    return {
      overallScore: Math.round(score),
      verdict: parsed.verdict as AiVerdict['verdict'],
      actionItems: (parsed.actionItems as AiVerdict['actionItems']).filter(
        (item) => item.text && ['high', 'medium', 'low'].includes(item.priority),
      ),
    }
  } catch {
    return null
  }
}

// ── Polling helper (inline to avoid cross-import) ─────────────────────────────

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
        'chat.history', { sessionKey, limit: 100 },
      )
      const msgs = data?.messages ?? []
      if (msgs.length > baselineCount) {
        for (let i = msgs.length - 1; i >= baselineCount; i--) {
          if (msgs[i].role === 'assistant') return extractText(msgs[i].content)
        }
      }
    } catch { /* ignore */ }
  }
  return null
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface AIEnrichedState {
  enriching: boolean
  error: string | null
  enrich: (report: AnalysisReport, input: EngineInput) => Promise<AnalysisReport>
  reset: () => void
}

export function useAIEnrichedAnalysis(): AIEnrichedState {
  const [enriching, setEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enrich = useCallback(async (
    report: AnalysisReport,
    input: EngineInput,
  ): Promise<AnalysisReport> => {
    const { rpc } = useGatewayStore.getState()
    const sessionKey = `amazon-ai-analysis:${Date.now()}`

    setEnriching(true)
    setError(null)

    try {
      const before = await rpc<{ messages?: unknown[] }>(
        'chat.history', { sessionKey, limit: 100 },
      ).catch(() => ({ messages: [] }))
      const baselineCount = (before.messages ?? []).length

      const prompt = buildEnrichPrompt(report, input)
      await rpc('chat.send', {
        sessionKey,
        message: prompt,
        deliver: false,
        idempotencyKey: crypto.randomUUID(),
      })

      const reply = await pollForReply(rpc, sessionKey, baselineCount)
      if (!reply) {
        setError('AI 未在规定时间内响应')
        return report
      }

      const aiVerdict = parseAiResponse(reply)
      if (!aiVerdict) {
        setError('AI 返回格式无法解析，使用算法评估结果')
        return report
      }

      // Merge: keep all local step metrics, override top-level judgment
      return {
        ...report,
        overallScore: aiVerdict.overallScore,
        verdict: aiVerdict.verdict,
        actionItems: aiVerdict.actionItems,
        aiEnriched: true,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      return report
    } finally {
      setEnriching(false)
    }
  }, [])

  const reset = useCallback(() => setError(null), [])

  return { enriching, error, enrich, reset }
}
