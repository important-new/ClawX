// src/pages/Amazon/components/ProfitSimulator.tsx
import { useProfitCalculator, type Viability } from '../hooks/useProfitCalculator';

const VIABILITY_STYLES: Record<Viability, { bg: string; text: string; label: string }> = {
  viable: { bg: 'bg-green-500/10 border-green-700', text: 'text-green-400', label: '可行' },
  caution: { bg: 'bg-amber-500/10 border-amber-700', text: 'text-amber-400', label: '待验证' },
  'not-viable': { bg: 'bg-red-500/10 border-red-700', text: 'text-red-400', label: '不建议' },
};

function SliderInput({ label, value, onChange, min, max, step, suffix }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; suffix: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-200">{suffix === '%' ? `${(value * 100).toFixed(0)}%` : `$${value.toFixed(2)}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
    </div>
  );
}

export function ProfitSimulator({ sellingPrice, monthlyUnits }: {
  sellingPrice: number; monthlyUnits: number;
}) {
  const { inputs, updateInput, result, viability } = useProfitCalculator(sellingPrice, monthlyUnits);
  const style = VIABILITY_STYLES[viability];

  return (
    <div className={`rounded-xl border p-4 ${style.bg}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-200">利润模拟</h4>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.text}`}>
          {style.label}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <SliderInput label="采购成本" value={inputs.costPrice}
          onChange={(v) => updateInput('costPrice', v)}
          min={1} max={sellingPrice * 0.8} step={0.5} suffix="$" />
        <SliderInput label="头程运费" value={inputs.shippingCost}
          onChange={(v) => updateInput('shippingCost', v)}
          min={1} max={20} step={0.5} suffix="$" />
        <SliderInput label="PPC 日预算" value={inputs.ppcDailyBudget}
          onChange={(v) => updateInput('ppcDailyBudget', v)}
          min={5} max={100} step={5} suffix="$" />
        <SliderInput label="目标 ACoS" value={inputs.targetAcos}
          onChange={(v) => updateInput('targetAcos', v)}
          min={0.1} max={0.6} step={0.05} suffix="%" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-zinc-800/50 p-2">
          <div className="text-zinc-500">单件毛利</div>
          <div className={`text-lg font-semibold ${result.unitProfit > 0 ? 'text-green-300' : 'text-red-300'}`}>
            ${result.unitProfit.toFixed(2)}
          </div>
          <div className="text-zinc-500">毛利率 {(result.grossMarginRate * 100).toFixed(1)}%</div>
        </div>
        <div className="rounded-lg bg-zinc-800/50 p-2">
          <div className="text-zinc-500">月利润</div>
          <div className={`text-lg font-semibold ${result.monthlyProfit > 0 ? 'text-green-300' : 'text-red-300'}`}>
            ${result.monthlyProfit.toFixed(0)}
          </div>
          <div className="text-zinc-500">ROI {(result.roi * 100).toFixed(0)}%</div>
        </div>
        <div className="col-span-2 rounded-lg bg-zinc-800/50 p-2">
          <div className="text-zinc-500">盈亏平衡</div>
          <div className="text-sm text-zinc-200">
            日均 {result.breakevenDailyUnits === Infinity ? 'N/A' : result.breakevenDailyUnits.toFixed(1)} 单
          </div>
        </div>
      </div>
    </div>
  );
}
