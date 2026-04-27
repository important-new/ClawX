import { create } from 'zustand';
import type {
  ExecutionMode, PipelinePhase, QualityCheckResult,
  QualityCheckState, CaptchaState, MultiLevelProgress, SessionInfo,
} from './types/pipeline';

export interface PhaseConfig {
  id: string;
  phase: number;
  name: string;
  enabled: boolean;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'skipped';
  productCount?: number;
  error?: string;
}

export interface PipelineState {
  // Session config (Step 1)
  sessionName: string;
  market: string;
  cdpPort: number;
  phases: PhaseConfig[];

  // Filter params (Step 2)
  filters: Record<string, any>;

  // Execution (Step 3)
  currentStep: 'config' | 'filters' | 'execute' | 'results';
  isExecuting: boolean;
  isPaused: boolean;
  overallProgress: number;
  currentPhaseIndex: number;
  intervention: { type: string; phase: number; message?: string } | null;

  // Results (Step 4)
  stats: Record<string, { count: number; label: string }>;
  reportContent: string | null;

  // Execution mode
  executionMode: ExecutionMode;
  setExecutionMode: (mode: ExecutionMode) => void;

  // Quality checks
  qualityChecks: Record<PipelinePhase, QualityCheckState>;
  setQualityCheckResult: (phase: PipelinePhase, result: QualityCheckResult) => void;
  setQualityCheckStatus: (phase: PipelinePhase, status: QualityCheckState['status']) => void;

  // CAPTCHA
  captcha: CaptchaState;
  triggerCaptcha: () => void;
  resolveCaptcha: () => void;

  // Multi-level progress
  progress: MultiLevelProgress;
  updatePhaseProgress: (p: MultiLevelProgress) => void;

  // Dedup sessions
  dedup: {
    availableSessions: SessionInfo[];
    selectedSessions: string[];
  };
  setAvailableSessions: (sessions: SessionInfo[]) => void;
  toggleDedupSession: (name: string) => void;
  selectAllDedupSessions: () => void;
  deselectAllDedupSessions: () => void;

  // Actions
  setSessionName: (name: string) => void;
  setMarket: (market: string) => void;
  setCdpPort: (port: number) => void;
  togglePhase: (phaseId: string) => void;
  setFilter: (key: string, value: any) => void;
  setFilters: (filters: Record<string, any>) => void;
  setCurrentStep: (step: PipelineState['currentStep']) => void;
  setExecuting: (executing: boolean) => void;
  setPaused: (paused: boolean) => void;
  setProgress: (progress: number) => void;
  setCurrentPhaseIndex: (index: number) => void;
  updatePhaseStatus: (phaseId: string, status: PhaseConfig['status'], extra?: Partial<PhaseConfig>) => void;
  setIntervention: (intervention: PipelineState['intervention']) => void;
  setStats: (stats: PipelineState['stats']) => void;
  setReportContent: (content: string | null) => void;
  reset: () => void;
}

const DEFAULT_PHASES: PhaseConfig[] = [
  { id: 'phase1', phase: 1, name: '搜索采样', enabled: true, status: 'idle' },
  { id: 'phase2', phase: 2, name: '卖家验证', enabled: true, status: 'idle' },
  { id: 'phase3', phase: 3, name: '店铺分析', enabled: true, status: 'idle' },
  { id: 'phase4', phase: 4, name: '产品详情', enabled: true, status: 'idle' },
  { id: 'phase5', phase: 5, name: '关键词分析', enabled: true, status: 'idle' },
  { id: 'phase6', phase: 6, name: '生成报告', enabled: true, status: 'idle' },
];

export const DEFAULT_FILTERS: Record<string, any> = {
  // ── Phase 1: SellerSprite 搜索条件 ──
  // 月份
  month: null,
  // 销售表现
  monthly_sales_min: 300,
  monthly_sales_max: null,
  monthly_revenue_min: null,
  monthly_revenue_max: null,
  child_sales_min: null,
  child_sales_max: null,
  sales_growth_min: null,
  sales_growth_max: null,
  bsr_min: null,
  bsr_max: null,
  sub_bsr_min: null,
  sub_bsr_max: null,
  sub_category_only: false,
  bsr_growth_num_min: null,
  bsr_growth_num_max: null,
  bsr_growth_rate_min: null,
  bsr_growth_rate_max: null,
  // 产品信息
  variants_min: null,
  variants_max: null,
  price_min: 50,
  price_max: 100,
  qa_min: null,
  qa_max: null,
  review_count_min: null,
  review_count_max: null,
  monthly_reviews_min: null,
  monthly_reviews_max: null,
  rating_min: 4.5,
  rating_max: 5,
  review_rate_min: null,
  review_rate_max: null,
  fba_fee_min: null,
  fba_fee_max: null,
  gross_margin_min: null,
  gross_margin_max: null,
  listing_age: '近半年',
  lqs_min: null,
  lqs_max: null,
  pkg_weight_min: null,
  pkg_weight_max: null,
  pkg_size: null,
  buyer_shipping_min: null,
  buyer_shipping_max: null,
  low_price: false,
  // 竞品筛选
  seller_count_min: null,
  seller_count_max: 1,
  seller_location: '中国',
  include_brand: null,
  exclude_brand: null,
  include_seller: null,
  exclude_seller: null,
  exclude_keyword: null,
  include_keyword: null,
  keyword_match: null,
  fba: true,
  amz: false,
  fbm: false,
  video: null,
  product_tags: null,
  // ── Phase 2-5: 后处理筛选 ──
  max_seller_reviews: 100,
  min_store_listing_count: 2,
  max_high_sales_ratio: 0.5,
  high_sales_threshold: 200,
  max_launch_reviews: 30,
  max_review_jumps: 0,
  review_jump_threshold: 30,
  min_3m_reviews: 0,
  max_3m_reviews: 60,
  max_min_ppc: 3.0,
  max_comp_reviews: 100,
};

const generateSessionName = () =>
  `pipeline-${new Date().toISOString().slice(0, 10)}-${Math.floor(Math.random() * 1000)}`;

export const usePipelineStore = create<PipelineState>()((set) => ({
  sessionName: generateSessionName(),
  market: 'us',
  cdpPort: 9222,
  phases: DEFAULT_PHASES.map(p => ({ ...p })),
  filters: { ...DEFAULT_FILTERS },
  currentStep: 'config',
  isExecuting: false,
  isPaused: false,
  overallProgress: 0,
  currentPhaseIndex: -1,
  intervention: null,
  stats: {},
  reportContent: null,

  executionMode: 'step',

  qualityChecks: {
    category_sampling: { status: 'pending', retryCount: 0 },
    seller_verification: { status: 'pending', retryCount: 0 },
    store_check: { status: 'pending', retryCount: 0 },
    product_detail: { status: 'pending', retryCount: 0 },
    keyword_research: { status: 'pending', retryCount: 0 },
    report_generation: { status: 'pending', retryCount: 0 },
  },

  captcha: { isWaiting: false, timestamps: [], currentDelay: 10, skippedAsins: [] },

  progress: { phase: null, phaseStep: 'execute', percent: 0, message: '' },

  dedup: { availableSessions: [], selectedSessions: [] },

  setAvailableSessions: (sessions) =>
    set({ dedup: { availableSessions: sessions, selectedSessions: sessions.map((s) => s.name) } }),

  toggleDedupSession: (name) =>
    set((s) => ({
      dedup: {
        ...s.dedup,
        selectedSessions: s.dedup.selectedSessions.includes(name)
          ? s.dedup.selectedSessions.filter((n) => n !== name)
          : [...s.dedup.selectedSessions, name],
      },
    })),

  selectAllDedupSessions: () =>
    set((s) => ({
      dedup: { ...s.dedup, selectedSessions: s.dedup.availableSessions.map((ss) => ss.name) },
    })),

  deselectAllDedupSessions: () =>
    set((s) => ({ dedup: { ...s.dedup, selectedSessions: [] } })),

  setSessionName: (name) => set({ sessionName: name }),
  setMarket: (market) => set({ market }),
  setCdpPort: (port) => set({ cdpPort: port }),

  togglePhase: (phaseId) =>
    set((state) => {
      // Phase 1 is always enabled
      if (phaseId === 'phase1') return state;
      const phases = state.phases.map((p) => {
        if (p.id !== phaseId) return p;
        return { ...p, enabled: !p.enabled };
      });
      // If phase4 disabled, also disable phase5 (depends on product_potential.csv)
      if (phaseId === 'phase4') {
        const phase4 = phases.find(p => p.id === 'phase4')!;
        if (!phase4.enabled) {
          const idx5 = phases.findIndex(p => p.id === 'phase5');
          if (idx5 >= 0) phases[idx5] = { ...phases[idx5], enabled: false };
        }
      }
      return { phases };
    }),

  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),

  setFilters: (filters) => set({ filters }),

  setCurrentStep: (step) => set({ currentStep: step }),
  setExecuting: (executing) => set({ isExecuting: executing }),
  setPaused: (paused) => set({ isPaused: paused }),
  setProgress: (progress) => set({ overallProgress: progress }),
  setCurrentPhaseIndex: (index) => set({ currentPhaseIndex: index }),

  updatePhaseStatus: (phaseId, status, extra) =>
    set((state) => ({
      phases: state.phases.map((p) =>
        p.id === phaseId ? { ...p, status, ...extra } : p
      ),
    })),

  setIntervention: (intervention) => set({ intervention }),
  setStats: (stats) => set({ stats }),
  setReportContent: (content) => set({ reportContent: content }),

  setExecutionMode: (mode) => set({ executionMode: mode }),

  setQualityCheckResult: (phase, result) =>
    set((s) => ({
      qualityChecks: {
        ...s.qualityChecks,
        [phase]: {
          status: result.pass ? 'passed' : 'failed',
          result,
          retryCount: s.qualityChecks[phase].retryCount,
        },
      },
    })),

  setQualityCheckStatus: (phase, status) =>
    set((s) => ({
      qualityChecks: {
        ...s.qualityChecks,
        [phase]: { ...s.qualityChecks[phase], status },
      },
    })),

  triggerCaptcha: () =>
    set((s) => {
      const timestamps = [...s.captcha.timestamps, Date.now()];
      const recent = timestamps.filter((t) => Date.now() - t < 300_000);
      const delay = recent.length <= 1 ? 10 : recent.length <= 3 ? 30 : 60;
      return { captcha: { ...s.captcha, isWaiting: true, timestamps, currentDelay: delay } };
    }),

  resolveCaptcha: () =>
    set((s) => ({ captcha: { ...s.captcha, isWaiting: false } })),

  updatePhaseProgress: (p) => set({ progress: p }),

  reset: () =>
    set({
      sessionName: generateSessionName(),
      phases: DEFAULT_PHASES.map(p => ({ ...p })),
      filters: { ...DEFAULT_FILTERS },
      currentStep: 'config',
      isExecuting: false,
      isPaused: false,
      overallProgress: 0,
      currentPhaseIndex: -1,
      intervention: null,
      stats: {},
      reportContent: null,
      executionMode: 'step',
      qualityChecks: {
        category_sampling: { status: 'pending', retryCount: 0 },
        seller_verification: { status: 'pending', retryCount: 0 },
        store_check: { status: 'pending', retryCount: 0 },
        product_detail: { status: 'pending', retryCount: 0 },
        keyword_research: { status: 'pending', retryCount: 0 },
        report_generation: { status: 'pending', retryCount: 0 },
      },
      captcha: { isWaiting: false, timestamps: [], currentDelay: 10, skippedAsins: [] },
      progress: { phase: null, phaseStep: 'execute', percent: 0, message: '' },
      dedup: { availableSessions: [], selectedSessions: [] },
    }),
}));
