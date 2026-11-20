import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppData } from '@/types';
import { migrate } from '@/lib/storage';
import { hasUserContent, mergeData, sameContent } from './merge';

/**
 * Synkronisering mot Supabase.
 *
 * Hele datadokumentet ligger i én rad per bruker i tabellen `budsjette_state`,
 * beskyttet av Row Level Security. Hver skriving øker `revision`, og en skriving
 * godtas bare hvis revisjonen er den enheten sist så. Slik oppdages det når en
 * annen enhet har skrevet i mellomtiden, og da slås endringene sammen først.
 *
 * Nøklene er offentlige (URL + publishable/anon key) og hører hjemme i frontend.
 * Tilgangen styres av innlogging og RLS, ikke av at nøkkelen er hemmelig.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudConfigured = Boolean(URL && KEY);

const TABLE = 'budsjette_state';
const SYNC_STATE_KEY = 'budsjette.sync.v1';

let clientPromise: Promise<SupabaseClient> | null = null;

/** Biblioteket lastes først når synk faktisk brukes, så appen starter like raskt. */
export function getClient(): Promise<SupabaseClient> {
  if (!cloudConfigured) return Promise.reject(new Error('Synkronisering er ikke satt opp.'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL as string, KEY as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'budsjette.auth',
      },
    }),
  );
  return clientPromise;
}

/* ---------- Lokal synk-tilstand ---------- */

export interface SyncState {
  userId: string;
  /** Revisjonen i skyen da denne enheten sist var i synk. */
  revision: number;
  /** Dataene slik de var da – grunnlaget for treveis sammenslåing. */
  base: AppData;
  syncedAt: string;
}

export function loadSyncState(userId: string): SyncState | null {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncState;
    if (parsed.userId !== userId) return null;
    return { ...parsed, base: migrate(parsed.base) };
  } catch {
    return null;
  }
}

function saveSyncState(state: SyncState): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  } catch {
    /* Full lagring: neste synk gjør en full sammenslåing i stedet. */
  }
}

export function clearSyncState(): void {
  try {
    localStorage.removeItem(SYNC_STATE_KEY);
  } catch {
    /* ignorer */
  }
}

/* ---------- Skyen ---------- */

export interface RemoteStore {
  fetch(userId: string): Promise<{ data: unknown; revision: number } | null>;
  /** Returnerer ny revisjon, eller null hvis noen andre har skrevet i mellomtiden. */
  push(userId: string, data: AppData, expectedRevision: number | null): Promise<number | null>;
}

export function supabaseStore(client: SupabaseClient): RemoteStore {
  return {
    async fetch(userId) {
      const { data, error } = await client
        .from(TABLE)
        .select('data, revision')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { data: data.data as unknown, revision: Number(data.revision) } : null;
    },

    async push(userId, data, expectedRevision) {
      if (expectedRevision === null) {
        const { error } = await client.from(TABLE).insert({ user_id: userId, data, revision: 1 });
        if (error) {
          if (error.code === '23505') return null; // en annen enhet rakk å opprette raden først
          throw new Error(error.message);
        }
        return 1;
      }
      const next = expectedRevision + 1;
      const { data: rows, error } = await client
        .from(TABLE)
        .update({ data, revision: next, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('revision', expectedRevision)
        .select('revision');
      if (error) throw new Error(error.message);
      return rows && rows.length > 0 ? next : null;
    },
  };
}

/* ---------- Selve synken ---------- */

const MAX_ATTEMPTS = 4;

/**
 * Synkroniserer et øyeblikksbilde av de lokale dataene med skyen og returnerer
 * resultatet. Kaster ved nettverks- eller tilgangsfeil.
 *
 * `mode: 'push'` hopper over nettverkskallet når ingenting er endret lokalt
 * siden forrige synk.
 */
export async function syncOnce(
  store: RemoteStore,
  userId: string,
  local: AppData,
  mode: 'push' | 'pull' = 'pull',
): Promise<AppData> {
  const state = loadSyncState(userId);
  if (mode === 'push' && state && sameContent(local, state.base)) return local;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const remote = await store.fetch(userId);

    let next: AppData;
    let expected: number | null;

    if (!remote) {
      // Ingenting i skyen ennå. Last ikke opp en tom app.
      if (!hasUserContent(local)) return local;
      next = local;
      expected = null;
    } else {
      const remoteData = migrate(remote.data);
      next =
        state && state.revision === remote.revision
          ? local // ingen andre har skrevet siden sist
          : mergeData(state?.base ?? null, local, remoteData);
      expected = remote.revision;

      if (sameContent(next, remoteData)) {
        saveSyncState({ userId, revision: remote.revision, base: remoteData, syncedAt: new Date().toISOString() });
        return next;
      }
    }

    const revision = await store.push(userId, next, expected);
    if (revision !== null) {
      saveSyncState({ userId, revision, base: next, syncedAt: new Date().toISOString() });
      return next;
    }
    // Noen andre skrev samtidig – prøv igjen med ferske data fra skyen.
  }
  throw new Error('Kunne ikke synkronisere fordi en annen enhet skrev samtidig. Prøv igjen.');
}
