// 利润计算器共享参数面板 — 对齐卖家精灵 FBA 利润计算器
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ProfitInputs } from '../hooks/useProfitCalculator';
import { AMAZON_CATEGORIES } from '../data/amazonCategories';
import { MARKETS, getMarket } from '../data/marketConfig';

interface ProfitParamsPanelProps {
  inputs: ProfitInputs;
  onInputChange: <K extends keyof ProfitInputs>(key: K, value: ProfitInputs[K]) => void;
  lockedFields?: (keyof ProfitInputs)[];
  showTargetMargin?: boolean;
  targetMargin?: number;
  onTargetMarginChange?: (v: number) => void;
}

// ─── 辅助组件 ────────────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-2 text-xs font-bold text-primary"
      >
        {title}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function Field({ label, suffix, children, computed }: {
  label: string; suffix?: string; children: React.ReactNode; computed?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 flex-1">
        {suffix && <span className="text-muted-foreground text-[10px] w-4 text-right">{suffix}</span>}
        {children}
      </div>
      {computed && <span className="text-[10px] text-muted-foreground/60 w-16 text-right">{computed}</span>}
    </div>
  );
}

function NumInput({ value, onChange, disabled, placeholder, className }: {
  value: number; onChange: (v: number) => void; disabled?: boolean;
  placeholder?: string; className?: string;
}) {
  return (
    <input
      type="number"
      step="any"
      value={value || ''}
      onChange={e => onChange(Number(e.target.value) || 0)}
      disabled={disabled}
      placeholder={placeholder ?? '0'}
      className={cn(
        'h-7 w-full rounded-md border bg-background px-2 text-xs tabular-nums',
        'focus:outline-none focus:ring-1 focus:ring-primary/50',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    />
  );
}

function SelectInput({ value, onChange, options, disabled }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'h-7 w-full rounded-md border bg-background px-1 text-xs',
        'focus:outline-none focus:ring-1 focus:ring-primary/50',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function ProfitParamsPanel({
  inputs, onInputChange, lockedFields = [],
  showTargetMargin, targetMargin, onTargetMarginChange,
}: ProfitParamsPanelProps) {
  const market = getMarket(inputs.marketId);
  const locked = (key: keyof ProfitInputs) => lockedFields.includes(key);
  const sym = market.currencySymbol;

  const fmtLocal = (cny: number) => {
    const v = inputs.exchangeRate > 0 ? cny / inputs.exchangeRate : 0;
    return `${sym}${v.toFixed(2)}`;
  };

  return (
    <div className="space-y-0 text-sm">
      {/* 顶部: 站点 + 汇率 */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/40">
        <SelectInput
          value={inputs.marketId}
          onChange={v => {
            onInputChange('marketId', v);
            const m = getMarket(v);
            onInputChange('exchangeRate', m.defaultExchangeRate);
          }}
          options={MARKETS.map(m => ({ value: m.id, label: `${m.icon} ${m.name}` }))}
          disabled={locked('marketId')}
        />
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <span>汇率</span>
          <span className="text-[10px]">({market.currency}/CNY):</span>
        </div>
        <NumInput
          value={inputs.exchangeRate}
          onChange={v => onInputChange('exchangeRate', v)}
          disabled={locked('exchangeRate')}
          className="w-20"
        />
      </div>

      {/* 目标利润率 (Part 2) */}
      {showTargetMargin && (
        <div className="flex items-center gap-2 py-2 border-b border-border/40">
          <span className="text-xs font-bold text-amber-500">目标净利率</span>
          <div className="flex items-center gap-1">
            <NumInput
              value={(targetMargin ?? 0.15) * 100}
              onChange={v => onTargetMarginChange?.(v / 100)}
              className="w-16"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
      )}

      {/* 产品规格 */}
      <Section title="产品规格">
        <Field label="包装尺寸" suffix="cm">
          <div className="flex items-center gap-1 flex-1">
            <NumInput value={inputs.packageLength} onChange={v => onInputChange('packageLength', v)} disabled={locked('packageLength')} placeholder="长" />
            <span className="text-muted-foreground">×</span>
            <NumInput value={inputs.packageWidth} onChange={v => onInputChange('packageWidth', v)} disabled={locked('packageWidth')} placeholder="宽" />
            <span className="text-muted-foreground">×</span>
            <NumInput value={inputs.packageHeight} onChange={v => onInputChange('packageHeight', v)} disabled={locked('packageHeight')} placeholder="高" />
          </div>
        </Field>
        <Field label="包装重量" suffix="kg">
          <NumInput value={inputs.packageWeight} onChange={v => onInputChange('packageWeight', v)} disabled={locked('packageWeight')} />
        </Field>
        <Field label="体积重量" suffix="kg">
          <div className="flex items-center gap-1 flex-1">
            <NumInput
              value={inputs.dimDivisor > 0 ? (inputs.packageLength * inputs.packageWidth * inputs.packageHeight) / inputs.dimDivisor : 0}
              onChange={() => {}}
              disabled
            />
            <SelectInput
              value={String(inputs.dimDivisor)}
              onChange={v => onInputChange('dimDivisor', Number(v))}
              options={[{ value: '5000', label: '÷5000' }, { value: '6000', label: '÷6000' }]}
            />
          </div>
        </Field>
      </Section>

      {/* 商品收入 */}
      <Section title="商品收入">
        <Field label="商品售价" suffix={sym}>
          <NumInput value={inputs.sellingPrice} onChange={v => onInputChange('sellingPrice', v)} disabled={locked('sellingPrice')} />
        </Field>
        <Field label="买家运费" suffix={sym}>
          <NumInput value={inputs.buyerShippingFee} onChange={v => onInputChange('buyerShippingFee', v)} disabled={locked('buyerShippingFee')} />
        </Field>
      </Section>

      {/* 商品成本 */}
      <Section title="商品成本">
        <Field label="采购成本" suffix="¥" computed={fmtLocal(inputs.purchaseCost)}>
          <NumInput value={inputs.purchaseCost} onChange={v => onInputChange('purchaseCost', v)} disabled={locked('purchaseCost')} />
        </Field>
        <Field label="头程运费" suffix="¥" computed={fmtLocal(inputs.firstMileShipping)}>
          <div className="flex items-center gap-1 flex-1">
            <SelectInput
              value={inputs.firstMileMethod}
              onChange={v => onInputChange('firstMileMethod', v as 'sea' | 'air' | 'express')}
              options={[
                { value: 'sea', label: '海运' },
                { value: 'air', label: '空运' },
                { value: 'express', label: '快递' },
              ]}
            />
            <NumInput value={inputs.firstMileShipping} onChange={v => onInputChange('firstMileShipping', v)} disabled={locked('firstMileShipping')} />
          </div>
        </Field>
        <Field label="其他成本" suffix="¥" computed={fmtLocal(inputs.otherCost)}>
          <NumInput value={inputs.otherCost} onChange={v => onInputChange('otherCost', v)} disabled={locked('otherCost')} />
        </Field>
      </Section>

      {/* 营销成本 */}
      <Section title="营销成本">
        <Field label="站内广告" suffix="%">
          <NumInput
            value={inputs.ppcRate * 100}
            onChange={v => onInputChange('ppcRate', v / 100)}
            disabled={locked('ppcRate')}
          />
        </Field>
        <Field label="站内促销" suffix="%">
          <NumInput
            value={inputs.onSitePromoRate * 100}
            onChange={v => onInputChange('onSitePromoRate', v / 100)}
            disabled={locked('onSitePromoRate')}
          />
        </Field>
        <Field label="站外促销" suffix="%">
          <NumInput
            value={inputs.offSitePromoRate * 100}
            onChange={v => onInputChange('offSitePromoRate', v / 100)}
            disabled={locked('offSitePromoRate')}
          />
        </Field>
      </Section>

      {/* 售后成本 */}
      <Section title="售后成本" defaultOpen={false}>
        <Field label="退货数" suffix="件">
          <NumInput value={inputs.returnQuantity} onChange={v => onInputChange('returnQuantity', v)} disabled={locked('returnQuantity')} />
        </Field>
        <Field label="可再售数" suffix="件">
          <NumInput value={inputs.resellableReturns} onChange={v => onInputChange('resellableReturns', v)} disabled={locked('resellableReturns')} />
        </Field>
        <Field label="退货处理费" suffix={sym}>
          <NumInput value={inputs.returnProcessingFee} onChange={v => onInputChange('returnProcessingFee', v)} disabled={locked('returnProcessingFee')} />
        </Field>
        <div className="flex items-center gap-2 text-xs pl-[6.5rem]">
          <input
            type="checkbox"
            checked={inputs.isApparelShoes}
            onChange={e => onInputChange('isApparelShoes', e.target.checked)}
            disabled={locked('isApparelShoes')}
            className="rounded"
          />
          <span className="text-muted-foreground">服装和鞋靴</span>
        </div>
      </Section>

      {/* 亚马逊扣费 */}
      <Section title="亚马逊扣费">
        <Field label="商品类别">
          <SelectInput
            value={inputs.categoryId}
            onChange={v => onInputChange('categoryId', v)}
            options={AMAZON_CATEGORIES.map(c => ({
              value: c.id,
              label: `${c.nameCn} (${(c.referralRate * 100).toFixed(0)}%)`,
            }))}
            disabled={locked('categoryId')}
          />
        </Field>
        <Field label="FBA运费" suffix={sym}>
          <NumInput value={inputs.fbaFee} onChange={v => onInputChange('fbaFee', v)} disabled={locked('fbaFee')} />
        </Field>
        <Field label="关税" suffix="%">
          <NumInput
            value={inputs.tariffRate * 100}
            onChange={v => onInputChange('tariffRate', v / 100)}
            disabled={locked('tariffRate')}
          />
        </Field>
        <Field label="仓储时间" suffix="月">
          <NumInput value={inputs.storageMonths} onChange={v => onInputChange('storageMonths', v)} disabled={locked('storageMonths')} />
        </Field>
      </Section>

      {/* 销量 */}
      <Section title="销量">
        <Field label="销量" suffix="件">
          <NumInput value={inputs.salesVolume} onChange={v => onInputChange('salesVolume', v)} disabled={locked('salesVolume')} />
        </Field>
      </Section>
    </div>
  );
}
