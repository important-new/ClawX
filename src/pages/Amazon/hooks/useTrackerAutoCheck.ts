/**
 * useTrackerAutoCheck — polls every 5 minutes for tracked products that are
 * overdue for reanalysis, then triggers automatic recheck and shows a toast.
 *
 * Runs entirely in the renderer — no Electron main process changes needed.
 * Uses the same runAnalysis() + AI enrichment path as manual recheck.
 */
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAmazonStore } from '../store'
import { runAnalysis } from '../engine'
import type { AnalysisSession } from '../types'

const POLL_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes

export function useTrackerAutoCheck() {
  // Keep a ref to the latest store state to avoid stale closures in setInterval
  const storeRef = useRef(useAmazonStore.getState())

  useEffect(() => {
    // Keep ref in sync with store
    const unsub = useAmazonStore.subscribe((state) => { storeRef.current = state })
    return unsub
  }, [])

  useEffect(() => {
    const check = () => {
      const { trackedProducts, sessions, addSession, updateTracked } = storeRef.current
      const now = Date.now()

      const due = trackedProducts.filter(
        (p) => p.status === 'active' && p.nextCheckAt <= now,
      )
      if (due.length === 0) return

      for (const product of due) {
        const originalSession = sessions.find((s) => s.id === product.sessionId) ?? sessions[0]
        if (!originalSession) continue

        const round = product.history.length
        const newReport = runAnalysis({
          mode: product.mode,
          productName: product.name,
          keywords: originalSession.keywords,
          market: originalSession.market,
          dataInputs: originalSession.dataInputs,
          round,
        })

        const newSession: AnalysisSession = {
          id: `auto-${Date.now()}-${product.id}`,
          createdAt: now,
          updatedAt: now,
          workflowType: 'form',
          mode: product.mode,
          productName: product.name,
          keywords: originalSession.keywords,
          market: originalSession.market,
          dataInputs: originalSession.dataInputs,
          status: 'completed',
          report: newReport,
        }
        addSession(newSession)

        const oldScore = product.currentScore
        const newScore = newReport.overallScore
        const scoreDiff = newScore - oldScore
        const changeSummary: string[] = []
        if (Math.abs(scoreDiff) >= 2) {
          changeSummary.push(`评分${scoreDiff > 0 ? '上升' : '下降'} ${Math.abs(scoreDiff)} 分`)
        }
        if (newReport.verdict !== product.currentVerdict) {
          changeSummary.push(`结论变更：${product.currentVerdict} → ${newReport.verdict}`)
        }
        if (changeSummary.length === 0) changeSummary.push('市场无明显变化')

        const intervalMs = product.intervalDays * 86400000
        updateTracked(product.id, {
          sessionId: newSession.id,
          currentScore: newScore,
          currentVerdict: newReport.verdict,
          scoreTrend: scoreDiff >= 2 ? 'up' : scoreDiff <= -2 ? 'down' : 'stable',
          lastCheckedAt: now,
          nextCheckAt: now + intervalMs,
          history: [
            ...product.history,
            {
              checkedAt: now,
              score: newScore,
              verdict: newReport.verdict,
              sessionId: newSession.id,
              changeSummary,
            },
          ],
        })

        // Show toast alert
        const isAlert = product.alertOnChange && scoreDiff <= -2
        if (isAlert) {
          toast.warning(`跟踪提醒：「${product.name}」评分下降 ${Math.abs(scoreDiff)} 分（${newScore}分）`, {
            description: changeSummary.join('；'),
            duration: 8000,
          })
        } else {
          toast.info(`已自动重评：「${product.name}」${newScore}分`, {
            description: changeSummary.join('；'),
            duration: 5000,
          })
        }
      }
    }

    // Run once on mount to catch any overdue items
    check()

    const timer = setInterval(check, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])
}
