import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppData, BudgetPeriod, ThemePreference } from '@/types';
import {
  LocalStorageAdapter,
  StorageWriteError,
  createInitialData,
  type StorageAdapter,
} from '@/lib/storage';
import { findActivePeriod, sortPeriods } from '@/lib/periods';
import { pendingOccurrences } from '@/lib/recurring';
import { today } from '@/lib/date';
import { reducer, type Action } from './reducer';

export type LoadStatus = 'loading' | 'ready' | 'error';
export type ResolvedTheme = 'light' | 'dark';

interface AppStoreValue {
  data: AppData;
  status: LoadStatus;
  error: string | null;
  /** Settes når lagring feiler (f.eks. full lagringskvote). */
  saveError: string | null;
  dispatch: (action: Action) => void;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  adapter: StorageAdapter;
  /** Tvinger øyeblikkelig lagring (brukes før eksport og import). */
  flush: () => Promise<void>;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

const SAVE_DEBOUNCE_MS = 400;

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** matchMedia finnes ikke i alle miljøer (eldre webviews, testmiljø). */
function darkModeQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(DARK_QUERY);
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return darkModeQuery()?.matches ?? false;
}

function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

export function AppStoreProvider({
  children,
  adapter: adapterProp,
  initialData,
}: {
  children: ReactNode;
  adapter?: StorageAdapter;
  initialData?: AppData;
}) {
  // Må være stabil mellom renders: en ny adapter ville fått innlastings-
  // og lagringseffektene til å kjøre om igjen ved hver eneste render.
  const fallbackAdapter = useRef<StorageAdapter>();
  if (!fallbackAdapter.current) fallbackAdapter.current = new LocalStorageAdapter();
  const adapter = adapterProp ?? fallbackAdapter.current;

  const [data, dispatch] = useReducer(reducer, initialData ?? createInitialData());
  const [status, setStatus] = useState<LoadStatus>(initialData ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(data);
  latest.current = data;
  const hasLoaded = useRef(Boolean(initialData));

  /* ---------- Innlasting ---------- */
  const loadStarted = useRef(false);
  useEffect(() => {
    // Lastes nøyaktig én gang. Uten denne vakten ville en adapter som bytter
    // identitet mellom renders lese inn dataene på nytt i en evig løkke.
    if (initialData || loadStarted.current) return;
    loadStarted.current = true;
    let cancelled = false;
    (async () => {
      try {
        const stored = await adapter.load();
        if (cancelled) return;
        if (stored) dispatch({ type: 'hydrate', data: stored });
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Noe gikk galt under lesing av lagrede data.',
        );
        setStatus('error');
      } finally {
        hasLoaded.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter, initialData]);

  /* ---------- Lagring (debounced) ---------- */
  useEffect(() => {
    if (status !== 'ready' || !hasLoaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      adapter
        .save(latest.current)
        .then(() => setSaveError(null))
        .catch((err) => {
          setSaveError(
            err instanceof StorageWriteError ? err.message : 'Klarte ikke lagre endringene.',
          );
        });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, adapter, status]);

  /* Lagre umiddelbart når appen sendes i bakgrunnen (viktig på mobil). */
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden' && hasLoaded.current) {
        void adapter.save(latest.current).catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [adapter]);

  /* ---------- Tema ---------- */
  useEffect(() => {
    const mq = darkModeQuery();
    if (!mq?.addEventListener) return;
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = resolveTheme(data.settings.theme, systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
    if (meta) meta.content = resolvedTheme === 'dark' ? '#0b0f14' : '#f6f7f9';
  }, [resolvedTheme]);

  /* ---------- Automatisk bokføring av faste utgifter ---------- */
  const autoPosted = useRef(false);
  useEffect(() => {
    if (status !== 'ready' || autoPosted.current) return;
    const active = findActivePeriod(data.periods);
    if (!active) return;
    autoPosted.current = true;

    const due = pendingOccurrences(data.recurring, data.transactions, today(), {
      onlyAutoPost: true,
    }).filter((o) => o.dueDate >= active.startDate);

    if (!due.length) return;
    dispatch({
      type: 'addTransactions',
      inputs: due.map((o) => ({
        kind: o.rule.kind,
        amountOre: o.rule.amountOre,
        categoryId: o.rule.categoryId,
        subcategoryName: o.rule.subcategoryName,
        date: o.dueDate,
        note: o.rule.note,
        recurringId: o.rule.id,
        occurrenceKey: o.key,
      })),
    });
  }, [status, data.periods, data.recurring, data.transactions]);

  const setTheme = useCallback((theme: ThemePreference) => {
    dispatch({ type: 'updateSettings', patch: { theme } });
  }, []);

  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await adapter.save(latest.current);
  }, [adapter]);

  const value = useMemo<AppStoreValue>(
    () => ({ data, status, error, saveError, dispatch, resolvedTheme, setTheme, adapter, flush }),
    [data, status, error, saveError, resolvedTheme, setTheme, adapter, flush],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error('useAppStore må brukes innenfor AppStoreProvider');
  return ctx;
}

export function useAppData(): AppData {
  return useAppStore().data;
}

export function useDispatch(): (action: Action) => void {
  return useAppStore().dispatch;
}

/** Aktiv periode, forrige periode og alle perioder sortert kronologisk. */
export function usePeriods(): {
  all: BudgetPeriod[];
  active?: BudgetPeriod;
  previous?: BudgetPeriod;
} {
  const data = useAppData();
  return useMemo(() => {
    const all = sortPeriods(data.periods);
    const active = findActivePeriod(all);
    const activeIndex = active ? all.findIndex((p) => p.id === active.id) : all.length;
    const previous = activeIndex > 0 ? all[activeIndex - 1] : undefined;
    return { all, active, previous };
  }, [data.periods]);
}

export function useCategory(id: string | null) {
  const data = useAppData();
  return useMemo(() => data.categories.find((c) => c.id === id), [data.categories, id]);
}
