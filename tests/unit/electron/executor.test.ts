import { describe, it, expect } from 'vitest';

// Test the regex patterns used by executor
const PHASE_RE = /^PHASE:\s*(\S+)\s+(\S+)/;
const QC_RESULT_RE = /^QC_RESULT:\s*(.+)/;
const CAPTCHA_RE = /^CAPTCHA:\s*(\S+)/;

describe('executor log signal parsing', () => {
  it('should parse PHASE signal', () => {
    const match = 'PHASE: keyword_research check'.match(PHASE_RE);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('keyword_research');
    expect(match![2]).toBe('check');
  });

  it('should parse QC_RESULT signal', () => {
    const line = 'QC_RESULT: {"phase":"seller_verification","pass":true,"metrics":{"total":312}}';
    const match = line.match(QC_RESULT_RE);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]);
    expect(data.phase).toBe('seller_verification');
    expect(data.pass).toBe(true);
  });

  it('should parse CAPTCHA signal', () => {
    const match = 'CAPTCHA: waiting'.match(CAPTCHA_RE);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('waiting');
  });

  it('should not match non-signal lines', () => {
    expect('normal log output'.match(PHASE_RE)).toBeNull();
    expect('PROGRESS: 50% (working)'.match(QC_RESULT_RE)).toBeNull();
  });
});
