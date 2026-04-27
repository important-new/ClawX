// src/pages/Amazon/hooks/useProfitCalculator.ts
import { useState, useMemo } from 'react';

export interface ProfitInputs {
  sellingPrice: number;
  costPrice: number;
  shippingCost: number;
  ppcDailyBudget: number;
  targetAcos: number;
  conversionRate: number;
  monthlyUnits: number;
}

export interface ProfitResult {
  fbaFee: number;
  referralFee: number;
  unitProfit: number;
  grossMarginRate: number;
  monthlyProfit: number;
  roi: number;
  breakevenDailyUnits: number;
}

export type Viability = 'viable' | 'caution' | 'not-viable';

export function calculateProfit(inputs: ProfitInputs): ProfitResult {
  const { sellingPrice, costPrice, shippingCost, ppcDailyBudget, monthlyUnits } = inputs;

  // Amazon fees (simplified)
  const referralFee = sellingPrice * 0.15;
  const fbaFee = sellingPrice <= 15 ? 3.22
    : sellingPrice <= 30 ? 4.75
    : sellingPrice <= 50 ? 5.40
    : sellingPrice <= 100 ? 8.26
    : sellingPrice * 0.15;

  const unitProfit = sellingPrice - costPrice - shippingCost - referralFee - fbaFee;
  const grossMarginRate = sellingPrice > 0 ? unitProfit / sellingPrice : 0;

  // Monthly PPC cost
  const monthlyPpc = ppcDailyBudget * 30;
  const monthlyRevenue = unitProfit * monthlyUnits;
  const monthlyProfit = monthlyRevenue - monthlyPpc;

  // ROI = monthly profit / monthly investment
  const monthlyInvestment = (costPrice + shippingCost) * monthlyUnits + monthlyPpc;
  const roi = monthlyInvestment > 0 ? monthlyProfit / monthlyInvestment : 0;

  // Breakeven: daily units where unit profit * units = daily PPC
  const breakevenDailyUnits = unitProfit > 0 ? ppcDailyBudget / unitProfit : Infinity;

  return {
    fbaFee,
    referralFee,
    unitProfit,
    grossMarginRate,
    monthlyProfit,
    roi,
    breakevenDailyUnits,
  };
}

export function getViability(grossMarginRate: number, dailyUnits: number): Viability {
  if (grossMarginRate >= 0.25 && dailyUnits >= 3) return 'viable';
  if (grossMarginRate < 0.15 || dailyUnits < 1) return 'not-viable';
  return 'caution';
}

export function useProfitCalculator(sellingPrice: number, monthlyUnits: number) {
  const [inputs, setInputs] = useState<ProfitInputs>({
    sellingPrice,
    costPrice: sellingPrice * 0.3,
    shippingCost: 5,
    ppcDailyBudget: 30,
    targetAcos: 0.30,
    conversionRate: 0.15,
    monthlyUnits,
  });

  const result = useMemo(() => calculateProfit(inputs), [inputs]);
  const viability = useMemo(
    () => getViability(result.grossMarginRate, inputs.monthlyUnits / 30),
    [result.grossMarginRate, inputs.monthlyUnits]
  );

  const updateInput = <K extends keyof ProfitInputs>(key: K, value: ProfitInputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  return { inputs, updateInput, result, viability };
}
