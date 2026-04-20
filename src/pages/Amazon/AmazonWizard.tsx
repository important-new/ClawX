import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronRight, AlertCircle, 
  Settings2, CheckCircle2, Rocket,
  RefreshCw, LogIn, ShieldAlert
} from 'lucide-react';
import { AmazonBreadcrumbs } from './components/AmazonBreadcrumbs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { listAmazonTools, runAmazonWorkflow, stopAmazonWorkflow } from '@/lib/host-api';
import { useAmazonWorkflowStore, WorkflowStep } from './amazonWorkflowStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PluginTool {
  id: string;
  name: string;
  description: string;
  stage: string;
  arguments: any[];
}

interface WizardState {
  step: 'goal' | 'config' | 'run' | 'done';
  market: string;
  sessionName: string;
  selectedToolIds: string[];
  arguments: Record<string, Record<string, any>>;
  progress: any;
  intervention: any;
  isExecuting: boolean;
  strategyId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MARKETS = [
  { id: 'us', name: '美国 (Amazon.com)', icon: '🇺🇸' },
  { id: 'uk', name: '英国 (Amazon.co.uk)', icon: '🇬🇧' },
  { id: 'de', name: '德国 (Amazon.de)', icon: '🇩🇪' },
  { id: 'jp', name: '日本 (Amazon.co.jp)', icon: '🇯🇵' },
];

const STRATEGIES = [
  { id: 'standard', name: '标准全流程', desc: '包含抓取、核算与初置关键词', icon: '🎯' },
  { id: 'deep', name: '深度竞争调研', desc: '强化店铺分析与流量来源透视', icon: '🔍' },
  { id: 'quick', name: '快速采样', desc: '仅执行基础数据抓取与过滤', icon: '⚡' },
];

export function AmazonWizard() {
  const navigate = useNavigate();
  const { init } = useAmazonWorkflowStore();
  
  const [state, setState] = useState<WizardState>({
    step: 'goal',
    market: 'us',
    sessionName: `选品-${new Date().toISOString().slice(0, 10)}-${Math.floor(Math.random() * 1000)}`,
    selectedToolIds: ['scraper-pipeline'], // Default to the main pipeline
    arguments: {},
    progress: null,
    intervention: null,
    isExecuting: false,
    strategyId: 'standard',
  });

  const [tools, setTools] = useState<PluginTool[]>([]);
  // loadingTools removal
  const [, setLoadingTools] = useState(true);

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const loadTools = useCallback(async () => {
    setLoadingTools(true);
    try {
      const result = await listAmazonTools();
      if (!result.success || !Array.isArray(result.tools)) {
        throw new Error(result.error || 'Failed to list tools');
      }
      const toolsList = result.tools as PluginTool[];
      setTools(toolsList);

      // Default to selecting all tools (v02: select all, sorted by stage)
      const allToolIds = toolsList.map(t => t.id);

      // Initialize arguments for all tools
      const initialArgs: Record<string, Record<string, any>> = {};
      toolsList.forEach(tool => {
        const toolArgs: Record<string, any> = {};
        tool.arguments.forEach(arg => {
          toolArgs[arg.name] = arg.default ?? (arg.type === 'boolean' ? false : arg.type === 'number' ? 0 : '');
        });
        initialArgs[tool.id] = toolArgs;
      });
      
      setState(s => ({ 
        ...s, 
        arguments: initialArgs,
        selectedToolIds: allToolIds // Pre-select all discovered tools
      }));
    } catch (err) {
      toast.error('无法加载脚本源数据');
    } finally {
      setLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    init();
    loadTools();
  }, [init, loadTools]);

  // ── IPC Listeners ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handleProgress = (_: any, data: any) => {
      setState(s => ({ ...s, progress: data }));
    };

    const handleIntervention = (_: any, data: any) => {
      setState(s => ({ ...s, intervention: data }));
      toast.warning('流程已暂停：需要手动干预');
    };

    const unprogress = window.electron.ipcRenderer.on('amazon:workflowProgress', handleProgress);
    const unintervention = window.electron.ipcRenderer.on('amazon:workflowIntervention', handleIntervention);

    return () => {
      if (typeof unprogress === 'function') unprogress();
      if (typeof unintervention === 'function') unintervention();
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const nextStep = () => {
    if (state.step === 'goal') setState(s => ({ ...s, step: 'config' }));
    else if (state.step === 'config') startSelection();
  };

  const prevStep = () => {
    if (state.step === 'config') setState(s => ({ ...s, step: 'goal' }));
    if (state.step === 'run' && !state.isExecuting) setState(s => ({ ...s, step: 'config' }));
  };

  const startSelection = async () => {
    setState(s => ({ ...s, step: 'run', isExecuting: true, progress: null, intervention: null }));
    
    // Sort selected tools by stage to ensure sequential execution (Already sorted by backend, but we filter here)
    const activeTools = tools
      .filter(t => state.selectedToolIds.includes(t.id))
      .sort((a, b) => (Number(a.stage) || 0) - (Number(b.stage) || 0));

    const steps: WorkflowStep[] = activeTools.map(tool => ({
      toolId: tool.id,
      args: {
        ...state.arguments[tool.id],
        market: state.market,
        session: state.sessionName,
      }
    }));


    try {
      const res = await runAmazonWorkflow({
        id: `wizard-${Date.now()}`,
        name: state.sessionName,
        status: 'running',
        steps
      });

      if (!res.success) {
        toast.error('启动失败: ' + res.error);
        setState(s => ({ ...s, isExecuting: false }));
      }
    } catch (err) {
      toast.error('执行出错');
      setState(s => ({ ...s, isExecuting: false }));
    }
  };

  const stopSelection = async () => {
    await stopAmazonWorkflow();
    setState(s => ({ ...s, isExecuting: false }));
    toast.info('已请求终止');
  };

  const breadcrumbItems = state.step === 'goal' ? [] : 
                         state.step === 'config' ? [{ label: '精细化配置' }] :
                         state.step === 'run' ? [{ label: '正在执行' }] : [];

  // ── Render Helpers ────────────────────────────────────────────────────────

  const renderGoalStep = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-8 custom-scrollbar pt-2 pb-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-black bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent tracking-tight">确定选品目标</h2>
          <p className="text-sm text-muted-foreground">首先告诉我们要针对哪个市场进行自动化分析</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {MARKETS.map(m => (
            <button
              key={m.id}
              onClick={() => setState(s => ({ ...s, market: m.id }))}
              className={cn(
                "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                state.market === m.id 
                  ? "bg-primary/5 border-primary shadow-lg ring-1 ring-primary/20" 
                  : "bg-card border-transparent hover:border-muted"
              )}
            >
              <span className="text-3xl">{m.icon}</span>
              <span className="font-semibold text-sm">{m.name}</span>
            </button>
          ))}
        </div>

        <div className="space-y-4 pt-4 border-t border-dashed">
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-2">选择选品策略</h3>
          <div className="space-y-3">
            {STRATEGIES.map(st => (
              <button
                key={st.id}
                onClick={() => selectStrategy(st.id)}
                className={cn(
                  "w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left group",
                  state.strategyId === st.id 
                    ? "bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20" 
                    : "bg-card border-transparent hover:border-muted"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-colors",
                    state.strategyId === st.id ? "bg-primary text-primary-foreground" : "bg-muted group-hover:bg-primary/10"
                  )}>
                    {st.icon}
                  </div>
                  <div>
                    <div className="text-sm font-bold">{st.name}</div>
                    <div className="text-[10px] text-muted-foreground">{st.desc}</div>
                  </div>
                </div>
                <Badge variant={state.strategyId === st.id ? "default" : "outline"} className="text-[10px] uppercase h-5">
                  {state.strategyId === st.id ? "当前选择" : "预设"}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );


  const updateArg = (toolId: string, name: string, value: any) => {
    setState(s => {
      const newArgs = { ...s.arguments };
      newArgs[toolId] = { ...newArgs[toolId], [name]: value };
      
      // Smart Sync: If this is a global parameter, sync to all tools that have it
      if (['session', 'market'].includes(name)) {
        Object.keys(newArgs).forEach(tid => {
          if (tid !== toolId && tools.find(t => t.id === tid)?.arguments.find(a => a.name === name)) {
            newArgs[tid] = { ...newArgs[tid], [name]: value };
          }
        });
        // Also sync to top-level state if applicable
        if (name === 'session') s.sessionName = value;
        if (name === 'market') s.market = value;
      }
      
      return { ...s, arguments: newArgs };
    });
  };

  const toggleTool = (toolId: string) => {
    setState(s => ({
      ...s,
      selectedToolIds: s.selectedToolIds.includes(toolId)
        ? s.selectedToolIds.filter(id => id !== toolId)
        : [...s.selectedToolIds, toolId]
    }));
  };

  const selectStrategy = (strategyId: string) => {
    setState(s => {
      let nextToolIds = [...tools.map(t => t.id)];
      const nextArgs = { ...s.arguments };

      if (strategyId === 'quick') {
        // Only keep search and sampling
        nextToolIds = tools.filter(t => String(t.stage) === '1' || t.id.includes('sampling') || t.id.includes('base')).map(t => t.id);
      } else if (strategyId === 'deep') {
        // Maximize depth for search
        const searchTool = tools.find(t => t.id === 'ss_search');
        if (searchTool && nextArgs[searchTool.id]) {
          nextArgs[searchTool.id] = { 
            ...nextArgs[searchTool.id], 
            pages: 5, 
            limit: 500 
          };
        }
      }

      return {
        ...s,
        strategyId,
        selectedToolIds: nextToolIds,
        arguments: nextArgs
      };
    });
    
    toast.success(`已切换至预设：${STRATEGIES.find(st => st.id === strategyId)?.name}`);
  };

  const renderConfigStep = () => {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex flex-col gap-1 mb-6 shrink-0">
          <h2 className="text-3xl font-black bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent tracking-tight">精细化配置</h2>
          <p className="text-sm text-muted-foreground">根据选品策略，为您自动选择了部分脚本，您可以展开并微调参数</p>
        </div>

        <div className="flex-1 overflow-y-auto pr-3 -mr-3 space-y-6 custom-scrollbar min-h-0 pb-6">
          {/* Global Config Section */}
          <div className="p-6 rounded-3xl border bg-primary/5 space-y-4">
             <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Settings2 className="h-4 w-4" />
                <span>全局核心参数</span>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                   <label className="text-xs font-semibold text-muted-foreground">批次名称 (Session)</label>
                   <Input 
                      value={state.sessionName} 
                      onChange={e => {
                        const val = e.target.value;
                        setState(s => ({ ...s, sessionName: val }));
                        // Update all tools that have 'session' arg
                        tools.forEach(t => {
                          if (t.arguments.find(a => a.name === 'session')) {
                            updateArg(t.id, 'session', val);
                          }
                        });
                      }}
                      className="h-10 rounded-xl bg-background"
                   />
                </div>
                <div className="space-y-1.5">
                   <label className="text-xs font-semibold text-muted-foreground">目标市场 (Market)</label>
                   <div className="h-10 px-3 flex items-center bg-background border rounded-xl font-medium text-sm">
                      {MARKETS.find(m => m.id === state.market)?.icon} {MARKETS.find(m => m.id === state.market)?.name}
                   </div>
                </div>
             </div>
          </div>

          {/* Dynamic Tools Config */}
          <div className="space-y-4 pb-8">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-2">流程步骤与参数清单</h3>
            {tools.map((tool) => {
              const isActive = state.selectedToolIds.includes(tool.id);
              
              return (
                <div key={tool.id} className={cn(
                  "rounded-2xl border transition-all overflow-hidden",
                  isActive ? "bg-card shadow-sm border-primary/20" : "bg-muted/10 opacity-60"
                )}>
                  {/* Tool Header */}
                  <div 
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30"
                    onClick={() => toggleTool(tool.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center transition-colors",
                        isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <div className="w-2 h-2 rounded-full bg-current" />}
                      </div>
                      <div>
                        <div className="text-sm font-bold">{tool.name}</div>
                        <div className="text-[10px] text-muted-foreground line-clamp-1">{tool.description}</div>
                      </div>
                    </div>
                    {isActive && <Badge variant="secondary" className="text-[9px] uppercase">已启用</Badge>}
                  </div>

                  {/* Tool Params (Conditional) */}
                  {isActive && tool.arguments.length > 0 && (
                    <div className="px-5 pb-5 pt-1 border-t border-dashed grid grid-cols-2 gap-x-6 gap-y-4 bg-muted/5">
                      {tool.arguments.map(arg => {
                        // Skip session and market as they are global
                        if (['session', 'market'].includes(arg.name)) return null;

                        return (
                          <div key={arg.name} className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                               <label className="text-[11px] font-bold text-muted-foreground truncate">
                                 {arg.label || arg.name}
                               </label>
                               {arg.help && (
                                 <div className="group relative">
                                    <AlertCircle className="h-3 w-3 text-muted-foreground/50" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal w-40 z-50 pointer-events-none">
                                      {arg.help}
                                    </div>
                                 </div>
                               )}
                            </div>
                            
                            {arg.type === 'boolean' ? (
                               <div className="h-10 flex items-center">
                                 <div 
                                    className={cn(
                                      "w-10 h-5 rounded-full p-1 cursor-pointer transition-colors",
                                      state.arguments[tool.id]?.[arg.name] ? "bg-primary" : "bg-muted"
                                    )}
                                    onClick={() => updateArg(tool.id, arg.name, !state.arguments[tool.id]?.[arg.name])}
                                 >
                                    <div className={cn(
                                      "w-3 h-3 rounded-full bg-white transition-transform",
                                      state.arguments[tool.id]?.[arg.name] ? "translate-x-5" : "translate-x-0"
                                    )} />
                                 </div>
                               </div>
                            ) : (
                               <Input 
                                 type={arg.type === 'number' ? 'number' : 'text'}
                                 value={state.arguments[tool.id]?.[arg.name] ?? ''}
                                 onChange={e => {
                                   const val = arg.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                                   updateArg(tool.id, arg.name, val);
                                 }}
                                 placeholder={String(arg.default || '')}
                                 className="h-10 rounded-xl text-xs bg-background"
                               />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 shrink-0">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              提示：参数配置完成后，向导将按阶段顺序（{tools.map(t => t.stage).join(' ➔ ')}）为您执行。
            </p>
          </div>
        </div>
      </div>
    );
  };


  const renderRunStep = () => {
    const currentStepIndex = state.progress?.currentStep ?? 0;
    const percent = state.progress?.percent ?? 0;
    const status = state.progress?.status ?? '初始化环境中...';

    return (
      <div className="space-y-8 py-4 animate-in fade-in transition-all">
        <div className="text-center space-y-4">
          <div className="relative inline-block">
             <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-150 animate-pulse" />
             <div className="relative w-24 h-24 rounded-full border-4 border-primary/20 flex items-center justify-center bg-card shadow-inner">
                {state.isExecuting ? (
                  <Rocket className="h-10 w-10 text-primary animate-bounce" />
                ) : (
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                )}
             </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold">{state.isExecuting ? '正在执行自动化分析' : '分析任务已完成'}</h2>
            <p className="text-sm text-muted-foreground">正在为您探测 Amazon 选品机遇</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs mb-1 font-medium">
              <span className="text-primary">{status}</span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <Progress value={percent} className="h-3 rounded-full" />
          </div>

          {/* Step Track */}
          <div className="relative pl-6 border-l space-y-8 ml-2">
            {state.selectedToolIds.map((toolId, idx) => {
              const tool = tools.find(t => t.id === toolId);
              const isActive = idx === currentStepIndex;
              const isPast = idx < currentStepIndex;
              
              return (
                <div key={toolId} className="relative group">
                  <div className={cn(
                    "absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 transition-all",
                    isActive ? "bg-primary border-primary ring-4 ring-primary/20" : 
                    isPast ? "bg-green-500 border-green-500" : "bg-card border-muted"
                  )} />
                  <div className={cn(
                    "transition-all",
                    isActive ? "opacity-100 translate-x-1" : "opacity-40"
                  )}>
                    <div className="text-sm font-bold">{tool?.name || toolId}</div>
                    <div className="text-xs text-muted-foreground">{isActive ? '运行中...' : isPast ? '执行完成' : '等待中'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!state.isExecuting && (
          <div className="flex flex-col gap-3 pt-4 border-t">
            <Button className="w-full h-12 rounded-2xl text-lg font-bold" onClick={() => navigate('/amazon')}>
              查看完整报告
            </Button>
            <Button variant="outline" className="w-full h-11 rounded-2xl" onClick={() => setState(s => ({ ...s, step: 'goal' }))}>
              完成推出
            </Button>
          </div>
        )}

        {state.isExecuting && (
          <Button variant="ghost" className="w-full text-muted-foreground hover:text-destructive" onClick={stopSelection}>
            终止本次任务
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto w-full relative">
      <AmazonBreadcrumbs currentMode="选品向导" items={breadcrumbItems} />

      <AnimatePresence mode="wait">
        {/* Intervention Overlay (Glassmorphism) */}
        {state.intervention && (
          <motion.div 
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-6"
          >
            <div className="bg-card w-full max-w-md rounded-3xl border shadow-2xl p-8 space-y-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-3xl bg-amber-100 flex items-center justify-center text-amber-600">
                  {state.intervention.type === 'captcha' ? <ShieldAlert className="h-8 w-8" /> : <LogIn className="h-8 w-8" />}
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold">需要人工干预</h3>
                  <p className="text-sm text-muted-foreground">
                    系统检测到亚马逊反爬虫机制，请在弹出的浏览器窗口中完成以下操作
                  </p>
                </div>
              </div>

              <div className="bg-muted/50 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">待办事项</div>
                <ul className="text-sm space-y-2">
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    查看控制台或弹出的浏览器页面
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    输入验证码或进行滑块验证
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    确保页面已加载出目标内容
                  </li>
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button 
                  className="h-11 rounded-xl font-semibold" 
                  onClick={() => { setState(s => ({ ...s, intervention: null })) }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />我已完成
                </Button>
                <Button variant="ghost" className="h-11 rounded-xl" onClick={stopSelection}>
                   停止运行
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col bg-card/40 backdrop-blur-md border rounded-[32px] shadow-sm overflow-hidden relative min-h-0">
        <div className="p-6 sm:p-10 flex flex-col h-full overflow-hidden">
          <AnimatePresence mode="wait">
             <motion.div
               key={state.step}
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               transition={{ duration: 0.3 }}
               className="flex-1 flex flex-col overflow-hidden"
             >
                {state.step === 'goal' && renderGoalStep()}
                {state.step === 'config' && renderConfigStep()}
                {state.step === 'run' && renderRunStep()}

                {(state.step === 'goal' || state.step === 'config') && (
                  <div className="shrink-0 pt-6 mt-6 border-t flex items-center justify-between bg-transparent -mx-2 px-2 pb-2">
                      <div className="flex gap-1.5">
                        {['goal', 'config', 'run'].map((s) => (
                          <div key={s} className={cn(
                            "w-2 h-2 rounded-full transition-all",
                            state.step === s ? "bg-primary w-6" : "bg-muted"
                          )} />
                        ))}
                      </div>
                    
                    <div className="flex items-center gap-3">
                      {state.step !== 'goal' && (
                        <Button variant="ghost" className="rounded-xl px-6 h-11" onClick={prevStep}>
                          上一步
                        </Button>
                      )}
                      <Button className="rounded-xl px-8 h-11 font-bold group shadow-lg shadow-primary/20" onClick={nextStep}>
                        {state.step === 'config' ? '开始自动化选品' : '下一步'}
                        <ChevronRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </div>
                  </div>
                )}
             </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <p className="mt-6 text-[10px] text-muted-foreground/60 font-medium flex items-center justify-center gap-2">
        <ShieldAlert className="h-2.5 w-2.5" />
        由 ClawX AI Agent 提供动力支持
      </p>
    </div>
  );
}
