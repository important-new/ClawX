// 站点配置 — 对齐卖家精灵利润计算器站点选择

export interface MarketConfig {
  id: string;
  name: string;
  icon: string;
  currency: string;
  currencySymbol: string;
  defaultExchangeRate: number; // → CNY
  storageFeeJanSep: number;   // $/立方英尺/月 (标准尺寸, 1-9月)
  storageFeeOctDec: number;   // $/立方英尺/月 (标准尺寸, 10-12月)
}

// 仓储费率来源: Amazon FBA fulfillment fee schedule (2026)
// 汇率: 2026-04 参考值
export const MARKETS: MarketConfig[] = [
  { id: 'us', name: '美国站', icon: '🇺🇸', currency: 'USD', currencySymbol: '$', defaultExchangeRate: 6.8363, storageFeeJanSep: 0.56, storageFeeOctDec: 1.40 },
  { id: 'uk', name: '英国站', icon: '🇬🇧', currency: 'GBP', currencySymbol: '£', defaultExchangeRate: 8.68, storageFeeJanSep: 0.50, storageFeeOctDec: 1.20 },
  { id: 'de', name: '德国站', icon: '🇩🇪', currency: 'EUR', currencySymbol: '€', defaultExchangeRate: 7.50, storageFeeJanSep: 0.44, storageFeeOctDec: 1.06 },
  { id: 'fr', name: '法国站', icon: '🇫🇷', currency: 'EUR', currencySymbol: '€', defaultExchangeRate: 7.50, storageFeeJanSep: 0.44, storageFeeOctDec: 1.06 },
  { id: 'it', name: '意大利站', icon: '🇮🇹', currency: 'EUR', currencySymbol: '€', defaultExchangeRate: 7.50, storageFeeJanSep: 0.44, storageFeeOctDec: 1.06 },
  { id: 'es', name: '西班牙站', icon: '🇪🇸', currency: 'EUR', currencySymbol: '€', defaultExchangeRate: 7.50, storageFeeJanSep: 0.44, storageFeeOctDec: 1.06 },
  { id: 'jp', name: '日本站', icon: '🇯🇵', currency: 'JPY', currencySymbol: '¥', defaultExchangeRate: 0.0465, storageFeeJanSep: 0.45, storageFeeOctDec: 1.10 },
  { id: 'ca', name: '加拿大站', icon: '🇨🇦', currency: 'CAD', currencySymbol: 'C$', defaultExchangeRate: 5.00, storageFeeJanSep: 0.52, storageFeeOctDec: 1.30 },
  { id: 'au', name: '澳大利亚站', icon: '🇦🇺', currency: 'AUD', currencySymbol: 'A$', defaultExchangeRate: 4.50, storageFeeJanSep: 0.48, storageFeeOctDec: 1.20 },
];

export function getMarket(id: string): MarketConfig {
  return MARKETS.find(m => m.id === id) ?? MARKETS[0];
}

// cm³ → ft³
export const CM3_TO_FT3 = 1 / 28316.85;
