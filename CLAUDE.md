# CLAUDE.md — ClawX 开发守则

> Claude Code 专用。本文件约束 AI 助手在此仓库中的行为。

---

## 核心原则：非侵入性开发

**ClawX 是一个持续维护的开源项目，会定期接收上游更新。所有功能扩展必须最小化对核心文件的改动，以确保随 ClawX 版本升级时合并冲突降到最低。**

---

## 亚马逊选品助手（Amazon Selection Assistant）

所有选品助手相关代码遵循以下隔离规则：

### 允许自由修改的文件

```
src/pages/Amazon/          ← 全部文件（页面/组件/hooks/store）
electron/main/ipc-amazon.ts ← 所有亚马逊 IPC handler
```

### 禁止修改的核心文件

以下文件属于 ClawX 核心，**严禁增删业务逻辑**：

- `src/App.tsx`
- `electron/main/ipc-handlers.ts`
- `electron/main/gateway/manager.ts`
- `src/stores/` 下的所有文件
- `src/lib/` 下的所有文件
- `electron/utils/` 下的所有文件

### 核心文件的唯一例外（允许的最小改动）

| 文件 | 允许的改动 | 不允许 |
|------|-----------|--------|
| `src/App.tsx` | 追加 `import` 和 `<Route>` 行 | 修改现有路由、组件、逻辑 |
| `electron/main/ipc-handlers.ts` | 追加 `import` 和 `registerXxxHandlers()` 调用 | 修改现有 handler、注册逻辑 |

**修改核心文件前必须明确说明理由，并得到用户确认。**

---

## IPC 命名规范

亚马逊相关 IPC channel 必须以 `amazon:` 为前缀：

```
amazon:saveMcpConfig
amazon:readMcpConfig
amazon:selectSkillDir
amazon:readSkillMeta
amazon:listUserSkills
amazon:installSkillFromPath
amazon:removeSkill
amazon:exportBackup
amazon:importBackup
```

新增 channel 时，handler 必须注册在 `electron/main/ipc-amazon.ts` 中，不得写入 `ipc-handlers.ts`。

---

## 状态管理规范

- 亚马逊数据使用独立 store：`src/pages/Amazon/store.ts`、`src/pages/Amazon/amazonSettingsStore.ts`
- localStorage key 以 `amazon-` 为前缀（`amazon-selection-store`、`amazon-settings-store`）
- **禁止向 ClawX 核心 store（`src/stores/`）写入亚马逊数据**

---

## 依赖约束

- **禁止为亚马逊功能新增 npm 依赖**（除非 ClawX 已有同等功能包）
- 如需解析 YAML、生成文件等，优先使用 Node.js 内置模块或手写最小解析器

---

## 通用开发约束（继承自 AGENTS.md）

- Renderer 只通过 `src/lib/api-client.ts`（`invokeIpc`）调用 IPC，不直接调用 `window.electron.ipcRenderer`
- 不直接从 Renderer fetch Gateway HTTP（`http://127.0.0.1:18789`）
- 不跳过 lint/typecheck（`--no-verify`）
- 每次功能改动后更新 `docs/amazon-selection-assistant.md`

---

## 参考文档

| 文档 | 内容 |
|------|------|
| `AGENTS.md` | ClawX 通用开发规范、命令、注意事项 |
| `docs/amazon-selection-assistant.md` | 选品助手功能文档 |
| `electron/main/ipc-amazon.ts` | 全部亚马逊 IPC 实现 |
