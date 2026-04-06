import { Workflow } from './workflow-executor';

interface AmazonWorkflowStoreSchema {
  workflows: Workflow[];
}

let storeInstance: any = null;

async function getStore() {
  if (!storeInstance) {
    const Store = (await import('electron-store')).default;
    storeInstance = new Store<AmazonWorkflowStoreSchema>({
      name: 'amazon-workflows',
      defaults: {
        workflows: []
      }
    });
  }
  return storeInstance;
}

export const amazonWorkflowStore = {
  getWorkflows: async () => {
    const store = await getStore();
    const workflows = store.get('workflows');
    return Array.isArray(workflows) ? workflows : [];
  },
  saveWorkflow: async (wf: Workflow) => {
    const store = await getStore();
    const workflows = store.get('workflows') as Workflow[];
    const index = workflows.findIndex(w => w.id === wf.id);
    if (index >= 0) {
      workflows[index] = wf;
    } else {
      workflows.push(wf);
    }
    store.set('workflows', workflows);
  },
  removeWorkflow: async (id: string) => {
    const store = await getStore();
    const workflows = (store.get('workflows') as Workflow[]).filter(w => w.id !== id);
    store.set('workflows', workflows);
  }
};
