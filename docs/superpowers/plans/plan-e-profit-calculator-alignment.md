# Plan E: 利润计算器对齐卖家精灵

## 目标

两部分需求：
1. **独立工具（前端）** — 对齐卖家精灵 FBA 利润计算器 UI，单个产品正向计算利润
2. **批量工具（Python + 前端触发）** — 对已筛选产品批量反推采购成本上限

两部分**复用同一套参数面板组件**，共享费率/成本配置。

参考页面: https://www.sellersprite.com/v3/calculator/index

---

## 共享架构

### 共享参数面板 `ProfitParamsPanel.tsx`

提取为独立组件，Part 1 和 Part 2 都使用。包含卖家精灵全部输入分组：

```
┌─ 顶部 ─────────────────────────────────┐
│ [站点选择 ▼]  汇率(USD/CNY): [____]     │
├─ 产品规格 ──────────────────────────────┤
│ 包装尺寸 cm [__] x [__] x [__]          │
│ 包装重量 kg [__]   体积重量 kg [__]      │
├─ 商品收入 ──────────────────────────────┤
│ 商品售价 $ [__]    买家运费 $ [__]       │
├─ 商品成本 ──────────────────────────────┤
│ 采购成本 ¥ [__]                $X.XX    │
│ 头程运费 [海运▼] ¥ [__]        $X.XX    │
│ 其他成本 ¥ [__]                $X.XX    │
├─ 营销成本 ──────────────────────────────┤
│ 站内广告 % [__]    ¥X.XX               │
│ 站内促销 % [__]    ¥X.XX               │
│ 站外促销 % [__]    ¥X.XX               │
├─ 售后成本 ──────────────────────────────┤
│ 退货数 [__]件  可再售 [__]件             │
│ 退货处理费 $ [__]  □ 服装和鞋靴          │
├─ 亚马逊扣费 ────────────────────────────┤
│ 商品类别 [选择▼]    佣金 $X.XX (auto)   │
│ FBA运费 $ [__]                          │
│ 关税 % [__]                             │
│ 仓储 [__]月  费用: 1-9月$X / 10-12月$X  │
├─ 销量 ──────────────────────────────────┤
│ 销量 [__] 件                            │
└─────────────────────────────────────────┘
```

**使用模式：**
- **Part 1 (独立计算器)**: 所有字段可编辑，正向计算利润
- **Part 2 (批量评估)**: 售价/FBA/尺寸/重量/销量 由产品数据自动填入(disabled)，
  其余费率参数可编辑，作为批量计算的统一配置。
  新增"目标利润率"字段 + 反推模式

通过 props 控制：
```ts
interface ProfitParamsPanelProps {
  inputs: ProfitInputs;
  onInputChange: (key, value) => void;
  // Part 2 模式: 锁定产品相关字段
  lockedFields?: (keyof ProfitInputs)[];
  // Part 2 额外: 目标利润率
  showTargetMargin?: boolean;
  targetMargin?: number;
  onTargetMarginChange?: (v: number) => void;
}
```

### 共享数据文件

#### `src/pages/Amazon/data/amazonCategories.ts`
Amazon 商品类别 → 佣金比例映射表 (referral fee %)：
| 类别 | 佣金率 |
|------|--------|
| Electronics | 8% |
| Clothing, Shoes & Jewelry | 17% |
| Home & Kitchen | 15% |
| Sports & Outdoors | 15% |
| Beauty & Personal Care | 8% |
| Toys & Games | 15% |
| Tools & Home Improvement | 15% |
| Health & Household | 8% |
| Pet Supplies | 15% |
| Automotive | 12% |
| Industrial & Scientific | 12% |
| Office Products | 15% |
| Patio, Lawn & Garden | 15% |
| Grocery & Gourmet Food | 8% |
| 默认 | 15% |

#### `src/pages/Amazon/data/marketConfig.ts`
```ts
interface MarketConfig {
  id: string;
  name: string;              // "美国站"
  icon: string;              // flag emoji
  currency: string;          // "USD"
  currencySymbol: string;    // "$"
  defaultExchangeRate: number; // to CNY
  storageFeeJanSep: number;   // $/立方英尺/月
  storageFeeOctDec: number;
}
```
站点: 美国/英国/德国/法国/意大利/西班牙/日本/加拿大/澳大利亚

### 共享计算逻辑 `useProfitCalculator.ts`

**ProfitInputs:**
```ts
interface ProfitInputs {
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
  returnProcessingFee: number;
  isApparelShoes: boolean;
  // 亚马逊扣费
  categoryId: string;
  fbaFee: number;
  tariffRate: number;
  storageMonths: number;
  // 销量
  salesVolume: number;
}
```

**ProfitResult:**
```ts
interface ProfitResult {
  // 自动计算
  volumeCm3: number;
  dimWeight: number;
  billingWeight: number;
  referralFeeRate: number;
  referralFee: number;
  returnRate: number;
  storageFeeJanSep: number;
  storageFeeOctDec: number;
  // 收入
  revenuePerUnit: number;
  totalRevenue: number;
  // 成本明细 (USD)
  purchaseCostUsd: number;
  firstMileUsd: number;
  otherCostUsd: number;
  ppcCost: number;
  onSitePromoCost: number;
  offSitePromoCost: number;
  afterSalesCost: number;
  tariffCost: number;
  // 结果 (分季)
  netProfitJanSep: number;
  netProfitOctDec: number;
  netMarginJanSep: number;
  netMarginOctDec: number;
  roiJanSep: number;
  roiOctDec: number;
  totalCostJanSep: number;
  totalCostOctDec: number;
}
```

**计算公式 (对齐卖家精灵):**
```
volumeCm3 = L * W * H
dimWeight = volumeCm3 / dimDivisor
billingWeight = max(packageWeight, dimWeight)
referralFee = sellingPrice * categoryReferralRate

revenuePerUnit = sellingPrice + buyerShippingFee
totalRevenue = revenuePerUnit * salesVolume

purchaseCostUsd = purchaseCost / exchangeRate
firstMileUsd = firstMileShipping / exchangeRate
otherCostUsd = otherCost / exchangeRate

ppcCost = sellingPrice * ppcRate
onSitePromoCost = sellingPrice * onSitePromoRate
offSitePromoCost = sellingPrice * offSitePromoRate

afterSalesCost = (returnQuantity - resellableReturns) * sellingPrice
                 + returnQuantity * returnProcessingFee

tariffCost = (purchaseCostUsd + firstMileUsd) * tariffRate

storageFeeJanSep = volumeFt3 * marketStorageRateJanSep * storageMonths
storageFeeOctDec = volumeFt3 * marketStorageRateOctDec * storageMonths

costPerUnit = purchaseCostUsd + firstMileUsd + otherCostUsd
              + referralFee + fbaFee + tariffCost
              + ppcCost + onSitePromoCost + offSitePromoCost

totalCostJanSep = costPerUnit * salesVolume + storageFeeJanSep + afterSalesCost
totalCostOctDec = costPerUnit * salesVolume + storageFeeOctDec + afterSalesCost

netProfitJanSep = totalRevenue - totalCostJanSep
netMarginJanSep = totalRevenue > 0 ? netProfitJanSep / totalRevenue : 0
roiJanSep = totalCostJanSep > 0 ? netProfitJanSep / totalCostJanSep : 0
```

**反推函数 `calcPurchaseCeiling()` (Part 2 用):**
```
给定目标净利率 M，反推采购成本上限:

revenue = (sellingPrice + buyerShippingFee) * salesVolume
targetProfit = revenue * M

fixedCosts = referralFee + fbaFee + ppcCost + onSitePromoCost + offSitePromoCost
             + afterSalesCost/salesVolume + storageAvg/salesVolume
             + otherCostUsd + tariffOnNonPurchase

// tariffCost = (purchaseUsd + firstMileUsd) * tariffRate
// 展开: purchaseUsd * (1 + tariffRate) = remaining
purchaseUsd = (revenuePerUnit - revenuePerUnit*M - fixedCosts - firstMileUsd*(1+tariffRate))
              / (1 + tariffRate)
purchaseCny = purchaseUsd * exchangeRate
```

---

## Part 1: 独立 FBA 利润计算器

### 改动文件

#### 1.1 `amazonCategories.ts` + `marketConfig.ts` (见共享部分)

#### 1.2 重写 `useProfitCalculator.ts` (见共享部分)

导出:
- `calculateProfit(inputs: ProfitInputs): ProfitResult` — 正向计算
- `calcPurchaseCeiling(...)` — 反推采购上限
- `getReferralRate(categoryId: string): number` — 查表
- `useProfitCalculator()` — React hook (state + memo)
- `getViability(margin, dailyUnits): Viability` — 可行性判断

#### 1.3 新建 `ProfitParamsPanel.tsx` (见共享部分)

#### 1.4 重写 `ProfitSimulator.tsx` → `ProfitCalculator.tsx`

布局: 左侧 `<ProfitParamsPanel>` + 右侧计算结果面板
```
┌──────────────────────────────────────────────────────┐
│ FBA利润计算器                                         │
├─────────────────────┬────────────────────────────────┤
│ <ProfitParamsPanel>  │ 计算结果                       │
│ (全部字段可编辑)     │  净利润 1-9月: ¥__ $__         │
│                     │         10-12月: ¥__ $__        │
│                     │  净利率/ROI (分季)              │
│                     │                                │
│                     │  收入小计  ¥__ $__              │
│                     │   商品售价/商品运费             │
│                     │                                │
│                     │  成本小计(分季) ¥__ $__         │
│                     │   各项成本明细                  │
└─────────────────────┴────────────────────────────────┘
```

#### 1.5 重写 `profitCalculator.test.ts`

精确断言:
- 佣金率查表 (Electronics 8%, Home&Kitchen 15%, 默认 15%)
- 体积/重量计算 (volumeCm3, dimWeight, billingWeight)
- 标准场景全链路精确校验 (toBeCloseTo)
- 季节性拆分 (1-9月 vs 10-12月)
- 反推 calcPurchaseCeiling 精确校验
- 退货成本公式
- 汇率转换
- 边界: 售价=0, 销量=0, 成本>收入

#### 1.6 更新 `PipelineWizard.tsx`

- 移除 `<ProfitSimulator sellingPrice={59.99} monthlyUnits={450} />`
- 改为 `<ProfitCalculator />` 无 props
- 结果页独立 section

---

## Part 2: 批量采购价评估

### 2.1 修正 `profit_calculator.py` 对齐卖家精灵

**当前缺失 → 新增:**

| 缺失项 | CLI 参数 | 说明 |
|--------|---------|------|
| 买家运费 | `--buyer-shipping` | 默认 0，计入收入 |
| 其他成本 | `--other-cost` | ¥，默认 0 |
| 营销3项拆分 | `--ads` → `--ppc-rate` + `--onsite-promo` + `--offsite-promo` | 各自% |
| 退货数 | `--return-qty` | 件，默认 0 |
| 退货可再售数 | `--resellable-returns` | 件，默认 0 |
| 退货处理费 | `--return-fee` | $，默认 0 |
| 关税率 | `--tariff` | %，默认 0 |
| 按类别佣金 | `--referral` 改为可选，自动按 PDP 类目查表 | 从 bsr[0].category 推断 |

**修改 DEFAULTS:**
```python
DEFAULTS = {
    "exchange_rate": 6.8349,
    "target_margin": 0.15,
    "referral_rate": None,        # None = 按类别自动查表
    "ppc_rate": 0.10,             # 拆分: 站内广告
    "onsite_promo_rate": 0.0,     # 站内促销
    "offsite_promo_rate": 0.0,    # 站外促销
    "buyer_shipping": 0.0,        # 买家运费 $
    "other_cost_cny": 0.0,        # 其他成本 ¥
    "return_qty": 0,              # 退货数
    "resellable_returns": 0,      # 退货可再售
    "return_fee": 0.0,            # 退货处理费 $
    "tariff_rate": 0.0,           # 关税率 %
    "storage_months": 1.5,
    "storage_rate_low": 0.56,
    "storage_rate_high": 1.40,
    "sea_freight_rate": 2.84,
    "vol_divisor": 5000,
}
```

**修正 `calc_purchase_ceiling()` 公式:**
```python
def calc_purchase_ceiling(price, fba, storage_avg, freight, cfg):
    """
    反推: 采购成本上限
    revenue = (price + buyer_shipping)
    fixed = referral + fba + storage + ppc + promo + return_cost + other + tariff_on_freight
    purchase * (1 + tariff) = revenue * (1 - margin) - fixed - freight * (1 + tariff)
    """
    buyer_shipping = cfg["buyer_shipping"]
    revenue_per_unit = price + buyer_shipping

    referral = price * referral_rate
    ppc = price * cfg["ppc_rate"]
    onsite = price * cfg["onsite_promo_rate"]
    offsite = price * cfg["offsite_promo_rate"]
    other_usd = cfg["other_cost_cny"] / cfg["exchange_rate"]
    return_cost_per_unit = ...  # (return_qty - resellable) * price / sales + return_qty * return_fee / sales

    tariff = cfg["tariff_rate"]
    fixed = referral + fba + storage_avg + ppc + onsite + offsite + other_usd + return_cost_per_unit

    purchase_usd = (revenue_per_unit * (1 - cfg["target_margin"]) - fixed - freight * (1 + tariff)) / (1 + tariff)
    purchase_cny = purchase_usd * cfg["exchange_rate"]
    return purchase_usd, purchase_cny
```

**新增类别佣金查表:**
```python
CATEGORY_REFERRAL_RATES = {
    "Electronics": 0.08,
    "Clothing, Shoes & Jewelry": 0.17,
    "Home & Kitchen": 0.15,
    "Sports & Outdoors": 0.15,
    "Beauty & Personal Care": 0.08,
    "Health & Household": 0.08,
    "Automotive": 0.12,
    "Industrial & Scientific": 0.12,
    ...
}

def get_referral_rate(category: str, override: float | None = None) -> float:
    if override is not None:
        return override
    for key, rate in CATEGORY_REFERRAL_RATES.items():
        if key.lower() in category.lower():
            return rate
    return 0.15
```

**新增 `--json` flag:**
- 输出 QC_RESULT JSON 到 stdout
- 格式: `{"products": [...], "config": {...}, "summary": {"total", "viable", "not_viable"}}`

### 2.2 前端: `BatchProfitPanel.tsx`

复用 `<ProfitParamsPanel>` 但锁定产品字段:
```
┌──────────────────────────────────────────────────────┐
│ 批量采购价评估                                        │
├─────────────────────┬────────────────────────────────┤
│ <ProfitParamsPanel   │ 评估结果                       │
│  lockedFields=[      │                                │
│    sellingPrice,     │ 目标利润率: [15]%               │
│    fbaFee,           │ [开始计算]                      │
│    packageLength,    │                                │
│    packageWidth,     │ ┌──────────────────────────┐   │
│    packageHeight,    │ │# ASIN  售价 FBA 采购上限¥│   │
│    packageWeight,    │ │1 B0GQ  $99  $14 ¥200    │   │
│    salesVolume,      │ │2 B0G8  $69  $6  ¥214    │   │
│  ]                   │ │...                       │   │
│  showTargetMargin    │ └──────────────────────────┘   │
│ />                   │                                │
│                     │ 共 X 款，可行 Y 款              │
│                     │ [导出 CSV]  [导出 Excel]        │
└─────────────────────┴────────────────────────────────┘
```

费率参数(广告%/佣金/关税/仓储/汇率等)从面板获取，
产品数据(售价/FBA/尺寸/销量)从 session 数据自动填入。

### 2.3 IPC handler

```ts
// ipc-amazon.ts
ipcMain.handle('amazon:runProfitCalculator', async (_, args) => {
  // args: { sessionDir, margin, ppcRate, onsitePromo, offsitePromo,
  //         referralRate, tariff, freightRate, exchangeRate, storageMonths,
  //         otherCostCny, returnQty, resellableReturns, returnFee, buyerShipping }
  // 执行: uv run python profit_calculator.py <sessionDir> --margin X ... --json
  // 解析 stdout JSON
  // 返回: { success, products, summary }
})
```

---

## 不改动的文件
- `pipelineStore.ts` — 利润计算器是独立 hook
- `PipelineFilterForm.tsx` — 筛选表单无关
- `executor.test.ts` / `pipelineStore.test.ts` — 不在本次范围

## 执行顺序

### Part 1 (独立计算器) — ClawX repo
1. `amazonCategories.ts` + `marketConfig.ts`
2. `useProfitCalculator.ts` (含 calcPurchaseCeiling)
3. `profitCalculator.test.ts`
4. `ProfitParamsPanel.tsx` (共享参数面板)
5. `ProfitSimulator.tsx` → `ProfitCalculator.tsx`
6. `PipelineWizard.tsx` 集成
7. 验证: `npx vitest run` + `npx tsc --noEmit`

### Part 2 (批量计算) — amazon repo + ClawX repo
8. `profit_calculator.py` 修正对齐 + `--json`
9. `profit_calculator.py` 测试验证
10. `ipc-amazon.ts` 新增 handler
11. `BatchProfitPanel.tsx`
12. `PipelineWizard.tsx` 集成 BatchProfitPanel
13. 端到端验证
