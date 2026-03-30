import { useState } from 'react'
import { Database, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DataInput } from '../types'

const TYPE_LABELS: Record<DataInput['type'], string> = {
  'search-volume': '搜索量/供需比',
  'competitor': '竞品评论分布',
  'logistics': '头程物流报价',
  'ip-check': '知识产权查询',
  'custom': '自定义数据',
}

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动',
  mcp: 'MCP',
  saved: '已保存',
}

interface DataPanelProps {
  inputs: DataInput[]
  collapsed: boolean
  onToggle: () => void
  onAdd: (type: DataInput['type']) => void
  onFetch: (type: DataInput['type']) => void
  onContentChange?: (type: DataInput['type'], content: string) => void
}

export function DataPanel({ inputs, collapsed, onToggle, onAdd, onFetch, onContentChange }: DataPanelProps) {
  const [expandedSet, setExpandedSet] = useState<Set<DataInput['type']>>(new Set())

  const toggleExpand = (type: DataInput['type']) => {
    setExpandedSet((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }
  const loaded = inputs.filter((d) => d.source)
  const missing = inputs.filter((d) => d.required && !d.source)

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 gap-3 w-10 border-r bg-muted/20 shrink-0">
        <button
          onClick={onToggle}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="展开数据面板"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="relative" title={`${loaded.length} 项已加载`}>
          <Database className="h-4 w-4 text-muted-foreground" />
          {loaded.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary rounded-full text-[9px] text-primary-foreground flex items-center justify-center font-bold">
              {loaded.length}
            </span>
          )}
        </div>
        {missing.length > 0 && (
          <div
            className="w-2 h-2 rounded-full bg-yellow-500 mt-0.5"
            title={`${missing.length} 项数据缺失`}
          />
        )}
      </div>
    )
  }

  return (
    <div className="w-52 shrink-0 border-r bg-muted/10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <div className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground/80">数据来源</span>
        </div>
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Data Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {inputs.map((item, i) => (
          <div
            key={i}
            className={cn(
              'rounded-lg px-2.5 py-2 text-xs border',
              item.source
                ? 'bg-card border-border'
                : item.required
                ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800'
                : 'bg-muted/30 border-dashed border-border/60'
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={cn('font-medium', item.source ? 'text-foreground/80' : 'text-muted-foreground')}>
                {TYPE_LABELS[item.type]}
              </span>
              <div className="flex items-center gap-1">
                {item.required && !item.source && (
                  <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium">缺失</span>
                )}
                {item.source && (
                  <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                    {SOURCE_LABELS[item.source]} ✓
                  </span>
                )}
                {item.source === 'manual' && onContentChange && (
                  <button
                    onClick={() => toggleExpand(item.type)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {expandedSet.has(item.type)
                      ? <ChevronUp className="h-3 w-3" />
                      : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>
            {!item.source && (
              <div className="flex gap-1 mt-1.5">
                <button
                  onClick={() => { onAdd(item.type); if (onContentChange) toggleExpand(item.type) }}
                  className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-2.5 w-2.5" /> 粘贴
                </button>
                <button
                  onClick={() => onFetch(item.type)}
                  className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                >
                  <Zap className="h-2.5 w-2.5" /> 抓取
                </button>
              </div>
            )}
            {item.source === 'manual' && expandedSet.has(item.type) && onContentChange && (
              <textarea
                value={item.content ?? ''}
                onChange={(e) => onContentChange(item.type, e.target.value)}
                className="w-full mt-1.5 text-[10px] font-mono p-1.5 rounded bg-background border border-border resize-none min-h-[56px] focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="粘贴原始数据..."
              />
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      {missing.length > 0 && (
        <div className="px-3 py-2 border-t bg-yellow-50/50 dark:bg-yellow-950/10">
          <p className="text-[11px] text-yellow-700 dark:text-yellow-400">
            ⚠ {missing.length} 项缺失将降低报告置信度
          </p>
        </div>
      )}
    </div>
  )
}
