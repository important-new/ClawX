import { useState, useCallback } from 'react'
import { invokeIpc } from '@/lib/api-client'
import {
  readAmazonSessionFile,
  getAmazonSessionStats,
} from '@/lib/host-api'

export interface PipelineSessionMeta {
  name: string
  productCount: number
  date: string
}

export interface LoadedSession {
  name: string
  stats: Record<string, { count: number; label: string }>
  report: string | null
}

export function usePipelineSession() {
  const [sessions, setSessions] = useState<PipelineSessionMeta[]>([])
  const [scanning, setScanning] = useState(false)
  const [loaded, setLoaded] = useState<LoadedSession | null>(null)
  const [loading, setLoading] = useState(false)

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const result = await invokeIpc<PipelineSessionMeta[]>('amazon:scanSessions')
      setSessions(result ?? [])
    } finally {
      setScanning(false)
    }
  }, [])

  const load = useCallback(async (sessionName: string) => {
    setLoading(true)
    try {
      const [statsResult, reportResult] = await Promise.all([
        getAmazonSessionStats(sessionName),
        readAmazonSessionFile(sessionName, 'Product_Selection_Report.md'),
      ])

      setLoaded({
        name: sessionName,
        stats: statsResult?.success ? statsResult.stats : {},
        report: reportResult?.success ? (reportResult.content ?? null) : null,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => setLoaded(null), [])

  return { sessions, scanning, scan, loaded, loading, load, clear }
}
