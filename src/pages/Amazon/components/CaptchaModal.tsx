import { ShieldAlert, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePipelineStore } from '../pipelineStore';

export function CaptchaModal({ onResume, onStop }: {
  onResume: () => void;
  onStop: () => void;
}) {
  const captcha = usePipelineStore((s) => s.captcha);
  const resolveCaptcha = usePipelineStore((s) => s.resolveCaptcha);

  if (!captcha.isWaiting) return null;

  const recentCount = captcha.timestamps.filter(
    (t) => Date.now() - t < 300_000
  ).length;

  const handleResume = () => {
    resolveCaptcha();
    onResume();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          className="mx-4 max-w-md rounded-2xl border border-amber-700/50 bg-zinc-900 p-6 shadow-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-500/20 p-2">
              <ShieldAlert className="h-6 w-6 text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">需要验证码</h3>
          </div>

          <div className="mt-4 space-y-2 text-sm text-zinc-400">
            <p>请在浏览器中完成验证码，然后点击"继续执行"。</p>
            {recentCount > 1 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-950/30 p-2 text-amber-300">
                <Clock className="h-4 w-4" />
                <span>5 分钟内触发 {recentCount} 次，已自动降速至 {captcha.currentDelay}s 间隔</span>
              </div>
            )}
            {captcha.skippedAsins.length > 0 && (
              <p className="text-zinc-500">
                已跳过 {captcha.skippedAsins.length} 个 ASIN，将在最后重试
              </p>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleResume}
              className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
            >
              继续执行
            </button>
            <button
              onClick={onStop}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              停止
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
