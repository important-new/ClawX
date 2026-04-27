export type ExecutionMode = 'auto' | 'step' | 'hybrid';

export type PipelinePhase =
  | 'category_sampling'
  | 'seller_verification'
  | 'store_check'
  | 'product_detail'
  | 'keyword_research'
  | 'report_generation';

export type PhaseStep = 'execute' | 'check' | 'retry';

export interface QualityCheckResult {
  phase: PipelinePhase;
  timestamp: string;
  pass: boolean;
  metrics: Record<string, number | boolean>;
  threshold?: number;
  recrawl_csv?: string;
  recrawl_count?: number;
  details?: Record<string, unknown>;
}

export interface QualityCheckState {
  status: 'pending' | 'running' | 'passed' | 'failed';
  result?: QualityCheckResult;
  retryCount: number;
}

export interface CaptchaState {
  isWaiting: boolean;
  timestamps: number[];
  currentDelay: number;
  skippedAsins: string[];
}

export interface MultiLevelProgress {
  phase: PipelinePhase | null;
  phaseStep: PhaseStep;
  percent: number;
  message: string;
}

export interface SessionInfo {
  name: string;
  productCount: number;
  date: string;
  path: string;
}
