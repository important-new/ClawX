import { ToolExecutor, ExecutionResult } from './executor';
import { PluginTool } from './scanner';

export interface WorkflowStep {
  toolId: string;
  args: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  cron?: string;
  status?: 'idle' | 'running' | 'paused' | 'failed';
  lastRunAt?: number;
}

export class WorkflowExecutor {
  private executor: ToolExecutor;
  private isRunning = false;
  private currentStepIndex = -1;

  // Resume state
  private pausedWorkflow: Workflow | null = null;
  private pausedStepIndex = -1;
  private pausedTools: PluginTool[] = [];

  constructor(executor: ToolExecutor) {
    this.executor = executor;
  }

  async run(workflow: Workflow, tools: PluginTool[]): Promise<void> {
    if (this.isRunning) throw new Error('Workflow already running');
    this.isRunning = true;
    this.currentStepIndex = 0;

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        this.currentStepIndex = i;
        const step = workflow.steps[i];
        const tool = tools.find(t => t.id === step.toolId);
        if (!tool) throw new Error(`Tool ${step.toolId} not found in workflow`);

        console.log(`[Workflow] Starting step ${i + 1}/${workflow.steps.length}: ${tool.name}`);

        const result: ExecutionResult = await this.executor.execute(tool.path, step.args);

        if (result.code !== 0) {
          if (result.code === 2) {
            console.warn(`[Workflow] Step ${i + 1} paused for intervention.`);
            // Save paused state for resume
            this.pausedWorkflow = workflow;
            this.pausedStepIndex = i;
            this.pausedTools = tools;
            this.isRunning = false;
            return;
          }
          throw new Error(`Step ${i + 1} (${tool.name}) failed with code ${result.code}`);
        }
      }
      console.log('[Workflow] Completed successfully');
    } finally {
      if (!this.pausedWorkflow) {
        this.isRunning = false;
        this.currentStepIndex = -1;
      }
    }
  }

  async resume(): Promise<void> {
    if (!this.pausedWorkflow) {
      throw new Error('No paused workflow to resume');
    }

    const workflow = this.pausedWorkflow;
    const startFrom = this.pausedStepIndex;
    const tools = this.pausedTools;

    // Clear paused state
    this.pausedWorkflow = null;
    this.pausedStepIndex = -1;
    this.pausedTools = [];

    this.isRunning = true;

    try {
      // Resume from the paused step (re-execute it — Python scripts skip completed items)
      for (let i = startFrom; i < workflow.steps.length; i++) {
        this.currentStepIndex = i;
        const step = workflow.steps[i];
        const tool = tools.find(t => t.id === step.toolId);
        if (!tool) throw new Error(`Tool ${step.toolId} not found in workflow`);

        console.log(`[Workflow] Resuming step ${i + 1}/${workflow.steps.length}: ${tool.name}`);

        const result: ExecutionResult = await this.executor.execute(tool.path, step.args);

        if (result.code !== 0) {
          if (result.code === 2) {
            console.warn(`[Workflow] Step ${i + 1} paused again for intervention.`);
            this.pausedWorkflow = workflow;
            this.pausedStepIndex = i;
            this.pausedTools = tools;
            this.isRunning = false;
            return;
          }
          throw new Error(`Step ${i + 1} (${tool.name}) failed with code ${result.code}`);
        }
      }
      console.log('[Workflow] Resumed workflow completed successfully');
    } finally {
      if (!this.pausedWorkflow) {
        this.isRunning = false;
        this.currentStepIndex = -1;
      }
    }
  }

  isPaused(): boolean {
    return this.pausedWorkflow !== null;
  }

  stop() {
    this.executor.stop();
    this.isRunning = false;
    this.pausedWorkflow = null;
    this.pausedStepIndex = -1;
    this.pausedTools = [];
  }

  getHealth() {
    return {
      isRunning: this.isRunning,
      currentStep: this.currentStepIndex,
      isPaused: this.pausedWorkflow !== null,
    };
  }
}
