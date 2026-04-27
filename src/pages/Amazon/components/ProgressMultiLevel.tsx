import { CheckCircle, Loader2, Circle } from 'lucide-react';
import { usePipelineStore } from '../pipelineStore';
import type { PipelinePhase } from '../types/pipeline';

const PHASES: { id: PipelinePhase; label: string }[] = [
  { id: 'category_sampling', label: '采样' },
  { id: 'seller_verification', label: '卖家' },
  { id: 'store_check', label: '店铺' },
  { id: 'product_detail', label: '详情' },
  { id: 'keyword_research', label: '关键词' },
  { id: 'report_generation', label: '报告' },
];

const STEP_LABELS = { execute: '执行中', check: '质检中', retry: '补爬中' } as const;

export function ProgressMultiLevel() {
  const progress = usePipelineStore((s) => s.progress);
  const phases = usePipelineStore((s) => s.phases);

  const currentIdx = PHASES.findIndex((p) => p.id === progress.phase);

  return (
    <div className="space-y-3">
      {/* Level 1: Phase bar */}
      <div className="flex items-center gap-1">
        {PHASES.map((p, i) => {
          const phaseConfig = phases.find((pc) => pc.id === p.id);
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          const isSkipped = phaseConfig && !phaseConfig.enabled;

          return (
            <div key={p.id} className="flex items-center gap-1">
              {i > 0 && <div className={`h-px w-4 ${isDone ? 'bg-green-500' : 'bg-zinc-700'}`} />}
              <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                isSkipped ? 'text-zinc-600' :
                isActive ? 'bg-blue-500/20 text-blue-300 font-medium' :
                isDone ? 'text-green-400' : 'text-zinc-500'
              }`}>
                {isDone ? <CheckCircle className="h-3 w-3" /> :
                 isActive ? <Loader2 className="h-3 w-3 animate-spin" /> :
                 <Circle className="h-3 w-3" />}
                {p.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Level 2: Phase step */}
      {progress.phase && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>{PHASES[currentIdx]?.label}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-blue-300">{STEP_LABELS[progress.phaseStep]}</span>
        </div>
      )}

      {/* Level 3: Progress bar */}
      {progress.percent > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="text-xs text-zinc-500">{progress.message}</div>
        </div>
      )}
    </div>
  );
}
