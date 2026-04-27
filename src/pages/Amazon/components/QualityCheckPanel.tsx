import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { usePipelineStore } from '../pipelineStore';
import type { PipelinePhase, QualityCheckState } from '../types/pipeline';

const PHASE_LABELS: Record<PipelinePhase, string> = {
  category_sampling: '类目采样',
  seller_verification: '卖家核查',
  store_check: '店群分析',
  product_detail: '商品详情',
  keyword_research: '关键词研究',
  report_generation: '报告生成',
};

function QualityCheckRow({ phase, state, onRetry }: {
  phase: PipelinePhase;
  state: QualityCheckState;
  onRetry?: () => void;
}) {
  const r = state.result;
  if (state.status === 'pending') return null;

  return (
    <div className={`rounded-lg border p-3 ${
      state.status === 'passed' ? 'border-green-800 bg-green-950/30' :
      state.status === 'failed' ? 'border-red-800 bg-red-950/30' :
      'border-zinc-700 bg-zinc-800/30'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {state.status === 'passed'
            ? <CheckCircle className="h-4 w-4 text-green-400" />
            : <XCircle className="h-4 w-4 text-red-400" />}
          <span className="text-sm font-medium text-zinc-200">{PHASE_LABELS[phase]}</span>
        </div>
        {state.status === 'failed' && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 rounded-md bg-amber-600/20 px-2 py-1 text-xs text-amber-300 hover:bg-amber-600/30"
          >
            <RefreshCw className="h-3 w-3" /> 补爬
          </button>
        )}
      </div>

      {r && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-400">
          <div>总数: <span className="text-zinc-200">{r.metrics.total}</span></div>
          <div>成功: <span className="text-green-300">{r.metrics.success}</span></div>
          <div>成功率: <span className={
            (r.metrics.success_rate as number) >= (r.threshold ?? 0.9)
              ? 'text-green-300' : 'text-red-300'
          }>{Math.round((r.metrics.success_rate as number) * 100)}%</span></div>
          {r.recrawl_count ? (
            <div className="col-span-3 text-amber-400">
              需补爬: {r.recrawl_count} 条 ({r.recrawl_csv})
            </div>
          ) : null}
        </div>
      )}

      {r?.timestamp && (
        <div className="mt-1 text-xs text-zinc-600">
          {new Date(r.timestamp).toLocaleString('zh-CN')}
        </div>
      )}
    </div>
  );
}

export function QualityCheckPanel() {
  const qualityChecks = usePipelineStore((s) => s.qualityChecks);

  const phases = Object.entries(qualityChecks) as [PipelinePhase, QualityCheckState][];
  const hasResults = phases.some(([, s]) => s.status !== 'pending');

  if (!hasResults) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
        暂无质检数据，启动流水线后自动生成
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-300">质检结果</h3>
      {phases.map(([phase, state]) => (
        <QualityCheckRow key={phase} phase={phase} state={state} />
      ))}
    </div>
  );
}
