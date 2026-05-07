import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getAmazonSkillsDir, getBundledPythonDir, quoteForCmd, needsWinShell } from '../../../utils/paths';
import { resolveUvBin } from '../../../utils/uv-setup';

const PHASE_RE = /^PHASE:\s*(\S+)\s+(\S+)/;
const QC_RESULT_RE = /^QC_RESULT:\s*(.+)/;
const CAPTCHA_SIGNAL_RE = /^CAPTCHA:\s*(\S+)/;
const SKIP_ASIN_RE = /^SKIP_ASIN:\s*([A-Z0-9]+)(?:\s+(.+))?/;

export interface ExecutionResult {
  code: number | null;
  signal: string | null;
  error?: string;
  /** True if the script emitted any intervention (captcha) signal during this run. */
  interventionEmitted?: boolean;
}

export class ToolExecutor extends EventEmitter {
  private process: ChildProcess | null = null;
  private currentToolId: string | null = null;
  private interventionEmitted = false;

  async execute(
    toolPath: string,
    args: Record<string, any>,
    cwd: string = getAmazonSkillsDir()
  ): Promise<ExecutionResult> {
    const formattedArgs = this.formatArgs(args);
    const { bin: uvBin } = resolveUvBin();
    const useShell = needsWinShell(uvBin);
    const env: Record<string, string | undefined> = { ...process.env, PYTHONIOENCODING: 'utf-8' };
    // If a bundled Python exists, tell uv to use it instead of downloading
    const bundledPython = getBundledPythonDir();
    if (bundledPython) {
      env.UV_PYTHON = bundledPython;
    }
    this.interventionEmitted = false;
    return new Promise((resolve) => {
      // Use uv run to execute the python script
      // e.g., uv run path/to/script.py --session mysession
      this.process = spawn(useShell ? quoteForCmd(uvBin) : uvBin, ['run', toolPath, ...formattedArgs], {
        cwd,
        shell: useShell,
        env,
      });

      this.process.stdout?.on('data', (data) => {
        const output = data.toString();
        this.emit('output', output);

        // Parse PROGRESS: X% (status)
        const progressMatch = output.match(/PROGRESS:\s*(\d+)%\s*\((.+)\)/);
        if (progressMatch) {
          const percent = parseInt(progressMatch[1], 10);
          const status = progressMatch[2];
          this.emit('progress', { percent, status });
        }

        // Parse PAUSED (CAPTCHA DETECTED)
        if (output.includes('PROGRESS: PAUSED (CAPTCHA DETECTED)') ||
            output.includes('PROGRESS: PAUSED (AMAZON CAPTCHA)') ||
            output.includes('PROGRESS: PAUSED (SS CAPTCHA)')) {
          this.interventionEmitted = true;
          this.emit('intervention', { type: 'captcha' });
        }

        // Line-by-line signal parsing
        for (const line of output.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const phaseMatch = trimmed.match(PHASE_RE);
          if (phaseMatch) {
            this.emit('phase-signal', { phase: phaseMatch[1], step: phaseMatch[2] });
          }

          const qcMatch = trimmed.match(QC_RESULT_RE);
          if (qcMatch) {
            try {
              const result = JSON.parse(qcMatch[1]);
              this.emit('qc-result', result);
            } catch { /* ignore malformed JSON */ }
          }

          const captchaMatch = trimmed.match(CAPTCHA_SIGNAL_RE);
          if (captchaMatch) {
            this.interventionEmitted = true;
          this.emit('intervention', { type: 'captcha' });
          }

          const skipMatch = trimmed.match(SKIP_ASIN_RE);
          if (skipMatch) {
            this.emit('asin-skipped', {
              asin: skipMatch[1],
              reason: skipMatch[2] ?? 'unknown',
            });
          }
        }
      });

      this.process.stderr?.on('data', (data) => {
        this.emit('error-output', data.toString());
      });

      this.process.on('close', (code, signal) => {
        this.process = null;
        resolve({ code, signal, interventionEmitted: this.interventionEmitted });
      });

      this.process.on('error', (err) => {
        this.process = null;
        resolve({ code: 1, signal: null, error: err.message, interventionEmitted: this.interventionEmitted });
      });
    });
  }

  stop() {
    if (this.process) {
      this.process.kill('SIGINT');
      this.process = null;
    }
  }

  isRunning() {
    return this.process !== null;
  }

  private formatArgs(args: Record<string, any>): string[] {
    const result: string[] = [];
    for (const [key, value] of Object.entries(args)) {
      if (value === null || value === undefined || value === false) continue;
      
      const flag = key.startsWith('-') ? key : `--${key}`;
      
      if (value === true) {
        result.push(flag);
      } else {
        result.push(flag);
        result.push(String(value));
      }
    }
    return result;
  }
}
