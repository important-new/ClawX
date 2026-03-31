/**
 * Amazon Selection Assistant — MCP server configuration store.
 * Only MCP server config is persisted here (localStorage "amazon-settings-store").
 * Skill metadata is read live from ~/.openclaw/skills/ via IPC.
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

/** Skill metadata parsed from SKILL.md frontmatter (read-only, from IPC) */
export interface SkillMeta {
  slug: string
  name: string
  version: string
  description: string
  author: string
  extra: Record<string, string>
  /** Absolute path on disk */
  path: string
  /** Directory ctime (used as install timestamp) */
  installedAt?: number
}

interface AmazonSettingsState {
  mcpServers: McpServer[]

  // MCP server actions
  addMcpServer: (server: Omit<McpServer, 'id'>) => void
  updateMcpServer: (id: string, updates: Partial<Omit<McpServer, 'id'>>) => void
  removeMcpServer: (id: string) => void
  toggleMcpServer: (id: string) => void
}

// ─── Persistence helpers ───────────────────────────────────────────────────────

const STORE_KEY = 'amazon-settings-store'

type PersistedState = Pick<AmazonSettingsState, 'mcpServers'>

function load(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Migrate: old store may have customSkills field — just ignore it
    return { mcpServers: (parsed.mcpServers as McpServer[]) ?? [] }
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

  addMcpServer(server) {
    const next = [...get().mcpServers, { ...server, id: uid() }]
    set({ mcpServers: next })
    persist({ mcpServers: next })
  },

  updateMcpServer(id, updates) {
    const next = get().mcpServers.map((s) => s.id === id ? { ...s, ...updates } : s)
    set({ mcpServers: next })
    persist({ mcpServers: next })
  },

  removeMcpServer(id) {
    const next = get().mcpServers.filter((s) => s.id !== id)
    set({ mcpServers: next })
    persist({ mcpServers: next })
  },

  toggleMcpServer(id) {
    const next = get().mcpServers.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s)
    set({ mcpServers: next })
    persist({ mcpServers: next })
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
