# Plan C: SellerSprite Filter Alignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align ClawX Pipeline Wizard filter UI with SellerSprite's product research page layout, add missing `--month` and `--sub-bsr` parameters to Python scripts, and ensure all 37 SellerSprite filter conditions are fully supported end-to-end.

**Architecture:** Three-layer change: (1) Python scripts gain `--month` and `--sub-bsr-*` CLI params + UI automation, (2) ClawX `PipelineFilterForm` is rebuilt to mirror SellerSprite's 3-group layout (销售表现/产品信息/竞品筛选) with matching Chinese labels, (3) `DEFAULT_FILTERS` and `filter-metadata.ts` are updated to use the same key names as the Python scripts (replacing the old `s1_*` prefix keys).

**Tech Stack:** Python (Playwright async), TypeScript, React 19, Zustand, Tailwind CSS

**Codebase:**
- Python scripts: `D:\Code\amazon`
- ClawX app: `D:\Code\ClawX`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `D:\Code\amazon\.agent\skills\sellersprite-search-products\scripts\ss_search_params.py` | Add `--month`, `--sub-bsr-min/max`, `--sub-category-only` CLI args |
| Modify | `D:\Code\amazon\.agent\skills\sellersprite-search-products\scripts\ss_search_ui.py` | Add month selection + sub-BSR fill + sub-category checkbox UI automation |
| Modify | `D:\Code\ClawX\src\pages\Amazon\pipelineStore.ts` | Replace `s1_*` keys with script-aligned keys in `DEFAULT_FILTERS` |
| Rewrite | `D:\Code\ClawX\src\pages\Amazon\components\PipelineFilterForm.tsx` | Rebuild Phase 1 with 3 sub-groups matching SellerSprite layout |
| Modify | `D:\Code\ClawX\electron\main\plugins\amazon\filter-metadata.ts` | Add labels for all new filter keys |

---

### Task 1: Add `--month` and `--sub-bsr` parameters to Python scripts

**Files:**
- Modify: `D:\Code\amazon\.agent\skills\sellersprite-search-products\scripts\ss_search_params.py`

- [ ] **Step 1: Add new CLI arguments to `build_parser()`**

In `ss_search_params.py`, add these arguments to the 销售表现 group (after `--bsr-growth-rate-max`):

```python
    sales.add_argument("--sub-bsr-min", type=int, default=None, metavar="N", help="小类BSR最小值")
    sales.add_argument("--sub-bsr-max", type=int, default=None, metavar="N", help="小类BSR最大值")
    sales.add_argument(
        "--sub-category-only", action="store_true", default=False, help="只看该子类目排名"
    )
```

Add to the 通用选项 group (before `--filters-file`):

```python
    general.add_argument(
        "--month",
        type=str,
        default=None,
        metavar="TEXT",
        help="选择月份: 最近30天 或 YYYY-MM 格式（如 2026-03）",
    )
```

- [ ] **Step 2: Register new fields in `_FILTER_FILE_ARGS_FIELDS`**

Add to the set:

```python
    "sub_bsr_min",
    "sub_bsr_max",
    "sub_category_only",
    "month",
```

- [ ] **Step 3: Commit**

```bash
cd D:\Code\amazon
git add .agent/skills/sellersprite-search-products/scripts/ss_search_params.py
git commit -m "feat(ss-search): add --month, --sub-bsr-min/max, --sub-category-only params"
```

---

### Task 2: Add month selection and sub-BSR UI automation

**Files:**
- Modify: `D:\Code\amazon\.agent\skills\sellersprite-search-products\scripts\ss_search_ui.py`

- [ ] **Step 1: Add month selection function**

Add after the `_set_page_size` function (before `apply_filters`):

```python
async def _select_month(page, month_text: str):
    """点击月份按钮选择数据月份。"""
    try:
        month_section = page.locator("text=选择月份").locator("..")
        btn = month_section.locator("button, .el-button").filter(has_text=month_text)
        if await btn.count() > 0:
            already_active = await btn.first.evaluate(
                "el => el.classList.contains('active') || el.classList.contains('is-active') || el.classList.contains('is-plain') === false"
            )
            if not already_active:
                await _rand_delay(page, 300, 600)
                await btn.first.click()
                await _wait_for_results(page, context=f"月份切换: {month_text}")
            logger.info(f"  月份: {month_text}")
        else:
            logger.warning(f"  未找到月份按钮: {month_text}")
    except Exception as e:
        logger.warning(f"  设置月份失败: {e}")
```

- [ ] **Step 2: Add sub-BSR and sub-category-only interaction**

Add the sub-BSR range and sub-category checkbox to `apply_filters()`. In the `ranges` dict, add after `"BSR"`:

```python
        "小类BSR": (args.sub_bsr_min, args.sub_bsr_max),
```

After the radio/checkbox section (before `return category_count`), add:

```python
    if getattr(args, "sub_category_only", False):
        try:
            label = page.locator("label.el-checkbox").filter(has_text="只看该子类目排名")
            if await label.count() > 0:
                disabled = await label.first.evaluate("el => el.querySelector('input')?.disabled")
                if not disabled:
                    already = await label.first.evaluate("el => el.classList.contains('is-checked')")
                    if not already:
                        await label.first.click()
                    logger.info("  只看该子类目排名 ✓")
                else:
                    logger.warning("  只看该子类目排名: checkbox 已禁用（需先选子类目）")
        except Exception as e:
            logger.warning(f"  设置只看该子类目排名失败: {e}")
```

- [ ] **Step 3: Wire month selection in `apply_filters()`**

At the very beginning of `apply_filters()`, after the `logger.info` line and before category selection, add:

```python
    # 月份选择（优先设置，影响所有数据）
    if getattr(args, "month", None):
        await _select_month(page, args.month)
```

- [ ] **Step 4: Commit**

```bash
cd D:\Code\amazon
git add .agent/skills/sellersprite-search-products/scripts/ss_search_ui.py
git commit -m "feat(ss-search): add month selection and sub-BSR UI automation"
```

---

### Task 3: Rebuild DEFAULT_FILTERS with script-aligned keys

**Files:**
- Modify: `D:\Code\ClawX\src\pages\Amazon\pipelineStore.ts`

- [ ] **Step 1: Replace the `DEFAULT_FILTERS` object**

Replace the existing `DEFAULT_FILTERS` block with filter keys that directly match the Python script parameter names (dest names from argparse). This eliminates the `s1_*` prefix indirection.

```typescript
export const DEFAULT_FILTERS: Record<string, any> = {
  // ── Phase 1: SellerSprite 搜索条件 ──
  // 月份
  month: null,
  // 销售表现
  monthly_sales_min: 300,
  monthly_sales_max: null,
  monthly_revenue_min: null,
  monthly_revenue_max: null,
  child_sales_min: null,
  child_sales_max: null,
  sales_growth_min: null,
  sales_growth_max: null,
  bsr_min: null,
  bsr_max: null,
  sub_bsr_min: null,
  sub_bsr_max: null,
  sub_category_only: false,
  bsr_growth_num_min: null,
  bsr_growth_num_max: null,
  bsr_growth_rate_min: null,
  bsr_growth_rate_max: null,
  // 产品信息
  variants_min: null,
  variants_max: null,
  price_min: 50,
  price_max: 100,
  qa_min: null,
  qa_max: null,
  review_count_min: null,
  review_count_max: null,
  monthly_reviews_min: null,
  monthly_reviews_max: null,
  rating_min: 4.5,
  rating_max: 5,
  review_rate_min: null,
  review_rate_max: null,
  fba_fee_min: null,
  fba_fee_max: null,
  gross_margin_min: null,
  gross_margin_max: null,
  listing_age: '近半年',
  lqs_min: null,
  lqs_max: null,
  pkg_weight_min: null,
  pkg_weight_max: null,
  pkg_size: null,
  buyer_shipping_min: null,
  buyer_shipping_max: null,
  low_price: false,
  // 竞品筛选
  seller_count_min: null,
  seller_count_max: 1,
  seller_location: '中国',
  include_brand: null,
  exclude_brand: null,
  include_seller: null,
  exclude_seller: null,
  exclude_keyword: null,
  include_keyword: null,
  keyword_match: null,
  fba: true,
  amz: false,
  fbm: false,
  video: null,
  product_tags: null,
  // ── Phase 2-5: 后处理筛选 ──
  max_seller_reviews: 100,
  min_store_listing_count: 2,
  max_high_sales_ratio: 0.5,
  high_sales_threshold: 200,
  max_launch_reviews: 30,
  max_review_jumps: 0,
  review_jump_threshold: 30,
  min_3m_reviews: 0,
  max_3m_reviews: 60,
  max_min_ppc: 3.0,
  max_comp_reviews: 100,
};
```

- [ ] **Step 2: Commit**

```bash
cd D:\Code\ClawX
git add src/pages/Amazon/pipelineStore.ts
git commit -m "refactor(amazon): align DEFAULT_FILTERS keys with Python script params"
```

---

### Task 4: Update filter-metadata labels

**Files:**
- Modify: `D:\Code\ClawX\electron\main\plugins\amazon\filter-metadata.ts`

- [ ] **Step 1: Replace the AMZ_FILTER_LABELS object**

```typescript
export const AMZ_FILTER_LABELS: Record<string, string> = {
  // ── 月份 ──
  "month": "月份",
  // ── 销售表现 ──
  "monthly_sales_min": "月销量 ≥",
  "monthly_sales_max": "月销量 ≤",
  "monthly_revenue_min": "月销售额 ≥",
  "monthly_revenue_max": "月销售额 ≤",
  "child_sales_min": "子体销量 ≥",
  "child_sales_max": "子体销量 ≤",
  "sales_growth_min": "月销量增长率 ≥",
  "sales_growth_max": "月销量增长率 ≤",
  "bsr_min": "BSR ≥",
  "bsr_max": "BSR ≤",
  "sub_bsr_min": "小类BSR ≥",
  "sub_bsr_max": "小类BSR ≤",
  "sub_category_only": "只看该子类目排名",
  "bsr_growth_num_min": "BSR增长数 ≥",
  "bsr_growth_num_max": "BSR增长数 ≤",
  "bsr_growth_rate_min": "BSR增长率 ≥",
  "bsr_growth_rate_max": "BSR增长率 ≤",
  // ── 产品信息 ──
  "variants_min": "变体数 ≥",
  "variants_max": "变体数 ≤",
  "price_min": "价格 ≥",
  "price_max": "价格 ≤",
  "qa_min": "Q&A ≥",
  "qa_max": "Q&A ≤",
  "review_count_min": "评分数 ≥",
  "review_count_max": "评分数 ≤",
  "monthly_reviews_min": "月评新增 ≥",
  "monthly_reviews_max": "月评新增 ≤",
  "rating_min": "评分值 ≥",
  "rating_max": "评分值 ≤",
  "review_rate_min": "留评率 ≥",
  "review_rate_max": "留评率 ≤",
  "fba_fee_min": "FBA运费 ≥",
  "fba_fee_max": "FBA运费 ≤",
  "gross_margin_min": "毛利率 ≥",
  "gross_margin_max": "毛利率 ≤",
  "listing_age": "上架时间",
  "lqs_min": "LQS ≥",
  "lqs_max": "LQS ≤",
  "pkg_weight_min": "包装重量 ≥",
  "pkg_weight_max": "包装重量 ≤",
  "pkg_size": "包装尺寸",
  "buyer_shipping_min": "买家运费 ≥",
  "buyer_shipping_max": "买家运费 ≤",
  "low_price": "低价商品",
  // ── 竞品筛选 ──
  "seller_count_min": "卖家数量 ≥",
  "seller_count_max": "卖家数量 ≤",
  "seller_location": "卖家所属地",
  "include_brand": "包含品牌",
  "exclude_brand": "排除品牌",
  "include_seller": "包含卖家",
  "exclude_seller": "排除卖家",
  "exclude_keyword": "排除关键词",
  "include_keyword": "包含关键词",
  "keyword_match": "关键词匹配",
  "fba": "FBA",
  "amz": "AMZ",
  "fbm": "FBM",
  "video": "主图视频",
  "product_tags": "商品标识",
  // ── Phase 2-5 后处理 ──
  "max_seller_reviews": "店铺评价数上限",
  "min_store_listing_count": "店铺最少商品数",
  "max_high_sales_ratio": "成熟产品占比上限",
  "high_sales_threshold": "高销量阈值",
  "max_launch_reviews": "上架时评论数限制",
  "max_3m_reviews": "3个月后评论上限",
  "min_3m_reviews": "3个月后评论下限",
  "review_jump_threshold": "评论跳涨阈值",
  "max_review_jumps": "允许评论跳涨次数",
  "max_min_ppc": "核心词最低竞价上限",
  "max_comp_reviews": "首页对标评价数限制",
};
```

- [ ] **Step 2: Commit**

```bash
cd D:\Code\ClawX
git add electron/main/plugins/amazon/filter-metadata.ts
git commit -m "refactor(amazon): complete filter label mapping for all SellerSprite params"
```

---

### Task 5: Rebuild PipelineFilterForm to match SellerSprite layout

**Files:**
- Rewrite: `D:\Code\ClawX\src\pages\Amazon\components\PipelineFilterForm.tsx`

This is the core UI change. The form is rebuilt to mirror SellerSprite's 3-group structure for Phase 1, while keeping Phase 2-5 groups unchanged.

- [ ] **Step 1: Rewrite the component**

```tsx
// src/pages/Amazon/components/PipelineFilterForm.tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ─── Field type definitions ──────────────────────────────────────────────────

type FieldType = 'range' | 'range-pct' | 'range-usd' | 'range-weight' | 'select' | 'text' | 'checkbox' | 'radio' | 'checkbox-group';

interface FilterFieldBase {
  label: string;
  type: FieldType;
}

interface RangeField extends FilterFieldBase {
  type: 'range' | 'range-pct' | 'range-usd' | 'range-weight';
  keyMin: string;
  keyMax: string;
}

interface SelectField extends FilterFieldBase {
  type: 'select';
  key: string;
  options: string[];
}

interface TextField extends FilterFieldBase {
  type: 'text';
  key: string;
  placeholder?: string;
}

interface CheckboxField extends FilterFieldBase {
  type: 'checkbox';
  key: string;
}

interface RadioField extends FilterFieldBase {
  type: 'radio';
  key: string;
  options: string[];
}

interface CheckboxGroupField extends FilterFieldBase {
  type: 'checkbox-group';
  items: { key: string; label: string }[];
}

type FilterField = RangeField | SelectField | TextField | CheckboxField | RadioField | CheckboxGroupField;

interface FilterGroup {
  id: string;
  title: string;
  phase?: number;
  fields: FilterField[];
}

// ─── SellerSprite-aligned filter groups ───────────────────────────────────────

const LISTING_AGE_OPTIONS = [
  '不限', '近30天', '近60天', '近3个月', '近半年',
  '近1年', '近2年', '近1~2年', '近3年', '近4年', '近3~4年', '4年以上',
];

const PKG_SIZE_OPTIONS = ['不限', '标准', '大件', '超大件'];

const MONTH_OPTIONS = (() => {
  const opts = ['最近30天'];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return opts;
})();

const VIDEO_OPTIONS = ['不限', '含视频', '不含视频'];
const KEYWORD_MATCH_OPTIONS = ['模糊匹配', '词组匹配', '精准匹配'];
const PRODUCT_TAG_OPTIONS = ['Best Seller', "Amazon's Choice", 'New Release', 'A+', '不含A+'];

const PHASE1_GROUPS: FilterGroup[] = [
  {
    id: 'month',
    title: '选择月份',
    fields: [
      { label: '月份', type: 'select', key: 'month', options: MONTH_OPTIONS },
    ],
  },
  {
    id: 'sales',
    title: '销售表现',
    fields: [
      { label: '月销量', type: 'range', keyMin: 'monthly_sales_min', keyMax: 'monthly_sales_max' },
      { label: '月销售额', type: 'range-usd', keyMin: 'monthly_revenue_min', keyMax: 'monthly_revenue_max' },
      { label: '子体销量', type: 'range', keyMin: 'child_sales_min', keyMax: 'child_sales_max' },
      { label: '月销量增长率', type: 'range-pct', keyMin: 'sales_growth_min', keyMax: 'sales_growth_max' },
      { label: 'BSR', type: 'range', keyMin: 'bsr_min', keyMax: 'bsr_max' },
      { label: '小类BSR', type: 'range', keyMin: 'sub_bsr_min', keyMax: 'sub_bsr_max' },
      { label: '只看该子类目排名', type: 'checkbox', key: 'sub_category_only' },
      { label: 'BSR增长数', type: 'range', keyMin: 'bsr_growth_num_min', keyMax: 'bsr_growth_num_max' },
      { label: 'BSR增长率', type: 'range-pct', keyMin: 'bsr_growth_rate_min', keyMax: 'bsr_growth_rate_max' },
    ],
  },
  {
    id: 'product',
    title: '产品信息',
    fields: [
      { label: '变体数', type: 'range', keyMin: 'variants_min', keyMax: 'variants_max' },
      { label: '价格', type: 'range-usd', keyMin: 'price_min', keyMax: 'price_max' },
      { label: 'Q&A', type: 'range', keyMin: 'qa_min', keyMax: 'qa_max' },
      { label: '评分数', type: 'range', keyMin: 'review_count_min', keyMax: 'review_count_max' },
      { label: '月评新增', type: 'range', keyMin: 'monthly_reviews_min', keyMax: 'monthly_reviews_max' },
      { label: '评分值', type: 'range', keyMin: 'rating_min', keyMax: 'rating_max' },
      { label: '留评率', type: 'range-pct', keyMin: 'review_rate_min', keyMax: 'review_rate_max' },
      { label: 'FBA运费', type: 'range-usd', keyMin: 'fba_fee_min', keyMax: 'fba_fee_max' },
      { label: '毛利率', type: 'range-pct', keyMin: 'gross_margin_min', keyMax: 'gross_margin_max' },
      { label: '上架时间', type: 'select', key: 'listing_age', options: LISTING_AGE_OPTIONS },
      { label: 'LQS', type: 'range', keyMin: 'lqs_min', keyMax: 'lqs_max' },
      { label: '包装重量', type: 'range-weight', keyMin: 'pkg_weight_min', keyMax: 'pkg_weight_max' },
      { label: '包装尺寸', type: 'select', key: 'pkg_size', options: PKG_SIZE_OPTIONS },
      { label: '买家运费', type: 'range-usd', keyMin: 'buyer_shipping_min', keyMax: 'buyer_shipping_max' },
      { label: '低价商品', type: 'checkbox', key: 'low_price' },
    ],
  },
  {
    id: 'compete',
    title: '竞品筛选',
    fields: [
      { label: '卖家数量', type: 'range', keyMin: 'seller_count_min', keyMax: 'seller_count_max' },
      { label: '卖家所属地', type: 'text', key: 'seller_location', placeholder: '如: 中国,美国' },
      { label: '包含品牌', type: 'text', key: 'include_brand', placeholder: '多个以英文逗号区分' },
      { label: '排除品牌', type: 'text', key: 'exclude_brand', placeholder: '多个以英文逗号区分' },
      { label: '包含卖家', type: 'text', key: 'include_seller', placeholder: '多个以英文逗号区分' },
      { label: '排除卖家', type: 'text', key: 'exclude_seller', placeholder: '多个以英文逗号区分' },
      { label: '排除关键词', type: 'text', key: 'exclude_keyword', placeholder: '多个以英文逗号区分' },
      { label: '包含关键词', type: 'text', key: 'include_keyword', placeholder: '多个以英文逗号区分' },
      { label: '关键词匹配', type: 'radio', key: 'keyword_match', options: KEYWORD_MATCH_OPTIONS },
      { label: '配送方式', type: 'checkbox-group', items: [
        { key: 'amz', label: 'AMZ' },
        { key: 'fba', label: 'FBA' },
        { key: 'fbm', label: 'FBM' },
      ]},
      { label: '主图视频', type: 'radio', key: 'video', options: VIDEO_OPTIONS },
      { label: '商品标识', type: 'text', key: 'product_tags', placeholder: 'BestSeller,AmazonChoice,NewRelease,A+' },
    ],
  },
];

const PHASE2_5_GROUPS: FilterGroup[] = [
  {
    id: 'phase2',
    title: 'Phase 2 — 卖家筛选',
    phase: 2,
    fields: [
      { label: '最大历史评价数', type: 'range', keyMin: '_skip', keyMax: 'max_seller_reviews' },
    ],
  },
  {
    id: 'phase3',
    title: 'Phase 3 — 店铺筛选',
    phase: 3,
    fields: [
      { label: '最少店铺商品数', type: 'range', keyMin: 'min_store_listing_count', keyMax: '_skip' },
      { label: '成熟产品比例上限', type: 'range', keyMin: '_skip', keyMax: 'max_high_sales_ratio' },
      { label: '高销量阈值', type: 'range', keyMin: 'high_sales_threshold', keyMax: '_skip' },
    ],
  },
  {
    id: 'phase4',
    title: 'Phase 4 — 产品详情筛选',
    phase: 4,
    fields: [
      { label: '上架评论数上限', type: 'range', keyMin: '_skip', keyMax: 'max_launch_reviews' },
      { label: '评论跳涨次数上限', type: 'range', keyMin: '_skip', keyMax: 'max_review_jumps' },
      { label: '跳涨检测阈值', type: 'range', keyMin: 'review_jump_threshold', keyMax: '_skip' },
      { label: '3 月评论最少', type: 'range', keyMin: 'min_3m_reviews', keyMax: '_skip' },
      { label: '3 月评论最多', type: 'range', keyMin: '_skip', keyMax: 'max_3m_reviews' },
    ],
  },
  {
    id: 'phase5',
    title: 'Phase 5 — 关键词筛选',
    phase: 5,
    fields: [
      { label: 'PPC 最小值上限 ($)', type: 'range', keyMin: '_skip', keyMax: 'max_min_ppc' },
      { label: '竞品评论数上限', type: 'range', keyMin: '_skip', keyMax: 'max_comp_reviews' },
    ],
  },
];

// ─── Field renderers ─────────────────────────────────────────────────────────

function RangeInput({ field, filters, onChange, suffix }: {
  field: RangeField; filters: Record<string, any>;
  onChange: (key: string, value: any) => void; suffix?: string;
}) {
  const showMin = field.keyMin !== '_skip';
  const showMax = field.keyMax !== '_skip';

  return (
    <div className="flex items-center gap-1.5">
      {showMin ? (
        <div className="relative flex-1">
          <Input
            type="number"
            placeholder="最小值"
            value={filters[field.keyMin] ?? ''}
            onChange={(e) => onChange(field.keyMin, e.target.value === '' ? null : parseFloat(e.target.value))}
            className="h-8 rounded-lg text-xs bg-background pr-6"
          />
          {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>}
        </div>
      ) : <div className="flex-1" />}
      {showMin && showMax && <span className="text-xs text-muted-foreground shrink-0">~</span>}
      {showMax ? (
        <div className="relative flex-1">
          <Input
            type="number"
            placeholder="最大值"
            value={filters[field.keyMax] ?? ''}
            onChange={(e) => onChange(field.keyMax, e.target.value === '' ? null : parseFloat(e.target.value))}
            className="h-8 rounded-lg text-xs bg-background pr-6"
          />
          {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>}
        </div>
      ) : <div className="flex-1" />}
    </div>
  );
}

function FieldRenderer({ field, filters, onChange }: {
  field: FilterField; filters: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  switch (field.type) {
    case 'range':
      return <RangeInput field={field} filters={filters} onChange={onChange} />;
    case 'range-pct':
      return <RangeInput field={field} filters={filters} onChange={onChange} suffix="%" />;
    case 'range-usd':
      return <RangeInput field={field} filters={filters} onChange={onChange} suffix="$" />;
    case 'range-weight':
      return <RangeInput field={field} filters={filters} onChange={onChange} suffix="g" />;

    case 'select': {
      const f = field as SelectField;
      return (
        <select
          value={filters[f.key] ?? ''}
          onChange={(e) => onChange(f.key, e.target.value || null)}
          className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
        >
          <option value="">不限</option>
          {f.options.filter(o => o !== '不限').map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }

    case 'text': {
      const f = field as TextField;
      return (
        <Input
          type="text"
          placeholder={f.placeholder}
          value={filters[f.key] ?? ''}
          onChange={(e) => onChange(f.key, e.target.value || null)}
          className="h-8 rounded-lg text-xs bg-background"
        />
      );
    }

    case 'checkbox': {
      const f = field as CheckboxField;
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!filters[f.key]}
            onChange={(e) => onChange(f.key, e.target.checked)}
            className="rounded border-muted-foreground"
          />
          <span className="text-xs text-muted-foreground">{f.label}</span>
        </label>
      );
    }

    case 'radio': {
      const f = field as RadioField;
      return (
        <div className="flex flex-wrap gap-2">
          {f.options.map((o) => (
            <label key={o} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name={f.key}
                checked={filters[f.key] === o}
                onChange={() => onChange(f.key, o)}
                className="accent-primary"
              />
              <span className="text-xs">{o}</span>
            </label>
          ))}
        </div>
      );
    }

    case 'checkbox-group': {
      const f = field as CheckboxGroupField;
      return (
        <div className="flex flex-wrap gap-3">
          {f.items.map((item) => (
            <label key={item.key} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters[item.key]}
                onChange={(e) => onChange(item.key, e.target.checked)}
                className="rounded border-muted-foreground"
              />
              <span className="text-xs">{item.label}</span>
            </label>
          ))}
        </div>
      );
    }
  }
}

// ─── Collapsible group component ─────────────────────────────────────────────

function FilterGroupPanel({ group, filters, onChange, isExpanded, onToggle, disabled }: {
  group: FilterGroup; filters: Record<string, any>;
  onChange: (key: string, value: any) => void;
  isExpanded: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden transition-all',
      disabled ? 'bg-muted/20 opacity-50 pointer-events-none' : 'bg-card'
    )}>
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <span className="text-sm font-bold">{group.title}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
      </button>
      {isExpanded && (
        <div className="px-5 pb-5 pt-1 border-t border-dashed space-y-3 bg-muted/5">
          {group.fields.map((field) => {
            // Checkbox and checkbox-group render inline (no separate label row)
            if (field.type === 'checkbox') {
              return (
                <div key={(field as CheckboxField).key}>
                  <FieldRenderer field={field} filters={filters} onChange={onChange} />
                </div>
              );
            }
            return (
              <div key={'key' in field ? field.key : (field as RangeField).keyMin}>
                <div className="text-[11px] font-bold text-muted-foreground mb-1">{field.label}</div>
                <FieldRenderer field={field} filters={filters} onChange={onChange} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface PipelineFilterFormProps {
  filters: Record<string, any>;
  onFilterChange: (key: string, value: any) => void;
  enabledPhases: number[];
}

export function PipelineFilterForm({ filters, onFilterChange, enabledPhases }: PipelineFilterFormProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['sales']));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Phase 1: SellerSprite-aligned groups */}
      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-2">
        Phase 1 — 搜索条件 (SellerSprite)
      </div>
      {PHASE1_GROUPS.map((g) => (
        <FilterGroupPanel
          key={g.id}
          group={g}
          filters={filters}
          onChange={onFilterChange}
          isExpanded={expanded.has(g.id)}
          onToggle={() => toggle(g.id)}
        />
      ))}

      {/* Phase 2-5 groups */}
      {PHASE2_5_GROUPS.map((g) => (
        <FilterGroupPanel
          key={g.id}
          group={g}
          filters={filters}
          onChange={onFilterChange}
          isExpanded={expanded.has(g.id)}
          onToggle={() => toggle(g.id)}
          disabled={g.phase !== undefined && !enabledPhases.includes(g.phase)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd D:\Code\ClawX
git add src/pages/Amazon/components/PipelineFilterForm.tsx
git commit -m "feat(amazon): rebuild PipelineFilterForm to match SellerSprite layout"
```

---

### Task 6: Remove stale `s1_*` references from PipelineWizard

**Files:**
- Modify: `D:\Code\ClawX\src\pages\Amazon\PipelineWizard.tsx`

The old `s1_min_sales`, `s1_min_price` etc. keys no longer exist in `DEFAULT_FILTERS`. The filter enrichment logic in the `useEffect` that loads tools should still work because it merges `filters_default.json` keys (which use the script-aligned names). No changes needed to the filter-passing logic since all filters are passed as `filter:key` anyway.

- [ ] **Step 1: Verify no hardcoded `s1_*` references remain in PipelineWizard.tsx**

Search the file for `s1_`. If any exist, update them to the new key names. The current PipelineWizard.tsx does not reference `s1_*` keys directly (those are in `DEFAULT_FILTERS` and `PipelineFilterForm`), so this should be a no-op verification.

- [ ] **Step 2: If changes needed, commit**

```bash
cd D:\Code\ClawX
git add src/pages/Amazon/PipelineWizard.tsx
git commit -m "fix(amazon): update stale s1_ filter references"
```

---

### Task 7: Build and verify

- [ ] **Step 1: Run ClawX unit tests**

```bash
cd D:\Code\ClawX && pnpm test -- --run
```

Expected: All tests pass (the pipelineStore tests reset to DEFAULT_FILTERS, which changed shape but the test only checks new Plan B fields).

- [ ] **Step 2: Verify visually**

```bash
cd D:\Code\ClawX && pnpm dev
```

Navigate to Pipeline Wizard → Step 2 (筛选参数). Verify:
- "选择月份" group with dropdown showing 最近30天 + 24 months
- "销售表现" group with 月销量, 月销售额, 子体销量, BSR, 小类BSR, BSR增长数, BSR增长率 ranges
- "产品信息" group with 变体数, 价格, Q&A, 评分数, 评分值, 留评率, FBA运费, 毛利率, 上架时间, LQS, 包装重量, 包装尺寸, 买家运费, 低价商品
- "竞品筛选" group with 卖家数量, 卖家所属地, brands, sellers, keywords, 配送方式, 主图视频, 商品标识
- Phase 2-5 groups unchanged

- [ ] **Step 3: Final commit if needed**

```bash
git add -A && git commit -m "fix: integration adjustments for SellerSprite filter alignment"
```
