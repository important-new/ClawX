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
      // stdio: 'ignore' on stdin prevents uv from blocking on TTY/stdin
      // detection when we run via shell: true. Without this, the inherited
      // pipe handle can leave uv idle indefinitely (observed: 5+ min, 0
      // CPU) on Windows even though the script itself exits in <1s when
      // invoked directly from a real terminal.
      this.process = spawn(useShell ? quoteForCmd(uvBin) : uvBin, ['run', toolPath, ...formattedArgs], {
        cwd,
        shell: useShell,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
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
    if (!this.process) return;
    const pid = this.process.pid;
    // `uv run script.py` spawns uv as the immediate child, which then spawns
    // the actual python interpreter (and python may itself spawn playwright /
    // browser children). On Windows, ChildProcess.kill('SIGINT') is mapped to
    // SIGTERM and only signals the direct child — uv dies but python keeps
    // running as an orphan, and the UI thinks the workflow stopped while the
    // pipeline is still hammering SellerSprite in the background.
    //
    // Use taskkill /T /F (Windows) or process.kill -- -<pgid> (POSIX) to take
    // down the whole tree.
    if (pid !== undefined) {
      if (process.platform === 'win32') {
        try {
          require('node:child_process').execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], {
            stdio: 'ignore',
          });
        } catch {
          // Already exited or no permission — fall through to .kill()
          try { this.process.kill('SIGKILL'); } catch { /* ignore */ }
        }
      } else {
        // POSIX: signal the entire process group started via { detached: true } if available,
        // otherwise just SIGKILL the direct child.
        try {
          process.kill(-pid, 'SIGTERM');
        } catch {
          try { this.process.kill('SIGKILL'); } catch { /* ignore */ }
        }
      }
    }
    this.process = null;
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
