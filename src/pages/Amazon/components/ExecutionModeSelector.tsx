import { usePipelineStore } from '../pipelineStore';
import type { ExecutionMode } from '../types/pipeline';

const MODES: Array<{ value: ExecutionMode; label: string; desc: string }> = [
  { value: 'auto', label: '全自动', desc: '阶段自动衔接，质检失败时阻塞等待确认' },
  { value: 'step', label: '逐步确认', desc: '每阶段完成后暂停，展示结果等待确认' },
  { value: 'hybrid', label: '混合模式', desc: '采集阶段自动，分析/过滤阶段暂停确认' },
];

export function ExecutionModeSelector() {
  const mode = usePipelineStore((s) => s.executionMode);
  const setMode = usePipelineStore((s) => s.setExecutionMode);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-300">执行模式</label>
      <div className="grid grid-cols-3 gap-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`rounded-xl border p-3 text-left transition-all ${
              mode === m.value
                ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
            }`}
          >
            <div className="text-sm font-medium text-zinc-200">{m.label}</div>
            <div className="mt-1 text-xs text-zinc-400">{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
