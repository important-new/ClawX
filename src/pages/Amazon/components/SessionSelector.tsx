// src/pages/Amazon/components/SessionSelector.tsx
import { Loader2, RefreshCw } from 'lucide-react';
import { usePipelineStore } from '../pipelineStore';
import { useSessionScanner } from '../hooks/useSessionScanner';

export function SessionSelector() {
  const { scan, loading } = useSessionScanner();
  const dedup = usePipelineStore((s) => s.dedup);
  const toggleSession = usePipelineStore((s) => s.toggleDedupSession);
  const selectAll = usePipelineStore((s) => s.selectAllDedupSessions);
  const deselectAll = usePipelineStore((s) => s.deselectAllDedupSessions);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-300">历史去重 Session</label>
        <button
          onClick={scan}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          刷新
        </button>
      </div>

      {dedup.availableSessions.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-500">
          {loading ? '扫描中...' : '无历史 session'}
        </div>
      ) : (
        <>
          <div className="flex gap-2 text-xs">
            <button onClick={selectAll} className="text-blue-400 hover:text-blue-300">全选</button>
            <button onClick={deselectAll} className="text-zinc-500 hover:text-zinc-300">全不选</button>
            <span className="text-zinc-600">
              已选 {dedup.selectedSessions.length}/{dedup.availableSessions.length}
            </span>
          </div>

          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
            {dedup.availableSessions.map((session) => (
              <label
                key={session.name}
                className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-zinc-800/50"
              >
                <input
                  type="checkbox"
                  checked={dedup.selectedSessions.includes(session.name)}
                  onChange={() => toggleSession(session.name)}
                  className="rounded border-zinc-600"
                />
                <span className="text-sm text-zinc-300">{session.name}</span>
                <span className="text-xs text-zinc-500">
                  ({session.productCount} products, {session.date})
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
