import { useEffect } from 'react';
import { usePipelineStore } from '../pipelineStore';
import type { PipelinePhase, QualityCheckResult } from '../types/pipeline';

declare global {
  interface Window {
    electronAPI?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    };
  }
}

export function useQualityCheck() {
  const setQualityCheckResult = usePipelineStore((s) => s.setQualityCheckResult);
  const setQualityCheckStatus = usePipelineStore((s) => s.setQualityCheckStatus);

  useEffect(() => {
    const cleanup = window.electronAPI?.on('amazon:qualityCheckResult', (_event: unknown, result: QualityCheckResult) => {
      setQualityCheckResult(result.phase, result);
    });
    return cleanup;
  }, [setQualityCheckResult]);

  const runCheck = async (sessionName: string, phase: PipelinePhase): Promise<QualityCheckResult | null> => {
    setQualityCheckStatus(phase, 'running');
    try {
      const result = await window.electronAPI?.invoke('amazon:runQualityCheck', {
        sessionName,
        phase,
      }) as QualityCheckResult;

      if (result && 'pass' in result) {
        setQualityCheckResult(phase, result);
        return result;
      }
      setQualityCheckStatus(phase, 'failed');
      return null;
    } catch {
      setQualityCheckStatus(phase, 'failed');
      return null;
    }
  };

  return { runCheck };
}
