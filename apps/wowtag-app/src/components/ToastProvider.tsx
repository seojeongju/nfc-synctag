import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, LogIn, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  exiting?: boolean;
};

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
};

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3200,
  error: 4500,
  info: 3600,
  warning: 4000,
};

type ToastContextValue = {
  showToast: (type: ToastType, message: string, duration?: number) => void;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastIdSeq = 0;

const TOAST_STYLES: Record<
  ToastType,
  { icon: typeof CheckCircle2; ring: string; iconBg: string; iconColor: string; bar: string }
> = {
  success: {
    icon: CheckCircle2,
    ring: 'ring-emerald-500/15',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600',
    bar: 'bg-emerald-500',
  },
  error: {
    icon: XCircle,
    ring: 'ring-rose-500/15',
    iconBg: 'bg-rose-500/10',
    iconColor: 'text-rose-600',
    bar: 'bg-rose-500',
  },
  info: {
    icon: Info,
    ring: 'ring-violet-500/15',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600',
    bar: 'bg-violet-500',
  },
  warning: {
    icon: AlertCircle,
    ring: 'ring-amber-500/15',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600',
    bar: 'bg-amber-500',
  },
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const style = TOAST_STYLES[item.type];
  const Icon = style.icon;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto w-full max-w-[min(100vw-2rem,24rem)] overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-[0_12px_40px_rgba(15,23,42,0.14),0_0_0_1px_rgba(15,23,42,0.04)] ring-1 backdrop-blur-xl ${style.ring} ${
        item.exiting ? 'toast-exit' : 'toast-enter'
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBg} ${style.iconColor}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </div>
        <p className="min-w-0 flex-1 pt-1 text-[13px] font-bold leading-snug text-slate-800 whitespace-pre-line">
          {item.message}
        </p>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-0.5 w-full bg-slate-100/80">
        <div
          className={`h-full origin-left ${style.bar} toast-progress`}
          style={{ animationDuration: `${item.duration}ms` }}
        />
      </div>
    </div>
  );
}

function ConfirmDialog({
  options,
  onResult,
}: {
  options: ConfirmOptions;
  onResult: (ok: boolean) => void;
}) {
  const isDanger = options.tone === 'danger';
  const title = options.title ?? '확인';
  const confirmLabel = options.confirmLabel ?? '확인';
  const cancelLabel = options.cancelLabel ?? '취소';
  const showLoginIcon = !isDanger && /로그인/.test(confirmLabel);

  return createPortal(
    <div
      className="fixed inset-0 z-[410] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-confirm-title"
      aria-describedby="app-confirm-desc"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        aria-label="닫기"
        onClick={() => onResult(false)}
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)] toast-enter">
        <div className="bg-gradient-to-br from-violet-50/90 via-white to-amber-50/50 px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                isDanger ? 'bg-rose-500/10 text-rose-600' : 'bg-violet-500/10 text-violet-600'
              }`}
            >
              {showLoginIcon ? (
                <LogIn className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              ) : isDanger ? (
                <AlertCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              ) : (
                <Info className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id="app-confirm-title" className="text-base font-black text-slate-900 tracking-tight">
                {title}
              </h2>
              <p id="app-confirm-desc" className="mt-2 text-[13px] font-bold leading-relaxed text-slate-600 whitespace-pre-line">
                {options.message}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-slate-100 bg-slate-50/80 p-3">
          <button
            type="button"
            onClick={() => onResult(false)}
            className="flex-1 h-11 rounded-xl border border-slate-200/80 bg-white text-sm font-black text-slate-600 transition-colors hover:bg-slate-50 active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onResult(true)}
            className={`flex-1 h-11 rounded-xl text-sm font-black text-white shadow-md transition-all active:scale-[0.98] ${
              isDanger
                ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/25'
                : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-violet-500/30'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmOptions | null>(null);
  const timersRef = useRef<Map<string, number>>(new Map());
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

  const dismiss = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, exiting: true } : x)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 220);
  }, []);

  const finishConfirm = useCallback((ok: boolean) => {
    setConfirmDialog(null);
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    resolve?.(ok);
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmDialog({
        title: options.title,
        message: options.message.trim(),
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        tone: options.tone,
      });
    });
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, duration?: number) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const id = `toast-${++toastIdSeq}`;
      const ms = duration ?? DEFAULT_DURATION[type];
      const item: ToastItem = { id, type, message: trimmed, duration: ms };
      setToasts((prev) => [...prev.slice(-2), item]);
      const timer = window.setTimeout(() => dismiss(id), ms) as unknown as number;
      timersRef.current.set(id, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      confirmResolveRef.current?.(false);
      confirmResolveRef.current = null;
    };
  }, []);

  const value = useMemo(() => ({ showToast, showConfirm }), [showToast, showConfirm]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[400] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
        aria-label="알림"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
      {confirmDialog ? <ConfirmDialog options={confirmDialog} onResult={finishConfirm} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
