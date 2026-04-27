# Plan C: ClawX Standalone Features (Session Selector + Profit Simulator)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add smart session selector with historical dedup and interactive profit simulator to the pipeline wizard, reducing manual errors and enabling real-time feasibility assessment.

**Architecture:** Session selector uses IPC to scan `report/sessions/` directory, defaults to selecting all for dedup. Profit simulator is a pure frontend component using Amazon FBA fee formulas — no backend needed.

**Tech Stack:** TypeScript, React 19, Zustand, Tailwind CSS, Vitest

**Codebase:** `D:\Code\ClawX`

**Depends on:** Plan B (pipelineStore extension with types/pipeline.ts) must be completed first.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/pages/Amazon/components/SessionSelector.tsx` | Session scanning + dedup selection UI |
| Create | `src/pages/Amazon/hooks/useSessionScanner.ts` | IPC hook for scanning sessions |
| Create | `src/pages/Amazon/components/ProfitSimulator.tsx` | Interactive profit calculator |
| Create | `src/pages/Amazon/hooks/useProfitCalculator.ts` | Profit calculation logic |
| Create | `tests/unit/pages/Amazon/profitCalculator.test.ts` | Unit tests for profit math |
| Modify | `src/pages/Amazon/pipelineStore.ts` | Add dedup session state |
| Modify | `src/pages/Amazon/PipelineWizard.tsx` | Integrate session selector + profit simulator |

---

### Task 1: Add session dedup state to pipelineStore

**Files:**
- Modify: `src/pages/Amazon/pipelineStore.ts`
- Modify: `tests/unit/pages/Amazon/pipelineStore.test.ts`

- [ ] **Step 1: Write tests**

Append to `tests/unit/pages/Amazon/pipelineStore.test.ts`:

```typescript
  it('should initialize with empty dedup sessions', () => {
    expect(usePipelineStore.getState().dedup.availableSessions).toEqual([]);
    expect(usePipelineStore.getState().dedup.selectedSessions).toEqual([]);
  });

  it('should set available sessions and auto-select all', () => {
    const sessions = [
      { name: '20260426-1', productCount: 44, date: '2026-04-26', path: '/path' },
      { name: '20260404', productCount: 38, date: '2026-04-04', path: '/path2' },
    ];
    usePipelineStore.getState().setAvailableSessions(sessions);
    const state = usePipelineStore.getState();
    expect(state.dedup.availableSessions).toHaveLength(2);
    expect(state.dedup.selectedSessions).toEqual(['20260426-1', '20260404']);
  });

  it('should toggle session selection', () => {
    const sessions = [
      { name: '20260426-1', productCount: 44, date: '2026-04-26', path: '/p1' },
      { name: '20260404', productCount: 38, date: '2026-04-04', path: '/p2' },
    ];
    usePipelineStore.getState().setAvailableSessions(sessions);
    usePipelineStore.getState().toggleDedupSession('20260404');
    expect(usePipelineStore.getState().dedup.selectedSessions).toEqual(['20260426-1']);
    usePipelineStore.getState().toggleDedupSession('20260404');
    expect(usePipelineStore.getState().dedup.selectedSessions).toEqual(['20260426-1', '20260404']);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:\Code\ClawX && pnpm test -- --run tests/unit/pages/Amazon/pipelineStore.test.ts`

- [ ] **Step 3: Add dedup state and actions to pipelineStore.ts**

Add to PipelineState interface:
```typescript
  dedup: {
    availableSessions: SessionInfo[];
    selectedSessions: string[];
  };
  setAvailableSessions: (sessions: SessionInfo[]) => void;
  toggleDedupSession: (name: string) => void;
  selectAllDedupSessions: () => void;
  deselectAllDedupSessions: () => void;
```

Add import:
```typescript
import type { SessionInfo } from './types/pipeline';
```

Add defaults:
```typescript
  dedup: { availableSessions: [], selectedSessions: [] },
```

Add actions:
```typescript
  setAvailableSessions: (sessions) =>
    set({ dedup: { availableSessions: sessions, selectedSessions: sessions.map((s) => s.name) } }),

  toggleDedupSession: (name) =>
    set((s) => ({
      dedup: {
        ...s.dedup,
        selectedSessions: s.dedup.selectedSessions.includes(name)
          ? s.dedup.selectedSessions.filter((n) => n !== name)
          : [...s.dedup.selectedSessions, name],
      },
    })),

  selectAllDedupSessions: () =>
    set((s) => ({
      dedup: { ...s.dedup, selectedSessions: s.dedup.availableSessions.map((ss) => ss.name) },
    })),

  deselectAllDedupSessions: () =>
    set((s) => ({ dedup: { ...s.dedup, selectedSessions: [] } })),
```

Add to reset():
```typescript
  dedup: { availableSessions: [], selectedSessions: [] },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:\Code\ClawX && pnpm test -- --run tests/unit/pages/Amazon/pipelineStore.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/pages/Amazon/pipelineStore.ts tests/unit/pages/Amazon/pipelineStore.test.ts
git commit -m "feat(amazon): add session dedup state to pipeline store"
```

---

### Task 2: Create useSessionScanner hook

**Files:**
- Create: `src/pages/Amazon/hooks/useSessionScanner.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/pages/Amazon/hooks/useSessionScanner.ts
import { useEffect, useState } from 'react';
import { usePipelineStore } from '../pipelineStore';
import type { SessionInfo } from '../types/pipeline';

export function useSessionScanner() {
  const [loading, setLoading] = useState(false);
  const setAvailableSessions = usePipelineStore((s) => s.setAvailableSessions);
  const sessionName = usePipelineStore((s) => s.sessionName);

  const scan = async () => {
    setLoading(true);
    try {
      const sessions = (await window.electronAPI?.invoke('amazon:scanSessions')) as SessionInfo[] ?? [];
      // Exclude current session from dedup list
      const filtered = sessions.filter((s) => s.name !== sessionName);
      setAvailableSessions(filtered);
    } finally {
      setLoading(false);
    }
  };

  // Auto-scan on mount
  useEffect(() => {
    scan();
  }, [sessionName]);

  return { scan, loading };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Amazon/hooks/useSessionScanner.ts
git commit -m "feat(amazon): add useSessionScanner hook"
```

---

### Task 3: Build SessionSelector component

**Files:**
- Create: `src/pages/Amazon/components/SessionSelector.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/pages/Amazon/components/SessionSelector.tsx
import { Loader2, RefreshCw } from 'lucide-react';
import { usePipelineStore } from '../pipelineStore';
import { useSessionScanner } from '../hooks/useSessionScanner';

export function SessionSelector() {
  const { scan, loading } = useSessionScanner();
  const dedup = usePipelineStore((s) => s.dedup);
  const toggleSession = usePipelineStore((s) => s.toggleDedupSession);
  const selectAll = usePipelineStore((s) => s.selectAllDedupSessions);
  const deselectAll = usePipelineStore((s) => s.deselectAllDedupSessions);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-300">历史去重 Session</label>
        <button
          onClick={scan}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          刷新
        </button>
      </div>

      {dedup.availableSessions.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-500">
          {loading ? '扫描中...' : '无历史 session'}
        </div>
      ) : (
        <>
          <div className="flex gap-2 text-xs">
            <button onClick={selectAll} className="text-blue-400 hover:text-blue-300">全选</button>
            <button onClick={deselectAll} className="text-zinc-500 hover:text-zinc-300">全不选</button>
            <span className="text-zinc-600">
              已选 {dedup.selectedSessions.length}/{dedup.availableSessions.length}
            </span>
          </div>

          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
            {dedup.availableSessions.map((session) => (
              <label
                key={session.name}
                className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-zinc-800/50"
              >
                <input
                  type="checkbox"
                  checked={dedup.selectedSessions.includes(session.name)}
                  onChange={() => toggleSession(session.name)}
                  className="rounded border-zinc-600"
                />
                <span className="text-sm text-zinc-300">{session.name}</span>
                <span className="text-xs text-zinc-500">
                  ({session.productCount} products, {session.date})
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Amazon/components/SessionSelector.tsx
git commit -m "feat(amazon): add SessionSelector component with auto-scan"
```

---

### Task 4: Create profit calculator logic with tests

**Files:**
- Create: `src/pages/Amazon/hooks/useProfitCalculator.ts`
- Create: `tests/unit/pages/Amazon/profitCalculator.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/unit/pages/Amazon/profitCalculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateProfit, getViability } from '../../../../src/pages/Amazon/hooks/useProfitCalculator';

describe('calculateProfit', () => {
  const BASE = {
    sellingPrice: 59.99,
    costPrice: 18,          // 30% of selling price
    shippingCost: 5,
    ppcDailyBudget: 30,
    targetAcos: 0.30,
    conversionRate: 0.15,
    monthlyUnits: 450,       // ~15/day
  };

  it('should calculate gross margin correctly', () => {
    const result = calculateProfit(BASE);
    // FBA fee ~= 15% of selling price = ~$9
    // Referral fee = 15% = ~$9
    // Unit profit = 59.99 - 18 - 5 - 9 - 9 = ~$18.99
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:\Code\ClawX && pnpm test -- --run tests/unit/pages/Amazon/profitCalculator.test.ts`

- [ ] **Step 3: Write the calculator logic**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:\Code\ClawX && pnpm test -- --run tests/unit/pages/Amazon/profitCalculator.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/Amazon/hooks/useProfitCalculator.ts tests/unit/pages/Amazon/profitCalculator.test.ts
git commit -m "feat(amazon): add profit calculator logic with tests"
```

---

### Task 5: Build ProfitSimulator component

**Files:**
- Create: `src/pages/Amazon/components/ProfitSimulator.tsx`

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Amazon/components/ProfitSimulator.tsx
git commit -m "feat(amazon): add ProfitSimulator component with interactive sliders"
```

---

### Task 6: Integrate SessionSelector and ProfitSimulator into PipelineWizard

**Files:**
- Modify: `src/pages/Amazon/PipelineWizard.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { SessionSelector } from './components/SessionSelector';
import { ProfitSimulator } from './components/ProfitSimulator';
```

- [ ] **Step 2: Add SessionSelector to config step**

In `renderConfigStep()`, after session name input, add:
```tsx
<SessionSelector />
```

- [ ] **Step 3: Pass selected sessions to workflow**

In `startPipeline()`, include dedup sessions in workflow args. Find where `--session` is passed and add:
```typescript
const selectedSessions = usePipelineStore.getState().dedup.selectedSessions;
if (selectedSessions.length > 0) {
  // Add --prev-session args for select_product_base.py step
  step.args['prev-session'] = selectedSessions.join(' ');
}
```

- [ ] **Step 4: Add ProfitSimulator to results step**

In `renderResultsStep()`, after the report content, add profit simulators for products that have price/sales data:
```tsx
{stats && Object.values(stats).some((s) => s.count > 0) && (
  <div className="mt-4">
    <h3 className="mb-2 text-sm font-medium text-zinc-300">利润模拟 (示例)</h3>
    <ProfitSimulator sellingPrice={59.99} monthlyUnits={450} />
  </div>
)}
```

- [ ] **Step 5: Run all tests**

Run: `cd D:\Code\ClawX && pnpm test -- --run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/pages/Amazon/PipelineWizard.tsx
git commit -m "feat(amazon): integrate SessionSelector and ProfitSimulator into wizard"
```

---

### Task 7: End-to-end manual verification

- [ ] **Step 1: Build and launch ClawX**

```bash
cd D:\Code\ClawX && pnpm dev
```

- [ ] **Step 2: Verify SessionSelector**

1. Navigate to `/amazon/pipeline-wizard`
2. Verify session selector appears in Step 1
3. Verify historical sessions are listed and all checked by default
4. Toggle a session off/on, verify checkbox state

- [ ] **Step 3: Verify ProfitSimulator**

1. Complete a pipeline run or navigate to results step
2. Verify profit simulator renders with sliders
3. Adjust sliders, verify real-time calculation updates
4. Verify viability badge changes color (green/amber/red)

- [ ] **Step 4: Final test run**

```bash
cd D:\Code\ClawX && pnpm test -- --run
```
Expected: All tests pass

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "fix: final adjustments for standalone features"
```
