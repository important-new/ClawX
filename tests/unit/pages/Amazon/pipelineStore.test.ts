import { describe, it, expect, beforeEach } from 'vitest';
import { usePipelineStore } from '../../../../src/pages/Amazon/pipelineStore';

describe('pipelineStore', () => {
  beforeEach(() => {
    usePipelineStore.getState().reset();
  });

  it('should have default execution mode as step', () => {
    expect(usePipelineStore.getState().executionMode).toBe('step');
  });

  it('should update execution mode', () => {
    usePipelineStore.getState().setExecutionMode('auto');
    expect(usePipelineStore.getState().executionMode).toBe('auto');
  });

  it('should initialize quality checks as pending', () => {
    const qc = usePipelineStore.getState().qualityChecks;
    expect(qc.seller_verification.status).toBe('pending');
    expect(qc.seller_verification.retryCount).toBe(0);
  });

  it('should update quality check result', () => {
    usePipelineStore.getState().setQualityCheckResult('seller_verification', {
      phase: 'seller_verification',
      timestamp: '2026-04-27T10:00:00Z',
      pass: true,
      metrics: { total: 312, success: 310, failed: 2, success_rate: 0.9936 },
      threshold: 0.95,
    });
    const qc = usePipelineStore.getState().qualityChecks.seller_verification;
    expect(qc.status).toBe('passed');
    expect(qc.result?.metrics.total).toBe(312);
  });

  it('should track captcha state', () => {
    usePipelineStore.getState().triggerCaptcha();
    const captcha = usePipelineStore.getState().captcha;
    expect(captcha.isWaiting).toBe(true);
    expect(captcha.timestamps.length).toBe(1);
  });

  it('should increase delay on repeated captcha', () => {
    const store = usePipelineStore.getState();
    store.triggerCaptcha();
    store.resolveCaptcha();
    store.triggerCaptcha();
    expect(usePipelineStore.getState().captcha.currentDelay).toBeGreaterThan(10);
  });

  it('should update multi-level progress', () => {
    usePipelineStore.getState().updatePhaseProgress({
      phase: 'keyword_research',
      phaseStep: 'check',
      percent: 45,
      message: 'Running quality check',
    });
    const progress = usePipelineStore.getState().progress;
    expect(progress.phase).toBe('keyword_research');
    expect(progress.phaseStep).toBe('check');
  });

  it('should initialize with empty dedup sessions', () => {
    expect(usePipelineStore.getState().dedup.availableSessions).toEqual([]);
    expect(usePipelineStore.getState().dedup.selectedSessions).toEqual([]);
  });

  it('should set available sessions and auto-select all', () => {
    const sessions = [
      { name: '20260426-1', productCount: 44, date: '2026-04-26', path: '/path' },
      { name: '20260404', productCount: 38, date: '2026-04-04', path: '/path2' },
    ];
    usePipelineStore.getState().setAvailableSessions(sessions);
    const state = usePipelineStore.getState();
    expect(state.dedup.availableSessions).toHaveLength(2);
    expect(state.dedup.selectedSessions).toEqual(['20260426-1', '20260404']);
  });

  it('should toggle session selection', () => {
    const sessions = [
      { name: '20260426-1', productCount: 44, date: '2026-04-26', path: '/p1' },
      { name: '20260404', productCount: 38, date: '2026-04-04', path: '/p2' },
    ];
    usePipelineStore.getState().setAvailableSessions(sessions);
    usePipelineStore.getState().toggleDedupSession('20260404');
    expect(usePipelineStore.getState().dedup.selectedSessions).toEqual(['20260426-1']);
    usePipelineStore.getState().toggleDedupSession('20260404');
    expect(usePipelineStore.getState().dedup.selectedSessions).toEqual(['20260426-1', '20260404']);
  });

  it('should reset quality checks on full reset', () => {
    usePipelineStore.getState().setQualityCheckResult('seller_verification', {
      phase: 'seller_verification', timestamp: '', pass: true,
      metrics: { total: 1, success: 1, failed: 0, success_rate: 1 },
    });
    usePipelineStore.getState().reset();
    expect(usePipelineStore.getState().qualityChecks.seller_verification.status).toBe('pending');
  });
});
