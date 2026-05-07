import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, AlertCircle, Settings2, Play, Square,
  FileText, Download, RotateCcw,
} from 'lucide-react';
import { AmazonBreadcrumbs } from './components/AmazonBreadcrumbs';
import { PipelineFilterForm } from './components/PipelineFilterForm';
import { PipelinePhaseCard } from './components/PipelinePhaseCard';
import { PipelineFunnel } from './components/PipelineFunnel';
import { MarkdownReport } from './components/MarkdownReport';
import { ExecutionModeSelector } from './components/ExecutionModeSelector';
import { QualityCheckPanel } from './components/QualityCheckPanel';
import { QualityCheckBadge } from './components/QualityCheckBadge';
import { CaptchaModal } from './components/CaptchaModal';
import { ProgressMultiLevel } from './components/ProgressMultiLevel';
import { SessionSelector } from './components/SessionSelector';
import { ProfitCalculator } from './components/ProfitCalculator';
import { BatchProfitPanel } from './components/BatchProfitPanel';
import type { PipelinePhase } from './types/pipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  listAmazonTools,
  runAmazonWorkflow,
  stopAmazonWorkflow,
  resumeAmazonWorkflow,
  readAmazonSessionFile,
  getAmazonSessionStats,
} from '@/lib/host-api';
import { invokeIpc } from '@/lib/api-client';
import { usePipelineStore, DEFAULT_FILTERS } from './pipelineStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PluginTool {
  id: string;
  name: string;
  description: string;
  stage: string;
  arguments: any[];
}

const MARKETS = [
  { id: 'us', name: '美国 (Amazon.com)', icon: '🇺🇸' },
  { id: 'uk', name: '英国 (Amazon.co.uk)', icon: '🇬🇧' },
  { id: 'de', name: '德国 (Amazon.de)', icon: '🇩🇪' },
  { id: 'jp', name: '日本 (Amazon.co.jp)', icon: '🇯🇵' },
];

const STEPS = ['config', 'filters', 'execute', 'results'] as const;
const STEP_LABELS = ['会话配置', '筛选参数', '执行监控', '结果查看'];

const PHASE_NUM_TO_ID: Record<number, PipelinePhase> = {
  1: 'category_sampling',
  2: 'seller_verification',
  3: 'store_check',
  4: 'product_detail',
  5: 'keyword_research',
  6: 'report_generation',
};

export function PipelineWizard() {
  const navigate = useNavigate();
  const store = usePipelineStore();
  const [tools, setTools] = useState<PluginTool[]>([]);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // ── Load tools ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    listAmazonTools().then(result => {
      if (cancelled) return;
      if (result.success && Array.isArray(result.tools)) {
        const toolsList = result.tools as PluginTool[];
        setTools(toolsList);
        // Merge filter defaults from tools' enriched arguments
        const enrichedDefaults: Record<string, any> = {};
        for (const tool of toolsList) {
          for (const arg of tool.arguments || []) {
            if (arg.name.startsWith('filter:')) {
              const key = arg.name.replace('filter:', '');
              if (enrichedDefaults[key] === undefined && arg.default !== undefined) {
                enrichedDefaults[key] = arg.default;
              }
            }
          }
        }
        if (Object.keys(enrichedDefaults).length > 0) {
          usePipelineStore.getState().setFilters({ ...DEFAULT_FILTERS, ...enrichedDefaults, ...usePipelineStore.getState().filters });
        }
      }
    }).catch(() => {
      if (!cancelled) toast.error('无法加载工具列表');
    });
    return () => { cancelled = true; };
  }, []);

  // ── IPC listeners ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handleProgress = (_: any, data: any) => {
      if (data.percent !== undefined) store.setProgress(data.percent);
      if (data.currentStep !== undefined) {
        store.setCurrentPhaseIndex(data.currentStep);
        // Update phase statuses based on current step
        const enabledPhases = store.phases.filter(p => p.enabled);
        enabledPhases.forEach((p, idx) => {
          if (idx < data.currentStep) {
            store.updatePhaseStatus(p.id, 'completed');
          } else if (idx === data.currentStep) {
            store.updatePhaseStatus(p.id, 'running');
          }
        });
      }
    };

    const handleIntervention = (_: any, data: any) => {
      const enabledPhases = store.phases.filter(p => p.enabled);
      const currentPhase = enabledPhases[store.currentPhaseIndex];
      if (currentPhase) {
        store.updatePhaseStatus(currentPhase.id, 'paused');
      }
      store.setPaused(true);
      store.setIntervention({
        type: data.type || 'captcha',
        phase: store.currentPhaseIndex,
        message: data.message,
      });
      // Trigger captcha tracking in store
      if (data.type === 'captcha') {
        usePipelineStore.getState().triggerCaptcha();
      }
      toast.warning('流程已暂停：需要手动干预');
    };

    const handleQcResult = (_: any, result: any) => {
      if (result?.phase && 'pass' in result) {
        usePipelineStore.getState().setQualityCheckResult(result.phase, result);
      }
    };

    const handlePhaseSignal = (_: any, signal: any) => {
      usePipelineStore.getState().updatePhaseProgress({
        phase: signal.phase,
        phaseStep: signal.step,
        percent: usePipelineStore.getState().overallProgress,
        message: `${signal.phase}: ${signal.step}`,
      });
    };

    const unprogress = window.electron.ipcRenderer.on('amazon:workflowProgress', handleProgress);
    const unintervention = window.electron.ipcRenderer.on('amazon:workflowIntervention', handleIntervention);
    const unqc = window.electron.ipcRenderer.on('amazon:qualityCheckResult', handleQcResult);
    const unphase = window.electron.ipcRenderer.on('amazon:phaseProgress', handlePhaseSignal);

    return () => {
      if (typeof unprogress === 'function') unprogress();
      if (typeof unintervention === 'function') unintervention();
      if (typeof unqc === 'function') unqc();
      if (typeof unphase === 'function') unphase();
    };
  }, []);

  // ── Execute pipeline ──────────────────────────────────────────────────────

  const startPipeline = async () => {
    setExecutionError(null);
    store.setExecuting(true);
    store.setProgress(0);
    store.setCurrentPhaseIndex(0);

    // Reset phase statuses
    for (const p of store.phases) {
      store.updatePhaseStatus(p.id, p.enabled ? 'idle' : 'skipped');
    }

    // Build workflow steps from enabled phases + tools
    const enabledPhases = store.phases.filter(p => p.enabled);
    const sortedTools = [...tools].sort((a, b) => (Number(a.stage) || 0) - (Number(b.stage) || 0));

    // Map phases to tools by stage number.
    // Stage 6 (report generation) actually contains multiple post-processing
    // tools (gen_selection_report → insert_profit → insert_analysis →
    // pipeline_stats → export_report). We expand a single phase to a chain
    // of steps, ordered by .ui.json `name` (e.g. "Stage 6.1 / 6.2 / 6.3").
    const steps = enabledPhases.flatMap(phase => {
      const phaseTools = sortedTools.filter(t => Number(t.stage) === phase.phase);
      if (phaseTools.length === 0) return [];
      const ordered = [...phaseTools].sort((a, b) => a.name.localeCompare(b.name));

      return ordered.map(phaseTool => {
        // Only forward args that the tool declares in its .ui.json — keeps
        // post-processing scripts (which only take --session) from receiving
        // unsupported flags like --market / --cdp-port / --filters-file.
        const declared = new Set((phaseTool.arguments || []).map((a: any) => a.name));
        const args: Record<string, any> = {};
        if (declared.has('session')) args.session = store.sessionName;
        if (declared.has('market')) args.market = store.market;
        if (declared.has('cdp-port')) args['cdp-port'] = store.cdpPort;
        if (declared.has('filters-file')) {
          for (const [key, val] of Object.entries(store.filters)) {
            args[`filter:${key}`] = val;
          }
        }
        // Apply .ui.json declared defaults (e.g. force=true, format="both")
        for (const arg of (phaseTool.arguments || []) as any[]) {
          if (arg?.default !== undefined && !(arg.name in args)) {
            args[arg.name] = arg.default;
          }
        }
        return { toolId: phaseTool.id, args };
      });
    }) as { toolId: string; args: Record<string, any> }[];

    if (steps.length === 0) {
      toast.error('没有可执行的步骤 — 请检查工具是否已安装');
      store.setExecuting(false);
      return;
    }

    // Mark first phase as running
    store.updatePhaseStatus(enabledPhases[0].id, 'running');

    const workflowId = `pipeline-${store.sessionName}`;
    try {
      const res = await runAmazonWorkflow({
        id: workflowId,
        name: store.sessionName,
        status: 'running',
        steps,
      });

      if (!res.success) {
        setExecutionError(res.error || '启动失败');
        store.setExecuting(false);
        return;
      }

      // Workflow completed (or paused internally)
      store.setExecuting(false);

      // Mark remaining phases
      const lastEnabled = enabledPhases[enabledPhases.length - 1];
      if (lastEnabled && store.phases.find(p => p.id === lastEnabled.id)?.status === 'running') {
        store.updatePhaseStatus(lastEnabled.id, 'completed');
      }

      // Auto-load stats and report
      await loadResults();
    } catch (err) {
      setExecutionError(String(err));
      store.setExecuting(false);
    }
  };

  const handleResume = async () => {
    store.setIntervention(null);
    store.setPaused(false);

    // Re-mark paused phase as running
    const enabledPhases = store.phases.filter(p => p.enabled);
    const pausedPhase = enabledPhases[store.currentPhaseIndex];
    if (pausedPhase) store.updatePhaseStatus(pausedPhase.id, 'running');

    store.setExecuting(true);
    try {
      const res = await resumeAmazonWorkflow();
      if (!res.success) {
        setExecutionError(res.error || '恢复失败');
      }
      store.setExecuting(false);
      await loadResults();
    } catch (err) {
      setExecutionError(String(err));
      store.setExecuting(false);
    }
  };

  const handleStop = async () => {
    await stopAmazonWorkflow();
    store.setExecuting(false);
    store.setIntervention(null);
    store.setPaused(false);
    toast.info('已请求终止');
  };

  const loadResults = async () => {
    try {
      const [statsRes, reportRes] = await Promise.all([
        getAmazonSessionStats(store.sessionName),
        readAmazonSessionFile(store.sessionName, 'Product_Selection_Report.md'),
      ]);

      if (statsRes.success && statsRes.stats) {
        store.setStats(statsRes.stats);

        // Update phase product counts from stats
        for (const [key, val] of Object.entries(statsRes.stats)) {
          const phaseNum = parseInt(key.replace('phase', ''), 10);
          const phase = store.phases.find(p => p.phase === phaseNum);
          if (phase && typeof val === 'object' && 'count' in val) {
            store.updatePhaseStatus(phase.id, phase.status === 'idle' ? 'completed' : phase.status, {
              productCount: (val as any).count,
            });
          }
        }
      }

      if (reportRes.success && reportRes.content) {
        store.setReportContent(reportRes.content);
      }
    } catch {
      // Stats/report not available yet
    }
  };

  // ── Step navigation ────────────────────────────────────────────────────────

  const stepIndex = STEPS.indexOf(store.currentStep);

  const goNext = () => {
    if (store.currentStep === 'config') store.setCurrentStep('filters');
    else if (store.currentStep === 'filters') {
      store.setCurrentStep('execute');
      startPipeline();
    } else if (store.currentStep === 'execute' && !store.isExecuting) {
      store.setCurrentStep('results');
      loadResults();
    }
  };

  const goPrev = () => {
    if (store.currentStep === 'filters') store.setCurrentStep('config');
    else if (store.currentStep === 'execute' && !store.isExecuting) store.setCurrentStep('filters');
    else if (store.currentStep === 'results') store.setCurrentStep('execute');
  };

  const enabledPhaseNumbers = store.phases.filter(p => p.enabled).map(p => p.phase);

  // ── Breadcrumbs ────────────────────────────────────────────────────────────

  const breadcrumbItems = stepIndex > 0
    ? [{ label: STEP_LABELS[stepIndex] }]
    : [];

  // ── Render Step 1: Config ─────────────────────────────────────────────────

  const renderConfigStep = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-8 custom-scrollbar pt-2 pb-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-black bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent tracking-tight">
            会话配置
          </h2>
          <p className="text-sm text-muted-foreground">配置本次 Pipeline 运行的基本参数</p>
        </div>

        {/* Session Name + Market */}
        <div className="p-6 rounded-3xl border bg-primary/5 space-y-4">
          <div className="flex items-center gap-2 text-primary font-bold text-sm">
            <Settings2 className="h-4 w-4" />
            <span>基本设置</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">批次名称</label>
              <Input
                value={store.sessionName}
                onChange={(e) => store.setSessionName(e.target.value)}
                className="h-10 rounded-xl bg-background"
                data-testid="pipeline-session-name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">CDP 端口</label>
              <Input
                type="number"
                value={store.cdpPort}
                onChange={(e) => store.setCdpPort(parseInt(e.target.value, 10) || 9222)}
                className="h-10 rounded-xl bg-background"
                data-testid="pipeline-cdp-port"
              />
            </div>
          </div>
        </div>

        {/* Session Dedup */}
        <SessionSelector />

        {/* Execution Mode */}
        <ExecutionModeSelector />

        {/* Market Selection */}
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-2">目标市场</h3>
          <div className="grid grid-cols-2 gap-4">
            {MARKETS.map((m) => (
              <button
                key={m.id}
                onClick={() => store.setMarket(m.id)}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left',
                  store.market === m.id
                    ? 'bg-primary/5 border-primary shadow-lg ring-1 ring-primary/20'
                    : 'bg-card border-transparent hover:border-muted'
                )}
              >
                <span className="text-3xl">{m.icon}</span>
                <span className="font-semibold text-sm">{m.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Phase Toggles */}
        <div className="space-y-3">
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-2">阶段开关</h3>
          <div className="space-y-2">
            {store.phases.map((phase) => {
              const isAlwaysOn = phase.phase === 1;
              const isDependencyBlocked = phase.phase === 5 && !store.phases.find(p => p.phase === 4)?.enabled;

              return (
                <div
                  key={phase.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-xl border transition-all',
                    phase.enabled ? 'bg-card' : 'bg-muted/20 opacity-60'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold',
                      phase.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      {phase.phase}
                    </div>
                    <div>
                      <span className="text-sm font-bold">{phase.name}</span>
                      {isAlwaysOn && (
                        <span className="ml-2 text-[9px] text-muted-foreground">(必需)</span>
                      )}
                      {isDependencyBlocked && (
                        <span className="ml-2 text-[9px] text-amber-600 dark:text-amber-400">
                          需先启用 Phase 4
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'w-10 h-5 rounded-full p-1 transition-colors',
                      isAlwaysOn || isDependencyBlocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                      phase.enabled ? 'bg-primary' : 'bg-muted'
                    )}
                    onClick={() => {
                      if (!isAlwaysOn && !isDependencyBlocked) store.togglePhase(phase.id);
                    }}
                  >
                    <div className={cn(
                      'w-3 h-3 rounded-full bg-white transition-transform',
                      phase.enabled ? 'translate-x-5' : 'translate-x-0'
                    )} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Render Step 2: Filters ────────────────────────────────────────────────

  const renderFiltersStep = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-col gap-1 mb-6 shrink-0">
        <h2 className="text-3xl font-black bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent tracking-tight">
          筛选参数
        </h2>
        <p className="text-sm text-muted-foreground">按阶段配置各项筛选阈值，控制漏斗精度</p>
      </div>
      <div className="flex-1 overflow-y-auto pr-3 -mr-3 custom-scrollbar min-h-0 pb-6">
        <PipelineFilterForm
          filters={store.filters}
          onFilterChange={store.setFilter}
          enabledPhases={enabledPhaseNumbers}
        />

        <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 mt-4">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            点击"开始执行"后将按阶段顺序（{enabledPhaseNumbers.join(' → ')}）为您运行完整 Pipeline。
          </p>
        </div>
      </div>
    </div>
  );

  // ── Render Step 3: Execution ──────────────────────────────────────────────

  const renderExecuteStep = () => {
    const enabledPhases = store.phases.filter(p => p.enabled);

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex flex-col gap-1 mb-6 shrink-0">
          <h2 className="text-3xl font-black bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent tracking-tight">
            执行监控
          </h2>
          <p className="text-sm text-muted-foreground">
            {store.isExecuting ? '正在执行自动化分析...' : store.isPaused ? '流程已暂停，等待手动干预' : '执行已完成'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto pr-3 -mr-3 custom-scrollbar min-h-0 pb-6 space-y-6">
          {/* Multi-level progress */}
          <ProgressMultiLevel />

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-primary" data-testid="pipeline-status">
                {store.isExecuting ? '执行中...' : store.isPaused ? '已暂停' : '已完成'}
              </span>
              <span className="tabular-nums" data-testid="pipeline-progress">{store.overallProgress}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  store.isPaused ? 'bg-amber-500' : 'bg-primary'
                )}
                style={{ width: `${store.overallProgress}%` }}
              />
            </div>
          </div>

          {/* Phase timeline */}
          <div className="space-y-0">
            {enabledPhases.map((phase, idx) => (
              <div key={phase.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <PipelinePhaseCard
                    phase={phase.phase}
                    name={phase.name}
                    status={phase.status}
                    productCount={phase.productCount}
                    error={phase.error}
                    isLast={idx === enabledPhases.length - 1}
                  />
                </div>
                {PHASE_NUM_TO_ID[phase.phase] && (
                  <QualityCheckBadge phase={PHASE_NUM_TO_ID[phase.phase]} />
                )}
              </div>
            ))}
            {/* Skipped phases */}
            {store.phases.filter(p => !p.enabled).map((phase, idx, arr) => (
              <PipelinePhaseCard
                key={phase.id}
                phase={phase.phase}
                name={phase.name}
                status="skipped"
                isLast={idx === arr.length - 1}
              />
            ))}
          </div>

          {/* Error display */}
          {executionError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                错误: {executionError}
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="rounded-xl" onClick={startPipeline}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />重试
                </Button>
                <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => store.setCurrentStep('config')}>
                  返回配置
                </Button>
              </div>
            </div>
          )}

          {/* Controls */}
          {store.isExecuting && (
            <Button variant="ghost" className="w-full text-muted-foreground hover:text-destructive" onClick={handleStop} data-testid="pipeline-stop-button">
              <Square className="h-4 w-4 mr-2" />终止本次任务
            </Button>
          )}

          {!store.isExecuting && !executionError && (
            <Button className="w-full h-12 rounded-2xl font-bold" onClick={goNext} data-testid="pipeline-view-results">
              查看结果
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  // ── Render Step 4: Results ────────────────────────────────────────────────

  const renderResultsStep = () => {
    const funnelItems = Object.entries(store.stats)
      .map(([key, val]) => ({
        phase: parseInt(key.replace('phase', ''), 10),
        label: (val as any).label || `Phase ${key.replace('phase', '')}`,
        count: (val as any).count || 0,
      }))
      .sort((a, b) => a.phase - b.phase);

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex flex-col gap-1 mb-6 shrink-0">
          <h2 className="text-3xl font-black bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent tracking-tight">
            结果查看
          </h2>
          <p className="text-sm text-muted-foreground">Pipeline 执行结果与选品报告</p>
        </div>

        <div className="flex-1 overflow-y-auto pr-3 -mr-3 custom-scrollbar min-h-0 pb-6 space-y-8">
          {/* Funnel */}
          <div className="p-6 rounded-3xl border bg-card">
            <PipelineFunnel items={funnelItems} />
          </div>

          {/* Quality Check Results */}
          <div className="p-6 rounded-3xl border bg-card">
            <QualityCheckPanel />
          </div>

          {/* Report */}
          {store.reportContent ? (
            <div className="p-6 rounded-3xl border bg-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <FileText className="h-4 w-4 text-primary" />
                  选品报告
                </div>
                <Button variant="outline" size="sm" className="rounded-xl text-xs h-8" onClick={() => {
                  invokeIpc('amazon:exportPdf', `${store.sessionName}-report.pdf`);
                }}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />导出 PDF
                </Button>
              </div>
              <MarkdownReport content={store.reportContent} />
            </div>
          ) : (
            <div className="p-6 rounded-3xl border bg-card text-center">
              <p className="text-sm text-muted-foreground">
                暂无报告 — 报告将在 Phase 6 完成后自动加载
              </p>
              <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={loadResults}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />刷新
              </Button>
            </div>
          )}

          {/* Batch Profit Assessment */}
          {Object.values(store.stats).some((s: any) => s.count > 0) && (
            <BatchProfitPanel sessionName={store.sessionName} />
          )}

          {/* Standalone Profit Calculator */}
          <ProfitCalculator />

          {/* Actions */}
          <div className="flex gap-3">
            <Button className="flex-1 h-11 rounded-2xl font-bold" onClick={() => {
              store.reset();
              store.setCurrentStep('config');
            }}>
              <RotateCcw className="h-4 w-4 mr-2" />开始新 Pipeline
            </Button>
            <Button variant="outline" className="flex-1 h-11 rounded-2xl" onClick={() => navigate('/amazon')}>
              返回首页
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // ── Main Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto w-full relative" data-testid="pipeline-wizard">
      <AmazonBreadcrumbs
        currentMode="Pipeline 向导"
        currentModeOnClick={() => store.setCurrentStep('config')}
        items={breadcrumbItems}
      />

      <CaptchaModal onResume={handleResume} onStop={handleStop} />

      <div className="flex-1 flex flex-col bg-card/40 backdrop-blur-md border rounded-[32px] shadow-sm overflow-hidden relative min-h-0">
        <div className="p-6 sm:p-10 flex flex-col h-full overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={store.currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {store.currentStep === 'config' && renderConfigStep()}
              {store.currentStep === 'filters' && renderFiltersStep()}
              {store.currentStep === 'execute' && renderExecuteStep()}
              {store.currentStep === 'results' && renderResultsStep()}

              {/* Footer navigation (only for config & filters steps) */}
              {(store.currentStep === 'config' || store.currentStep === 'filters') && (
                <div className="shrink-0 pt-6 mt-6 border-t flex items-center justify-between bg-transparent -mx-2 px-2 pb-2">
                  <div className="flex gap-1.5">
                    {STEPS.map((s) => (
                      <div key={s} className={cn(
                        'w-2 h-2 rounded-full transition-all',
                        store.currentStep === s ? 'bg-primary w-6' : 'bg-muted'
                      )} />
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    {store.currentStep !== 'config' && (
                      <Button variant="ghost" className="rounded-xl px-6 h-11" onClick={goPrev}>
                        <ChevronLeft className="h-4 w-4 mr-1" />上一步
                      </Button>
                    )}
                    <Button className="rounded-xl px-8 h-11 font-bold group shadow-lg shadow-primary/20" onClick={goNext} data-testid="pipeline-next-button">
                      {store.currentStep === 'filters' ? (
                        <>
                          <Play className="h-4 w-4 mr-2" />开始执行
                        </>
                      ) : (
                        <>
                          下一步
                          <ChevronRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
