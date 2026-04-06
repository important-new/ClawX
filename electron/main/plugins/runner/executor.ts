import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface ExecutionResult {
  code: number | null;
  signal: string | null;
  error?: string;
}

export class ToolExecutor extends EventEmitter {
  private process: ChildProcess | null = null;
  private currentToolId: string | null = null;

  async execute(
    toolPath: string,
    args: Record<string, any>,
    cwd: string = 'd:\\Code\\amazon'
  ): Promise<ExecutionResult> {
    const formattedArgs = this.formatArgs(args);
    return new Promise((resolve) => {
      // Use uv run to execute the python script
      // e.g., uv run path/to/script.py --session mysession
      this.process = spawn('uv', ['run', toolPath, ...formattedArgs], {
        cwd,
        shell: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
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
          this.emit('intervention', { type: 'captcha' });
        }
      });

      this.process.stderr?.on('data', (data) => {
        this.emit('error-output', data.toString());
      });

      this.process.on('close', (code, signal) => {
        this.process = null;
        resolve({ code, signal });
      });

      this.process.on('error', (err) => {
        this.process = null;
        resolve({ code: 1, signal: null, error: err.message });
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
