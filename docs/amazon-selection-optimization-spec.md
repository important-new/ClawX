# ClawX Amazon Selection Assistant Optimization Spec

> 基于 20260426-1 session 实际爬取经验的优化设计方案
> 日期: 2026-04-27

---

## 1. Pipeline Automation & Execution Mode

### 问题
当前 PipelineWizard 是 4 步向导，每步需手动触发。实际爬取中 8 阶段流水线需要频繁人工介入，效率低。

### 方案：可配置执行模式

提供三种模式供用户在启动前选择：

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| **全自动** | 阶段间自动衔接，质检失败阻塞等待确认 | 数据稳定、夜间无人值守 |
| **逐步确认** | 每阶段完成后暂停，展示结果等待确认 | 首次使用、调试参数 |
| **混合** | 采集类阶段自动，分析/过滤阶段暂停确认 | 日常使用推荐 |

**关键约束**：质检失败在任何模式下都必须阻塞流水线，不允许自动跳过。数据不完整会导致分析报告质量差。

### UI 变更
- PipelineWizard Step 1 新增"执行模式"选择器（Radio Group）
- 阶段间过渡动画 + 状态卡片（成功/失败/等待确认）

---

## 2. Error Handling & Smart Retry

### 问题
实际爬取中遇到多种错误：TargetClosedError（CDP 连接断开）、SS 插件无响应、网络超时。当前需要手动判断是否重试。

### 方案：分类错误处理

```
错误分类:
├── 可自动重试 (Transient)
│   ├── 网络超时 → 等待 30s 重试，最多 3 次
│   ├── SS 插件无响应 → 刷新页面重试
│   └── CDP TargetClosedError → 重连 CDP 重试
├── 需人工干预 (Interactive)
│   ├── CAPTCHA → 弹窗通知用户，等待确认后继续
│   └── 登录过期 → 提示重新登录
└── 不可恢复 (Fatal)
    ├── 脚本崩溃 → 记录日志，标记失败 ASIN
    └── 数据格式异常 → 跳过该 ASIN，记入补爬清单
```

### CAPTCHA 智能处理
- 频率追踪：记录每次 CAPTCHA 触发时间
- 自动降速：连续触发时增大请求间隔（10s → 30s → 60s）
- 跳过+回填：CAPTCHA 反复出现时跳过当前 ASIN，加入末尾重试队列
- UI 弹窗：`InterventionModal` 增加 CAPTCHA 类型，显示截图 + 等待用户确认

---

## 3. Quality Check Integration

### 问题
质检是独立手动步骤，容易遗漏。缺少结构化结果展示。

### 方案：嵌入式自动质检 + 独立质检面板

**流水线内嵌质检**：每个采集阶段完成后自动执行对应 `check_*.py --json`，解析结果决定是否继续。

**质检规则**（基于实际爬取数据制定）：

| 阶段 | 指标 | 阈值 | 说明 |
|------|------|------|------|
| Phase 1 类目采样 | 采集成功率 | 用户确认 | 筛选条件用户自定义，结果需人工判断合理性 |
| Phase 2 卖家详情 | 卖家数据完整率 | ≥ 95% | 实测 85/312 首次失败，补爬后 100% |
| Phase 3 店铺列表 | 店铺采集成功率 | ≥ 90% | SS 插件偶尔无响应 |
| Phase 4 商品详情 | PDP 完整率 | ≥ 90% | Keepa/SS 数据可能部分缺失 |
| Phase 4 商品详情 | Keepa 图表覆盖率 | ≥ 85% | 新品可能无历史图表 |
| Phase 5 关键词 | Phase1 采集成功率 | ≥ 95% | API 调用相对稳定 |
| Phase 5 关键词 | Phase2 研究成功率 | ≥ 90% | CAPTCHA 是主要失败原因 |
| Phase 5 关键词 | 缩略图完整率 | ≥ 90% | 网络问题导致空文件 |

**Phase 1 特殊处理**：类目采样的筛选条件由用户自定义，无法用固定阈值判定。建议展示与上一次爬取的对比（品类数、产品数、分布变化），由用户确认是否继续。部分 0 数据（新店无评价、下架商品无 PDP）属于正常情况。

**质检面板 UI**：
- 独立 Tab 页，展示所有阶段质检历史
- 每条记录：阶段名、时间、通过/失败、详细指标、补爬建议命令
- 失败项可一键触发补爬

---

## 4. Session Management & Historical Dedup

### 问题
实际操作中忘记 `--prev-session` 导致卖家爬取浪费。需要手动记忆历史 session。

### 方案：智能 Session 选择器

**自动扫描**：启动时扫描 `report/sessions/` 下所有历史 session 目录。

**智能推荐**：默认勾选所有历史 session 用于去重（取并集）。用户可取消勾选特定 session。

**Session 选择器 UI**：
```
┌─ Session 配置 ──────────────────────────┐
│ 当前 Session: [20260427]                │
│                                          │
│ 历史去重 Session（已自动选中全部）：      │
│ ☑ 20260426-1  (44 products, 2026-04-26) │
│ ☑ 20260404    (38 products, 2026-04-04) │
│ ☑ 20260301    (52 products, 2026-03-01) │
│ ☑ 20260201    (61 products, 2026-02-01) │
│ ...                                      │
│ [全选] [全不选]                           │
└──────────────────────────────────────────┘
```

---

## 5. Profit Simulator

### 问题
利润计算是后置步骤，用户无法在选品阶段快速评估可行性。

### 方案：嵌入式利润模拟器

在报告页面每个产品卡片中嵌入可交互的利润计算器：

**输入参数**（可调节滑块）：
- 采购成本（默认售价 30%）
- 头程运费（默认 $5/件）
- PPC 日预算（默认 $30）
- 目标 ACoS（默认 30%）
- 预估转化率（默认 15%）

**实时输出**：
- 单件毛利 / 毛利率
- 月利润估算
- ROI
- 盈亏平衡点（日单量）

**可行性判定**：
- 毛利率 ≥ 25% + 日均 ≥ 3 单 → 可行（绿色）
- 毛利率 15-25% 或需验证 → 待验证（黄色）
- 毛利率 < 15% 或日均 < 1 单 → 不建议（红色）

---

## 6. State Management & IPC

### pipelineStore.ts 扩展

```typescript
interface PipelineState {
  // 现有字段保留...

  // 新增
  executionMode: 'auto' | 'step' | 'hybrid';

  // 质检状态
  qualityChecks: Record<PipelinePhase, {
    status: 'pending' | 'running' | 'passed' | 'failed';
    result?: QualityCheckResult;
    retryCount: number;
  }>;

  // CAPTCHA 状态
  captcha: {
    isWaiting: boolean;
    frequency: number[];        // 触发时间戳
    currentDelay: number;       // 当前请求间隔
    skippedAsins: string[];     // 跳过的 ASIN
  };

  // Session 去重
  dedup: {
    availableSessions: SessionInfo[];
    selectedSessions: string[];
  };

  // 进度（多层级）
  progress: {
    phase: PipelinePhase;
    phaseStep: 'execute' | 'check' | 'retry';
    percent: number;
    message: string;
  };
}
```

### IPC 新增通道

| 通道 | 方向 | 用途 |
|------|------|------|
| `amazon:quality-check` | main→renderer | 质检结果推送 |
| `amazon:captcha-detected` | main→renderer | CAPTCHA 弹窗触发 |
| `amazon:captcha-resolved` | renderer→main | 用户确认已完成验证 |
| `amazon:scan-sessions` | renderer→main | 扫描历史 session |
| `amazon:phase-progress` | main→renderer | 多层级进度更新 |
| `amazon:profit-calculate` | renderer→main | 利润计算请求（可选，也可纯前端） |

---

## 7. Module Architecture

### 新增文件

```
src/pages/Amazon/
├── components/
│   ├── QualityCheckPanel.tsx      # 质检面板（独立 Tab）
│   ├── QualityCheckBadge.tsx      # 阶段内质检状态徽章
│   ├── SessionSelector.tsx        # 历史 Session 选择器
│   ├── ProfitSimulator.tsx        # 利润模拟器组件
│   ├── ExecutionModeSelector.tsx  # 执行模式选择器
│   ├── ProgressMultiLevel.tsx     # 多层级进度展示
│   └── CaptchaModal.tsx           # CAPTCHA 专用弹窗（从 InterventionModal 拆出）
├── hooks/
│   ├── useQualityCheck.ts         # 质检逻辑 hook
│   ├── useSessionScanner.ts       # Session 扫描 hook
│   └── useProfitCalculator.ts     # 利润计算 hook
└── types.ts                       # 扩展类型定义
```

### 修改文件

```
src/pages/Amazon/
├── PipelineWizard.tsx             # 集成执行模式、Session 选择器、质检流程
├── pipelineStore.ts               # 扩展状态字段
├── components/InterventionModal.tsx  # CAPTCHA 逻辑迁移到 CaptchaModal

electron/main/
├── ipc-amazon.ts                  # 新增 IPC 通道
├── plugins/runner/workflow-executor.ts  # 增强日志解析、质检集成
```

---

## 8. Python Script Adaptation (`--json` output)

### 问题
现有 `check_*.py` 脚本输出人类可读文本，ClawX 无法程序化解析结果。

### 方案：所有质检脚本新增 `--json` 参数

**需要适配的脚本**：

| 脚本 | 输出内容 |
|------|----------|
| `check_product_base.py` | 类目采集完整性 + 与上次对比 |
| `check_product_small_seller.py` | 卖家数据完整率 |
| `check_store_list.py` | 店铺采集成功率 |
| `check_product_potential.py` | PDP 完整率 + Keepa 覆盖率 |
| `check_keyword_research.py` | 关键词采集/研究成功率 + 缩略图完整率 |

**统一 JSON 输出格式**：

```json
{
  "phase": "seller_verification",
  "timestamp": "2026-04-27T10:30:00",
  "pass": true,
  "metrics": {
    "total": 312,
    "success": 310,
    "failed": 2,
    "success_rate": 0.9936
  },
  "threshold": 0.95,
  "recrawl_csv": "recrawl_seller.csv",
  "recrawl_count": 2,
  "details": { ... }
}
```

**executor.ts 集成**：质检脚本以 `--json` 调用，解析 stdout JSON，判断 `pass` 字段决定流水线是否继续。

---

## 9. Log Progress & Real-time Feedback

### 问题
当前 `PROGRESS:` 协议只覆盖单脚本执行，新的质检集成流水线需要多层级进度。

### 方案：多层级进度协议

```
层级 1: 整体流水线进度    → "Phase 3/6: 店群分析"
层级 2: 阶段内子步骤进度  → "执行中 → 质检中 → 补爬中(第2次)"
层级 3: 单脚本执行进度    → "PROGRESS: 45% (已处理 30/67 ASIN)"
```

**Python 脚本日志协议扩展**：

| 输出格式 | 用途 | 示例 |
|---------|------|------|
| `PROGRESS: 60% (msg)` | 已有，单脚本进度 | `PROGRESS: 60% (已处理 40/67)` |
| `PHASE: <name> <step>` | 新增，阶段+子步骤 | `PHASE: keyword_research check` |
| `QC_RESULT: {...}` | 新增，质检结果 JSON | 由 `--json` 输出的最终行 |
| `CAPTCHA: waiting` | 新增，验证码等待信号 | 触发前端弹窗 |

**executor.ts 解析增强**：

```typescript
// 现有: 解析 PROGRESS 行
if (line.startsWith('PROGRESS:')) { updateProgress(line); }

// 新增: 解析阶段信号
if (line.startsWith('PHASE:')) {
  const [phase, step] = line.slice(7).trim().split(' ');
  store.updatePhaseStep(phase, step);
}

// 新增: 解析质检结果
if (line.startsWith('QC_RESULT:')) {
  const result = JSON.parse(line.slice(10));
  store.setQualityCheckResult(phase, result);
}

// 新增: 验证码信号
if (line.startsWith('CAPTCHA:')) {
  store.triggerCaptchaModal();
}
```

**前端进度展示**：
- 顶部：整体流水线阶段条（6 个阶段，当前高亮）
- 中部：当前阶段内子步骤（执行 → 质检 → 补爬），带状态图标
- 底部：实时日志滚动窗口 + 进度百分比条

---

## 实施优先级

| 优先级 | 模块 | 原因 |
|--------|------|------|
| P0 | Quality Check Integration (§3) + `--json` (§8) | 数据质量是核心痛点 |
| P0 | Error Handling & Smart Retry (§2) | 减少人工干预频率 |
| P1 | Log Progress (§9) | 质检集成的前置依赖 |
| P1 | Session Management (§4) | 防止遗漏去重 |
| P1 | Pipeline Automation (§1) | 提升效率 |
| P2 | Profit Simulator (§5) | 增值功能 |
| P2 | State & IPC (§6) | 随其他模块按需实现 |
