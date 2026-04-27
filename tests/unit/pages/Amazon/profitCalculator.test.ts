import { describe, it, expect } from 'vitest';
import {
  calculateProfit,
  calcPurchaseCeiling,
  getViability,
  type ProfitInputs,
} from '../../../../src/pages/Amazon/hooks/useProfitCalculator';
import { getReferralRate, inferCategoryId } from '../../../../src/pages/Amazon/data/amazonCategories';
import { CM3_TO_FT3 } from '../../../../src/pages/Amazon/data/marketConfig';

// ─── 标准测试场景 ────────────────────────────────────────────────────────────
// 售价 $59.99, 采购 ¥120, 头程 ¥30, FBA $8.26
// 类别 Home & Kitchen (15%), 广告 10%, 关税 0%, 仓储 1 月
// 包装 30×20×15 cm, 2kg, 销量 100 件

const BASE: ProfitInputs = {
  marketId: 'us',
  exchangeRate: 6.8363,
  packageLength: 30,
  packageWidth: 20,
  packageHeight: 15,
  packageWeight: 2,
  dimDivisor: 5000,
  sellingPrice: 59.99,
  buyerShippingFee: 0,
  purchaseCost: 120,
  firstMileShipping: 30,
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
  fbaFee: 8.26,
  tariffRate: 0,
  storageMonths: 1,
  salesVolume: 100,
};

// ─── 佣金率查表 ──────────────────────────────────────────────────────────────

describe('getReferralRate', () => {
  it('Electronics 佣金率 8%', () => {
    expect(getReferralRate('electronics')).toBe(0.08);
  });

  it('Home & Kitchen 佣金率 15%', () => {
    expect(getReferralRate('home_kitchen')).toBe(0.15);
  });

  it('Clothing 佣金率 17%', () => {
    expect(getReferralRate('clothing')).toBe(0.17);
  });

  it('未知类别默认 15%', () => {
    expect(getReferralRate('nonexistent_category')).toBe(0.15);
  });
});

describe('inferCategoryId', () => {
  it('从 BSR 类目名推断 Home & Kitchen', () => {
    expect(inferCategoryId('Home & Kitchen')).toBe('home_kitchen');
  });

  it('从 BSR 类目名推断 Electronics', () => {
    expect(inferCategoryId('Electronics')).toBe('electronics');
  });

  it('空字符串默认 home_kitchen', () => {
    expect(inferCategoryId('')).toBe('home_kitchen');
  });
});

// ─── 体积/重量计算 ──────────────────────────────────────────────────────────

describe('calculateProfit - 体积重量', () => {
  it('volumeCm3 = L * W * H', () => {
    const r = calculateProfit(BASE);
    expect(r.volumeCm3).toBe(30 * 20 * 15); // 9000
  });

  it('dimWeight = volumeCm3 / dimDivisor', () => {
    const r = calculateProfit(BASE);
    expect(r.dimWeight).toBeCloseTo(9000 / 5000, 4); // 1.8
  });

  it('billingWeight = max(实际重量, 体积重量)', () => {
    const r = calculateProfit(BASE);
    // 实际 2kg > 体积重量 1.8kg
    expect(r.billingWeight).toBe(2);
  });

  it('体积重量大于实际重量时取体积重量', () => {
    const r = calculateProfit({ ...BASE, packageWeight: 1 });
    expect(r.billingWeight).toBeCloseTo(1.8, 4);
  });
});

// ─── 精确计算校验 ────────────────────────────────────────────────────────────

describe('calculateProfit - 标准场景精确校验', () => {
  const r = calculateProfit(BASE);

  // 手算:
  // referralFee = 59.99 * 0.15 = 8.9985
  // purchaseCostLocal = 120 / 6.8363 = 17.5537...
  // firstMileLocal = 30 / 6.8363 = 4.3884...
  // ppcCost = 59.99 * 0.10 = 5.999
  // costPerUnit = 17.5537 + 4.3884 + 0 + 8.9985 + 8.26 + 0 + 5.999 + 0 + 0
  //            = 45.1996...
  // volumeFt3 = 9000 * (1/28316.85) = 0.31787...
  // storageFeeJanSep = 0.31787 * 0.56 * 1 * 100 = 17.801...
  // totalCostJanSep = 45.1996 * 100 + 17.801 + 0 = 4537.77...
  // totalRevenue = 59.99 * 100 = 5999
  // netProfitJanSep = 5999 - 4537.77 = 1461.23...

  it('referralFee 精确值', () => {
    expect(r.referralFee).toBeCloseTo(8.9985, 3);
  });

  it('purchaseCostLocal (CNY→USD)', () => {
    expect(r.purchaseCostLocal).toBeCloseTo(120 / 6.8363, 2);
  });

  it('firstMileLocal (CNY→USD)', () => {
    expect(r.firstMileLocal).toBeCloseTo(30 / 6.8363, 2);
  });

  it('ppcCost', () => {
    expect(r.ppcCost).toBeCloseTo(5.999, 3);
  });

  it('storageFeeJanSep', () => {
    const expectedVolFt3 = 9000 * CM3_TO_FT3;
    const expected = expectedVolFt3 * 0.56 * 1 * 100;
    expect(r.storageFeeJanSep).toBeCloseTo(expected, 2);
  });

  it('storageFeeOctDec > storageFeeJanSep', () => {
    expect(r.storageFeeOctDec).toBeGreaterThan(r.storageFeeJanSep);
    const expectedVolFt3 = 9000 * CM3_TO_FT3;
    const expected = expectedVolFt3 * 1.40 * 1 * 100;
    expect(r.storageFeeOctDec).toBeCloseTo(expected, 2);
  });

  it('totalRevenue', () => {
    expect(r.totalRevenue).toBe(5999);
  });

  it('netProfitJanSep 精确', () => {
    const costPerUnit = r.purchaseCostLocal + r.firstMileLocal + r.otherCostLocal
      + r.referralFee + 8.26 + r.tariffCost
      + r.ppcCost + r.onSitePromoCost + r.offSitePromoCost;
    const expectedTotal = costPerUnit * 100 + r.storageFeeJanSep + r.afterSalesCost;
    expect(r.netProfitJanSep).toBeCloseTo(5999 - expectedTotal, 2);
  });

  it('netMarginJanSep = netProfit / revenue', () => {
    expect(r.netMarginJanSep).toBeCloseTo(r.netProfitJanSep / 5999, 4);
  });

  it('roiJanSep = netProfit / totalCost', () => {
    expect(r.roiJanSep).toBeCloseTo(r.netProfitJanSep / r.totalCostJanSep, 4);
  });
});

// ─── 季节性拆分 ──────────────────────────────────────────────────────────────

describe('calculateProfit - 季节性', () => {
  it('10-12月仓储费是1-9月的2.5倍 (US)', () => {
    const r = calculateProfit(BASE);
    expect(r.storageFeeOctDec / r.storageFeeJanSep).toBeCloseTo(1.40 / 0.56, 2);
  });

  it('10-12月净利润低于1-9月', () => {
    const r = calculateProfit(BASE);
    expect(r.netProfitOctDec).toBeLessThan(r.netProfitJanSep);
  });
});

// ─── 退货成本 ────────────────────────────────────────────────────────────────

describe('calculateProfit - 退货', () => {
  it('退货率 = 退货数/销量', () => {
    const r = calculateProfit({ ...BASE, returnQuantity: 5 });
    expect(r.returnRate).toBeCloseTo(0.05, 4);
  });

  it('afterSalesCost = (退货-可再售)*售价 + 退货*处理费', () => {
    const r = calculateProfit({
      ...BASE,
      returnQuantity: 10,
      resellableReturns: 6,
      returnProcessingFee: 3.50,
    });
    // (10-6)*59.99 + 10*3.50 = 239.96 + 35 = 274.96
    expect(r.afterSalesCost).toBeCloseTo(274.96, 2);
  });

  it('可再售数 > 退货数时 lostUnits 为 0', () => {
    const r = calculateProfit({
      ...BASE,
      returnQuantity: 5,
      resellableReturns: 8,
    });
    // max(0, 5-8)*59.99 + 5*0 = 0
    expect(r.afterSalesCost).toBe(0);
  });
});

// ─── 关税 ────────────────────────────────────────────────────────────────────

describe('calculateProfit - 关税', () => {
  it('tariffCost = (采购+头程) * 关税率', () => {
    const r = calculateProfit({ ...BASE, tariffRate: 0.05 });
    const expected = (120 / 6.8363 + 30 / 6.8363) * 0.05;
    expect(r.tariffCost).toBeCloseTo(expected, 3);
  });

  it('关税影响净利润', () => {
    const noTariff = calculateProfit(BASE);
    const withTariff = calculateProfit({ ...BASE, tariffRate: 0.25 });
    expect(withTariff.netProfitJanSep).toBeLessThan(noTariff.netProfitJanSep);
  });
});

// ─── 汇率 ────────────────────────────────────────────────────────────────────

describe('calculateProfit - 汇率', () => {
  it('purchaseCostLocal = purchaseCost / exchangeRate', () => {
    const r = calculateProfit({ ...BASE, exchangeRate: 7.0 });
    expect(r.purchaseCostLocal).toBeCloseTo(120 / 7.0, 4);
  });

  it('汇率越高，USD成本越低，利润越高', () => {
    const lowRate = calculateProfit({ ...BASE, exchangeRate: 6.0 });
    const highRate = calculateProfit({ ...BASE, exchangeRate: 8.0 });
    expect(highRate.netProfitJanSep).toBeGreaterThan(lowRate.netProfitJanSep);
  });
});

// ─── 买家运费 ────────────────────────────────────────────────────────────────

describe('calculateProfit - 买家运费', () => {
  it('buyerShippingFee 计入收入', () => {
    const without = calculateProfit(BASE);
    const withFee = calculateProfit({ ...BASE, buyerShippingFee: 5.99 });
    expect(withFee.revenuePerUnit).toBeCloseTo(59.99 + 5.99, 2);
    expect(withFee.netProfitJanSep).toBeGreaterThan(without.netProfitJanSep);
  });
});

// ─── 边界情况 ────────────────────────────────────────────────────────────────

describe('calculateProfit - 边界', () => {
  it('售价=0 时净利率=0', () => {
    const r = calculateProfit({ ...BASE, sellingPrice: 0 });
    expect(r.netMarginJanSep).toBe(0);
  });

  it('销量=0 时退货率=0', () => {
    const r = calculateProfit({ ...BASE, salesVolume: 0, returnQuantity: 5 });
    expect(r.returnRate).toBe(0);
  });

  it('成本>收入时净利润为负', () => {
    const r = calculateProfit({ ...BASE, purchaseCost: 500 });
    expect(r.netProfitJanSep).toBeLessThan(0);
  });

  it('dimDivisor=0 时 dimWeight=0', () => {
    const r = calculateProfit({ ...BASE, dimDivisor: 0 });
    expect(r.dimWeight).toBe(0);
  });
});

// ─── 反推采购上限 ────────────────────────────────────────────────────────────

describe('calcPurchaseCeiling', () => {
  it('15%目标利润率反推采购上限', () => {
    // 简化场景: 售价$60, FBA$8.26, 佣金15%, 广告10%, 无关税/仓储/退货
    const { purchaseLocal, purchaseCny } = calcPurchaseCeiling({
      targetMargin: 0.15,
      sellingPrice: 60,
      buyerShippingFee: 0,
      fbaFee: 8.26,
      referralFeeRate: 0.15,
      ppcRate: 0.10,
      onSitePromoRate: 0,
      offSitePromoRate: 0,
      otherCostLocal: 0,
      firstMileLocal: 4.39,
      tariffRate: 0,
      storagePerUnit: 0.18,
      returnCostPerUnit: 0,
      exchangeRate: 6.8363,
    });

    // purchase = 60*(1-0.15) - (60*0.15 + 60*0.10 + 8.26 + 0 + 0.18 + 0) - 4.39*(1+0)
    // = 51 - (9 + 6 + 8.26 + 0.18) - 4.39
    // = 51 - 23.44 - 4.39 = 23.17
    expect(purchaseLocal).toBeCloseTo(23.17, 1);
    expect(purchaseCny).toBeCloseTo(23.17 * 6.8363, 0);
  });

  it('含关税时反推', () => {
    const { purchaseLocal } = calcPurchaseCeiling({
      targetMargin: 0.15,
      sellingPrice: 60,
      buyerShippingFee: 0,
      fbaFee: 8.26,
      referralFeeRate: 0.15,
      ppcRate: 0.10,
      onSitePromoRate: 0,
      offSitePromoRate: 0,
      otherCostLocal: 0,
      firstMileLocal: 4.39,
      tariffRate: 0.05,
      storagePerUnit: 0.18,
      returnCostPerUnit: 0,
      exchangeRate: 6.8363,
    });

    // purchase*(1.05) = 51 - 23.44 - 4.39*1.05
    // purchase*(1.05) = 51 - 23.44 - 4.6095 = 22.9505
    // purchase = 22.9505 / 1.05 = 21.857...
    expect(purchaseLocal).toBeCloseTo(21.86, 1);
  });

  it('采购上限为负表示不可行', () => {
    const { purchaseLocal } = calcPurchaseCeiling({
      targetMargin: 0.50,
      sellingPrice: 20,
      buyerShippingFee: 0,
      fbaFee: 8.26,
      referralFeeRate: 0.15,
      ppcRate: 0.10,
      onSitePromoRate: 0.05,
      offSitePromoRate: 0.05,
      otherCostLocal: 2,
      firstMileLocal: 3,
      tariffRate: 0.10,
      storagePerUnit: 0.50,
      returnCostPerUnit: 1,
      exchangeRate: 6.8363,
    });
    expect(purchaseLocal).toBeLessThan(0);
  });
});

// ─── 可行性判断 ──────────────────────────────────────────────────────────────

describe('getViability', () => {
  it('margin>=25% 且 daily>=3 → viable', () => {
    expect(getViability(0.30, 10)).toBe('viable');
  });

  it('margin=20%, daily=5 → caution', () => {
    expect(getViability(0.20, 5)).toBe('caution');
  });

  it('margin<15% → not-viable', () => {
    expect(getViability(0.10, 10)).toBe('not-viable');
  });

  it('daily<1 → not-viable', () => {
    expect(getViability(0.30, 0.5)).toBe('not-viable');
  });
});
