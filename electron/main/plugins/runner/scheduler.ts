import { amazonWorkflowStore } from './store';
import { WorkflowExecutor } from './workflow-executor';
import { ToolExecutor } from './executor';
import { scanTools } from './scanner';
import { logger } from '../../../utils/logger';

export class AmazonScheduler {
  private timer: NodeJS.Timeout | null = null;
  private workflowRunner: WorkflowExecutor;

  constructor(runner: ToolExecutor) {
    this.workflowRunner = new WorkflowExecutor(runner);
  }

  start() {
    if (this.timer) return;
    logger.info('[AmazonScheduler] Starting background scheduler (1m interval)');
    this.timer = setInterval(() => this.check(), 60 * 1000);
    this.check(); // Initial check
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async check() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const workflows = amazonWorkflowStore.getWorkflows();

    for (const wf of workflows) {
      if (!wf.cron || wf.status === 'running') continue;

      // Simple HH:mm matching for daily tasks
      if (wf.cron === currentTime) {
        // Prevent double runs in the same minute
        if (wf.lastRunAt && (now.getTime() - wf.lastRunAt < 120 * 1000)) {
          continue;
        }

        logger.info(`[AmazonScheduler] Triggering workflow: ${wf.name}`);
        this.runWorkflow(wf);
      }
    }
  }

  private async runWorkflow(wf: any) {
    try {
      const tools = scanTools();
      amazonWorkflowStore.saveWorkflow({ ...wf, status: 'running', lastRunAt: Date.now() });
      
      await this.workflowRunner.run(wf, tools);
      
      amazonWorkflowStore.saveWorkflow({ ...wf, status: 'idle' });
    } catch (err) {
      logger.error(`[AmazonScheduler] Workflow ${wf.name} failed: ${err}`);
      amazonWorkflowStore.saveWorkflow({ ...wf, status: 'failed' });
    }
  }
}
