import { ShieldAlert, LogIn, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

interface InterventionModalProps {
  type: string;
  phaseName?: string;
  onResume: () => void;
  onStop: () => void;
}

export function InterventionModal({ type, phaseName, onResume, onStop }: InterventionModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
      exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-6"
    >
      <div className="bg-card w-full max-w-md rounded-3xl border shadow-2xl p-8 space-y-6">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
            {type === 'captcha' ? <ShieldAlert className="h-8 w-8" /> : <LogIn className="h-8 w-8" />}
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold">需要人工干预</h3>
            <p className="text-sm text-muted-foreground">
              {phaseName && <span className="font-medium text-foreground">{phaseName}</span>}
              {phaseName && ' — '}
              系统检测到亚马逊反爬虫机制，请在浏览器中完成验证
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
          <Button className="h-11 rounded-xl font-semibold" onClick={onResume}>
            <RefreshCw className="h-4 w-4 mr-2" />
            继续执行
          </Button>
          <Button variant="ghost" className="h-11 rounded-xl" onClick={onStop}>
            <Square className="h-4 w-4 mr-2" />
            停止运行
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
