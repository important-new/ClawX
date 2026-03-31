/**
 * Amazon selection assistant — Gateway AI integration hooks.
 *
 * useGatewayRequest — one-shot: send a prompt, get one AI response
 * useGatewayChat    — multi-turn: full chat session via gateway
 */
import { useCallback, useRef, useState } from 'react'
import { useGatewayStore } from '@/stores/gateway'

// ── Text extraction ────────────────────────────────────────────────────────────

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string; thinking?: string }>)
      .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
      .join('')
  }
  return ''
}

interface RawMsg { role: string; content: unknown; timestamp?: number }

// ── Shared polling helper ──────────────────────────────────────────────────────

async function pollForReply(
  rpc: <T>(method: string, params?: unknown, timeout?: number) => Promise<T>,
  sessionKey: string,
  baselineCount: number,
  timeoutMs = 90000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1800))
    try {
      const data = await rpc<{ messages?: RawMsg[] }>(
        'chat.history',
        { sessionKey, limit: 100 },
      )
      const msgs = data?.messages ?? []
      if (msgs.length > baselineCount) {
        // Walk backwards from end — find last assistant msg after baseline
        for (let i = msgs.length - 1; i >= baselineCount; i--) {
          if (msgs[i].role === 'assistant') {
            return extractText(msgs[i].content)
          }
        }
      }
    } catch { /* ignore transient errors */ }
  }
  return null
}

async function sendAndGetBaseline(
  rpc: <T>(method: string, params?: unknown, timeout?: number) => Promise<T>,
  sessionKey: string,
): Promise<number> {
  const before = await rpc<{ messages?: RawMsg[] }>(
    'chat.history',
    { sessionKey, limit: 100 },
  ).catch(() => ({ messages: [] }))
  return (before.messages ?? []).length
}

// ── useGatewayRequest — single-shot ──────────────────────────────────────────

export interface GatewayRequestState {
  loading: boolean
  result: string | null
  error: string | null
  request: (prompt: string) => Promise<string | null>
  reset: () => void
}

export function useGatewayRequest(): GatewayRequestState {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const request = useCallback(async (prompt: string): Promise<string | null> => {
    const { rpc } = useGatewayStore.getState()
    const sessionKey = `amazon-req:${Date.now()}`
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const baselineCount = await sendAndGetBaseline(rpc, sessionKey)

      await rpc('chat.send', {
        sessionKey,
        message: prompt,
        deliver: false,
        idempotencyKey: crypto.randomUUID(),
      })

      const reply = await pollForReply(rpc, sessionKey, baselineCount)
      if (reply) {
        setResult(reply)
        return reply
      }
      setError('AI 未在规定时间内响应，请重试')
      return null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { loading, result, error, request, reset }
}

// ── useGatewayChat — multi-turn ───────────────────────────────────────────────

export interface GatewayChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface GatewayChatState {
  messages: GatewayChatMessage[]
  sending: boolean
  error: string | null
  sessionKey: string
  send: (text: string) => Promise<string | null>
  reset: () => void
}

export interface GatewayChatOptions {
  systemPrompt?: string
}

export function useGatewayChat(options?: GatewayChatOptions): GatewayChatState {
  const sessionKeyRef = useRef(`amazon-chat:${Date.now()}`)
  const [messages, setMessages] = useState<GatewayChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Track whether the system prompt has been injected for this session
  const systemInjectedRef = useRef(false)

  const send = useCallback(async (text: string): Promise<string | null> => {
    const { rpc } = useGatewayStore.getState()
    setSending(true)
    setError(null)

    // Optimistic user message in local UI
    setMessages((prev) => [...prev, { role: 'user', content: text }])

    try {
      // On the very first user message, silently prepend the system prompt so the
      // AI understands its role without cluttering the visible conversation.
      if (options?.systemPrompt && !systemInjectedRef.current) {
        systemInjectedRef.current = true
        const initBaseline = await sendAndGetBaseline(rpc, sessionKeyRef.current)
        await rpc('chat.send', {
          sessionKey: sessionKeyRef.current,
          message: options.systemPrompt,
          deliver: false,
          idempotencyKey: crypto.randomUUID(),
        })
        // Wait for the AI to acknowledge the system context before sending the
        // actual user message. This keeps the conversation coherent.
        await pollForReply(rpc, sessionKeyRef.current, initBaseline, 60000)
      }

      const baselineCount = await sendAndGetBaseline(rpc, sessionKeyRef.current)

      await rpc('chat.send', {
        sessionKey: sessionKeyRef.current,
        message: text,
        deliver: false,
        idempotencyKey: crypto.randomUUID(),
      })

      const reply = await pollForReply(rpc, sessionKeyRef.current, baselineCount)
      if (reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
        return reply
      }
      setError('AI 未在规定时间内响应，请重试')
      return null
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      return null
    } finally {
      setSending(false)
    }
  }, [options?.systemPrompt])

  const reset = useCallback(() => {
    sessionKeyRef.current = `amazon-chat:${Date.now()}`
    systemInjectedRef.current = false
    setMessages([])
    setError(null)
  }, [])

  return {
    messages,
    sending,
    error,
    sessionKey: sessionKeyRef.current,
    send,
    reset,
  }
}
