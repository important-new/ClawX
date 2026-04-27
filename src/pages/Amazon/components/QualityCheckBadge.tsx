import { CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { usePipelineStore } from '../pipelineStore';
import type { PipelinePhase } from '../types/pipeline';

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-zinc-500', label: '待检' },
  running: { icon: Loader2, color: 'text-blue-400 animate-spin', label: '检测中' },
  passed: { icon: CheckCircle, color: 'text-green-400', label: '通过' },
  failed: { icon: XCircle, color: 'text-red-400', label: '未通过' },
} as const;

export function QualityCheckBadge({ phase }: { phase: PipelinePhase }) {
  const qc = usePipelineStore((s) => s.qualityChecks[phase]);
  const config = STATUS_CONFIG[qc.status];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${config.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
      {qc.result && qc.status !== 'pending' && (
        <span className="text-zinc-500">
          ({Math.round((qc.result.metrics.success_rate as number) * 100)}%)
        </span>
      )}
    </span>
  );
}
