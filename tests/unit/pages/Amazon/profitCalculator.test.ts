// tests/unit/pages/Amazon/profitCalculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateProfit, getViability } from '../../../../src/pages/Amazon/hooks/useProfitCalculator';

describe('calculateProfit', () => {
  const BASE = {
    sellingPrice: 59.99,
    costPrice: 18,
    shippingCost: 5,
    ppcDailyBudget: 30,
    targetAcos: 0.30,
    conversionRate: 0.15,
    monthlyUnits: 450,
  };

  it('should calculate gross margin correctly', () => {
    const result = calculateProfit(BASE);
    expect(result.unitProfit).toBeGreaterThan(10);
    expect(result.grossMarginRate).toBeGreaterThan(0.15);
  });

  it('should calculate monthly profit', () => {
    const result = calculateProfit(BASE);
    expect(result.monthlyProfit).toBeGreaterThan(0);
    expect(result.roi).toBeGreaterThan(0);
  });

  it('should calculate breakeven daily units', () => {
    const result = calculateProfit(BASE);
    expect(result.breakevenDailyUnits).toBeGreaterThan(0);
    expect(result.breakevenDailyUnits).toBeLessThan(30);
  });

  it('should return negative profit for expensive product', () => {
    const result = calculateProfit({ ...BASE, costPrice: 50, shippingCost: 15 });
    expect(result.unitProfit).toBeLessThan(0);
  });
});

describe('getViability', () => {
  it('should return viable for good margins', () => {
    expect(getViability(0.30, 10)).toBe('viable');
  });

  it('should return caution for medium margins', () => {
    expect(getViability(0.20, 5)).toBe('caution');
  });

  it('should return not-viable for low margins', () => {
    expect(getViability(0.10, 2)).toBe('not-viable');
  });

  it('should return not-viable for very low daily units', () => {
    expect(getViability(0.30, 0.5)).toBe('not-viable');
  });
});
