import { useState, useCallback, useEffect } from 'react'
import {
  Plus, Trash2, Edit2, Check, X, ChevronDown,
  Server, Zap, AlertCircle, CheckCircle2, FolderOpen, RefreshCw,
  Package, Calendar, Download, Upload, Settings2,
} from 'lucide-react'
import { AmazonBreadcrumbs } from './components/AmazonBreadcrumbs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { invokeIpc } from '@/lib/api-client'
import {
  useAmazonSettingsStore,
  buildMcpServersConfig,
  SELLERSPRITE_TEMPLATE,
  type McpServer,
  type McpTransportType,
  type SkillMeta,
  type McpServerHeader,
} from './amazonSettingsStore'

// ─── MCP server form ──────────────────────────────────────────────────────────

interface McpFormState {
  name: string
  description: string
  type: McpTransportType
  url: string
  command: string
  headers: McpServerHeader[]
  enabled: boolean
}

const EMPTY_MCP_FORM: McpFormState = {
  name: '', description: '', type: 'streamableHttp',
  url: '', command: '', headers: [], enabled: true,
}

function mcpToForm(s: McpServer): McpFormState {
  return { name: s.name, description: s.description, type: s.type, url: s.url, command: s.command, headers: s.headers, enabled: s.enabled }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      )}
    >
      <span className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'
      )} />
    </button>
  )
}

// ─── MCP server form panel ────────────────────────────────────────────────────

function McpForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: McpFormState
  onSave: (f: McpFormState) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<McpFormState>(initial)
  const set = (patch: Partial<McpFormState>) => setForm((f) => ({ ...f, ...patch }))

  const addHeader = () => set({ headers: [...form.headers, { key: '', value: '' }] })
  const removeHeader = (i: number) => set({ headers: form.headers.filter((_, idx) => idx !== i) })
  const updateHeader = (i: number, field: keyof McpServerHeader, val: string) =>
    set({ headers: form.headers.map((h, idx) => idx === i ? { ...h, [field]: val } : h) })

  const valid = form.name.trim() && (form.type === 'stdio' ? form.command.trim() : form.url.trim())

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
      {/* Name + type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">服务器名称 <span className="text-red-500">*</span></label>
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="如：sellersprite-mcp" className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">传输类型</label>
          <div className="relative">
            <select
              value={form.type}
              onChange={(e) => set({ type: e.target.value as McpTransportType })}
              className="w-full h-8 text-sm bg-background border border-input rounded-md pl-2.5 pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="streamableHttp">Streamable HTTP</option>
              <option value="stdio">Stdio</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* URL or command */}
      {form.type === 'streamableHttp' ? (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">URL <span className="text-red-500">*</span></label>
          <Input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://mcp.example.com/mcp" className="h-8 text-sm font-mono" />
        </div>
      ) : (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">启动命令 <span className="text-red-500">*</span></label>
          <Input value={form.command} onChange={(e) => set({ command: e.target.value })} placeholder="npx -y my-mcp-server" className="h-8 text-sm font-mono" />
        </div>
      )}

      {/* Description */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">描述（可选）</label>
        <Input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="简短说明此 MCP 服务器的用途" className="h-8 text-sm" />
      </div>

      {/* Headers (HTTP only) */}
      {form.type === 'streamableHttp' && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-muted-foreground">请求头（Headers）</label>
            <button onClick={addHeader} className="text-xs text-primary hover:underline">+ 添加</button>
          </div>
          {form.headers.length === 0 && (
            <p className="text-xs text-muted-foreground/60 italic">无请求头</p>
          )}
          <div className="space-y-1.5">
            {form.headers.map((h, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={h.key}
                  onChange={(e) => updateHeader(i, 'key', e.target.value)}
                  placeholder="Header Key"
                  className="h-7 text-xs font-mono flex-1"
                />
                <span className="text-muted-foreground text-xs">:</span>
                <Input
                  value={h.value}
                  onChange={(e) => updateHeader(i, 'value', e.target.value)}
                  placeholder="Value"
                  className="h-7 text-xs font-mono flex-1"
                />
                <button onClick={() => removeHeader(i)} className="text-muted-foreground hover:text-red-500 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onCancel}>取消</Button>
        <Button size="sm" onClick={() => valid && onSave(form)} disabled={!valid}>
          <Check className="h-3.5 w-3.5 mr-1" />保存
        </Button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type TabKey = 'mcp' | 'skills' | 'backup'

export function AmazonSettings() {
  const { mcpServers, addMcpServer, updateMcpServer, removeMcpServer, toggleMcpServer } = useAmazonSettingsStore()

  const [tab, setTab] = useState<TabKey>('mcp')
  const [applying, setApplying] = useState(false)
  const [applyDone, setApplyDone] = useState(false)

  // MCP editing state
  const [showMcpForm, setShowMcpForm] = useState(false)
  const [editingMcpId, setEditingMcpId] = useState<string | null>(null)
  const [mcpFormInitial, setMcpFormInitial] = useState<McpFormState>(EMPTY_MCP_FORM)
  const [deleteConfirmMcpId, setDeleteConfirmMcpId] = useState<string | null>(null)

  // Backup state
  const [backupWorking, setBackupWorking] = useState(false)

  // Skill state — loaded from disk via IPC
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [installingSkill, setInstallingSkill] = useState(false)
  const [deleteConfirmSkillSlug, setDeleteConfirmSkillSlug] = useState<string | null>(null)
  const [previewMeta, setPreviewMeta] = useState<{ meta: SkillMeta; srcPath: string } | null>(null)

  // Load installed skills when tab becomes active
  useEffect(() => {
    if (tab === 'skills') loadSkills()
  }, [tab])

  const loadSkills = async () => {
    setSkillsLoading(true)
    try {
      const result = await invokeIpc<{ success: boolean; skills: SkillMeta[]; error?: string }>(
        'amazon:listUserSkills',
      )
      if (result?.success) setSkills(result.skills)
    } finally {
      setSkillsLoading(false)
    }
  }

  // ── MCP actions ─────────────────────────────────────────────────────────────

  const openAddMcp = () => {
    setEditingMcpId(null)
    setMcpFormInitial(EMPTY_MCP_FORM)
    setShowMcpForm(true)
  }

  const openAddMcpFromTemplate = () => {
    setEditingMcpId(null)
    setMcpFormInitial({ ...SELLERSPRITE_TEMPLATE })
    setShowMcpForm(true)
  }

  const openEditMcp = (server: McpServer) => {
    setEditingMcpId(server.id)
    setMcpFormInitial(mcpToForm(server))
    setShowMcpForm(true)
  }

  const handleSaveMcp = useCallback((form: McpFormState) => {
    if (editingMcpId) {
      updateMcpServer(editingMcpId, form)
      toast.success('MCP 服务器已更新')
    } else {
      addMcpServer(form)
      toast.success(`已添加 ${form.name}`)
    }
    setShowMcpForm(false)
    setEditingMcpId(null)
    setApplyDone(false)
  }, [editingMcpId, addMcpServer, updateMcpServer])

  // ── Skill actions ────────────────────────────────────────────────────────────

  const handleSelectSkillDir = async () => {
    console.log('[AmazonSettings] Button clicked: selectSkillDir')
    toast.info('正在请求选择目录...')
    const result = await invokeIpc<{ canceled: boolean; filePaths: string[] }>(
      'amazon:selectSkillDir',
    )
    console.log('[AmazonSettings] result from IPC:', result)
    if (result?.canceled || !result?.filePaths?.length) return

    const srcPath = result.filePaths[0]
    const metaResult = await invokeIpc<{ success: boolean; meta: SkillMeta; error?: string }>(
      'amazon:readSkillMeta',
      srcPath,
    )
    if (!metaResult?.success) {
      toast.error(metaResult?.error ?? '读取 SKILL.md 失败，请确认目录中存在该文件')
      return
    }
    setPreviewMeta({ meta: metaResult.meta, srcPath })
    toast.success('Skill 已读取，请在下方预览并确认安装')
  }

  const handleConfirmInstall = async () => {
    if (!previewMeta) return
    setInstallingSkill(true)
    try {
      const result = await invokeIpc<{ success: boolean; slug: string; error?: string }>(
        'amazon:installSkillFromPath',
        previewMeta.srcPath,
      )
      if (result?.success) {
        toast.success(`Skill "${previewMeta.meta.name}" 安装成功，Gateway 正在重载`)
        setPreviewMeta(null)
        await loadSkills()
      } else {
        toast.error(result?.error ?? '安装失败')
      }
    } finally {
      setInstallingSkill(false)
    }
  }

  const handleRemoveSkill = async (slug: string) => {
    const result = await invokeIpc<{ success: boolean; error?: string }>(
      'amazon:removeSkill',
      slug,
    )
    if (result?.success) {
      toast.success(`Skill "${slug}" 已移除，Gateway 正在重载`)
      setDeleteConfirmSkillSlug(null)
      await loadSkills()
    } else {
      toast.error(result?.error ?? '移除失败')
    }
  }

  // ── Backup / restore ─────────────────────────────────────────────────────────

  const handleExport = async () => {
    setBackupWorking(true)
    try {
      const payload = {
        version: 1,
        exportedAt: Date.now(),
        amazonStore: localStorage.getItem('amazon-selection-store') ?? '{}',
        amazonSettingsStore: localStorage.getItem('amazon-settings-store') ?? '{}',
      }
      const result = await invokeIpc<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>(
        'amazon:exportBackup',
        payload,
      )
      if (result?.success) toast.success(`备份已导出到 ${result.filePath}`)
      else if (!result?.canceled) toast.error(result?.error ?? '导出失败')
    } finally {
      setBackupWorking(false)
    }
  }

  const handleImport = async () => {
    setBackupWorking(true)
    try {
      const result = await invokeIpc<{
        success: boolean; canceled?: boolean; error?: string
        data?: { version: number; amazonStore: string; amazonSettingsStore: string }
      }>('amazon:importBackup')

      if (!result?.success || result.canceled) {
        if (!result?.canceled) toast.error(result?.error ?? '导入失败')
        return
      }

      const data = result.data
      if (!data || data.version !== 1) {
        toast.error('备份文件格式不兼容，请确认是选品助手导出的文件')
        return
      }

      if (data.amazonStore) localStorage.setItem('amazon-selection-store', data.amazonStore)
      if (data.amazonSettingsStore) localStorage.setItem('amazon-settings-store', data.amazonSettingsStore)

      toast.success('备份已导入，将在 3 秒后重载页面以生效…')
      setTimeout(() => window.location.reload(), 3000)
    } finally {
      setBackupWorking(false)
    }
  }

  // ── Apply to openclaw.json ───────────────────────────────────────────────────

  const handleApply = async () => {
    setApplying(true)
    try {
      const config = buildMcpServersConfig(mcpServers)
      const result = await invokeIpc<{ success: boolean; error?: string }>(
        'amazon:saveMcpConfig',
        config,
      )
      if (result?.success) {
        setApplyDone(true)
        toast.success('MCP 配置已应用，Gateway 正在重新加载（macOS/Linux 热重载，Windows 将自动重启）')
      } else {
        toast.error(result?.error ?? '写入配置失败')
      }
    } catch (err) {
      toast.error(String(err))
    } finally {
      setApplying(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto w-full">
      <AmazonBreadcrumbs currentMode="设置" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold">选品助手配置</h1>
          <p className="text-[11px] text-muted-foreground">管理数据源 MCP 服务器和自定义 Skill</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: 'mcp', label: 'MCP 服务器', icon: <Server className="h-3.5 w-3.5" /> },
          { key: 'skills', label: '自定义 Skill', icon: <Zap className="h-3.5 w-3.5" /> },
          { key: 'backup', label: '数据备份', icon: <Download className="h-3.5 w-3.5" /> },
        ] as { key: TabKey; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-testid={`amazon-settings-tab-${key}`}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
            )}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── MCP tab ─────────────────────────────────────────────────────────── */}
      {tab === 'mcp' && (
        <div className="space-y-4">
          {/* Info banner */}
          <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 dark:text-blue-300 space-y-0.5">
              <p>配置写入 <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">~/.openclaw/openclaw.json</code> 后自动触发 Gateway 重载。</p>
              <p>macOS / Linux 支持热重载（不中断连接）；Windows 会自动完整重启。仅启用状态的服务器会被写入。</p>
            </div>
          </div>

          {/* Quick-add SellerSprite */}
          {!mcpServers.some((s) => s.name === 'sellersprite-mcp') && (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-950/20 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-orange-600 dark:text-orange-400 text-xs font-bold">SS</div>
                <div>
                  <p className="text-sm font-medium">卖家精灵 MCP</p>
                  <p className="text-xs text-muted-foreground">快速接入卖家精灵数据源</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={openAddMcpFromTemplate} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />快速添加
              </Button>
            </div>
          )}

          {/* Server list */}
          <div className="space-y-2">
            {mcpServers.map((server) => (
              <div key={server.id}>
                {editingMcpId === server.id && showMcpForm ? (
                  <McpForm
                    initial={mcpFormInitial}
                    onSave={handleSaveMcp}
                    onCancel={() => { setShowMcpForm(false); setEditingMcpId(null) }}
                  />
                ) : (
                  <div className={cn(
                    'flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors',
                    !server.enabled && 'opacity-50'
                  )}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{server.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                          {server.type === 'streamableHttp' ? 'HTTP' : 'stdio'}
                        </span>
                        {server.description && (
                          <span className="text-xs text-muted-foreground">{server.description}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                        {server.type === 'streamableHttp' ? server.url : server.command}
                      </p>
                      {server.headers.length > 0 && (
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                          {server.headers.length} 个 Header（
                          {server.headers.map((h) => h.key || '未命名').join('、')}）
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Toggle checked={server.enabled} onChange={() => { toggleMcpServer(server.id); setApplyDone(false) }} />
                      <button onClick={() => openEditMcp(server)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      {deleteConfirmMcpId === server.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">确认删除?</span>
                          <button onClick={() => { removeMcpServer(server.id); setDeleteConfirmMcpId(null); setApplyDone(false) }} className="text-xs text-red-500 hover:underline">是</button>
                          <button onClick={() => setDeleteConfirmMcpId(null)} className="text-xs text-muted-foreground hover:underline">否</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirmMcpId(server.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add form (new) */}
          {showMcpForm && !editingMcpId && (
            <McpForm
              initial={mcpFormInitial}
              onSave={handleSaveMcp}
              onCancel={() => setShowMcpForm(false)}
            />
          )}

          {/* Add button */}
          {!showMcpForm && (
            <button
              onClick={openAddMcp}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
            >
              <Plus className="h-4 w-4" />添加 MCP 服务器
            </button>
          )}

          {/* Apply button */}
          {mcpServers.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                {mcpServers.filter((s) => s.enabled).length} 个已启用 / {mcpServers.length} 个已配置
              </p>
              <Button
                onClick={handleApply}
                disabled={applying || applyDone}
                size="sm"
                className="gap-2"
              >
                {applyDone
                  ? <><CheckCircle2 className="h-3.5 w-3.5" />已应用</>
                  : applying
                    ? '写入中...'
                    : '应用配置到 Gateway'
                }
              </Button>
            </div>
          )}

          {applyDone && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 text-xs text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              配置已写入并触发 Gateway 重载，MCP 服务器即将生效。
            </div>
          )}
        </div>
      )}

      {/* ── Backup tab ──────────────────────────────────────────────────────── */}
      {tab === 'backup' && (
        <div className="space-y-4">
          {/* Info */}
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              <p>以下数据存储在应用内部，<strong>卸载应用时会丢失</strong>，建议定期导出备份：</p>
              <ul className="list-disc list-inside space-y-0.5 mt-1">
                <li>所有选品分析记录（历史报告）</li>
                <li>跟踪看板的产品列表与评分历史</li>
                <li>MCP 服务器配置列表</li>
              </ul>
              <p className="mt-1 text-amber-600 dark:text-amber-400">
                注：<code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">~/.openclaw/</code>（Gateway 配置与已安装 Skill）卸载后会保留，无需手动备份。
              </p>
            </div>
          </div>

          {/* Export */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div>
              <h3 className="text-sm font-medium">导出备份</h3>
              <p className="text-xs text-muted-foreground mt-0.5">将全部数据导出为 JSON 文件，保存到本地任意位置。</p>
            </div>
            <Button onClick={handleExport} disabled={backupWorking} size="sm" className="gap-2">
              <Download className="h-3.5 w-3.5" />
              {backupWorking ? '处理中...' : '导出备份文件'}
            </Button>
          </div>

          {/* Import */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div>
              <h3 className="text-sm font-medium">导入备份</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                重装应用后，选择之前导出的备份文件恢复数据。
                <strong className="text-foreground"> 导入将覆盖当前数据</strong>，请确认后操作。
              </p>
            </div>
            <Button onClick={handleImport} disabled={backupWorking} size="sm" variant="outline" className="gap-2">
              <Upload className="h-3.5 w-3.5" />
              {backupWorking ? '处理中...' : '选择备份文件并导入'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Skills tab ──────────────────────────────────────────────────────── */}
      {tab === 'skills' && (
        <div className="space-y-4">
          {/* Info */}
          <div className="flex items-start gap-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3">
            <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs text-purple-700 dark:text-purple-300 space-y-0.5">
              <p>Skill 目录将复制到 <code className="font-mono bg-purple-100 dark:bg-purple-900/50 px-1 rounded">~/.openclaw/skills/</code>，安装后自动触发 Gateway 热重载。</p>
              <p>每个 Skill 目录必须包含 <code className="font-mono bg-purple-100 dark:bg-purple-900/50 px-1 rounded">SKILL.md</code>（含 YAML frontmatter：name / version / description）。</p>
            </div>
          </div>

          {/* Preview panel — shown after directory selection, before install */}
          {previewMeta && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">安装预览</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{previewMeta.meta.name}</span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{previewMeta.meta.version}</span>
                </div>
                {previewMeta.meta.description && (
                  <p className="text-xs text-muted-foreground ml-6">{previewMeta.meta.description}</p>
                )}
                {previewMeta.meta.author && (
                  <p className="text-xs text-muted-foreground ml-6">作者：{previewMeta.meta.author}</p>
                )}
                <p className="text-[11px] text-muted-foreground font-mono ml-6 truncate">{previewMeta.srcPath}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setPreviewMeta(null)}>取消</Button>
                <Button size="sm" onClick={handleConfirmInstall} disabled={installingSkill} data-testid="amazon-confirm-install-button">
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {installingSkill ? '安装中...' : '确认安装'}
                </Button>
              </div>
            </div>
          )}

          {/* Installed skill list */}
          {skillsLoading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">加载中...</div>
          ) : skills.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              尚未安装任何 Skill。点击下方"选择 Skill 目录"导入你的脚本。
            </div>
          ) : (
            <div className="space-y-2">
              {skills.map((skill) => (
                <div key={skill.slug} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{skill.name}</span>
                      <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{skill.version}</span>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{skill.slug}</span>
                    </div>
                    {skill.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{skill.description}</p>
                    )}
                    {skill.installedAt && (
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground/60">
                        <Calendar className="h-2.5 w-2.5" />
                        {new Date(skill.installedAt).toLocaleDateString('zh-CN')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {deleteConfirmSkillSlug === skill.slug ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">确认移除?</span>
                        <button onClick={() => handleRemoveSkill(skill.slug)} className="text-xs text-red-500 hover:underline">是</button>
                        <button onClick={() => setDeleteConfirmSkillSlug(null)} className="text-xs text-muted-foreground hover:underline">否</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmSkillSlug(skill.slug)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSelectSkillDir} className="gap-1.5" data-testid="amazon-select-skill-dir-button">
              <FolderOpen className="h-3.5 w-3.5" />选择 Skill 目录
            </Button>
            <Button variant="ghost" size="sm" onClick={loadSkills} disabled={skillsLoading} className="gap-1.5 text-muted-foreground">
              <RefreshCw className={cn('h-3.5 w-3.5', skillsLoading && 'animate-spin')} />刷新
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
