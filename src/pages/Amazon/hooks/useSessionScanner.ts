// src/pages/Amazon/hooks/useSessionScanner.ts
import { useEffect, useState } from 'react';
import { usePipelineStore } from '../pipelineStore';
import type { SessionInfo } from '../types/pipeline';

export function useSessionScanner() {
  const [loading, setLoading] = useState(false);
  const setAvailableSessions = usePipelineStore((s) => s.setAvailableSessions);
  const sessionName = usePipelineStore((s) => s.sessionName);

  const scan = async () => {
    setLoading(true);
    try {
      const sessions = (await window.electronAPI?.invoke('amazon:scanSessions')) as SessionInfo[] ?? [];
      // Exclude current session from dedup list
      const filtered = sessions.filter((s) => s.name !== sessionName);
      setAvailableSessions(filtered);
    } finally {
      setLoading(false);
    }
  };

  // Auto-scan on mount
  useEffect(() => {
    scan();
  }, [sessionName]);

  return { scan, loading };
}
