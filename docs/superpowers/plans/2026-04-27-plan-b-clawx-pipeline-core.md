# Plan B: ClawX Pipeline Core Enhancement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance ClawX pipeline with quality check integration, execution modes, CAPTCHA smart handling, and multi-level progress, enabling semi-autonomous pipeline execution with data quality guarantees.

**Architecture:** Extend existing Zustand store (`pipelineStore.ts`) with new state slices. Enhance `executor.ts` to parse new log signals (`PHASE:`, `QC_RESULT:`, `CAPTCHA:`). Add IPC channels for quality check results, CAPTCHA flow, and session scanning. Build new React components for quality check panel, execution mode selector, and enhanced CAPTCHA modal.

**Tech Stack:** TypeScript, React 19, Zustand, Radix UI, Tailwind CSS, Framer Motion, Vitest

**Codebase:** `D:\Code\ClawX`

**Depends on:** Plan A (Python --json adaptation) must be completed first.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/pages/Amazon/types/pipeline.ts` | Pipeline-specific type definitions |
| Create | `src/pages/Amazon/components/ExecutionModeSelector.tsx` | 3-mode radio selector (auto/step/hybrid) |
| Create | `src/pages/Amazon/components/QualityCheckPanel.tsx` | Quality check results tab with history |
| Create | `src/pages/Amazon/components/QualityCheckBadge.tsx` | Inline pass/fail badge per phase |
| Create | `src/pages/Amazon/components/CaptchaModal.tsx` | Enhanced CAPTCHA modal with frequency info |
| Create | `src/pages/Amazon/components/ProgressMultiLevel.tsx` | 3-level progress display |
| Create | `src/pages/Amazon/hooks/useQualityCheck.ts` | QC result listener + retry logic |
| Create | `tests/unit/pages/Amazon/pipelineStore.test.ts` | Store unit tests |
| Modify | `src/pages/Amazon/pipelineStore.ts` | Add executionMode, qualityChecks, captcha, progress slices |
| Modify | `electron/main/plugins/runner/executor.ts` | Parse PHASE:, QC_RESULT:, CAPTCHA: signals |
| Modify | `electron/main/ipc-amazon.ts` | Add quality-check, captcha, scan-sessions IPC |
| Modify | `src/pages/Amazon/PipelineWizard.tsx` | Integrate new components and flow |

---

### Task 1: Define pipeline types

**Files:**
- Create: `src/pages/Amazon/types/pipeline.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/pages/Amazon/types/pipeline.ts

export type ExecutionMode = 'auto' | 'step' | 'hybrid';

export type PipelinePhase =
  | 'category_sampling'
  | 'seller_verification'
  | 'store_check'
  | 'product_detail'
  | 'keyword_research'
  | 'report_generation';

export type PhaseStep = 'execute' | 'check' | 'retry';

export interface QualityCheckResult {
  phase: PipelinePhase;
  timestamp: string;
  pass: boolean;
  metrics: Record<string, number | boolean>;
  threshold?: number;
  recrawl_csv?: string;
  recrawl_count?: number;
  details?: Record<string, unknown>;
}

export interface QualityCheckState {
  status: 'pending' | 'running' | 'passed' | 'failed';
  result?: QualityCheckResult;
  retryCount: number;
}

export interface CaptchaState {
  isWaiting: boolean;
  timestamps: number[];
  currentDelay: number;
  skippedAsins: string[];
}

export interface MultiLevelProgress {
  phase: PipelinePhase | null;
  phaseStep: PhaseStep;
  percent: number;
  message: string;
}

export interface SessionInfo {
  name: string;
  productCount: number;
  date: string;
  path: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Amazon/types/pipeline.ts
git commit -m "feat(amazon): add pipeline enhancement type definitions"
```

---

### Task 2: Extend pipelineStore with new state slices

**Files:**
- Modify: `src/pages/Amazon/pipelineStore.ts`
- Create: `tests/unit/pages/Amazon/pipelineStore.test.ts`

- [ ] **Step 1: Write store tests**

```typescript
// tests/unit/pages/Amazon/pipelineStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { usePipelineStore } from '../../../../src/pages/Amazon/pipelineStore';

describe('pipelineStore', () => {
  beforeEach(() => {
    usePipelineStore.getState().reset();
  });

  it('should have default execution mode as step', () => {
    expect(usePipelineStore.getState().executionMode).toBe('step');
  });

  it('should update execution mode', () => {
    usePipelineStore.getState().setExecutionMode('auto');
    expect(usePipelineStore.getState().executionMode).toBe('auto');
  });

  it('should initialize quality checks as pending', () => {
    const qc = usePipelineStore.getState().qualityChecks;
    expect(qc.seller_verification.status).toBe('pending');
    expect(qc.seller_verification.retryCount).toBe(0);
  });

  it('should update quality check result', () => {
    usePipelineStore.getState().setQualityCheckResult('seller_verification', {
      phase: 'seller_verification',
      timestamp: '2026-04-27T10:00:00Z',
      pass: true,
      metrics: { total: 312, success: 310, failed: 2, success_rate: 0.9936 },
      threshold: 0.95,
    });
    const qc = usePipelineStore.getState().qualityChecks.seller_verification;
    expect(qc.status).toBe('passed');
    expect(qc.result?.metrics.total).toBe(312);
  });

  it('should track captcha state', () => {
    usePipelineStore.getState().triggerCaptcha();
    const captcha = usePipelineStore.getState().captcha;
    expect(captcha.isWaiting).toBe(true);
    expect(captcha.timestamps.length).toBe(1);
  });

  it('should increase delay on repeated captcha', () => {
    const store = usePipelineStore.getState();
    store.triggerCaptcha();
    store.resolveCaptcha();
    store.triggerCaptcha();
    expect(usePipelineStore.getState().captcha.currentDelay).toBeGreaterThan(10);
  });

  it('should update multi-level progress', () => {
    usePipelineStore.getState().updatePhaseProgress({
      phase: 'keyword_research',
      phaseStep: 'check',
      percent: 45,
      message: 'Running quality check',
    });
    const progress = usePipelineStore.getState().progress;
    expect(progress.phase).toBe('keyword_research');
    expect(progress.phaseStep).toBe('check');
  });

  it('should reset quality checks on full reset', () => {
    usePipelineStore.getState().setQualityCheckResult('seller_verification', {
      phase: 'seller_verification', timestamp: '', pass: true,
      metrics: { total: 1, success: 1, failed: 0, success_rate: 1 },
    });
    usePipelineStore.getState().reset();
    expect(usePipelineStore.getState().qualityChecks.seller_verification.status).toBe('pending');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:\Code\ClawX && pnpm test -- --run tests/unit/pages/Amazon/pipelineStore.test.ts`
Expected: FAIL (new fields/methods don't exist)

- [ ] **Step 3: Extend pipelineStore.ts**

Add imports at top:
```typescript
import type {
  ExecutionMode, PipelinePhase, QualityCheckResult,
  QualityCheckState, CaptchaState, MultiLevelProgress,
} from './types/pipeline';
```

Add to PipelineState interface:
```typescript
  // Execution mode
  executionMode: ExecutionMode;
  setExecutionMode: (mode: ExecutionMode) => void;

  // Quality checks
  qualityChecks: Record<PipelinePhase, QualityCheckState>;
  setQualityCheckResult: (phase: PipelinePhase, result: QualityCheckResult) => void;
  setQualityCheckStatus: (phase: PipelinePhase, status: QualityCheckState['status']) => void;

  // CAPTCHA
  captcha: CaptchaState;
  triggerCaptcha: () => void;
  resolveCaptcha: () => void;

  // Multi-level progress
  progress: MultiLevelProgress;
  updatePhaseProgress: (p: MultiLevelProgress) => void;
```

Add default values in create():
```typescript
  executionMode: 'step',

  qualityChecks: {
    category_sampling: { status: 'pending', retryCount: 0 },
    seller_verification: { status: 'pending', retryCount: 0 },
    store_check: { status: 'pending', retryCount: 0 },
    product_detail: { status: 'pending', retryCount: 0 },
    keyword_research: { status: 'pending', retryCount: 0 },
    report_generation: { status: 'pending', retryCount: 0 },
  },

  captcha: { isWaiting: false, timestamps: [], currentDelay: 10, skippedAsins: [] },

  progress: { phase: null, phaseStep: 'execute', percent: 0, message: '' },
```

Add action implementations:
```typescript
  setExecutionMode: (mode) => set({ executionMode: mode }),

  setQualityCheckResult: (phase, result) =>
    set((s) => ({
      qualityChecks: {
        ...s.qualityChecks,
        [phase]: {
          status: result.pass ? 'passed' : 'failed',
          result,
          retryCount: s.qualityChecks[phase].retryCount,
        },
      },
    })),

  setQualityCheckStatus: (phase, status) =>
    set((s) => ({
      qualityChecks: {
        ...s.qualityChecks,
        [phase]: { ...s.qualityChecks[phase], status },
      },
    })),

  triggerCaptcha: () =>
    set((s) => {
      const timestamps = [...s.captcha.timestamps, Date.now()];
      const recent = timestamps.filter((t) => Date.now() - t < 300_000);
      const delay = recent.length <= 1 ? 10 : recent.length <= 3 ? 30 : 60;
      return { captcha: { ...s.captcha, isWaiting: true, timestamps, currentDelay: delay } };
    }),

  resolveCaptcha: () =>
    set((s) => ({ captcha: { ...s.captcha, isWaiting: false } })),

  updatePhaseProgress: (p) => set({ progress: p }),
```

Add to reset():
```typescript
  executionMode: 'step',
  qualityChecks: { /* same defaults as above */ },
  captcha: { isWaiting: false, timestamps: [], currentDelay: 10, skippedAsins: [] },
  progress: { phase: null, phaseStep: 'execute', percent: 0, message: '' },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:\Code\ClawX && pnpm test -- --run tests/unit/pages/Amazon/pipelineStore.test.ts`
Expected: All 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/Amazon/pipelineStore.ts tests/unit/pages/Amazon/pipelineStore.test.ts
git commit -m "feat(amazon): extend pipeline store with quality check, captcha, progress state"
```

---

### Task 3: Enhance executor.ts with new log signal parsing

**Files:**
- Modify: `electron/main/plugins/runner/executor.ts`
- Create: `tests/unit/electron/executor.test.ts`

- [ ] **Step 1: Write executor signal parsing tests**

```typescript
// tests/unit/electron/executor.test.ts
import { describe, it, expect } from 'vitest';

// Test the regex patterns used by executor
const PHASE_RE = /^PHASE:\s*(\S+)\s+(\S+)/;
const QC_RESULT_RE = /^QC_RESULT:\s*(.+)/;
const CAPTCHA_RE = /^CAPTCHA:\s*(\S+)/;

describe('executor log signal parsing', () => {
  it('should parse PHASE signal', () => {
    const match = 'PHASE: keyword_research check'.match(PHASE_RE);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('keyword_research');
    expect(match![2]).toBe('check');
  });

  it('should parse QC_RESULT signal', () => {
    const line = 'QC_RESULT: {"phase":"seller_verification","pass":true,"metrics":{"total":312}}';
    const match = line.match(QC_RESULT_RE);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]);
    expect(data.phase).toBe('seller_verification');
    expect(data.pass).toBe(true);
  });

  it('should parse CAPTCHA signal', () => {
    const match = 'CAPTCHA: waiting'.match(CAPTCHA_RE);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('waiting');
  });

  it('should not match non-signal lines', () => {
    expect('normal log output'.match(PHASE_RE)).toBeNull();
    expect('PROGRESS: 50% (working)'.match(QC_RESULT_RE)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (regex-only, no executor dependency)

Run: `cd D:\Code\ClawX && pnpm test -- --run tests/unit/electron/executor.test.ts`
Expected: PASS

- [ ] **Step 3: Add signal parsing to executor.ts**

In `executor.ts`, add new regex patterns alongside existing `PROGRESS_RE`:

```typescript
const PHASE_RE = /^PHASE:\s*(\S+)\s+(\S+)/;
const QC_RESULT_RE = /^QC_RESULT:\s*(.+)/;
const CAPTCHA_SIGNAL_RE = /^CAPTCHA:\s*(\S+)/;
```

In the stdout line processing (around line 33-46), add after existing PROGRESS/intervention checks:

```typescript
      // Parse PHASE signal
      const phaseMatch = line.match(PHASE_RE);
      if (phaseMatch) {
        this.emit('phase-signal', { phase: phaseMatch[1], step: phaseMatch[2] });
      }

      // Parse QC_RESULT signal
      const qcMatch = line.match(QC_RESULT_RE);
      if (qcMatch) {
        try {
          const result = JSON.parse(qcMatch[1]);
          this.emit('qc-result', result);
        } catch { /* ignore malformed JSON */ }
      }

      // Parse CAPTCHA signal (new protocol, alongside existing PAUSED detection)
      const captchaMatch = line.match(CAPTCHA_SIGNAL_RE);
      if (captchaMatch) {
        this.emit('intervention', { type: 'captcha' });
      }
```

- [ ] **Step 4: Commit**

```bash
git add electron/main/plugins/runner/executor.ts tests/unit/electron/executor.test.ts
git commit -m "feat(executor): parse PHASE, QC_RESULT, CAPTCHA log signals"
```

---

### Task 4: Add quality check and session IPC handlers

**Files:**
- Modify: `electron/main/ipc-amazon.ts`

- [ ] **Step 1: Add IPC handlers for quality check and session scanning**

In `ipc-amazon.ts`, add these handlers in the `registerAmazonIpc()` function:

```typescript
  // --- Quality Check ---
  ipcMain.handle('amazon:runQualityCheck', async (_event, { sessionName, phase }: {
    sessionName: string; phase: string;
  }) => {
    // Map phase to check script path
    const phaseScripts: Record<string, { script: string; extraArgs: string[] }> = {
      category_sampling: {
        script: '.agent/skills/sellersprite-search-products/scripts/check_product_base.py',
        extraArgs: ['--check'],
      },
      seller_verification: {
        script: '.agent/skills/amazon-check-seller/scripts/check_product_small_seller.py',
        extraArgs: ['--check'],
      },
      store_check: {
        script: '.agent/skills/amazon-list-storefront/scripts/check_store_list.py',
        extraArgs: ['--check'],
      },
      product_detail: {
        script: '.agent/skills/amazon-get-product/scripts/check_product_potential.py',
        extraArgs: ['--check'],
      },
      keyword_research: {
        script: '.agent/skills/amazon-keyword-research/scripts/check_keyword_research.py',
        extraArgs: ['--check'],
      },
    };

    const config = phaseScripts[phase];
    if (!config) return { error: `Unknown phase: ${phase}` };

    const scriptPath = path.join(AMAZON_ROOT, config.script);
    const args = ['run', scriptPath, '--session', sessionName, ...config.extraArgs, '--json'];

    try {
      const { stdout } = await execAsync(`uv ${args.join(' ')}`, {
        cwd: AMAZON_ROOT,
        timeout: 120_000,
      });
      return JSON.parse(stdout.trim());
    } catch (err: any) {
      // Exit code 1 = check failed but JSON is valid
      if (err.stdout) {
        try { return JSON.parse(err.stdout.trim()); } catch { /* fall through */ }
      }
      return { error: err.message, pass: false };
    }
  });

  // --- Session Scanning ---
  ipcMain.handle('amazon:scanSessions', async () => {
    const sessionsDir = path.join(AMAZON_ROOT, '.agent/skills/report/sessions');
    if (!fs.existsSync(sessionsDir)) return [];

    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    const sessions: Array<{ name: string; productCount: number; date: string }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sessionPath = path.join(sessionsDir, entry.name);

      // Try to get product count from last CSV in pipeline
      let productCount = 0;
      for (const csvName of [
        'product_keyword.csv', 'product_potential.csv',
        'product_potential_store.csv', 'product_small_seller.csv', 'product_base.csv',
      ]) {
        const csvPath = path.join(sessionPath, csvName);
        if (fs.existsSync(csvPath)) {
          const content = fs.readFileSync(csvPath, 'utf-8');
          productCount = content.split('\n').filter((l) => l.trim()).length - 1;
          break;
        }
      }

      // Get date from directory stat
      const stat = fs.statSync(sessionPath);
      sessions.push({
        name: entry.name,
        productCount,
        date: stat.mtime.toISOString().slice(0, 10),
      });
    }

    return sessions.sort((a, b) => b.date.localeCompare(a.date));
  });
```

Also add `execAsync` helper at top if not present:
```typescript
import { promisify } from 'util';
import { exec } from 'child_process';
const execAsync = promisify(exec);
```

- [ ] **Step 2: Wire quality check events in workflow execution**

In the existing `amazon:runWorkflow` handler, after the executor event listeners, add:

```typescript
    executor.on('qc-result', (result: any) => {
      mainWindow?.webContents.send('amazon:qualityCheckResult', result);
    });

    executor.on('phase-signal', (signal: { phase: string; step: string }) => {
      mainWindow?.webContents.send('amazon:phaseProgress', signal);
    });
```

- [ ] **Step 3: Commit**

```bash
git add electron/main/ipc-amazon.ts
git commit -m "feat(ipc): add quality check runner and session scanner IPC handlers"
```

---

### Task 5: Build ExecutionModeSelector component

**Files:**
- Create: `src/pages/Amazon/components/ExecutionModeSelector.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/pages/Amazon/components/ExecutionModeSelector.tsx
import { usePipelineStore } from '../pipelineStore';
import type { ExecutionMode } from '../types/pipeline';

const MODES: Array<{ value: ExecutionMode; label: string; desc: string }> = [
  { value: 'auto', label: '全自动', desc: '阶段自动衔接，质检失败时阻塞等待确认' },
  { value: 'step', label: '逐步确认', desc: '每阶段完成后暂停，展示结果等待确认' },
  { value: 'hybrid', label: '混合模式', desc: '采集阶段自动，分析/过滤阶段暂停确认' },
];

export function ExecutionModeSelector() {
  const mode = usePipelineStore((s) => s.executionMode);
  const setMode = usePipelineStore((s) => s.setExecutionMode);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-300">执行模式</label>
      <div className="grid grid-cols-3 gap-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`rounded-xl border p-3 text-left transition-all ${
              mode === m.value
                ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
            }`}
          >
            <div className="text-sm font-medium text-zinc-200">{m.label}</div>
            <div className="mt-1 text-xs text-zinc-400">{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Amazon/components/ExecutionModeSelector.tsx
git commit -m "feat(amazon): add ExecutionModeSelector component"
```

---

### Task 6: Build QualityCheckBadge component

**Files:**
- Create: `src/pages/Amazon/components/QualityCheckBadge.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/pages/Amazon/components/QualityCheckBadge.tsx
import { CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { usePipelineStore } from '../pipelineStore';
import type { PipelinePhase } from '../types/pipeline';

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-zinc-500', label: '待检' },
  running: { icon: Loader2, color: 'text-blue-400 animate-spin', label: '检测中' },
  passed: { icon: CheckCircle, color: 'text-green-400', label: '通过' },
  failed: { icon: XCircle, color: 'text-red-400', label: '未通过' },
} as const;

export function QualityCheckBadge({ phase }: { phase: PipelinePhase }) {
  const qc = usePipelineStore((s) => s.qualityChecks[phase]);
  const config = STATUS_CONFIG[qc.status];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${config.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
      {qc.result && qc.status !== 'pending' && (
        <span className="text-zinc-500">
          ({Math.round((qc.result.metrics.success_rate as number) * 100)}%)
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Amazon/components/QualityCheckBadge.tsx
git commit -m "feat(amazon): add QualityCheckBadge component"
```

---

### Task 7: Build QualityCheckPanel component

**Files:**
- Create: `src/pages/Amazon/components/QualityCheckPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/pages/Amazon/components/QualityCheckPanel.tsx
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { usePipelineStore } from '../pipelineStore';
import type { PipelinePhase, QualityCheckState } from '../types/pipeline';

const PHASE_LABELS: Record<PipelinePhase, string> = {
  category_sampling: '类目采样',
  seller_verification: '卖家核查',
  store_check: '店群分析',
  product_detail: '商品详情',
  keyword_research: '关键词研究',
  report_generation: '报告生成',
};

function QualityCheckRow({ phase, state, onRetry }: {
  phase: PipelinePhase;
  state: QualityCheckState;
  onRetry?: () => void;
}) {
  const r = state.result;
  if (state.status === 'pending') return null;

  return (
    <div className={`rounded-lg border p-3 ${
      state.status === 'passed' ? 'border-green-800 bg-green-950/30' :
      state.status === 'failed' ? 'border-red-800 bg-red-950/30' :
      'border-zinc-700 bg-zinc-800/30'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {state.status === 'passed'
            ? <CheckCircle className="h-4 w-4 text-green-400" />
            : <XCircle className="h-4 w-4 text-red-400" />}
          <span className="text-sm font-medium text-zinc-200">{PHASE_LABELS[phase]}</span>
        </div>
        {state.status === 'failed' && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 rounded-md bg-amber-600/20 px-2 py-1 text-xs text-amber-300 hover:bg-amber-600/30"
          >
            <RefreshCw className="h-3 w-3" /> 补爬
          </button>
        )}
      </div>

      {r && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-400">
          <div>总数: <span className="text-zinc-200">{r.metrics.total}</span></div>
          <div>成功: <span className="text-green-300">{r.metrics.success}</span></div>
          <div>成功率: <span className={
            (r.metrics.success_rate as number) >= (r.threshold ?? 0.9)
              ? 'text-green-300' : 'text-red-300'
          }>{Math.round((r.metrics.success_rate as number) * 100)}%</span></div>
          {r.recrawl_count ? (
            <div className="col-span-3 text-amber-400">
              需补爬: {r.recrawl_count} 条 ({r.recrawl_csv})
            </div>
          ) : null}
        </div>
      )}

      {r?.timestamp && (
        <div className="mt-1 text-xs text-zinc-600">
          {new Date(r.timestamp).toLocaleString('zh-CN')}
        </div>
      )}
    </div>
  );
}

export function QualityCheckPanel() {
  const qualityChecks = usePipelineStore((s) => s.qualityChecks);

  const phases = Object.entries(qualityChecks) as [PipelinePhase, QualityCheckState][];
  const hasResults = phases.some(([, s]) => s.status !== 'pending');

  if (!hasResults) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
        暂无质检数据，启动流水线后自动生成
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-300">质检结果</h3>
      {phases.map(([phase, state]) => (
        <QualityCheckRow key={phase} phase={phase} state={state} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Amazon/components/QualityCheckPanel.tsx
git commit -m "feat(amazon): add QualityCheckPanel component"
```

---

### Task 8: Build CaptchaModal component

**Files:**
- Create: `src/pages/Amazon/components/CaptchaModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/pages/Amazon/components/CaptchaModal.tsx
import { ShieldAlert, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePipelineStore } from '../pipelineStore';

export function CaptchaModal({ onResume, onStop }: {
  onResume: () => void;
  onStop: () => void;
}) {
  const captcha = usePipelineStore((s) => s.captcha);
  const resolveCaptcha = usePipelineStore((s) => s.resolveCaptcha);

  if (!captcha.isWaiting) return null;

  const recentCount = captcha.timestamps.filter(
    (t) => Date.now() - t < 300_000
  ).length;

  const handleResume = () => {
    resolveCaptcha();
    onResume();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          className="mx-4 max-w-md rounded-2xl border border-amber-700/50 bg-zinc-900 p-6 shadow-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-500/20 p-2">
              <ShieldAlert className="h-6 w-6 text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">需要验证码</h3>
          </div>

          <div className="mt-4 space-y-2 text-sm text-zinc-400">
            <p>请在浏览器中完成验证码，然后点击"继续执行"。</p>
            {recentCount > 1 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-950/30 p-2 text-amber-300">
                <Clock className="h-4 w-4" />
                <span>5 分钟内触发 {recentCount} 次，已自动降速至 {captcha.currentDelay}s 间隔</span>
              </div>
            )}
            {captcha.skippedAsins.length > 0 && (
              <p className="text-zinc-500">
                已跳过 {captcha.skippedAsins.length} 个 ASIN，将在最后重试
              </p>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleResume}
              className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
            >
              继续执行
            </button>
            <button
              onClick={onStop}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              停止
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Amazon/components/CaptchaModal.tsx
git commit -m "feat(amazon): add enhanced CaptchaModal with frequency tracking"
```

---

### Task 9: Build ProgressMultiLevel component

**Files:**
- Create: `src/pages/Amazon/components/ProgressMultiLevel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/pages/Amazon/components/ProgressMultiLevel.tsx
import { CheckCircle, Loader2, Circle } from 'lucide-react';
import { usePipelineStore } from '../pipelineStore';
import type { PipelinePhase } from '../types/pipeline';

const PHASES: { id: PipelinePhase; label: string }[] = [
  { id: 'category_sampling', label: '采样' },
  { id: 'seller_verification', label: '卖家' },
  { id: 'store_check', label: '店铺' },
  { id: 'product_detail', label: '详情' },
  { id: 'keyword_research', label: '关键词' },
  { id: 'report_generation', label: '报告' },
];

const STEP_LABELS = { execute: '执行中', check: '质检中', retry: '补爬中' } as const;

export function ProgressMultiLevel() {
  const progress = usePipelineStore((s) => s.progress);
  const phases = usePipelineStore((s) => s.phases);

  const currentIdx = PHASES.findIndex((p) => p.id === progress.phase);

  return (
    <div className="space-y-3">
      {/* Level 1: Phase bar */}
      <div className="flex items-center gap-1">
        {PHASES.map((p, i) => {
          const phaseConfig = phases.find((pc) => pc.id === p.id);
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          const isSkipped = phaseConfig && !phaseConfig.enabled;

          return (
            <div key={p.id} className="flex items-center gap-1">
              {i > 0 && <div className={`h-px w-4 ${isDone ? 'bg-green-500' : 'bg-zinc-700'}`} />}
              <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                isSkipped ? 'text-zinc-600' :
                isActive ? 'bg-blue-500/20 text-blue-300 font-medium' :
                isDone ? 'text-green-400' : 'text-zinc-500'
              }`}>
                {isDone ? <CheckCircle className="h-3 w-3" /> :
                 isActive ? <Loader2 className="h-3 w-3 animate-spin" /> :
                 <Circle className="h-3 w-3" />}
                {p.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Level 2: Phase step */}
      {progress.phase && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>{PHASES[currentIdx]?.label}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-blue-300">{STEP_LABELS[progress.phaseStep]}</span>
        </div>
      )}

      {/* Level 3: Progress bar */}
      {progress.percent > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="text-xs text-zinc-500">{progress.message}</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Amazon/components/ProgressMultiLevel.tsx
git commit -m "feat(amazon): add ProgressMultiLevel component"
```

---

### Task 10: Create useQualityCheck hook

**Files:**
- Create: `src/pages/Amazon/hooks/useQualityCheck.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/pages/Amazon/hooks/useQualityCheck.ts
import { useEffect } from 'react';
import { usePipelineStore } from '../pipelineStore';
import type { PipelinePhase, QualityCheckResult } from '../types/pipeline';

declare global {
  interface Window {
    electronAPI?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    };
  }
}

export function useQualityCheck() {
  const setQualityCheckResult = usePipelineStore((s) => s.setQualityCheckResult);
  const setQualityCheckStatus = usePipelineStore((s) => s.setQualityCheckStatus);

  // Listen for QC results from workflow execution
  useEffect(() => {
    const cleanup = window.electronAPI?.on('amazon:qualityCheckResult', (_event: unknown, result: QualityCheckResult) => {
      setQualityCheckResult(result.phase, result);
    });
    return cleanup;
  }, [setQualityCheckResult]);

  // Manual quality check trigger
  const runCheck = async (sessionName: string, phase: PipelinePhase): Promise<QualityCheckResult | null> => {
    setQualityCheckStatus(phase, 'running');
    try {
      const result = await window.electronAPI?.invoke('amazon:runQualityCheck', {
        sessionName,
        phase,
      }) as QualityCheckResult;

      if (result && 'pass' in result) {
        setQualityCheckResult(phase, result);
        return result;
      }
      setQualityCheckStatus(phase, 'failed');
      return null;
    } catch {
      setQualityCheckStatus(phase, 'failed');
      return null;
    }
  };

  return { runCheck };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Amazon/hooks/useQualityCheck.ts
git commit -m "feat(amazon): add useQualityCheck hook"
```

---

### Task 11: Integrate new components into PipelineWizard

**Files:**
- Modify: `src/pages/Amazon/PipelineWizard.tsx`

- [ ] **Step 1: Add imports**

At top of PipelineWizard.tsx, add:
```typescript
import { ExecutionModeSelector } from './components/ExecutionModeSelector';
import { QualityCheckPanel } from './components/QualityCheckPanel';
import { QualityCheckBadge } from './components/QualityCheckBadge';
import { CaptchaModal } from './components/CaptchaModal';
import { ProgressMultiLevel } from './components/ProgressMultiLevel';
import { useQualityCheck } from './hooks/useQualityCheck';
```

- [ ] **Step 2: Add ExecutionModeSelector to config step**

In `renderConfigStep()`, after the CDP port input, add:
```tsx
<ExecutionModeSelector />
```

- [ ] **Step 3: Replace InterventionModal with CaptchaModal**

In `renderExecuteStep()`, replace the existing `<InterventionModal>` usage with:
```tsx
<CaptchaModal onResume={handleResume} onStop={handleStop} />
```

- [ ] **Step 4: Add ProgressMultiLevel to execute step**

In `renderExecuteStep()`, add at top of the execute section:
```tsx
<ProgressMultiLevel />
```

- [ ] **Step 5: Add QualityCheckBadge to phase cards**

In the phase status cards within `renderExecuteStep()`, add after each phase name:
```tsx
<QualityCheckBadge phase={phaseConfig.id as PipelinePhase} />
```

- [ ] **Step 6: Add QualityCheckPanel to results step**

In `renderResultsStep()`, add after the funnel chart:
```tsx
<QualityCheckPanel />
```

- [ ] **Step 7: Wire IPC listeners for new signals**

In the `useEffect` that sets up IPC listeners (around line 88), add:
```typescript
const cleanupQC = window.electronAPI?.on('amazon:qualityCheckResult', (_event, result) => {
  usePipelineStore.getState().setQualityCheckResult(result.phase, result);
});

const cleanupPhase = window.electronAPI?.on('amazon:phaseProgress', (_event, signal) => {
  usePipelineStore.getState().updatePhaseProgress({
    phase: signal.phase,
    phaseStep: signal.step,
    percent: usePipelineStore.getState().overallProgress,
    message: `${signal.phase}: ${signal.step}`,
  });
});
```

Add cleanup in the return function.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Amazon/PipelineWizard.tsx
git commit -m "feat(amazon): integrate quality check, execution mode, and progress into PipelineWizard"
```

---

### Task 12: End-to-end manual test

- [ ] **Step 1: Build and run ClawX**

```bash
cd D:\Code\ClawX && pnpm dev
```

- [ ] **Step 2: Verify config step shows execution mode selector**

Navigate to `/amazon/pipeline-wizard`, verify 3-mode radio buttons appear in Step 1.

- [ ] **Step 3: Verify execute step shows multi-level progress**

Start a pipeline, verify phase bar, sub-step indicator, and progress bar render correctly.

- [ ] **Step 4: Verify quality check results display**

After a phase completes, verify QualityCheckBadge shows pass/fail on the phase card.

- [ ] **Step 5: Verify results step shows QualityCheckPanel**

Navigate to results step, verify quality check history panel renders.

- [ ] **Step 6: Run unit tests**

```bash
cd D:\Code\ClawX && pnpm test -- --run
```
Expected: All existing + new tests pass.

- [ ] **Step 7: Final commit if needed**

```bash
git add -A && git commit -m "fix: integration adjustments for pipeline core"
```
