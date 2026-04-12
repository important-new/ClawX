import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Play, Square, Trash2, 
  ChevronUp, ChevronDown, Clock, Search, Zap, Loader2,
  ChevronRight, Settings2, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAmazonWorkflowStore, WorkflowStep } from './amazonWorkflowStore';
import { 
  listAmazonTools, 
  runAmazonWorkflow, 
  stopAmazonWorkflow 
} from '@/lib/host-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PluginTool {
  id: string;
  name: string;
  description: string;
  stage: string;
  arguments: any[];
}

export function AmazonPipeline() {
  const navigate = useNavigate();
  const { workflows, init, addWorkflow, updateWorkflow, removeWorkflow } = useAmazonWorkflowStore();
  
  const [tools, setTools] = useState<PluginTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(true);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState<any>(null);

  useEffect(() => {
    init();
  }, [init]);

  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const loadTools = useCallback(async () => {
    setLoadingTools(true);
    try {
      const result = await listAmazonTools();
      setTools(result as PluginTool[]);
    } catch (err) {
      toast.error('无法加载工具列表');
    } finally {
      setLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  // ── IPC Listeners ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handleProgress = (_: any, data: any) => {
      if (selectedWorkflowId === data.workflowId) {
        setProgress(data);
      }
    };

    const handleIntervention = (_: any, data: any) => {
      if (selectedWorkflowId === data.workflowId) {
        toast.warning('需要人工干预：' + (data.message || '请查看控制台'));
      }
    };

    const unprogress = window.electron.ipcRenderer.on('amazon:workflowProgress', handleProgress);
    const unintervention = window.electron.ipcRenderer.on('amazon:workflowIntervention', handleIntervention);

    return () => {
      if (typeof unprogress === 'function') unprogress();
      if (typeof unintervention === 'function') unintervention();
    };
  }, [selectedWorkflowId]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const createWorkflow = () => {
    const newId = `wf-${Date.now()}`;
    addWorkflow({
      id: newId,
      name: '新选品流程',
      status: 'idle',
      steps: [],
    });
    setSelectedWorkflowId(newId);
  };

  const addStep = (tool: PluginTool) => {
    if (!selectedWorkflowId) return;
    
    // Initialize with default arguments from metadata
    const defaultArgs: Record<string, any> = {};
    if (tool.arguments) {
      tool.arguments.forEach(arg => {
        if (arg.default !== undefined) {
          defaultArgs[arg.name] = arg.default;
        } else if (arg.type === 'string') {
          defaultArgs[arg.name] = '';
        } else if (arg.type === 'number') {
          defaultArgs[arg.name] = 0;
        } else if (arg.type === 'boolean') {
          defaultArgs[arg.name] = false;
        }
      });
    }

    const newStep: WorkflowStep = {
      toolId: tool.id,
      args: defaultArgs,
    };
    updateWorkflow(selectedWorkflowId, {
      steps: [...(selectedWorkflow?.steps || []), newStep]
    });
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (!selectedWorkflow) return;
    const newSteps = [...selectedWorkflow.steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSteps.length) return;
    
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    updateWorkflow(selectedWorkflow.id, { steps: newSteps });
  };

  const removeStep = (index: number) => {
    if (!selectedWorkflow) return;
    const newSteps = selectedWorkflow.steps.filter((_, i) => i !== index);
    updateWorkflow(selectedWorkflow.id, { steps: newSteps });
  };

  const startWorkflow = async () => {
    if (!selectedWorkflow) return;
    setIsExecuting(true);
    setProgress(null);
    try {
      const res = await runAmazonWorkflow(selectedWorkflow);
      if (res.success) {
        toast.success('工作流开始执行');
      } else {
        toast.error('执行失败: ' + res.error);
      }
    } catch (err) {
      toast.error('执行出错');
    } finally {
      setIsExecuting(false);
    }
  };

  const stopWorkflow = async () => {
    await stopAmazonWorkflow();
    setIsExecuting(false);
    toast.info('已请求停止工作流');
  };

  return (
    <div className="flex flex-col h-full -m-6 bg-background">
      {/* Top Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
        <button onClick={() => navigate('/amazon')} className="p-1.5 rounded hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-col">
          <h1 className="text-sm font-semibold">流水线编排</h1>
          <p className="text-[11px] text-muted-foreground">编排您的选品自动化流程</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={createWorkflow}>
            <Plus className="h-3.5 w-3.5" />新建流程
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Workflows list */}
        <div className="w-64 border-r bg-muted/30 flex flex-col overflow-hidden">
          <div className="p-3 border-b bg-background/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="搜索流程..." className="pl-8 h-8 text-xs" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {workflows.map(wf => (
              <button
                key={wf.id}
                onClick={() => setSelectedWorkflowId(wf.id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors relative group",
                  selectedWorkflowId === wf.id 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "hover:bg-muted"
                )}
              >
                <div className="font-medium truncate pr-6">{wf.name}</div>
                <div className={cn(
                  "text-[10px] mt-0.5",
                  selectedWorkflowId === wf.id ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  {wf.steps.length} 个步骤
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); removeWorkflow(wf.id); if (selectedWorkflowId === wf.id) setSelectedWorkflowId(null); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500 rounded"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </button>
            ))}
            {workflows.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-xs">
                暂无流程
              </div>
            )}
          </div>
        </div>

        {/* Main Content: Workflow Editor */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {selectedWorkflow ? (
            <>
              <div className="p-4 border-b flex items-center justify-between bg-muted/10">
                <div className="flex items-center gap-3">
                  <Input 
                    value={selectedWorkflow.name} 
                    onChange={(e) => updateWorkflow(selectedWorkflow.id, { name: e.target.value })}
                    className="h-9 font-semibold text-lg max-w-[240px] bg-transparent border-none focus-visible:ring-0 px-0"
                  />
                  {selectedWorkflow.cron && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px]">
                      <Clock className="h-3 w-3" />
                      {selectedWorkflow.cron}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 h-8 rounded-md border bg-background text-xs group/cron">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                    <span className="text-muted-foreground truncate max-w-[40px]">定时:</span>
                    <input 
                      type="text" 
                      placeholder="HH:mm" 
                      className="bg-transparent border-none focus:outline-none w-12 text-center"
                      value={selectedWorkflow.cron || ''}
                      onChange={(e) => updateWorkflow(selectedWorkflow.id, { cron: e.target.value })}
                    />
                    {selectedWorkflow.cron && (
                      <button 
                        onClick={() => updateWorkflow(selectedWorkflow.id, { cron: '' })}
                        className="opacity-0 group-hover/cron:opacity-100 p-0.5 hover:bg-muted rounded"
                      >
                        <X className="h-2.5 w-2.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {isExecuting ? (
                    <Button variant="destructive" size="sm" className="h-8" onClick={stopWorkflow}>
                      <Square className="h-3.5 w-3.5 mr-1.5" />停止运行
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" className="h-8" onClick={startWorkflow} disabled={selectedWorkflow.steps.length === 0}>
                      <Play className="h-3.5 w-3.5 mr-1.5" />立即运行
                    </Button>
                  )}
                </div>
              </div>

              {/* Parameter Editor Sub-component */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Steps List */}
                <div className="max-w-2xl mx-auto space-y-3">
                  {selectedWorkflow.steps.length === 0 && (
                    <div className="border-2 border-dashed rounded-2xl py-12 flex flex-col items-center justify-center text-muted-foreground">
                      <Zap className="h-8 w-8 mb-3 opacity-20" />
                      <p className="text-sm">暂无步骤，从右侧选择工具添加</p>
                    </div>
                  )}
                  {selectedWorkflow.steps.map((step, index) => {
                    const tool = tools.find(t => t.id === step.toolId);
                    const isCurrent = progress?.currentStep === index;
                    
                    return (
                      <div 
                        key={`${step.toolId}-${index}`}
                        className={cn(
                          "group relative border rounded-xl p-4 transition-all hover:shadow-md bg-card",
                          isCurrent && "border-primary ring-1 ring-primary/20 bg-primary/5"
                        )}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                            <div className={cn(
                              "w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold",
                              isCurrent ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground"
                            )}>
                              {index + 1}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <button onClick={() => moveStep(index, 'up')} className="p-1 hover:bg-muted rounded disabled:opacity-30" disabled={index === 0}>
                                <ChevronUp className="h-3 w-3" />
                              </button>
                              <button onClick={() => moveStep(index, 'down')} className="p-1 hover:bg-muted rounded disabled:opacity-30" disabled={index === selectedWorkflow.steps.length - 1}>
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="text-sm font-semibold truncate">
                                {tool?.name || step.toolId}
                              </h3>
                              <div className="flex items-center gap-2">
                                {isCurrent && (
                                  <div className="flex items-center gap-1.5 text-[10px] text-primary animate-pulse">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    执行中...
                                  </div>
                                )}
                                <button 
                                  onClick={() => removeStep(index)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                              {tool?.description || '工具元数据缺失'}
                            </p>
                            {/* Parameter configuration toggle */}
                            <div className="mt-3 pt-3 border-t">
                              <details className="group/params">
                                <summary className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-primary list-none">
                                  <Settings2 className="h-3 w-3" />
                                  <span>配置参数</span>
                                  <ChevronRight className="h-3 w-3 transition-transform group-open/params:rotate-90" />
                                </summary>
                                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 bg-muted/30 p-3 rounded-lg border border-dashed">
                                  {tool?.arguments && tool.arguments.length > 0 ? tool.arguments.map(arg => (
                                    <div key={arg.name} className="space-y-1">
                                      <label className="text-[10px] text-muted-foreground block truncate" title={arg.help}>
                                        {arg.label || arg.name}
                                        {arg.required && <span className="text-red-500 ml-0.5">*</span>}
                                      </label>
                                      {arg.type === 'boolean' ? (
                                        <input 
                                          type="checkbox" 
                                          checked={step.args[arg.name] || false}
                                          onChange={(e) => {
                                            const newSteps = [...selectedWorkflow.steps];
                                            newSteps[index] = { 
                                              ...newSteps[index], 
                                              args: { ...newSteps[index].args, [arg.name]: e.target.checked } 
                                            };
                                            updateWorkflow(selectedWorkflow.id, { steps: newSteps as WorkflowStep[] });
                                          }}
                                          className="h-3.5 w-3.5"
                                        />
                                      ) : arg.type === 'number' ? (
                                        <Input 
                                          type="number" 
                                          value={(step.args[arg.name] ?? '') as any} 
                                          onChange={(e) => {
                                            const newSteps = [...selectedWorkflow.steps];
                                            newSteps[index] = { 
                                              ...newSteps[index], 
                                              args: { ...newSteps[index].args, [arg.name]: parseFloat(e.target.value) || 0 } 
                                            };
                                            updateWorkflow(selectedWorkflow.id, { steps: newSteps as WorkflowStep[] });
                                          }}
                                          className="h-7 text-[11px] px-2"
                                        />
                                      ) : (
                                        <Input 
                                          value={(step.args[arg.name] ?? '') as any} 
                                          onChange={(e) => {
                                            const newSteps = [...selectedWorkflow.steps];
                                            newSteps[index] = { 
                                              ...newSteps[index], 
                                              args: { ...newSteps[index].args, [arg.name]: e.target.value } 
                                            };
                                            updateWorkflow(selectedWorkflow.id, { steps: newSteps as WorkflowStep[] });
                                          }}
                                          className="h-7 text-[11px] px-2"
                                        />
                                      )}
                                    </div>
                                  )) : (
                                    <div className="col-span-2 text-[10px] text-muted-foreground italic">该工具无需配置参数</div>
                                  )}
                                </div>
                              </details>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-center p-8">
              <Zap className="h-12 w-12 mb-4 opacity-10" />
              <h3 className="text-lg font-medium text-foreground mb-1">请选择或创建一个流程</h3>
              <p className="text-sm max-w-xs">编排抓取、过滤、核算与报告生成，实现亚马逊选品全自动化</p>
              <Button className="mt-6" onClick={createWorkflow}>
                <Plus className="h-4 w-4 mr-2" />创建您的第一个流程
              </Button>
            </div>
          )}
        </div>

        {/* Right Panel: Tools catalog */}
        <div className="w-72 border-l bg-accent/5 overflow-y-auto">
          <div className="p-4 border-b bg-background sticky top-0 z-10">
            <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-orange-500" />
              工具箱 (Stages)
            </h3>
          </div>
          <div className="p-3 space-y-3">
            {loadingTools ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">扫描元数据中...</span>
              </div>
            ) : tools.map(tool => (
              <div 
                key={tool.id}
                className="group p-3 border rounded-xl bg-background hover:border-primary/50 transition-all cursor-default"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground truncate max-w-[120px]">
                    {tool.stage}
                  </span>
                  <button 
                    onClick={() => addStep(tool)}
                    disabled={!selectedWorkflowId}
                    className="p-1 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-20"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <h4 className="text-xs font-semibold mb-1 truncate">{tool.name}</h4>
                <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                  {tool.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
