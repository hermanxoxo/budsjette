import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Info, Undo2 } from 'lucide-react';
import { cx } from './primitives';

/** Korte tilbakemeldinger nederst på skjermen, med mulighet for angre-handling. */

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, options?: { tone?: ToastTone; action?: ToastItem['action']; duration?: number }) => void;
  success: (message: string, action?: ToastItem['action']) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>(
    (message, options = {}) => {
      const id = ++counter.current;
      const item: ToastItem = { id, message, tone: options.tone ?? 'info', action: options.action };
      setItems((prev) => [...prev.slice(-2), item]);
      const duration = options.duration ?? (options.action ? 6000 : 3200);
      setTimeout(() => remove(id), duration);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, action) => show(message, { tone: 'success', action }),
      error: (message) => show(message, { tone: 'error', duration: 5000 }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:pb-6"
            role="status"
            aria-live="polite"
          >
            {items.map((item) => (
              <ToastView key={item.id} item={item} onDismiss={() => remove(item.id)} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const Icon = item.tone === 'success' ? Check : item.tone === 'error' ? AlertTriangle : Info;
  return (
    <div
      className={cx(
        'pointer-events-auto flex w-full max-w-sm animate-rise items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-float',
        item.tone === 'error'
          ? 'border-danger/30 bg-danger/95 text-white'
          : item.tone === 'success'
            ? 'border-positive/30 bg-surface text-ink'
            : 'border-line bg-surface text-ink',
      )}
    >
      <span
        className={cx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          item.tone === 'error' ? 'bg-white/20' : item.tone === 'success' ? 'bg-positive/15 text-positive' : 'bg-surface2 text-muted',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-sm">{item.message}</p>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss();
          }}
          className={cx(
            'inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium',
            item.tone === 'error' ? 'bg-white/15 text-white' : 'bg-accent/10 text-accent',
          )}
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          {item.action.label}
        </button>
      )}
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast må brukes innenfor ToastProvider');
  return ctx;
}
