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
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  exiting?: boolean;
};

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3200,
  error: 4500,
  info: 3600,
  warning: 4000,
};

type ToastContextValue = {
  showToast: (type: ToastType, message: string, duration?: number) => void;
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

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
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

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
