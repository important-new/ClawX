// src/pages/Amazon/components/PipelineFilterForm.tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ─── Field type definitions ──────────────────────────────────────────────────

type FieldType = 'range' | 'range-pct' | 'range-usd' | 'range-weight' | 'select' | 'text' | 'checkbox' | 'radio' | 'checkbox-group';

interface FilterFieldBase {
  label: string;
  type: FieldType;
}

interface RangeField extends FilterFieldBase {
  type: 'range' | 'range-pct' | 'range-usd' | 'range-weight';
  keyMin: string;
  keyMax: string;
}

interface SelectField extends FilterFieldBase {
  type: 'select';
  key: string;
  options: string[];
}

interface TextField extends FilterFieldBase {
  type: 'text';
  key: string;
  placeholder?: string;
}

interface CheckboxField extends FilterFieldBase {
  type: 'checkbox';
  key: string;
}

interface RadioField extends FilterFieldBase {
  type: 'radio';
  key: string;
  options: string[];
}

interface CheckboxGroupField extends FilterFieldBase {
  type: 'checkbox-group';
  items: { key: string; label: string }[];
}

type FilterField = RangeField | SelectField | TextField | CheckboxField | RadioField | CheckboxGroupField;

interface FilterGroup {
  id: string;
  title: string;
  phase?: number;
  fields: FilterField[];
}

// ─── SellerSprite-aligned filter groups ───────────────────────────────────────

const LISTING_AGE_OPTIONS = [
  '不限', '近30天', '近60天', '近3个月', '近半年',
  '近1年', '近2年', '近1~2年', '近3年', '近4年', '近3~4年', '4年以上',
];

const PKG_SIZE_OPTIONS = ['不限', '标准', '大件', '超大件'];

const MONTH_OPTIONS = (() => {
  const opts = ['最近30天'];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return opts;
})();

const VIDEO_OPTIONS = ['不限', '含视频', '不含视频'];
const KEYWORD_MATCH_OPTIONS = ['模糊匹配', '词组匹配', '精准匹配'];

const PHASE1_GROUPS: FilterGroup[] = [
  {
    id: 'month',
    title: '选择月份',
    fields: [
      { label: '月份', type: 'select', key: 'month', options: MONTH_OPTIONS },
    ],
  },
  {
    id: 'sales',
    title: '销售表现',
    fields: [
      { label: '月销量', type: 'range', keyMin: 'monthly_sales_min', keyMax: 'monthly_sales_max' },
      { label: '月销售额', type: 'range-usd', keyMin: 'monthly_revenue_min', keyMax: 'monthly_revenue_max' },
      { label: '子体销量', type: 'range', keyMin: 'child_sales_min', keyMax: 'child_sales_max' },
      { label: '月销量增长率', type: 'range-pct', keyMin: 'sales_growth_min', keyMax: 'sales_growth_max' },
      { label: 'BSR', type: 'range', keyMin: 'bsr_min', keyMax: 'bsr_max' },
      { label: '小类BSR', type: 'range', keyMin: 'sub_bsr_min', keyMax: 'sub_bsr_max' },
      { label: '只看该子类目排名', type: 'checkbox', key: 'sub_category_only' },
      { label: 'BSR增长数', type: 'range', keyMin: 'bsr_growth_num_min', keyMax: 'bsr_growth_num_max' },
      { label: 'BSR增长率', type: 'range-pct', keyMin: 'bsr_growth_rate_min', keyMax: 'bsr_growth_rate_max' },
    ],
  },
  {
    id: 'product',
    title: '产品信息',
    fields: [
      { label: '变体数', type: 'range', keyMin: 'variants_min', keyMax: 'variants_max' },
      { label: '价格', type: 'range-usd', keyMin: 'price_min', keyMax: 'price_max' },
      { label: 'Q&A', type: 'range', keyMin: 'qa_min', keyMax: 'qa_max' },
      { label: '评分数', type: 'range', keyMin: 'review_count_min', keyMax: 'review_count_max' },
      { label: '月评新增', type: 'range', keyMin: 'monthly_reviews_min', keyMax: 'monthly_reviews_max' },
      { label: '评分值', type: 'range', keyMin: 'rating_min', keyMax: 'rating_max' },
      { label: '留评率', type: 'range-pct', keyMin: 'review_rate_min', keyMax: 'review_rate_max' },
      { label: 'FBA运费', type: 'range-usd', keyMin: 'fba_fee_min', keyMax: 'fba_fee_max' },
      { label: '毛利率', type: 'range-pct', keyMin: 'gross_margin_min', keyMax: 'gross_margin_max' },
      { label: '上架时间', type: 'select', key: 'listing_age', options: LISTING_AGE_OPTIONS },
      { label: 'LQS', type: 'range', keyMin: 'lqs_min', keyMax: 'lqs_max' },
      { label: '包装重量', type: 'range-weight', keyMin: 'pkg_weight_min', keyMax: 'pkg_weight_max' },
      { label: '包装尺寸', type: 'select', key: 'pkg_size', options: PKG_SIZE_OPTIONS },
      { label: '买家运费', type: 'range-usd', keyMin: 'buyer_shipping_min', keyMax: 'buyer_shipping_max' },
      { label: '低价商品', type: 'checkbox', key: 'low_price' },
    ],
  },
  {
    id: 'compete',
    title: '竞品筛选',
    fields: [
      { label: '卖家数量', type: 'range', keyMin: 'seller_count_min', keyMax: 'seller_count_max' },
      { label: '卖家所属地', type: 'text', key: 'seller_location', placeholder: '如: 中国,美国' },
      { label: '包含品牌', type: 'text', key: 'include_brand', placeholder: '多个以英文逗号区分' },
      { label: '排除品牌', type: 'text', key: 'exclude_brand', placeholder: '多个以英文逗号区分' },
      { label: '包含卖家', type: 'text', key: 'include_seller', placeholder: '多个以英文逗号区分' },
      { label: '排除卖家', type: 'text', key: 'exclude_seller', placeholder: '多个以英文逗号区分' },
      { label: '排除关键词', type: 'text', key: 'exclude_keyword', placeholder: '多个以英文逗号区分' },
      { label: '包含关键词', type: 'text', key: 'include_keyword', placeholder: '多个以英文逗号区分' },
      { label: '关键词匹配', type: 'radio', key: 'keyword_match', options: KEYWORD_MATCH_OPTIONS },
      { label: '配送方式', type: 'checkbox-group', items: [
        { key: 'amz', label: 'AMZ' },
        { key: 'fba', label: 'FBA' },
        { key: 'fbm', label: 'FBM' },
      ]},
      { label: '主图视频', type: 'radio', key: 'video', options: VIDEO_OPTIONS },
      { label: '商品标识', type: 'text', key: 'product_tags', placeholder: 'BestSeller,AmazonChoice,NewRelease,A+' },
    ],
  },
];

const PHASE2_5_GROUPS: FilterGroup[] = [
  {
    id: 'phase2',
    title: 'Phase 2 — 卖家筛选',
    phase: 2,
    fields: [
      { label: '最大历史评价数', type: 'range', keyMin: '_skip', keyMax: 'max_seller_reviews' },
    ],
  },
  {
    id: 'phase3',
    title: 'Phase 3 — 店铺筛选',
    phase: 3,
    fields: [
      { label: '最少店铺商品数', type: 'range', keyMin: 'min_store_listing_count', keyMax: '_skip' },
      { label: '成熟产品比例上限', type: 'range', keyMin: '_skip', keyMax: 'max_high_sales_ratio' },
      { label: '高销量阈值', type: 'range', keyMin: 'high_sales_threshold', keyMax: '_skip' },
    ],
  },
  {
    id: 'phase4',
    title: 'Phase 4 — 产品详情筛选',
    phase: 4,
    fields: [
      { label: '上架评论数上限', type: 'range', keyMin: '_skip', keyMax: 'max_launch_reviews' },
      { label: '评论跳涨次数上限', type: 'range', keyMin: '_skip', keyMax: 'max_review_jumps' },
      { label: '跳涨检测阈值', type: 'range', keyMin: 'review_jump_threshold', keyMax: '_skip' },
      { label: '3 月评论最少', type: 'range', keyMin: 'min_3m_reviews', keyMax: '_skip' },
      { label: '3 月评论最多', type: 'range', keyMin: '_skip', keyMax: 'max_3m_reviews' },
    ],
  },
  {
    id: 'phase5',
    title: 'Phase 5 — 关键词筛选',
    phase: 5,
    fields: [
      { label: 'PPC 最小值上限 ($)', type: 'range', keyMin: '_skip', keyMax: 'max_min_ppc' },
      { label: '竞品评论数上限', type: 'range', keyMin: '_skip', keyMax: 'max_comp_reviews' },
    ],
  },
];

// ─── Field renderers ─────────────────────────────────────────────────────────

function RangeInput({ field, filters, onChange, suffix }: {
  field: RangeField; filters: Record<string, any>;
  onChange: (key: string, value: any) => void; suffix?: string;
}) {
  const showMin = field.keyMin !== '_skip';
  const showMax = field.keyMax !== '_skip';

  return (
    <div className="flex items-center gap-1.5">
      {showMin ? (
        <div className="relative flex-1">
          <Input
            type="number"
            placeholder="最小值"
            value={filters[field.keyMin] ?? ''}
            onChange={(e) => onChange(field.keyMin, e.target.value === '' ? null : parseFloat(e.target.value))}
            className="h-8 rounded-lg text-xs bg-background pr-6"
          />
          {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>}
        </div>
      ) : <div className="flex-1" />}
      {showMin && showMax && <span className="text-xs text-muted-foreground shrink-0">~</span>}
      {showMax ? (
        <div className="relative flex-1">
          <Input
            type="number"
            placeholder="最大值"
            value={filters[field.keyMax] ?? ''}
            onChange={(e) => onChange(field.keyMax, e.target.value === '' ? null : parseFloat(e.target.value))}
            className="h-8 rounded-lg text-xs bg-background pr-6"
          />
          {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>}
        </div>
      ) : <div className="flex-1" />}
    </div>
  );
}

function FieldRenderer({ field, filters, onChange }: {
  field: FilterField; filters: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  switch (field.type) {
    case 'range':
      return <RangeInput field={field} filters={filters} onChange={onChange} />;
    case 'range-pct':
      return <RangeInput field={field} filters={filters} onChange={onChange} suffix="%" />;
    case 'range-usd':
      return <RangeInput field={field} filters={filters} onChange={onChange} suffix="$" />;
    case 'range-weight':
      return <RangeInput field={field} filters={filters} onChange={onChange} suffix="g" />;

    case 'select': {
      const f = field as SelectField;
      return (
        <select
          value={filters[f.key] ?? ''}
          onChange={(e) => onChange(f.key, e.target.value || null)}
          className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
        >
          <option value="">不限</option>
          {f.options.filter(o => o !== '不限').map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }

    case 'text': {
      const f = field as TextField;
      return (
        <Input
          type="text"
          placeholder={f.placeholder}
          value={filters[f.key] ?? ''}
          onChange={(e) => onChange(f.key, e.target.value || null)}
          className="h-8 rounded-lg text-xs bg-background"
        />
      );
    }

    case 'checkbox': {
      const f = field as CheckboxField;
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!filters[f.key]}
            onChange={(e) => onChange(f.key, e.target.checked)}
            className="rounded border-muted-foreground"
          />
          <span className="text-xs text-muted-foreground">{f.label}</span>
        </label>
      );
    }

    case 'radio': {
      const f = field as RadioField;
      return (
        <div className="flex flex-wrap gap-2">
          {f.options.map((o) => (
            <label key={o} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name={f.key}
                checked={filters[f.key] === o}
                onChange={() => onChange(f.key, o)}
                className="accent-primary"
              />
              <span className="text-xs">{o}</span>
            </label>
          ))}
        </div>
      );
    }

    case 'checkbox-group': {
      const f = field as CheckboxGroupField;
      return (
        <div className="flex flex-wrap gap-3">
          {f.items.map((item) => (
            <label key={item.key} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters[item.key]}
                onChange={(e) => onChange(item.key, e.target.checked)}
                className="rounded border-muted-foreground"
              />
              <span className="text-xs">{item.label}</span>
            </label>
          ))}
        </div>
      );
    }
  }
}

// ─── Collapsible group component ─────────────────────────────────────────────

function FilterGroupPanel({ group, filters, onChange, isExpanded, onToggle, disabled }: {
  group: FilterGroup; filters: Record<string, any>;
  onChange: (key: string, value: any) => void;
  isExpanded: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all',
      disabled ? 'bg-muted/20 opacity-50 pointer-events-none' : 'bg-card'
    )}>
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <span className="text-sm font-bold">{group.title}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
      </button>
      {isExpanded && (
        <div className="px-5 pb-5 pt-1 border-t border-dashed space-y-3 bg-muted/5">
          {group.fields.map((field) => {
            // Checkbox and checkbox-group render inline (no separate label row)
            if (field.type === 'checkbox') {
              return (
                <div key={(field as CheckboxField).key}>
                  <FieldRenderer field={field} filters={filters} onChange={onChange} />
                </div>
              );
            }
            return (
              <div key={'key' in field ? field.key : (field as RangeField).keyMin}>
                <div className="text-[11px] font-bold text-muted-foreground mb-1">{field.label}</div>
                <FieldRenderer field={field} filters={filters} onChange={onChange} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface PipelineFilterFormProps {
  filters: Record<string, any>;
  onFilterChange: (key: string, value: any) => void;
  enabledPhases: number[];
}

export function PipelineFilterForm({ filters, onFilterChange, enabledPhases }: PipelineFilterFormProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['sales']));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Phase 1: SellerSprite-aligned groups */}
      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-2">
        Phase 1 — 搜索条件 (SellerSprite)
      </div>
      {PHASE1_GROUPS.map((g) => (
        <FilterGroupPanel
          key={g.id}
          group={g}
          filters={filters}
          onChange={onFilterChange}
          isExpanded={expanded.has(g.id)}
          onToggle={() => toggle(g.id)}
        />
      ))}

      {/* Phase 2-5 groups */}
      {PHASE2_5_GROUPS.map((g) => (
        <FilterGroupPanel
          key={g.id}
          group={g}
          filters={filters}
          onChange={onFilterChange}
          isExpanded={expanded.has(g.id)}
          onToggle={() => toggle(g.id)}
          disabled={g.phase !== undefined && !enabledPhases.includes(g.phase)}
        />
      ))}
    </div>
  );
}
