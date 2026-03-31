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
- [MCP 服务器配置](#mcp-服务器配置)
- [自定义 Skill 管理](#自定义-skill-管理)
- [数据备份与恢复](#数据备份与恢复)
- [状态管理](#状态管理)
- [IPC 通道一览](#ipc-通道一览)
- [已知限制](#已知限制)

---

## 功能概览

选品助手提供三种工作模式，引导用户完成亚马逊产品的市场可行性评估：

| 模式 | 适用场景 |
|------|----------|
| **对话模式** | 新手友好，AI 或引导式问答，逐步收集数据 |
| **表单模式** | 结构化录入，批量数据粘贴，快速生成标准报告 |
| **跟踪看板** | 监控候选产品，定期手动重评，掌握竞争态势变化 |

核心能力：
- 五步评估模型：初选筛选 → 竞争分析 → 盈利核算 → 合规排查 → 试销方案
- 支持四种运营模式：FBA 精铺 / FBA 铺货 / FBM 精铺 / FBM 铺货
- 数据置信度分级：高（必填数据齐全）/ 中（部分数据）/ 低（无实际数据）
- Gateway AI 集成：真实 AI 对话分析 + 报告深度解读（需 gateway 在线）
- Skill 专项分析：调用已安装的 OpenClaw Skill 对产品进行深度分析
- MCP 服务器配置：通过 UI 配置卖家精灵等数据源，写入 `~/.openclaw/openclaw.json`
- 历史记录：筛选、多产品横向对比、Markdown 导出
- 数据备份/恢复：导出全量数据为 JSON，重装后一键恢复

---

## 路由结构

```
/amazon              首页，模式选择 + 统计看板 + 近期分析
/amazon/chat         对话模式
/amazon/form         表单模式
/amazon/tracker      跟踪看板
/amazon/history      历史报告
/amazon/settings     配置页（MCP 服务器 / Skill 管理 / 数据备份）
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
├── AmazonSettings.tsx         配置页（MCP / Skill / 备份，三 Tab）
├── engine.ts                  五步分析引擎（确定性算法）
├── store.ts                   Zustand store（localStorage 持久化）
├── amazonSettingsStore.ts     MCP 服务器配置 store（localStorage 持久化）
├── types.ts                   全局类型定义
├── components/
│   ├── ModeCard.tsx           首页模式入口卡片
│   ├── ReportView.tsx         报告展示组件
│   ├── VerdictBadge.tsx       结论/评分徽章
│   ├── DataPanel.tsx          数据来源侧边面板
│   ├── TrackerCard.tsx        跟踪产品卡片
│   ├── CompareTable.tsx       多产品横向对比表
│   └── SkillInvoker.tsx       Skill 调用面板（步骤3 / 对话模式）
└── hooks/
    ├── useGatewayAI.ts        Gateway AI 集成 hooks
    └── useInstalledSkills.ts  读取已安装 Skill 列表

electron/main/
└── ipc-amazon.ts              全部亚马逊 IPC handler（与 ClawX 核心隔离）
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

### McpServer（amazonSettingsStore）

```typescript
interface McpServer {
  id: string
  name: string
  description: string
  type: 'streamableHttp' | 'stdio'
  url: string        // streamableHttp 模式
  command: string    // stdio 模式
  headers: McpServerHeader[]
  enabled: boolean
}
```

### SkillMeta（amazonSettingsStore）

```typescript
interface SkillMeta {
  slug: string       // 目录名，作为唯一标识
  name: string
  version: string
  description: string
  author: string
  extra: Record<string, string>  // SKILL.md 其他 frontmatter 字段
  path: string       // ~/.openclaw/skills/<slug>/ 绝对路径
  installedAt?: number
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
- 内置 system prompt：AI 自动以专业亚马逊选品顾问角色响应，熟悉四种运营模式和五步评估框架
- AI 自由对话，不强制引导流程
- 对话 ≥2 条后激活"基于此对话生成结构化报告"按钮
- 用户确认产品名 + 模式后运行本地引擎生成报告
- **Skill 选择器**：工具栏显示已安装 Skill 列表（下拉），选择后将调用提示词预填到输入框

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
- 每张卡支持"粘贴数据"（内联 textarea）或"MCP 抓取"（标记模式，待真实接入）
- 缺少必填项时显示警告，以低置信度模式继续

**步骤 3 — 分析报告**
- 进度条动画模拟五步分析过程
- 展示完整 `ReportView`（含可展开的各步骤指标）
- **AI 深度解读**：gateway 在线时可点击，发送报告摘要获取 AI 定性洞察
- **Skill 专项分析**：gateway 在线且有已安装 Skill 时显示，选择 Skill 后发送携带产品上下文的调用提示词，结果展示于面板内
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

单次请求，适用于一次性 AI 分析（FormMode 深度解读、Skill 调用）：

```typescript
const { request, loading, result, error, reset } = useGatewayRequest()

// 发送 prompt，内部轮询 chat.history 获取回复
const reply = await request('请分析以下报告...')
```

**Session key 格式：** `amazon-req:{timestamp}`

### useGatewayChat

多轮对话，适用于 ChatMode AI 模式：

```typescript
const { messages, send, sending, error, reset, sessionKey } = useGatewayChat({
  systemPrompt: '...',  // 可选，首条消息前静默注入 system prompt
})

const reply = await send('我想评估便携挂烫机')
```

**Session key 格式：** `amazon-chat:{timestamp}`

### 通信流程

```
useGatewayRequest / useGatewayChat
    ↓ useGatewayStore.getState().rpc()
    ↓ invokeIpc('gateway:rpc', 'chat.send', params)
    ↓ Electron IPC → GatewayManager → WebSocket
    ↓ OpenClaw Gateway → Claude AI（+ 已注册 Skill 工具）
    ↓ 轮询 chat.history（每 1.8 秒，超时 90 秒）
    ↓ 返回最新 assistant 消息文本
```

**前提条件：** `useGatewayStore(s => s.status.state === 'running')` 为 true

---

## MCP 服务器配置

**路由：** `/amazon/settings`（Tab: MCP 服务器）
**Store：** `amazonSettingsStore.ts`，localStorage key `amazon-settings-store`

### 配置流程

1. 在 Settings 页面添加/编辑 MCP 服务器（支持 `streamableHttp` 和 `stdio` 两种传输类型）
2. 点击"应用配置到 Gateway" → 调用 `amazon:saveMcpConfig`
3. IPC handler 将 `mcpServers` 写入 `~/.openclaw/openclaw.json`
4. 自动触发 Gateway 热重载（macOS/Linux: SIGUSR1；Windows: 完整重启）

### 卖家精灵快速添加

Settings 页面内置 SellerSprite 模板，填入 `secret-key` 后一键添加：

```json
{
  "sellersprite-mcp": {
    "type": "streamableHttp",
    "url": "https://mcp.sellersprite.com/mcp",
    "headers": { "secret-key": "<YOUR_KEY>" }
  }
}
```

### 配置持久化说明

| 存储位置 | 内容 | 卸载后 |
|----------|------|--------|
| `localStorage amazon-settings-store` | UI 侧 McpServer 列表 | **丢失**（需备份） |
| `~/.openclaw/openclaw.json` | 写入 Gateway 的 mcpServers | **保留** |

---

## 自定义 Skill 管理

**路由：** `/amazon/settings`（Tab: 自定义 Skill）
**IPC：** `electron/main/ipc-amazon.ts`

### Skill 目录结构

每个 Skill 是一个目录，必须包含 `SKILL.md`（YAML frontmatter）：

```
my-skill/
├── SKILL.md          # 必须：包含 name/version/description/author
└── ...               # 脚本文件
```

```markdown
---
slug: my-skill
name: 竞品深度分析
version: 1.0.0
description: 基于 MCP 数据对竞品进行深度分析
author: 你的名字
---
```

### 安装流程

1. 点击"选择 Skill 目录" → OS 原生目录选择对话框
2. 自动读取并展示 `SKILL.md` 预览（名称/版本/描述/作者）
3. 点击"确认安装" → 整个目录复制到 `~/.openclaw/skills/<slug>/`
4. 自动触发 Gateway 热重载，Skill 立即对 AI 可用

### Skill 调用（集成到分析流程）

安装后，Skill 以两种方式集成到选品助手：

| 入口 | 方式 |
|------|------|
| **表单模式步骤 3** | "Skill 专项分析"面板，选择 Skill 后构造包含产品上下文的提示词，通过 `useGatewayRequest` 发送，结果内嵌展示 |
| **对话模式 AI 模式工具栏** | "Skills"下拉按钮，选择后将调用提示词预填到输入框，用户确认后发送 |

调用提示词包含：产品名称、运营模式、目标市场、当前报告评分摘要。

---

## 数据备份与恢复

**路由：** `/amazon/settings`（Tab: 数据备份）

### 需要备份的数据

| 数据 | 存储位置 | 卸载后 |
|------|----------|--------|
| 分析历史 + 跟踪产品 | `localStorage amazon-selection-store` | **丢失** |
| MCP 服务器配置列表 | `localStorage amazon-settings-store` | **丢失** |
| Gateway 配置（mcpServers） | `~/.openclaw/openclaw.json` | **保留** |
| 已安装 Skill 文件 | `~/.openclaw/skills/` | **保留** |

### 备份文件格式

```json
{
  "version": 1,
  "exportedAt": 1234567890,
  "amazonStore": "{ \"sessions\": [...], \"trackedProducts\": [...] }",
  "amazonSettingsStore": "{ \"mcpServers\": [...] }"
}
```

### 恢复流程

1. 重装 ClawX 后，进入 `/amazon/settings` → "数据备份" Tab
2. 点击"选择备份文件并导入"
3. 选择之前导出的 `.json` 文件
4. 数据写入 localStorage 后，页面自动重载（3 秒倒计时）

---

## 状态管理

### amazon-selection-store（store.ts）

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

### amazon-settings-store（amazonSettingsStore.ts）

```typescript
interface AmazonSettingsState {
  mcpServers: McpServer[]
  addMcpServer / updateMcpServer / removeMcpServer / toggleMcpServer
}
```

- **持久化：** localStorage key `amazon-settings-store`
- **Skill 数据**：不存 store，直接通过 `amazon:listUserSkills` IPC 实时读取文件系统

---

## IPC 通道一览

全部亚马逊 IPC handler 集中在 `electron/main/ipc-amazon.ts`，channel 以 `amazon:` 为前缀：

| Channel | 方向 | 说明 |
|---------|------|------|
| `amazon:saveMcpConfig` | Renderer → Main | 将 mcpServers 写入 openclaw.json，触发 Gateway 重载 |
| `amazon:readMcpConfig` | Renderer → Main | 读取 openclaw.json 中的 mcpServers |
| `amazon:selectSkillDir` | Renderer → Main | 显示 OS 目录选择对话框 |
| `amazon:readSkillMeta` | Renderer → Main | 解析指定目录的 SKILL.md frontmatter |
| `amazon:listUserSkills` | Renderer → Main | 列出 ~/.openclaw/skills/ 下所有已安装 Skill |
| `amazon:installSkillFromPath` | Renderer → Main | 复制 Skill 目录到 skills dir，触发 Gateway 重载 |
| `amazon:removeSkill` | Renderer → Main | 删除 ~/.openclaw/skills/<slug>/，触发 Gateway 重载 |
| `amazon:exportBackup` | Renderer → Main | 显示保存对话框，将备份 JSON 写入文件 |
| `amazon:importBackup` | Renderer → Main | 显示打开对话框，读取备份文件并返回数据 |

---

## 已知限制

| 限制 | 说明 |
|------|------|
| MCP 抓取为标记模式 | "MCP 抓取"按钮仅标记数据已加载，未接入真实 MCP 工具调用 |
| 引擎为确定性算法 | 非真实市场数据，评分仅供参考；待接入 AI 真实分析 |
| 跟踪器无自动定时重评 | `nextCheckAt` 字段已就绪，但缺少定时触发机制和 OS 通知 |
| 导出为剪贴板复制 | 不支持生成真实 Excel / PDF 文件 |
| AI 响应轮询延迟 | 最快约 2 秒感知到 AI 回复 |
