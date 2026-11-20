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
import type { AppData } from '@/types';
import {
  clearSyncState,
  cloudConfigured,
  getClient,
  loadSyncState,
  supabaseStore,
  syncOnce,
} from '@/lib/sync/cloud';
import { mergeData, sameContent } from '@/lib/sync/merge';
import { useAppStore } from './AppStore';

export type SyncStatus = 'disabled' | 'signedOut' | 'syncing' | 'synced' | 'offline' | 'error';

interface CloudSyncValue {
  configured: boolean;
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => void;
}

const CloudSyncContext = createContext<CloudSyncValue | null>(null);

/** Venter litt etter siste endring før opplasting, så raske endringer samles. */
const PUSH_DEBOUNCE_MS = 1500;
/** Hent endringer fra andre enheter jevnlig mens appen er åpen. */
const PULL_INTERVAL_MS = 60_000;

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Feil e-post eller passord.';
  if (/email not confirmed/i.test(message)) return 'E-postadressen er ikke bekreftet ennå.';
  if (/failed to fetch|network/i.test(message)) return 'Får ikke kontakt med serveren. Sjekk nettet.';
  return message;
}

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { data, dispatch, status: loadStatus } = useAppStore();

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>(cloudConfigured ? 'signedOut' : 'disabled');
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const latest = useRef<AppData>(data);
  latest.current = data;
  const running = useRef(false);
  const queued = useRef<'push' | 'pull' | null>(null);

  /* ---------- Innlogging ---------- */
  useEffect(() => {
    if (!cloudConfigured) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    getClient()
      .then(async (client) => {
        const { data: session } = await client.auth.getSession();
        if (cancelled) return;
        const user = session.session?.user ?? null;
        setUserId(user?.id ?? null);
        setEmail(user?.email ?? null);
        if (user) setLastSyncedAt(loadSyncState(user.id)?.syncedAt ?? null);

        const sub = client.auth.onAuthStateChange((_event, next) => {
          const u = next?.user ?? null;
          setUserId(u?.id ?? null);
          setEmail(u?.email ?? null);
          if (!u) setStatus('signedOut');
        });
        unsubscribe = () => sub.data.subscription.unsubscribe();
      })
      .catch(() => {
        if (!cancelled) setStatus('offline');
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  /* ---------- Synk ---------- */
  const run = useCallback(
    async (mode: 'push' | 'pull') => {
      if (!userId || loadStatus !== 'ready') return;
      if (running.current) {
        // Kjør én gang til etterpå. «pull» er sterkest siden den alltid spør skyen.
        queued.current = queued.current === 'pull' || mode === 'pull' ? 'pull' : 'push';
        return;
      }
      running.current = true;
      try {
        const snapshot = latest.current;
        const stateBefore = loadSyncState(userId);
        const needsNetwork = mode === 'pull' || !stateBefore || !sameContent(snapshot, stateBefore.base);
        if (needsNetwork) setStatus('syncing');

        const client = await getClient();
        const result = await syncOnce(supabaseStore(client), userId, snapshot, mode);

        // Har brukeren gjort endringer mens synken pågikk, legges de oppå resultatet.
        const current = latest.current;
        const final = current === snapshot ? result : mergeData(snapshot, current, result);
        if (!sameContent(final, current)) dispatch({ type: 'hydrate', data: final });

        setError(null);
        setStatus('synced');
        setLastSyncedAt(loadSyncState(userId)?.syncedAt ?? new Date().toISOString());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Synkronisering feilet.';
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setStatus(offline ? 'offline' : 'error');
        setError(offline ? null : friendlyAuthError(message));
      } finally {
        running.current = false;
        const next = queued.current;
        queued.current = null;
        if (next) void run(next);
      }
    },
    [userId, loadStatus, dispatch],
  );

  /* Hent ved innlogging og når appen er klar. */
  useEffect(() => {
    if (userId && loadStatus === 'ready') void run('pull');
  }, [userId, loadStatus, run]);

  /* Last opp etter endringer. */
  useEffect(() => {
    if (!userId || loadStatus !== 'ready') return;
    const timer = setTimeout(() => void run('push'), PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [data, userId, loadStatus, run]);

  /* Hent når appen kommer i forgrunnen, når nettet er tilbake, og jevnlig. */
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run('pull');
      else void run('push'); // på vei i bakgrunnen: få med siste endring
    };
    const onOnline = () => void run('pull');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void run('pull');
    }, PULL_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      clearInterval(interval);
    };
  }, [userId, run]);

  const signIn = useCallback(async (mail: string, password: string) => {
    const client = await getClient();
    const { data: res, error: err } = await client.auth.signInWithPassword({
      email: mail.trim(),
      password,
    });
    if (err) throw new Error(friendlyAuthError(err.message));
    setUserId(res.user?.id ?? null);
    setEmail(res.user?.email ?? null);
  }, []);

  const signOut = useCallback(async () => {
    const client = await getClient();
    await client.auth.signOut();
    clearSyncState();
    setUserId(null);
    setEmail(null);
    setLastSyncedAt(null);
    setError(null);
    setStatus('signedOut');
  }, []);

  const syncNow = useCallback(() => void run('pull'), [run]);

  const value = useMemo<CloudSyncValue>(
    () => ({
      configured: cloudConfigured,
      status: userId ? (status === 'signedOut' ? 'syncing' : status) : cloudConfigured ? 'signedOut' : 'disabled',
      email,
      lastSyncedAt,
      error,
      signIn,
      signOut,
      syncNow,
    }),
    [status, userId, email, lastSyncedAt, error, signIn, signOut, syncNow],
  );

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}

const DISABLED: CloudSyncValue = {
  configured: false,
  status: 'disabled',
  email: null,
  lastSyncedAt: null,
  error: null,
  signIn: () => Promise.reject(new Error('Synkronisering er ikke satt opp.')),
  signOut: () => Promise.resolve(),
  syncNow: () => undefined,
};

/** Uten provider (f.eks. i tester) oppfører appen seg som om synk ikke er satt opp. */
export function useCloudSync(): CloudSyncValue {
  return useContext(CloudSyncContext) ?? DISABLED;
}
