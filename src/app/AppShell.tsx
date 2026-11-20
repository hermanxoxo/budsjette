import type { ReactNode } from 'react';
import { BarChart3, Home, Plus, Receipt, Wallet } from 'lucide-react';
import { cx } from '@/ui/primitives';
import type { Route } from './router';

const TABS: { route: Route; label: string; icon: typeof Home }[] = [
  { route: 'oversikt', label: 'Oversikt', icon: Home },
  { route: 'historikk', label: 'Historikk', icon: Receipt },
  { route: 'analyse', label: 'Analyse', icon: BarChart3 },
  { route: 'budsjett', label: 'Budsjett', icon: Wallet },
];

/**
 * App-skall: innhold + bunnmeny + flytende registreringsknapp.
 * Bunnmenyen respekterer safe area på iPhone og har store trykkflater.
 */
export function AppShell({
  route,
  onNavigate,
  onAdd,
  children,
  showAddButton = true,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  onAdd: () => void;
  children: ReactNode;
  showAddButton?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col">
      <main className="flex-1 pb-nav">{children}</main>

      {showAddButton && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Registrer ny utgift"
          className="fixed bottom-[calc(4.9rem+env(safe-area-inset-bottom,0px))] right-4 z-30 flex h-15 w-15 items-center justify-center rounded-full bg-accent text-white shadow-float transition active:scale-95 sm:right-[max(1rem,calc(50%-19rem))]"
          style={{ height: '3.75rem', width: '3.75rem' }}
        >
          <Plus className="h-7 w-7" aria-hidden />
        </button>
      )}

      <nav
        aria-label="Hovedmeny"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 backdrop-blur-xl"
      >
        <div className="mx-auto flex w-full max-w-2xl items-stretch justify-around px-1 pb-safe">
          {TABS.map((tab) => {
            const active = tab.route === route;
            const Icon = tab.icon;
            return (
              <button
                key={tab.route}
                type="button"
                onClick={() => onNavigate(tab.route)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[0.68rem] font-medium transition',
                  active ? 'text-accent' : 'text-muted active:text-ink',
                )}
              >
                <Icon
                  className={cx('h-[1.35rem] w-[1.35rem] transition-transform', active && 'scale-110')}
                  strokeWidth={active ? 2.3 : 1.9}
                  aria-hidden
                />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Felles sideheader med tittel, undertittel og valgfrie handlinger. */
export function PageHeader({
  title,
  subtitle,
  action,
  sticky = true,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  sticky?: boolean;
}) {
  return (
    <header
      className={cx(
        'z-10 bg-bg/85 px-4 pb-3 pt-[calc(0.9rem+env(safe-area-inset-top,0px))] backdrop-blur-xl',
        sticky && 'sticky top-0',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[1.35rem] font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <div className="mt-0.5 text-[0.82rem] text-muted">{subtitle}</div>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      </div>
    </header>
  );
}
