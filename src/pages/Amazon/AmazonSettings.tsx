import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Edit2, Check, X, ChevronDown,
  Server, Zap, AlertCircle, CheckCircle2, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { invokeIpc } from '@/lib/api-client'
import {
  useAmazonSettingsStore,
  buildMcpServersConfig,
  SELLERSPRITE_TEMPLATE,
  type McpServer,
  type McpTransportType,
  type CustomSkill,
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

// ─── Skill form ───────────────────────────────────────────────────────────────

interface SkillFormState {
  name: string
  description: string
  triggers: string
  prompt: string
  enabled: boolean
}

const EMPTY_SKILL_FORM: SkillFormState = {
  name: '', description: '', triggers: '', prompt: '', enabled: true,
}

function skillToForm(s: CustomSkill): SkillFormState {
  return { name: s.name, description: s.description, triggers: s.triggers.join('，'), prompt: s.prompt, enabled: s.enabled }
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

// ─── Skill form panel ─────────────────────────────────────────────────────────

function SkillForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: SkillFormState
  onSave: (f: SkillFormState) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<SkillFormState>(initial)
  const set = (patch: Partial<SkillFormState>) => setForm((f) => ({ ...f, ...patch }))
  const valid = form.name.trim() && form.prompt.trim()

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Skill 名称 <span className="text-red-500">*</span></label>
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="如：竞品深度分析" className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">描述</label>
          <Input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="简短说明" className="h-8 text-sm" />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">触发关键词（逗号分隔）</label>
        <Input value={form.triggers} onChange={(e) => set({ triggers: e.target.value })} placeholder="竞品分析，competitor analysis" className="h-8 text-sm" />
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">提示词模板 <span className="text-red-500">*</span></label>
        <Textarea
          value={form.prompt}
          onChange={(e) => set({ prompt: e.target.value })}
          placeholder="当用户提到此 Skill 时，AI 会遵循此提示词执行任务。支持 {productName}、{mode}、{market} 占位符。"
          className="min-h-[80px] text-sm resize-none"
        />
      </div>

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

type TabKey = 'mcp' | 'skills'

export function AmazonSettings() {
  const navigate = useNavigate()
  const {
    mcpServers, addMcpServer, updateMcpServer, removeMcpServer, toggleMcpServer,
    customSkills, addCustomSkill, updateCustomSkill, removeCustomSkill, toggleCustomSkill,
  } = useAmazonSettingsStore()

  const [tab, setTab] = useState<TabKey>('mcp')
  const [applying, setApplying] = useState(false)
  const [applyDone, setApplyDone] = useState(false)

  // MCP editing state
  const [showMcpForm, setShowMcpForm] = useState(false)
  const [editingMcpId, setEditingMcpId] = useState<string | null>(null)
  const [mcpFormInitial, setMcpFormInitial] = useState<McpFormState>(EMPTY_MCP_FORM)
  const [deleteConfirmMcpId, setDeleteConfirmMcpId] = useState<string | null>(null)

  // Skill editing state
  const [showSkillForm, setShowSkillForm] = useState(false)
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null)
  const [skillFormInitial, setSkillFormInitial] = useState<SkillFormState>(EMPTY_SKILL_FORM)
  const [deleteConfirmSkillId, setDeleteConfirmSkillId] = useState<string | null>(null)

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

  const openAddSkill = () => {
    setEditingSkillId(null)
    setSkillFormInitial(EMPTY_SKILL_FORM)
    setShowSkillForm(true)
  }

  const openEditSkill = (skill: CustomSkill) => {
    setEditingSkillId(skill.id)
    setSkillFormInitial(skillToForm(skill))
    setShowSkillForm(true)
  }

  const handleSaveSkill = useCallback((form: SkillFormState) => {
    const triggers = form.triggers.split(/[，,、]/).map((t) => t.trim()).filter(Boolean)
    if (editingSkillId) {
      updateCustomSkill(editingSkillId, { ...form, triggers })
      toast.success('Skill 已更新')
    } else {
      addCustomSkill({ ...form, triggers })
      toast.success(`已添加 Skill：${form.name}`)
    }
    setShowSkillForm(false)
    setEditingSkillId(null)
  }, [editingSkillId, addCustomSkill, updateCustomSkill])

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
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/amazon')}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-base font-semibold">选品助手配置</h1>
          <p className="text-xs text-muted-foreground">管理数据源 MCP 服务器和自定义 Skill</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { key: 'mcp', label: 'MCP 服务器', icon: <Server className="h-3.5 w-3.5" /> },
          { key: 'skills', label: '自定义 Skill', icon: <Zap className="h-3.5 w-3.5" /> },
        ] as { key: TabKey; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
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

      {/* ── Skills tab ──────────────────────────────────────────────────────── */}
      {tab === 'skills' && (
        <div className="space-y-4">
          {/* Info */}
          <div className="flex items-start gap-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3">
            <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs text-purple-700 dark:text-purple-300 space-y-0.5">
              <p>自定义 Skill 是用于选品助手 AI 对话的提示词模板。AI 检测到触发关键词时自动激活。</p>
              <p>提示词中可使用 <code className="font-mono bg-purple-100 dark:bg-purple-900/50 px-1 rounded">{'{productName}'}</code>、<code className="font-mono bg-purple-100 dark:bg-purple-900/50 px-1 rounded">{'{mode}'}</code>、<code className="font-mono bg-purple-100 dark:bg-purple-900/50 px-1 rounded">{'{market}'}</code> 占位符。</p>
            </div>
          </div>

          {/* Skill list */}
          <div className="space-y-2">
            {customSkills.map((skill) => (
              <div key={skill.id}>
                {editingSkillId === skill.id && showSkillForm ? (
                  <SkillForm
                    initial={skillFormInitial}
                    onSave={handleSaveSkill}
                    onCancel={() => { setShowSkillForm(false); setEditingSkillId(null) }}
                  />
                ) : (
                  <div className={cn(
                    'rounded-xl border bg-card px-4 py-3 space-y-1.5 transition-colors',
                    !skill.enabled && 'opacity-50'
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{skill.name}</span>
                          {skill.description && (
                            <span className="text-xs text-muted-foreground truncate">{skill.description}</span>
                          )}
                        </div>
                        {skill.triggers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {skill.triggers.map((t) => (
                              <span key={t} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{t}</span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{skill.prompt}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 mt-0.5">
                        <Toggle checked={skill.enabled} onChange={() => toggleCustomSkill(skill.id)} />
                        <button onClick={() => openEditSkill(skill)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {deleteConfirmSkillId === skill.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">确认?</span>
                            <button onClick={() => { removeCustomSkill(skill.id); setDeleteConfirmSkillId(null) }} className="text-xs text-red-500 hover:underline">是</button>
                            <button onClick={() => setDeleteConfirmSkillId(null)} className="text-xs text-muted-foreground hover:underline">否</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirmSkillId(skill.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add form (new) */}
          {showSkillForm && !editingSkillId && (
            <SkillForm
              initial={skillFormInitial}
              onSave={handleSaveSkill}
              onCancel={() => setShowSkillForm(false)}
            />
          )}

          {/* Add button */}
          {!showSkillForm && (
            <button
              onClick={openAddSkill}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
            >
              <Plus className="h-4 w-4" />添加自定义 Skill
            </button>
          )}

          {/* Docs link */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
            <ExternalLink className="h-3 w-3" />
            <span>自定义 Skill 保存在本地，不影响 Gateway 配置，无需重启。</span>
          </div>
        </div>
      )}
    </div>
  )
}
