import { CheckCircle2, Loader2, PauseCircle, XCircle, MinusCircle, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type PhaseStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'skipped';

interface PipelinePhaseCardProps {
  phase: number;
  name: string;
  status: PhaseStatus;
  productCount?: number;
  error?: string;
  isLast?: boolean;
}

const STATUS_CONFIG: Record<PhaseStatus, { icon: React.ReactNode; color: string; label: string; lineColor: string }> = {
  idle: {
    icon: <Circle className="h-4 w-4" />,
    color: 'text-muted-foreground border-muted',
    label: '等待中',
    lineColor: 'border-muted',
  },
  running: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: 'text-blue-500 border-blue-500 ring-4 ring-blue-500/20',
    label: '运行中',
    lineColor: 'border-blue-500/30',
  },
  paused: {
    icon: <PauseCircle className="h-4 w-4" />,
    color: 'text-amber-500 border-amber-500 ring-4 ring-amber-500/20',
    label: '已暂停',
    lineColor: 'border-amber-500/30',
  },
  completed: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-green-500 border-green-500',
    label: '已完成',
    lineColor: 'border-green-500/30',
  },
  failed: {
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-red-500 border-red-500',
    label: '失败',
    lineColor: 'border-red-500/30',
  },
  skipped: {
    icon: <MinusCircle className="h-4 w-4" />,
    color: 'text-muted-foreground/50 border-dashed border-muted',
    label: '已跳过',
    lineColor: 'border-muted border-dashed',
  },
};

export function PipelinePhaseCard({ name, status, productCount, error, isLast }: PipelinePhaseCardProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="relative flex gap-4">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={cn('w-8 h-8 rounded-full border-2 flex items-center justify-center bg-card', config.color)}>
          {config.icon}
        </div>
        {!isLast && (
          <div className={cn('w-0 flex-1 border-l-2 my-1', config.lineColor)} />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 pb-6', isLast && 'pb-0')}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{name}</span>
          <Badge
            variant={status === 'running' ? 'default' : 'outline'}
            className={cn(
              'text-[9px] uppercase h-5',
              status === 'completed' && 'border-green-500/30 text-green-600 dark:text-green-400',
              status === 'failed' && 'border-red-500/30 text-red-600 dark:text-red-400',
              status === 'paused' && 'border-amber-500/30 text-amber-600 dark:text-amber-400',
              status === 'skipped' && 'border-muted text-muted-foreground/60',
            )}
          >
            {config.label}
          </Badge>
          {productCount !== undefined && productCount >= 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 tabular-nums">
              {productCount} 产品
            </Badge>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-1 line-clamp-2">{error}</p>
        )}
      </div>
    </div>
  );
}
