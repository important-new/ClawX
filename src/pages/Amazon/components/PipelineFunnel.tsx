import { cn } from '@/lib/utils';

interface FunnelItem {
  phase: number;
  label: string;
  count: number;
}

interface PipelineFunnelProps {
  items: FunnelItem[];
}

const PHASE_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-rose-500',
  'bg-orange-500',
];

export function PipelineFunnel({ items }: PipelineFunnelProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        暂无漏斗数据 — 运行 Pipeline 后将在此显示每阶段产品数量
      </div>
    );
  }

  const maxCount = Math.max(...items.map(i => i.count), 1);

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
        漏斗统计
      </h3>
      <div className="space-y-2">
        {items.map((item, idx) => {
          const widthPercent = Math.max((item.count / maxCount) * 100, 8);
          const color = PHASE_COLORS[idx % PHASE_COLORS.length];

          return (
            <div key={item.phase} className="flex items-center gap-3">
              <div className="w-24 text-right shrink-0">
                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
              </div>
              <div className="flex-1 relative h-8">
                <div
                  className={cn('h-full rounded-lg transition-all duration-500', color)}
                  style={{ width: `${widthPercent}%` }}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums text-foreground">
                  {item.count}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
