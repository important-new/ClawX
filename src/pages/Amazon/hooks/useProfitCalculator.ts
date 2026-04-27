// FBA 利润计算器 — 对齐卖家精灵 (https://www.sellersprite.com/v3/calculator/index)
import { useState, useMemo } from 'react';
import { getReferralRate } from '../data/amazonCategories';
import { getMarket, CM3_TO_FT3 } from '../data/marketConfig';

// ─── 输入 ────────────────────────────────────────────────────────────────────

export interface ProfitInputs {
  // 站点
  marketId: string;
  exchangeRate: number;
  // 产品规格
  packageLength: number;  // cm
  packageWidth: number;
  packageHeight: number;
  packageWeight: number;  // kg
  dimDivisor: number;     // 5000 | 6000
  // 商品收入
  sellingPrice: number;   // 站点货币
  buyerShippingFee: number;
  // 商品成本 (CNY)
  purchaseCost: number;
  firstMileShipping: number;
  firstMileMethod: 'sea' | 'air' | 'express';
  otherCost: number;
  // 营销成本 (%)
  ppcRate: number;
  onSitePromoRate: number;
  offSitePromoRate: number;
  // 售后成本
  returnQuantity: number;
  resellableReturns: number;
  returnProcessingFee: number; // $
  isApparelShoes: boolean;
  // 亚马逊扣费
  categoryId: string;
  fbaFee: number;         // $ 用户输入
  tariffRate: number;     // 小数 (0.05 = 5%)
  storageMonths: number;
  // 销量
  salesVolume: number;
}

// ─── 输出 ────────────────────────────────────────────────────────────────────

export interface ProfitResult {
  // 自动计算
  volumeCm3: number;
  dimWeight: number;       // kg
  billingWeight: number;   // max(实际, 体积)
  referralFeeRate: number;
  referralFee: number;     // 站点货币
  returnRate: number;
  storageFeeJanSep: number;  // 站点货币
  storageFeeOctDec: number;
  // 收入
  revenuePerUnit: number;
  totalRevenue: number;
  // 成本明细 (站点货币, per unit)
  purchaseCostLocal: number;
  firstMileLocal: number;
  otherCostLocal: number;
  ppcCost: number;
  onSitePromoCost: number;
  offSitePromoCost: number;
  afterSalesCost: number;    // 总额 (非 per unit)
  tariffCost: number;        // per unit
  // 结果 (分季, 总额)
  totalCostJanSep: number;
  totalCostOctDec: number;
  netProfitJanSep: number;
  netProfitOctDec: number;
  netMarginJanSep: number;
  netMarginOctDec: number;
  roiJanSep: number;
  roiOctDec: number;
}

export type Viability = 'viable' | 'caution' | 'not-viable';

// ─── 正向计算 ────────────────────────────────────────────────────────────────

export function calculateProfit(inputs: ProfitInputs): ProfitResult {
  const market = getMarket(inputs.marketId);
  const rate = inputs.exchangeRate;

  // 产品规格
  const volumeCm3 = inputs.packageLength * inputs.packageWidth * inputs.packageHeight;
  const dimWeight = inputs.dimDivisor > 0 ? volumeCm3 / inputs.dimDivisor : 0;
  const billingWeight = Math.max(inputs.packageWeight, dimWeight);

  // 佣金
  const referralFeeRate = getReferralRate(inputs.categoryId);
  const referralFee = inputs.sellingPrice * referralFeeRate;

  // 退货率
  const returnRate = inputs.salesVolume > 0 ? inputs.returnQuantity / inputs.salesVolume : 0;

  // 仓储费 (按体积 ft³)
  const volumeFt3 = volumeCm3 * CM3_TO_FT3;
  const storageFeeJanSep = volumeFt3 * market.storageFeeJanSep * inputs.storageMonths * inputs.salesVolume;
  const storageFeeOctDec = volumeFt3 * market.storageFeeOctDec * inputs.storageMonths * inputs.salesVolume;

  // 收入
  const revenuePerUnit = inputs.sellingPrice + inputs.buyerShippingFee;
  const totalRevenue = revenuePerUnit * inputs.salesVolume;

  // 成本 (CNY → 站点货币)
  const purchaseCostLocal = rate > 0 ? inputs.purchaseCost / rate : 0;
  const firstMileLocal = rate > 0 ? inputs.firstMileShipping / rate : 0;
  const otherCostLocal = rate > 0 ? inputs.otherCost / rate : 0;

  // 营销成本 (per unit)
  const ppcCost = inputs.sellingPrice * inputs.ppcRate;
  const onSitePromoCost = inputs.sellingPrice * inputs.onSitePromoRate;
  const offSitePromoCost = inputs.sellingPrice * inputs.offSitePromoRate;

  // 售后成本 (总额)
  const lostUnits = Math.max(0, inputs.returnQuantity - inputs.resellableReturns);
  const afterSalesCost = lostUnits * inputs.sellingPrice
    + inputs.returnQuantity * inputs.returnProcessingFee;

  // 关税 (per unit, 基于采购+头程)
  const tariffCost = (purchaseCostLocal + firstMileLocal) * inputs.tariffRate;

  // 单件成本 (不含仓储和售后，这两项按总额算)
  const costPerUnit = purchaseCostLocal + firstMileLocal + otherCostLocal
    + referralFee + inputs.fbaFee + tariffCost
    + ppcCost + onSitePromoCost + offSitePromoCost;

  // 总成本 (分季)
  const totalCostJanSep = costPerUnit * inputs.salesVolume + storageFeeJanSep + afterSalesCost;
  const totalCostOctDec = costPerUnit * inputs.salesVolume + storageFeeOctDec + afterSalesCost;

  // 净利润 (分季)
  const netProfitJanSep = totalRevenue - totalCostJanSep;
  const netProfitOctDec = totalRevenue - totalCostOctDec;

  // 净利率
  const netMarginJanSep = totalRevenue > 0 ? netProfitJanSep / totalRevenue : 0;
  const netMarginOctDec = totalRevenue > 0 ? netProfitOctDec / totalRevenue : 0;

  // ROI = 净利润 / 总投入成本
  const roiJanSep = totalCostJanSep > 0 ? netProfitJanSep / totalCostJanSep : 0;
  const roiOctDec = totalCostOctDec > 0 ? netProfitOctDec / totalCostOctDec : 0;

  return {
    volumeCm3, dimWeight, billingWeight,
    referralFeeRate, referralFee, returnRate,
    storageFeeJanSep, storageFeeOctDec,
    revenuePerUnit, totalRevenue,
    purchaseCostLocal, firstMileLocal, otherCostLocal,
    ppcCost, onSitePromoCost, offSitePromoCost,
    afterSalesCost, tariffCost,
    totalCostJanSep, totalCostOctDec,
    netProfitJanSep, netProfitOctDec,
    netMarginJanSep, netMarginOctDec,
    roiJanSep, roiOctDec,
  };
}

// ─── 反推采购成本上限 ────────────────────────────────────────────────────────

export interface PurchaseCeilingConfig {
  targetMargin: number;   // 目标净利率 (0.15 = 15%)
  // 以下从 ProfitInputs 获取
  sellingPrice: number;
  buyerShippingFee: number;
  fbaFee: number;
  referralFeeRate: number;
  ppcRate: number;
  onSitePromoRate: number;
  offSitePromoRate: number;
  otherCostLocal: number;       // 站点货币
  firstMileLocal: number;       // 站点货币
  tariffRate: number;
  storagePerUnit: number;       // 年均仓储/每件
  returnCostPerUnit: number;    // 售后成本/每件
  exchangeRate: number;
}

export function calcPurchaseCeiling(cfg: PurchaseCeilingConfig): {
  purchaseLocal: number;
  purchaseCny: number;
} {
  const revenuePerUnit = cfg.sellingPrice + cfg.buyerShippingFee;

  // 目标: netProfit/revenue = targetMargin
  // netProfit = revenue - allCosts
  // allCosts per unit = purchase*(1+tariff) + firstMile*(1+tariff) + otherCost
  //                   + referral + fba + ppc + onsite + offsite
  //                   + storage + returnCost
  // revenue * (1 - margin) = allCosts
  // purchase*(1+tariff) = revenue*(1-margin) - fixedCosts - firstMile*(1+tariff)

  const fixedPerUnit = cfg.sellingPrice * (cfg.referralFeeRate + cfg.ppcRate + cfg.onSitePromoRate + cfg.offSitePromoRate)
    + cfg.fbaFee + cfg.otherCostLocal + cfg.storagePerUnit + cfg.returnCostPerUnit;

  const tariffMul = 1 + cfg.tariffRate;
  const purchaseLocal = (revenuePerUnit * (1 - cfg.targetMargin) - fixedPerUnit - cfg.firstMileLocal * tariffMul) / tariffMul;
  const purchaseCny = purchaseLocal * cfg.exchangeRate;

  return { purchaseLocal, purchaseCny };
}

// ─── 可行性判断 ──────────────────────────────────────────────────────────────

export function getViability(netMargin: number, dailyUnits: number): Viability {
  if (netMargin >= 0.25 && dailyUnits >= 3) return 'viable';
  if (netMargin < 0.15 || dailyUnits < 1) return 'not-viable';
  return 'caution';
}

// ─── React Hook ──────────────────────────────────────────────────────────────

const DEFAULT_INPUTS: ProfitInputs = {
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
  ppcRate: 0,
  onSitePromoRate: 0,
  offSitePromoRate: 0,
  returnQuantity: 0,
  resellableReturns: 0,
  returnProcessingFee: 0,
  isApparelShoes: false,
  categoryId: 'home_kitchen',
  fbaFee: 0,
  tariffRate: 0,
  storageMonths: 1,
  salesVolume: 1,
};

export function useProfitCalculator(initialOverrides?: Partial<ProfitInputs>) {
  const [inputs, setInputs] = useState<ProfitInputs>({ ...DEFAULT_INPUTS, ...initialOverrides });

  const result = useMemo(() => calculateProfit(inputs), [inputs]);

  const viability = useMemo(
    () => getViability(result.netMarginJanSep, inputs.salesVolume / 30),
    [result.netMarginJanSep, inputs.salesVolume],
  );

  const updateInput = <K extends keyof ProfitInputs>(key: K, value: ProfitInputs[K]) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const resetInputs = (overrides?: Partial<ProfitInputs>) => {
    setInputs({ ...DEFAULT_INPUTS, ...overrides });
  };

  return { inputs, updateInput, resetInputs, result, viability };
}
