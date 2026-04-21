import { create } from 'zustand';

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
  // Phase 1 — Search
  s1_min_sales: 300,
  s1_min_price: 50,
  s1_max_price: 100,
  s1_min_rating: 4.2,
  s1_max_new_months: 12,
  // Phase 2 — Seller
  max_seller_reviews: 100,
  // Phase 3 — Store
  min_store_listing_count: 2,
  max_high_sales_ratio: 0.5,
  high_sales_threshold: 200,
  // Phase 4 — Product detail
  max_launch_reviews: 30,
  max_review_jumps: 0,
  review_jump_threshold: 30,
  min_3m_reviews: 0,
  max_3m_reviews: 60,
  // Phase 5 — Keyword
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
    }),
}));
