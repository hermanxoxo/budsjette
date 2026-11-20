import type { AppData } from '@/types';
import { DEFAULT_SETTINGS, createCoreCategories, createSeedSubcategories } from './defaults';

/**
 * Lagring.
 *
 * Første versjon lagrer alt i localStorage. All tilgang går gjennom
 * `StorageAdapter`-grensesnittet, slik at en Supabase-adapter senere kan
 * byttes inn uten å røre resten av appen (se docs/supabase.md).
 */

export const STORAGE_KEY = 'budsjette.v1';
export const SCHEMA_VERSION = 1;
export const APP_VERSION = '1.0.0';

export interface StorageAdapter {
  /** Henter lagret tilstand, eller null når ingenting er lagret. */
  load(): Promise<AppData | null>;
  /** Lagrer hele tilstanden. Kalles debounced fra app-staten. */
  save(data: AppData): Promise<void>;
  /** Sletter all lagret data. */
  clear(): Promise<void>;
  /** Beskrivelse til innstillingssiden. */
  readonly label: string;
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly label = 'Denne nettleseren (localStorage)';

  constructor(private readonly key: string = STORAGE_KEY) {}

  async load(): Promise<AppData | null> {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    try {
      return migrate(JSON.parse(raw));
    } catch (error) {
      console.error('Klarte ikke lese lagrede data', error);
      // Ta vare på det ødelagte innholdet slik at ingenting går tapt i stillhet.
      try {
        localStorage.setItem(`${this.key}.corrupt.${Date.now()}`, raw);
      } catch {
        /* lagringskvoten kan være full – da må vi la det ligge */
      }
      throw new StorageReadError('Lagrede data kunne ikke leses.');
    }
  }

  async save(data: AppData): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch (error) {
      throw new StorageWriteError(
        'Klarte ikke lagre. Nettleserens lagringsplass kan være full eller blokkert (privat modus).',
        error,
      );
    }
  }

  async clear(): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(this.key);
  }
}

export class StorageReadError extends Error {}

export class StorageWriteError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
  }
}

/** Tom starttilstand for en ny bruker – ingen transaksjoner, ingen perioder. */
export function createInitialData(now = new Date().toISOString()): AppData {
  const categories = createCoreCategories();
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    categories,
    subcategories: createSeedSubcategories(categories),
    periods: [],
    transactions: [],
    recurring: [],
    favorites: [],
    meta: { createdAt: now, updatedAt: now, appVersion: APP_VERSION },
  };
}

/**
 * Migrerer lagrede data til gjeldende skjemaversjon.
 * Hver migrering skal være idempotent og aldri slette brukerdata.
 */
export function migrate(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new StorageReadError('Ugyldig dataformat.');
  let data = raw as AppData & { schemaVersion?: number };

  const version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;

  if (version > SCHEMA_VERSION) {
    // Data lagret av en nyere appversjon. Vi beholder dem urørt og leser så godt vi kan.
    console.warn('Dataene er lagret av en nyere versjon av appen.');
  }

  if (version < 1) {
    data = { ...createInitialData(), ...data, schemaVersion: 1 };
  }

  // Fremtidige migreringer legges til her:
  // if (data.schemaVersion < 2) { ...; data.schemaVersion = 2; }

  return normalize(data);
}

/** Fyller inn felter som kan mangle i eldre eller importerte data. */
export function normalize(data: AppData): AppData {
  const fallback = createInitialData(data.meta?.createdAt);
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...fallback.settings, ...(data.settings ?? {}) },
    categories: Array.isArray(data.categories) && data.categories.length ? data.categories : fallback.categories,
    subcategories: Array.isArray(data.subcategories) ? data.subcategories : [],
    periods: Array.isArray(data.periods) ? data.periods : [],
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    recurring: Array.isArray(data.recurring)
      ? data.recurring.map((r) => ({ ...r, skipped: Array.isArray(r.skipped) ? r.skipped : [] }))
      : [],
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    meta: {
      createdAt: data.meta?.createdAt ?? fallback.meta.createdAt,
      updatedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
    },
  };
}

/** Grovt estimat på hvor mye plass dataene bruker – vises i innstillinger. */
export function estimateStorageBytes(data: AppData): number {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    return JSON.stringify(data).length;
  }
}
