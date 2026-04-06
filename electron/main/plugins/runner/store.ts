import Store from 'electron-store';
import { Workflow } from './workflow-executor';

interface AmazonWorkflowStoreSchema {
  workflows: Workflow[];
}

const store = new Store<AmazonWorkflowStoreSchema>({
  name: 'amazon-workflows',
  defaults: {
    workflows: []
  }
});

export const amazonWorkflowStore = {
  getWorkflows: () => store.get('workflows'),
  saveWorkflow: (wf: Workflow) => {
    const workflows = store.get('workflows');
    const index = workflows.findIndex(w => w.id === wf.id);
    if (index >= 0) {
      workflows[index] = wf;
    } else {
      workflows.push(wf);
    }
    store.set('workflows', workflows);
  },
  removeWorkflow: (id: string) => {
    const workflows = store.get('workflows').filter(w => w.id !== id);
    store.set('workflows', workflows);
  }
};
