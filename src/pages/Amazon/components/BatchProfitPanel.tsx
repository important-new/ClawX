// 批量采购价评估面板 — 复用 ProfitParamsPanel, 调用 Python profit_calculator.py
import { useState } from 'react';
import { Loader2, Download, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProfitParamsPanel } from './ProfitParamsPanel';
import type { ProfitInputs } from '../hooks/useProfitCalculator';
import { runAmazonProfitCalculator } from '@/lib/host-api';

interface BatchProduct {
  num: string;
  asin: string;
  name: string;
  price: number;
  fba: number;
  sales: number;
  category: string;
  referral_rate: number;
  purchase_cny: number;
  purchase_usd: number;
  monthly_profit_low: number;
  viable: boolean;
  dims: string;
}

interface BatchProfitPanelProps {
  sessionName: string;
}

// Part 2 模式: 产品相关字段锁定, 只编辑费率参数
const LOCKED_FIELDS: (keyof ProfitInputs)[] = [
  'sellingPrice', 'fbaFee', 'salesVolume',
  'packageLength', 'packageWidth', 'packageHeight', 'packageWeight',
  'buyerShippingFee',
];

const DEFAULT_PARAMS: ProfitInputs = {
  marketId: 'us',
  exchangeRate: 6.8363,
  packageLength: 0,
  packageWidth: 0,
  packageHeight: 0,
  packageWeight: 0,
  dimDivisor: 5000,
  sellingPrice: 0,
  buyerShippingFee: 0,
  purchaseCost: 0,
  firstMileShipping: 0,
  firstMileMethod: 'sea',
  otherCost: 0,
  ppcRate: 0.10,
  onSitePromoRate: 0,
  offSitePromoRate: 0,
  returnQuantity: 0,
  resellableReturns: 0,
  returnProcessingFee: 0,
  isApparelShoes: false,
  categoryId: 'home_kitchen',
  fbaFee: 0,
  tariffRate: 0,
  storageMonths: 1.5,
  salesVolume: 0,
};

export function BatchProfitPanel({ sessionName }: BatchProfitPanelProps) {
  const [params, setParams] = useState<ProfitInputs>(DEFAULT_PARAMS);
  const [targetMargin, setTargetMargin] = useState(0.15);
  const [products, setProducts] = useState<BatchProduct[]>([]);
  const [summary, setSummary] = useState<{ total: number; viable: number; not_viable: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateParam = <K extends keyof ProfitInputs>(key: K, value: ProfitInputs[K]) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const runCalculation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runAmazonProfitCalculator({
        sessionName,
        margin: targetMargin,
        ppcRate: params.ppcRate,
        onsitePromo: params.onSitePromoRate,
        offsitePromo: params.offSitePromoRate,
        tariff: params.tariffRate,
        exchangeRate: params.exchangeRate,
        storageMonths: params.storageMonths,
        otherCostCny: params.otherCost,
        returnRate: params.returnQuantity > 0 && params.salesVolume > 0
          ? params.returnQuantity / params.salesVolume
          : 0,
        resellableRatio: params.resellableReturns > 0 && params.returnQuantity > 0
          ? params.resellableReturns / params.returnQuantity
          : 0.5,
        returnFee: params.returnProcessingFee,
        buyerShipping: params.buyerShippingFee,
      });

      if (res.success && res.products) {
        setProducts(res.products as BatchProduct[]);
        setSummary(res.summary ?? null);
      } else {
        setError(res.error ?? '计算失败');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!products.length) return;
    const headers = ['#', 'ASIN', '产品名', '售价$', 'FBA$', '月销', '类别', '佣金%', '采购上限¥', '采购上限$', '月利润$', '状态'];
    const rows = products.map(p => [
      p.num, p.asin, `"${p.name}"`, p.price, p.fba, p.sales,
      `"${p.category}"`, (p.referral_rate * 100).toFixed(0),
      p.purchase_cny.toFixed(1), p.purchase_usd.toFixed(2),
      p.monthly_profit_low.toFixed(0), p.viable ? 'OK' : 'X',
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit_${sessionName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <h3 className="text-sm font-bold">批量采购价评估</h3>
        {summary && (
          <span className="text-[10px] text-muted-foreground">
            共 {summary.total} 款 | 可行 {summary.viable} | 不可行 {summary.not_viable}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/40">
        {/* 左: 参数面板 (复用) */}
        <div className="p-4 max-h-[600px] overflow-y-auto custom-scrollbar space-y-3">
          <ProfitParamsPanel
            inputs={params}
            onInputChange={updateParam}
            lockedFields={LOCKED_FIELDS}
            showTargetMargin
            targetMargin={targetMargin}
            onTargetMarginChange={setTargetMargin}
          />

          <Button
            onClick={runCalculation}
            disabled={loading}
            className="w-full h-10 rounded-xl font-bold"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />计算中...</>
            ) : (
              <><Calculator className="h-4 w-4 mr-2" />开始计算</>
            )}
          </Button>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">{error}</p>
          )}
        </div>

        {/* 右: 结果表格 */}
        <div className="p-4 max-h-[600px] overflow-y-auto custom-scrollbar">
          {products.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              配置参数后点击"开始计算"
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">评估结果</h4>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={exportCsv}>
                  <Download className="h-3 w-3 mr-1" />导出 CSV
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-1.5 px-2 text-left">#</th>
                      <th className="py-1.5 px-2 text-left">ASIN</th>
                      <th className="py-1.5 px-2 text-right">售价$</th>
                      <th className="py-1.5 px-2 text-right">FBA$</th>
                      <th className="py-1.5 px-2 text-right">佣金</th>
                      <th className="py-1.5 px-2 text-right">采购上限¥</th>
                      <th className="py-1.5 px-2 text-right">月利润$</th>
                      <th className="py-1.5 px-2 text-center">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr
                        key={p.asin}
                        className={cn(
                          'border-b border-border/30 hover:bg-muted/30',
                          !p.viable && 'opacity-50',
                        )}
                      >
                        <td className="py-1.5 px-2 tabular-nums">{p.num}</td>
                        <td className="py-1.5 px-2 font-mono text-[10px]">{p.asin}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{p.price.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{p.fba.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{(p.referral_rate * 100).toFixed(0)}%</td>
                        <td className={cn(
                          'py-1.5 px-2 text-right tabular-nums font-semibold',
                          p.purchase_cny > 0 ? 'text-green-400' : 'text-red-400',
                        )}>
                          {p.purchase_cny.toFixed(0)}
                        </td>
                        <td className={cn(
                          'py-1.5 px-2 text-right tabular-nums',
                          p.monthly_profit_low > 0 ? 'text-green-400' : 'text-red-400',
                        )}>
                          {p.monthly_profit_low.toFixed(0)}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={cn(
                            'inline-block w-5 h-5 rounded-full text-[10px] leading-5 font-bold',
                            p.viable ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400',
                          )}>
                            {p.viable ? 'OK' : 'X'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
