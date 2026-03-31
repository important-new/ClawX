export type SelectionMode = 'fba-refined' | 'fba-bulk' | 'fbm-refined' | 'fbm-bulk'
export type Verdict = 'pass' | 'watch' | 'reject'
export type StepStatus = 'pass' | 'watch' | 'fail' | 'skip'
export type DataSource = 'manual' | 'mcp' | 'saved'
export type WorkflowType = 'chat' | 'form'

export const MODE_LABELS: Record<SelectionMode, string> = {
  'fba-refined': 'FBA 精铺',
  'fba-bulk': 'FBA 铺货',
  'fbm-refined': 'FBM 精铺',
  'fbm-bulk': 'FBM 铺货',
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  pass: '建议入场',
  watch: '待观察',
  reject: '排除',
}

export const STEP_LABELS = {
  initial: '初选筛选',
  competition: '竞争分析',
  profit: '盈利核算',
  compliance: '合规排查',
  trial: '试销方案',
} as const

export interface DataInput {
  type: 'search-volume' | 'competitor' | 'logistics' | 'ip-check' | 'custom'
  label: string
  required: boolean
  source?: DataSource
  content?: string
  loadedAt?: number
}

export interface MetricResult {
  value: string
  threshold: string
  pass: boolean
}

export interface StepResult {
  status: StepStatus
  score: number
  metrics: Record<string, MetricResult>
  notes: string[]
}

export interface AnalysisReport {
  overallScore: number
  verdict: Verdict
  confidenceLevel: 'high' | 'medium' | 'low'
  steps: {
    initial: StepResult
    competition: StepResult
    profit: StepResult
    compliance: StepResult
    trial: StepResult
  }
  actionItems: Array<{
    priority: 'high' | 'medium' | 'low'
    text: string
  }>
  /** True when the verdict/score/actionItems have been enriched by Gateway AI */
  aiEnriched?: boolean
}

export interface AnalysisSession {
  id: string
  createdAt: number
  updatedAt: number
  workflowType: WorkflowType
  mode: SelectionMode
  productName: string
  keywords: string[]
  market: string
  dataInputs: DataInput[]
  status: 'draft' | 'analyzing' | 'completed' | 'failed'
  report?: AnalysisReport
}

export interface TrackerHistoryEntry {
  checkedAt: number
  score: number
  verdict: Verdict
  sessionId: string
  changeSummary: string[]
}

export interface TrackedProduct {
  id: string
  sessionId: string
  name: string
  mode: SelectionMode
  intervalDays: number
  lastCheckedAt: number
  nextCheckAt: number
  alertOnChange: boolean
  status: 'active' | 'paused'
  currentScore: number
  currentVerdict: Verdict
  scoreTrend: 'up' | 'down' | 'stable'
  history: TrackerHistoryEntry[]
}
