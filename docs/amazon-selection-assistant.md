# 选品助手（Amazon Selection Assistant）

> 基于亚马逊选品方法论的智能产品入场可行性评估工具，内置于 ClawX。

---

## 目录

- [功能概览](#功能概览)
- [路由结构](#路由结构)
- [文件结构](#文件结构)
- [核心数据模型](#核心数据模型)
- [分析引擎](#分析引擎)
- [工作流模式](#工作流模式)
  - [对话模式（ChatMode）](#对话模式chatmode)
  - [表单模式（FormMode）](#表单模式formmode)
  - [跟踪看板（Tracker）](#跟踪看板tracker)
  - [历史报告（History）](#历史报告history)
- [Gateway AI 集成](#gateway-ai-集成)
- [状态管理](#状态管理)
- [已知限制](#已知限制)

---

## 功能概览

选品助手提供三种工作模式，引导用户完成亚马逊产品的市场可行性评估：

| 模式 | 适用场景 |
|------|----------|
| **对话模式** | 新手友好，AI 或引导式问答，逐步收集数据 |
| **表单模式** | 结构化录入，批量数据粘贴，快速生成标准报告 |
| **跟踪看板** | 监控候选产品，定期自动重评，掌握竞争态势变化 |

核心能力：
- 五步评估模型：初选筛选 → 竞争分析 → 盈利核算 → 合规排查 → 试销方案
- 支持四种运营模式：FBA 精铺 / FBA 铺货 / FBM 精铺 / FBM 铺货
- 数据置信度分级：高（必填数据齐全）/ 中（部分数据）/ 低（无实际数据）
- Gateway AI 集成：真实 AI 对话分析 + 报告深度解读（需 gateway 在线）
- 历史记录：筛选、多产品横向对比、Markdown 导出

---

## 路由结构

```
/amazon              首页，模式选择 + 统计看板 + 近期分析
/amazon/chat         对话模式
/amazon/form         表单模式
/amazon/tracker      跟踪看板
/amazon/history      历史报告
```

---

## 文件结构

```
src/pages/Amazon/
├── index.tsx                  首页（统计卡片 + 近期记录）
├── ChatMode.tsx               对话模式（引导 + AI 双模式）
├── FormMode.tsx               表单模式（三步向导）
├── Tracker.tsx                跟踪看板
├── History.tsx                历史报告（筛选/对比/删除/导出）
├── engine.ts                  五步分析引擎（确定性算法）
├── store.ts                   Zustand store（localStorage 持久化）
├── types.ts                   全局类型定义
├── components/
│   ├── ModeCard.tsx           首页模式入口卡片
│   ├── ReportView.tsx         报告展示组件
│   ├── VerdictBadge.tsx       结论/评分徽章
│   ├── DataPanel.tsx          数据来源侧边面板
│   ├── TrackerCard.tsx        跟踪产品卡片
│   └── CompareTable.tsx       多产品横向对比表
└── hooks/
    └── useGatewayAI.ts        Gateway AI 集成 hooks
```

---

## 核心数据模型

### SelectionMode

```typescript
type SelectionMode = 'fba-refined' | 'fba-bulk' | 'fbm-refined' | 'fbm-bulk'
```

| 值 | 含义 | 特点 |
|----|------|------|
| `fba-refined` | FBA 精铺 | 高利润、品牌壁垒、高门槛 |
| `fba-bulk` | FBA 铺货 | 快速测款、广撒网、低试错成本 |
| `fbm-refined` | FBM 精铺 | 高客单价、低竞争、定制化细分 |
| `fbm-bulk` | FBM 铺货 | 零库存、低门槛、差价套利 |

### AnalysisReport

```typescript
interface AnalysisReport {
  overallScore: number                    // 0-100 综合评分
  verdict: 'pass' | 'watch' | 'reject'   // 建议入场 / 待观察 / 排除
  confidenceLevel: 'high' | 'medium' | 'low'
  steps: {
    initial: StepResult      // 初选筛选
    competition: StepResult  // 竞争分析
    profit: StepResult       // 盈利核算
    compliance: StepResult   // 合规排查
    trial: StepResult        // 试销方案
  }
  actionItems: Array<{
    priority: 'high' | 'medium' | 'low'
    text: string
  }>
}
```

### TrackedProduct

```typescript
interface TrackedProduct {
  id: string
  sessionId: string          // 关联的最新分析 session
  name: string
  mode: SelectionMode
  intervalDays: number       // 重评周期（3/7/14/30 天）
  lastCheckedAt: number
  nextCheckAt: number
  alertOnChange: boolean     // 评分下降时提醒
  status: 'active' | 'paused'
  currentScore: number
  currentVerdict: Verdict
  scoreTrend: 'up' | 'down' | 'stable'
  history: TrackerHistoryEntry[]
}
```

---

## 分析引擎

**文件：** `engine.ts`

引擎基于确定性哈希算法，保证相同输入产生一致的分析结果。

### 工作原理

```
base = hash32(productName + "|" + mode + "|" + market + "|" + round)
```

- `round` 参数（默认 0）：每次重新评估时递增，模拟市场变化
- 若 `DataInput.content` 有真实数据，引擎通过正则提取数值覆盖估算值
- 产品名称关键词影响竞争力/科技属性/体积系数，进一步调整分值

### 各模式阈值对比

| 指标 | FBA 精铺 | FBA 铺货 | FBM 精铺 | FBM 铺货 |
|------|---------|---------|---------|---------|
| 最低月搜索量 | 10,000 | 50,000 | 5,000 | 20,000 |
| 最低毛利率 | 40% | 35% | 50% | 25% |
| 最低 ROI | 1:2.0 | 1:1.5 | 1:2.5 | 1:1.3 |
| 客单价区间 | $20-80 | $10-50 | $30-120 | $8-40 |

### 综合评分权重

| 步骤 | 权重 |
|------|------|
| 初选筛选 | 20% |
| 竞争分析 | 25% |
| 盈利核算 | 35% |
| 合规排查 | 20% |
| 试销方案 | 待执行（不计入） |

**评分区间：** ≥70 → 建议入场，50-69 → 待观察，<50 → 排除

### 调用方式

```typescript
import { runAnalysis } from './engine'

const report = runAnalysis({
  mode: 'fba-bulk',
  productName: '折叠收纳盒',
  keywords: ['折叠收纳盒', 'collapsible storage box'],
  market: '美国站',
  dataInputs: [...],   // DataInput[]
  round: 0,            // 重评时传入 history.length
})
```

---

## 工作流模式

### 对话模式（ChatMode）

**文件：** `ChatMode.tsx`

支持两种子模式，通过顶栏切换：

#### 引导模式（本地状态机，始终可用）

六阶段状态机引导用户完成数据收集：

```
greeting → confirm-mode → collect-data → confirm-analyze → analyzing → done
```

- 自动提取产品名、运营模式、目标市场、关键词
- 左侧数据面板可粘贴真实数据（支持内联 textarea）
- 触发分析后运行引擎，报告内嵌在对话气泡中

#### AI 模式（需 gateway 在线）

- 消息通过 `useGatewayChat` 发送至真实 AI（独立 session）
- AI 自由对话，不强制引导流程
- 对话 ≥2 条后激活"基于此对话生成结构化报告"按钮
- 用户确认产品名 + 模式后运行本地引擎生成报告

#### 添加到跟踪

报告生成后可一键添加到跟踪看板，已跟踪则显示"查看跟踪 →"。

---

### 表单模式（FormMode）

**文件：** `FormMode.tsx`

三步向导：

**步骤 1 — 基础配置**
- 选择运营模式（4 选 1，含说明）
- 填写产品名称、目标站点（多选）、目标关键词

**步骤 2 — 数据录入**
- 4 类数据卡片：搜索量/供需比（必填）、竞品评论分布（必填）、头程物流报价（可选）、IP 查询（可选）
- 每张卡支持"粘贴数据"（内联 textarea）或"MCP 抓取"（标记模式）
- 缺少必填项时显示警告，以低置信度模式继续

**步骤 3 — 分析报告**
- 进度条动画模拟五步分析过程
- 展示完整 `ReportView`（含可展开的各步骤指标）
- **AI 深度解读**：gateway 在线时可点击，发送报告摘要获取 AI 定性洞察
- 可导出（复制 Markdown）、添加到跟踪

---

### 跟踪看板（Tracker）

**文件：** `Tracker.tsx`，**卡片：** `TrackerCard.tsx`

每个被跟踪产品显示为一张卡片：

| 功能 | 说明 |
|------|------|
| 评分 + 结论 | 当前综合评分和建议 |
| 趋势图标 | ↑上升 / ↓下降 / →持平 |
| 告警提醒 | 评分下降时顶部横幅提示 |
| 暂停/恢复 | 暂停后跳过重评，卡片变暗 |
| 重评周期 | 3/7/14/30 天可选，点击修改 |
| **立即重新评估** | 使用 `round=history.length` 调用引擎，模拟市场变化，生成新 session，对比分数得出 changeSummary |
| 历史时间线 | 展开查看所有评估记录（日期/评分/变化摘要） |
| 查看报告 | 跳转到 History 对应报告 |

**重评逻辑：**
1. 取原始 session 参数（keywords/market/dataInputs）
2. `round = product.history.length`（不同 round 得到不同哈希种子）
3. 对比前后各步骤分差，生成 changeSummary
4. 更新 `scoreTrend`（±2 分以上为上升/下降）
5. 创建新 session 存入历史

---

### 历史报告（History）

**文件：** `History.tsx`

| 功能 | 说明 |
|------|------|
| 搜索 | 按产品名或关键词过滤 |
| 筛选 | 按结论（建议入场/待观察/排除）和运营模式 |
| 对比模式 | 最多选 4 条，横向对比五步评分 |
| 报告详情 | 点击记录在右侧展开完整报告 |
| 删除 | hover 显示删除按钮，内联确认框 |
| 导出 | 单条/批量复制 Markdown 格式到剪贴板 |

---

## Gateway AI 集成

**文件：** `hooks/useGatewayAI.ts`

两个 hook，均使用独立 session key，不干扰主 chat：

### useGatewayRequest

单次请求，适用于一次性 AI 分析（FormMode 深度解读）：

```typescript
const { request, loading, result, error, reset } = useGatewayRequest()

// 发送 prompt，内部轮询 chat.history 获取回复
const reply = await request('请分析以下报告...')
```

**Session key 格式：** `amazon-req:{timestamp}`

### useGatewayChat

多轮对话，适用于 ChatMode AI 模式：

```typescript
const { messages, send, sending, error, reset, sessionKey } = useGatewayChat()

// messages 包含本地乐观更新的消息列表
const reply = await send('我想评估便携挂烫机')
```

**Session key 格式：** `amazon-chat:{timestamp}`

### 通信流程

```
useGatewayRequest / useGatewayChat
    ↓ useGatewayStore.getState().rpc()
    ↓ invokeIpc('gateway:rpc', 'chat.send', params)
    ↓ Electron IPC → GatewayManager → WebSocket
    ↓ OpenClaw Gateway → Claude AI
    ↓ 轮询 chat.history（每 1.8 秒，超时 90 秒）
    ↓ 返回最新 assistant 消息文本
```

**前提条件：** `useGatewayStore(s => s.status.state === 'running')` 为 true

---

## 状态管理

**文件：** `store.ts`

```typescript
interface AmazonStore {
  sessions: AnalysisSession[]         // 所有分析记录
  trackedProducts: TrackedProduct[]   // 跟踪产品列表
  addSession / updateSession / removeSession
  addTracked / updateTracked / removeTracked
}
```

- **持久化：** localStorage key `amazon-selection-store`
- **初始化：** 无持久数据时加载内置 MOCK 数据（4 个示例分析 + 3 个跟踪产品）
- **跨页共享：** 所有页面通过 `useAmazonStore()` 访问同一 store

---

## 已知限制

| 限制 | 说明 |
|------|------|
| MCP 抓取为标记模式 | "MCP 抓取"按钮仅标记数据已加载，未接入真实数据源 |
| AI 模式无预设 system prompt | AI 不会自动扮演选品顾问角色，需用户在对话中引导 |
| 引擎为确定性算法 | 非真实市场数据，评分仅供参考和演示 |
| 导出为剪贴板复制 | 不支持生成真实 Excel / PDF 文件 |
| AI 响应轮询延迟 | 最快约 2 秒感知到 AI 回复 |
