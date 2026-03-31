/**
 * SkillInvoker — shows installed Skills and lets the user trigger one
 * in the context of the current product analysis.
 *
 * Used in:
 *  - FormMode step 3 (below "AI 深度解读")
 *  - ChatMode AI mode toolbar (via skill picker dropdown)
 */
import { useState } from 'react'
import { Zap, ChevronDown, ChevronUp, Loader2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MODE_LABELS } from '../types'
import type { SelectionMode } from '../types'
import type { SkillMeta } from '../amazonSettingsStore'

interface SkillInvokerProps {
  skills: SkillMeta[]
  productName: string
  mode: SelectionMode
  market: string
  /** Optional: include a brief report summary in the invocation prompt */
  reportContext?: string
  /** Callback receives the fully-crafted invocation message */
  onInvoke: (message: string) => void
  /** True while a gateway request is in-flight */
  invoking?: boolean
  /** Result text returned by gateway */
  result?: string | null
  error?: string | null
}

function buildInvokeMessage(
  skill: SkillMeta,
  productName: string,
  mode: SelectionMode,
  market: string,
  reportContext?: string,
): string {
  const lines = [
    `请调用 Skill「${skill.name}」，对以下亚马逊产品进行专项分析：`,
    ``,
    `产品名称：${productName}`,
    `运营模式：${MODE_LABELS[mode]}`,
    `目标市场：${market}`,
  ]
  if (reportContext) {
    lines.push(``, `已有评估数据：`, reportContext)
  }
  lines.push(``, `请根据该 Skill 的功能给出具体的洞察和建议。`)
  return lines.join('\n')
}

export function SkillInvoker({
  skills,
  productName,
  mode,
  market,
  reportContext,
  onInvoke,
  invoking,
  result,
  error,
}: SkillInvokerProps) {
  const [expanded, setExpanded] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  if (skills.length === 0) return null

  const selectedSkill = skills.find((s) => s.slug === selectedSlug) ?? null

  const handleInvoke = () => {
    if (!selectedSkill) return
    const msg = buildInvokeMessage(selectedSkill, productName, mode, market, reportContext)
    onInvoke(msg)
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Zap className="h-4 w-4 text-purple-500" />
          Skill 专项分析
          <span className="text-[10px] font-normal bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full">
            {skills.length} 个可用
          </span>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
        }
      </button>

      {expanded && (
        <div className="border-t bg-muted/10 p-4 space-y-3">
          {/* Skill list */}
          <div className="grid gap-1.5">
            {skills.map((skill) => (
              <button
                key={skill.slug}
                onClick={() => setSelectedSlug(skill.slug === selectedSlug ? null : skill.slug)}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  selectedSlug === skill.slug
                    ? 'border-purple-400/60 bg-purple-50/60 dark:bg-purple-950/20'
                    : 'border-border hover:bg-muted/40'
                )}
              >
                <div className="w-7 h-7 rounded bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Package className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{skill.name}</span>
                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{skill.version}</span>
                  </div>
                  {skill.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{skill.description}</p>
                  )}
                </div>
                {selectedSlug === skill.slug && (
                  <div className="h-2 w-2 rounded-full bg-purple-500 mt-2 shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Invoke button */}
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={handleInvoke}
            disabled={!selectedSkill || invoking || !productName.trim()}
          >
            {invoking
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />分析中...</>
              : <><Zap className="h-3.5 w-3.5" />调用 {selectedSkill?.name ?? 'Skill'}</>
            }
          </Button>

          {/* Result */}
          {result && (
            <div className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 px-3 py-2.5 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {result}
            </div>
          )}
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400">⚠ {error}</div>
          )}
        </div>
      )}
    </div>
  )
}
