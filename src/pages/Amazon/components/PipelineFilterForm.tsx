import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FilterGroup {
  phase: number;
  title: string;
  fields: FilterField[];
}

interface FilterField {
  key: string;
  label: string;
  type: 'number' | 'string';
  step?: number;
  min?: number;
  max?: number;
  help?: string;
}

const FILTER_GROUPS: FilterGroup[] = [
  {
    phase: 1,
    title: 'Phase 1 — 搜索条件',
    fields: [
      { key: 's1_min_sales', label: '最低月销量', type: 'number', min: 0 },
      { key: 's1_min_price', label: '最低价格 ($)', type: 'number', min: 0 },
      { key: 's1_max_price', label: '最高价格 ($)', type: 'number', min: 0 },
      { key: 's1_min_rating', label: '最低评分', type: 'number', min: 0, max: 5, step: 0.1 },
      { key: 's1_max_new_months', label: '新品月数上限', type: 'number', min: 1 },
    ],
  },
  {
    phase: 2,
    title: 'Phase 2 — 卖家筛选',
    fields: [
      { key: 'max_seller_reviews', label: '最大历史评价数', type: 'number', min: 0, help: '筛选小卖家：排除评价数过高的老牌卖家' },
    ],
  },
  {
    phase: 3,
    title: 'Phase 3 — 店铺筛选',
    fields: [
      { key: 'min_store_listing_count', label: '最少店铺商品数', type: 'number', min: 1 },
      { key: 'max_high_sales_ratio', label: '成熟产品比例上限', type: 'number', min: 0, max: 1, step: 0.05, help: '高销量产品占比不超过此值' },
      { key: 'high_sales_threshold', label: '高销量阈值', type: 'number', min: 0, help: '月销量超过此值视为高销量' },
    ],
  },
  {
    phase: 4,
    title: 'Phase 4 — 产品详情筛选',
    fields: [
      { key: 'max_launch_reviews', label: '上架评论数上限', type: 'number', min: 0 },
      { key: 'max_review_jumps', label: '评论跳涨次数上限', type: 'number', min: 0 },
      { key: 'review_jump_threshold', label: '跳涨检测阈值', type: 'number', min: 1 },
      { key: 'min_3m_reviews', label: '3 月评论最少', type: 'number', min: 0 },
      { key: 'max_3m_reviews', label: '3 月评论最多', type: 'number', min: 0 },
    ],
  },
  {
    phase: 5,
    title: 'Phase 5 — 关键词筛选',
    fields: [
      { key: 'max_min_ppc', label: 'PPC 最小值上限 ($)', type: 'number', min: 0, step: 0.1, help: '广告成本：排除 PPC 过高的品类' },
      { key: 'max_comp_reviews', label: '竞品评论数上限', type: 'number', min: 0, help: '排除评论数过高的竞品' },
    ],
  },
];

interface PipelineFilterFormProps {
  filters: Record<string, any>;
  onFilterChange: (key: string, value: any) => void;
  enabledPhases: number[];
}

export function PipelineFilterForm({ filters, onFilterChange, enabledPhases }: PipelineFilterFormProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set([1]));

  const toggleGroup = (phase: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {FILTER_GROUPS.map((group) => {
        const isEnabled = enabledPhases.includes(group.phase);
        const isExpanded = expandedGroups.has(group.phase);

        return (
          <div
            key={group.phase}
            className={cn(
              'rounded-2xl border overflow-hidden transition-all',
              isEnabled ? 'bg-card' : 'bg-muted/20 opacity-50 pointer-events-none'
            )}
          >
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              onClick={() => toggleGroup(group.phase)}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold',
                  isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  {group.phase}
                </div>
                <span className="text-sm font-bold">{group.title}</span>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isExpanded && 'rotate-180'
                )}
              />
            </button>

            {isExpanded && (
              <div className="px-5 pb-5 pt-1 border-t border-dashed grid grid-cols-2 gap-x-6 gap-y-4 bg-muted/5">
                {group.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] font-bold text-muted-foreground truncate">
                        {field.label}
                      </label>
                      {field.help && (
                        <div className="group relative">
                          <div className="w-3.5 h-3.5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[9px] font-bold cursor-help">?</div>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal w-44 z-50 pointer-events-none">
                            {field.help}
                          </div>
                        </div>
                      )}
                    </div>
                    <Input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={filters[field.key] ?? ''}
                      onChange={(e) => {
                        const val = field.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                        onFilterChange(field.key, isNaN(val as number) ? 0 : val);
                      }}
                      step={field.step}
                      min={field.min}
                      max={field.max}
                      className="h-10 rounded-xl text-xs bg-background"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
