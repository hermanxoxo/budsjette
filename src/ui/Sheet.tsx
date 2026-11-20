import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx, IconButton } from './primitives';

/** Åpne ark i den rekkefølgen de ble åpnet. Bare det øverste reagerer på tastatur. */
const openSheets: object[] = [];

/**
 * Modal som legger seg som et ark nederst på mobil og sentrert på større skjermer.
 * Håndterer Escape, klikk utenfor, scroll-lås og enkel fokusfangst.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel = 'Lukk',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  closeLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const token = useRef({});
  // onClose er ofte en ny funksjon ved hver rendring. Ved å lese den via en ref
  // kjøres åpne-effekten bare når `open` endres, så fokus og rekkefølge står stille.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (openSheets[openSheets.length - 1] !== token.current) return;
      if (event.key === 'Escape') {
        // Felt som selv håndterer Escape (f.eks. avbryt redigering) skal ikke lukke arket.
        if ((event.target as HTMLElement | null)?.closest?.('[data-escape-local]')) return;
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const self = token.current;
    openSheets.push(self);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown, true);

    // Flytt fokus inn i arket, men unngå å åpne tastaturet uoppfordret på mobil.
    const timer = setTimeout(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current;
      target?.focus({ preventScroll: true });
    }, 60);

    return () => {
      clearTimeout(timer);
      const index = openSheets.lastIndexOf(self);
      if (index !== -1) openSheets.splice(index, 1);
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused.current?.focus?.({ preventScroll: true });
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-900/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col animate-sheet-in bg-surface shadow-sheet',
          'rounded-t-3xl sm:rounded-3xl sm:max-h-[88dvh]',
          size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 pb-3 pt-3">
          <div className="min-w-0 flex-1">
            {/* Dragehåndtak – visuell indikasjon på at arket kan lukkes. */}
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line sm:hidden" aria-hidden />
            <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <IconButton icon={X} label={closeLabel} onClick={onClose} className="-mr-1 -mt-1" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>

        {footer && (
          <div className="border-t border-line bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Bekreftelsesdialog – brukes før alt som sletter eller er vanskelig å angre. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Bekreft',
  cancelLabel = 'Avbryt',
  tone = 'danger',
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      {message && <div className="text-sm leading-relaxed text-muted">{message}</div>}
      {children}
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 flex-1 rounded-xl border border-line bg-surface2 font-medium text-ink transition active:scale-[0.98]"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          data-autofocus
          onClick={onConfirm}
          className={cx(
            'h-12 flex-1 rounded-xl font-medium text-white transition active:scale-[0.98]',
            tone === 'danger' ? 'bg-danger' : 'bg-accent',
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
