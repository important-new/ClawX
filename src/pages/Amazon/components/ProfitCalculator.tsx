// FBA 利润计算器 — 对齐卖家精灵布局 (左输入 + 右结果)
import { useProfitCalculator, type Viability } from '../hooks/useProfitCalculator';
import { getMarket } from '../data/marketConfig';
import { ProfitParamsPanel } from './ProfitParamsPanel';

const VIABILITY_STYLES: Record<Viability, { bg: string; text: string; label: string }> = {
  viable: { bg: 'bg-green-500/10 border-green-700/30', text: 'text-green-400', label: '可行' },
  caution: { bg: 'bg-amber-500/10 border-amber-700/30', text: 'text-amber-400', label: '待验证' },
  'not-viable': { bg: 'bg-red-500/10 border-red-700/30', text: 'text-red-400', label: '不建议' },
};

function DualCurrency({ local, cny, sym, rate }: {
  local: number; cny?: number; sym: string; rate: number;
}) {
  const cnyVal = cny ?? local * rate;
  return (
    <div className="flex items-baseline gap-2">
      <span className="tabular-nums font-semibold">{sym}{local.toFixed(2)}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums">¥{cnyVal.toFixed(2)}</span>
    </div>
  );
}

function ResultRow({ label, local, sym, rate, indent, bold }: {
  label: string; local: number; sym: string; rate: number;
  indent?: boolean; bold?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-0.5 text-xs ${indent ? 'pl-3' : ''}`}>
      <span className={`text-muted-foreground ${bold ? 'font-bold text-foreground' : ''}`}>{label}</span>
      <DualCurrency local={local} sym={sym} rate={rate} />
    </div>
  );
}

function SeasonRow({ label, janSep, octDec, sym, rate, isPercent }: {
  label: string; janSep: number; octDec: number; sym: string; rate: number;
  isPercent?: boolean;
}) {
  const fmt = (v: number) => isPercent ? `${(v * 100).toFixed(2)}%` : `${sym}${v.toFixed(2)}`;
  const fmtCny = (v: number) => isPercent ? '' : `¥${(v * rate).toFixed(2)}`;
  return (
    <div className="text-xs space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="font-bold">{label}</span>
      </div>
      <div className="flex items-center justify-between pl-3">
        <span className="text-muted-foreground">1-9月:</span>
        <div className="flex items-baseline gap-2">
          <span className="tabular-nums font-semibold">{fmt(janSep)}</span>
          {!isPercent && <span className="text-[10px] text-muted-foreground tabular-nums">{fmtCny(janSep)}</span>}
        </div>
      </div>
      <div className="flex items-center justify-between pl-3">
        <span className="text-muted-foreground">10-12月:</span>
        <div className="flex items-baseline gap-2">
          <span className="tabular-nums font-semibold">{fmt(octDec)}</span>
          {!isPercent && <span className="text-[10px] text-muted-foreground tabular-nums">{fmtCny(octDec)}</span>}
        </div>
      </div>
    </div>
  );
}

export function ProfitCalculator() {
  const { inputs, updateInput, result, viability } = useProfitCalculator();
  const market = getMarket(inputs.marketId);
  const sym = market.currencySymbol;
  const rate = inputs.exchangeRate;
  const style = VIABILITY_STYLES[viability];

  return (
    <div className="rounded-2xl border bg-card">
      {/* 标题 */}
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <h3 className="text-sm font-bold">FBA 利润计算器</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${style.bg} ${style.text}`}>
          {style.label}
        </span>
      </div>

      {/* 左右布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/40">
        {/* 左: 参数输入 */}
        <div className="p-4 max-h-[600px] overflow-y-auto custom-scrollbar">
          <ProfitParamsPanel inputs={inputs} onInputChange={updateInput} />
        </div>

        {/* 右: 计算结果 */}
        <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">计算结果</h4>

          {/* 净利润/净利率/ROI (分季) */}
          <div className={`rounded-xl border p-3 space-y-3 ${style.bg}`}>
            <SeasonRow label="净利润" janSep={result.netProfitJanSep} octDec={result.netProfitOctDec} sym={sym} rate={rate} />
            <SeasonRow label="净利率" janSep={result.netMarginJanSep} octDec={result.netMarginOctDec} sym={sym} rate={rate} isPercent />
            <SeasonRow label="ROI" janSep={result.roiJanSep} octDec={result.roiOctDec} sym={sym} rate={rate} isPercent />
          </div>

          {/* 收入小计 */}
          <div className="space-y-1">
            <ResultRow label="收入小计" local={result.totalRevenue} sym={sym} rate={rate} bold />
            <ResultRow label="商品售价" local={inputs.sellingPrice * inputs.salesVolume} sym={sym} rate={rate} indent />
            <ResultRow label="商品运费" local={inputs.buyerShippingFee * inputs.salesVolume} sym={sym} rate={rate} indent />
          </div>

          <div className="border-t border-border/30" />

          {/* 成本小计 (分季) */}
          <SeasonRow label="成本小计" janSep={result.totalCostJanSep} octDec={result.totalCostOctDec} sym={sym} rate={rate} />

          {/* 成本明细 */}
          <div className="space-y-1">
            <ResultRow label="采购成本" local={result.purchaseCostLocal * inputs.salesVolume} sym={sym} rate={rate} indent />
            <ResultRow label="头程运费" local={result.firstMileLocal * inputs.salesVolume} sym={sym} rate={rate} indent />
            <ResultRow label="其他成本" local={result.otherCostLocal * inputs.salesVolume} sym={sym} rate={rate} indent />
            <ResultRow label="站内广告" local={result.ppcCost * inputs.salesVolume} sym={sym} rate={rate} indent />
            <ResultRow label="站内促销" local={result.onSitePromoCost * inputs.salesVolume} sym={sym} rate={rate} indent />
            <ResultRow label="站外促销" local={result.offSitePromoCost * inputs.salesVolume} sym={sym} rate={rate} indent />
            <ResultRow label="售后成本" local={result.afterSalesCost} sym={sym} rate={rate} indent />
            <ResultRow label="销售佣金" local={result.referralFee * inputs.salesVolume} sym={sym} rate={rate} indent />
            <ResultRow label="FBA运费" local={inputs.fbaFee * inputs.salesVolume} sym={sym} rate={rate} indent />
            <ResultRow label="关税" local={result.tariffCost * inputs.salesVolume} sym={sym} rate={rate} indent />
            <SeasonRow label="仓储费用" janSep={result.storageFeeJanSep} octDec={result.storageFeeOctDec} sym={sym} rate={rate} />
          </div>
        </div>
      </div>
    </div>
  );
}
