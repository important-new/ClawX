/**
 * Amazon Selection Assistant — MCP server & custom skill configuration store.
 * Persisted to localStorage under "amazon-settings-store".
 */
import { create } from 'zustand'

// ─── Types ────────────────────────────────────────────────────────────────────

export type McpTransportType = 'streamableHttp' | 'stdio'

export interface McpServerHeader {
  key: string
  value: string
}

export interface McpServer {
  id: string
  name: string
  description: string
  type: McpTransportType
  /** streamableHttp: remote URL */
  url: string
  /** stdio: shell command */
  command: string
  headers: McpServerHeader[]
  enabled: boolean
}

export interface CustomSkill {
  id: string
  name: string
  description: string
  /** Keywords that activate this skill in chat mode */
  triggers: string[]
  /** System-level instruction injected when skill is active */
  prompt: string
  enabled: boolean
}

interface AmazonSettingsState {
  mcpServers: McpServer[]
  customSkills: CustomSkill[]

  // MCP server actions
  addMcpServer: (server: Omit<McpServer, 'id'>) => void
  updateMcpServer: (id: string, updates: Partial<Omit<McpServer, 'id'>>) => void
  removeMcpServer: (id: string) => void
  toggleMcpServer: (id: string) => void

  // Custom skill actions
  addCustomSkill: (skill: Omit<CustomSkill, 'id'>) => void
  updateCustomSkill: (id: string, updates: Partial<Omit<CustomSkill, 'id'>>) => void
  removeCustomSkill: (id: string) => void
  toggleCustomSkill: (id: string) => void
}

// ─── Persistence helpers ───────────────────────────────────────────────────────

const STORE_KEY = 'amazon-settings-store'

type PersistedState = Pick<AmazonSettingsState, 'mcpServers' | 'customSkills'>

function load(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedState
  } catch {
    return null
  }
}

function persist(state: PersistedState): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state))
  } catch { /* ignore quota errors */ }
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── Store ─────────────────────────────────────────────────────────────────────

const persisted = load()

export const useAmazonSettingsStore = create<AmazonSettingsState>((set, get) => ({
  mcpServers: persisted?.mcpServers ?? [],
  customSkills: persisted?.customSkills ?? [],

  // ── MCP servers ────────────────────────────────────────────────────────────

  addMcpServer(server) {
    const next = [...get().mcpServers, { ...server, id: uid() }]
    set({ mcpServers: next })
    persist({ mcpServers: next, customSkills: get().customSkills })
  },

  updateMcpServer(id, updates) {
    const next = get().mcpServers.map((s) => s.id === id ? { ...s, ...updates } : s)
    set({ mcpServers: next })
    persist({ mcpServers: next, customSkills: get().customSkills })
  },

  removeMcpServer(id) {
    const next = get().mcpServers.filter((s) => s.id !== id)
    set({ mcpServers: next })
    persist({ mcpServers: next, customSkills: get().customSkills })
  },

  toggleMcpServer(id) {
    const next = get().mcpServers.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s)
    set({ mcpServers: next })
    persist({ mcpServers: next, customSkills: get().customSkills })
  },

  // ── Custom skills ──────────────────────────────────────────────────────────

  addCustomSkill(skill) {
    const next = [...get().customSkills, { ...skill, id: uid() }]
    set({ customSkills: next })
    persist({ mcpServers: get().mcpServers, customSkills: next })
  },

  updateCustomSkill(id, updates) {
    const next = get().customSkills.map((s) => s.id === id ? { ...s, ...updates } : s)
    set({ customSkills: next })
    persist({ mcpServers: get().mcpServers, customSkills: next })
  },

  removeCustomSkill(id) {
    const next = get().customSkills.filter((s) => s.id !== id)
    set({ customSkills: next })
    persist({ mcpServers: get().mcpServers, customSkills: next })
  },

  toggleCustomSkill(id) {
    const next = get().customSkills.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s)
    set({ customSkills: next })
    persist({ mcpServers: get().mcpServers, customSkills: next })
  },
}))

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Convert enabled MCP servers to the openclaw.json mcpServers format */
export function buildMcpServersConfig(
  servers: McpServer[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const s of servers.filter((s) => s.enabled)) {
    if (s.type === 'streamableHttp') {
      const headers: Record<string, string> = {}
      for (const h of s.headers) {
        if (h.key.trim()) headers[h.key.trim()] = h.value
      }
      result[s.name] = {
        type: 'streamableHttp',
        url: s.url,
        ...(s.description ? { description: s.description } : {}),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }
    } else {
      result[s.name] = {
        type: 'stdio',
        command: s.command,
        ...(s.description ? { description: s.description } : {}),
      }
    }
  }
  return result
}

/** SellerSprite pre-fill template */
export const SELLERSPRITE_TEMPLATE: Omit<McpServer, 'id'> = {
  name: 'sellersprite-mcp',
  description: 'SellerSpriteMCP',
  type: 'streamableHttp',
  url: 'https://mcp.sellersprite.com/mcp',
  command: '',
  headers: [{ key: 'secret-key', value: '' }],
  enabled: true,
}
