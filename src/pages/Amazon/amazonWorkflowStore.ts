import { create } from 'zustand';
import { 
  listAmazonWorkflows, 
  saveAmazonWorkflow, 
  removeAmazonWorkflow 
} from '@/lib/host-api';

export interface WorkflowStep {
  toolId: string;
  args: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  cron?: string; // e.g. "09:30"
  lastRunAt?: number;
  status: 'idle' | 'running' | 'paused' | 'failed';
}

interface AmazonWorkflowState {
  workflows: Workflow[];
  init: () => Promise<void>;
  addWorkflow: (w: Workflow) => Promise<void>;
  updateWorkflow: (id: string, patch: Partial<Workflow>) => Promise<void>;
  removeWorkflow: (id: string) => Promise<void>;
}

export const useAmazonWorkflowStore = create<AmazonWorkflowState>()(
  (set, get) => ({
    workflows: [],
    
    init: async () => {
      const workflows = await listAmazonWorkflows();
      set({ workflows: (workflows || []) as Workflow[] });
    },

    addWorkflow: async (w) => {
      await saveAmazonWorkflow(w);
      set((state) => ({ workflows: [...state.workflows, w] }));
    },

    updateWorkflow: async (id, patch) => {
      const { workflows } = get();
      const updated = workflows.map((w) => w.id === id ? { ...w, ...patch } : w);
      const target = updated.find(w => w.id === id);
      if (target) {
        await saveAmazonWorkflow(target);
      }
      set({ workflows: updated });
    },

    removeWorkflow: async (id) => {
      await removeAmazonWorkflow(id);
      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
      }));
    },
  })
);
