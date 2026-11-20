import type { AppData, BudgetPeriod, Subcategory, Transaction } from '@/types';
import { APP_VERSION, SCHEMA_VERSION } from '@/lib/storage';
import { findPeriodForDate } from '@/lib/periods';

/**
 * Treveis sammenslåing av to versjoner av dataene.
 *
 *  base   – siste versjon denne enheten og skyen var enige om
 *  local  – det som ligger på denne enheten nå
 *  remote – det som ligger i skyen nå
 *
 * For hver entitet (transaksjon, kategori, periode …), identifisert med id:
 *  - Endret bare ett sted → den endringen vinner.
 *  - Endret begge steder → nyeste `updatedAt` vinner, ellers denne enheten.
 *  - Slettet ett sted og urørt det andre → slettes.
 *  - Slettet ett sted og endret det andre → endringen beholdes (ingenting forsvinner i stillhet).
 *
 * Uten base (første synk på en enhet) slås alt sammen som en union.
 */

type Entity = { id: string };
type CollectionKey = 'categories' | 'subcategories' | 'periods' | 'transactions' | 'recurring' | 'favorites';

const COLLECTIONS: CollectionKey[] = [
  'categories',
  'subcategories',
  'periods',
  'transactions',
  'recurring',
  'favorites',
];

/** JSON med sorterte nøkler – gir stabil sammenligning uavhengig av nøkkelrekkefølge. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    }
    return val;
  });
}

function same(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** Innholdet som betyr noe for brukeren – uten tidsstempelet for siste lagring. */
export function contentOf(data: AppData): unknown {
  const { meta, ...rest } = data;
  return { ...rest, meta: { createdAt: meta.createdAt } };
}

export function sameContent(a: AppData, b: AppData): boolean {
  return same(contentOf(a), contentOf(b));
}

function updatedAtOf(item: Entity): string {
  const rec = item as { updatedAt?: string; createdAt?: string };
  return rec.updatedAt ?? '';
}

function mergeCollection<T extends Entity>(base: T[] | null, local: T[], remote: T[]): T[] {
  const baseMap = new Map((base ?? []).map((x) => [x.id, x]));
  const localMap = new Map(local.map((x) => [x.id, x]));
  const remoteMap = new Map(remote.map((x) => [x.id, x]));

  // Lokal rekkefølge først, deretter det som bare finnes i skyen.
  const ids = [...localMap.keys(), ...[...remoteMap.keys()].filter((id) => !localMap.has(id))];
  const result: T[] = [];

  for (const id of ids) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);

    if (l && r) {
      if (same(l, r)) result.push(l);
      else if (b && same(b, l)) result.push(r); // bare skyen har endret
      else if (b && same(b, r)) result.push(l); // bare denne enheten har endret
      else result.push(updatedAtOf(r) > updatedAtOf(l) ? r : l); // begge – nyeste vinner
      continue;
    }

    const only = (l ?? r) as T;
    if (!b) {
      result.push(only); // ny et av stedene
      continue;
    }
    // Fantes i base, men er borte på den ene siden = slettet der.
    // Slett bare hvis den andre siden ikke har endret den siden.
    if (!same(b, only)) result.push(only);
  }
  return result;
}

function mergeSettings(base: AppData | null, local: AppData, remote: AppData): AppData['settings'] {
  const keys = new Set([
    ...Object.keys(local.settings),
    ...Object.keys(remote.settings),
  ]) as Set<keyof AppData['settings']>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const l = local.settings[key];
    const r = remote.settings[key];
    if (!base) {
      out[key] = l !== undefined ? l : r;
      continue;
    }
    const b = base.settings[key];
    out[key] = same(l, b) ? r : l;
  }
  const settings = out as unknown as AppData['settings'];
  // Er appen satt opp ett av stedene, er den satt opp.
  settings.onboarded = local.settings.onboarded || remote.settings.onboarded;
  return settings;
}

/** Har brukeren faktisk lagt inn noe på denne enheten? */
export function hasUserContent(data: AppData): boolean {
  return (
    data.settings.onboarded ||
    data.transactions.length > 0 ||
    data.recurring.length > 0 ||
    data.favorites.length > 0
  );
}

/**
 * Første synk på en enhet som allerede har egne data: kobler denne enhetens
 * kategorier og perioder til skyens, slik at sammenslåingen ikke gir doble
 * hovedkategorier eller overlappende perioder.
 *
 *  - Hovedkategorier kobles på `coreKey`, egne kategorier på navn.
 *  - Lokale perioder som overlapper en periode i skyen, erstattes av skyens.
 *    Transaksjonene flyttes til skyperioden som dekker datoen deres.
 */
export function alignToRemote(local: AppData, remote: AppData): AppData {
  const catMap = new Map<string, string>();
  for (const c of local.categories) {
    const match =
      (c.coreKey && remote.categories.find((r) => r.coreKey === c.coreKey)) ||
      remote.categories.find((r) => !r.coreKey && !c.coreKey && r.name.toLowerCase() === c.name.toLowerCase());
    if (match) catMap.set(c.id, match.id);
  }
  const cat = (id: string | null) => (id && catMap.get(id)) ?? id;

  const overlaps = (a: BudgetPeriod, b: BudgetPeriod) => a.startDate <= b.endDate && b.startDate <= a.endDate;
  const droppedPeriods = new Set(
    local.periods.filter((p) => remote.periods.some((r) => overlaps(p, r))).map((p) => p.id),
  );
  const keptPeriods = local.periods
    .filter((p) => !droppedPeriods.has(p.id))
    .map((p) => ({ ...p, allocations: p.allocations.map((a) => ({ ...a, categoryId: cat(a.categoryId) as string })) }));
  const allPeriods = [...remote.periods, ...keptPeriods];

  return {
    ...local,
    // Skyen har innstillingene som allerede er i bruk.
    settings: { ...remote.settings, onboarded: true },
    categories: local.categories.filter((c) => !catMap.has(c.id)),
    subcategories: local.subcategories.map((s) => ({ ...s, categoryId: cat(s.categoryId) as string })),
    periods: keptPeriods,
    transactions: local.transactions.map((t) => {
      const periodId = droppedPeriods.has(t.periodId)
        ? (findPeriodForDate(allPeriods, t.date)?.id ?? t.periodId)
        : t.periodId;
      return { ...t, categoryId: cat(t.categoryId), periodId };
    }),
    recurring: local.recurring.map((r) => ({ ...r, categoryId: cat(r.categoryId) })),
    favorites: local.favorites.map((f) => ({ ...f, categoryId: cat(f.categoryId) })),
  };
}

export function mergeData(base: AppData | null, local: AppData, remote: AppData): AppData {
  if (!base) {
    // Ny enhet uten egne data: ta skyens data som de er.
    if (!hasUserContent(local)) return remote;
    local = alignToRemote(local, remote);
  }
  const merged = {
    schemaVersion: SCHEMA_VERSION,
    settings: mergeSettings(base, local, remote),
    meta: {
      createdAt:
        local.meta.createdAt < remote.meta.createdAt ? local.meta.createdAt : remote.meta.createdAt,
      updatedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
    },
  } as AppData;

  for (const key of COLLECTIONS) {
    (merged as unknown as Record<CollectionKey, Entity[]>)[key] = mergeCollection(
      base ? (base[key] as Entity[]) : null,
      local[key] as Entity[],
      remote[key] as Entity[],
    );
  }
  return reconcile(merged);
}

/**
 * Rydder opp i ting som kan oppstå når to enheter jobber hver for seg:
 *  - Samme faste utgift bokført på begge enheter → behold én.
 *  - Samme underkategori opprettet på begge → behold én.
 *  - To aktive perioder → den nyeste er aktiv, den eldre avsluttes.
 */
export function reconcile(data: AppData): AppData {
  /* Faste utgifter: occurrenceKey skal være unik. */
  const seenOccurrence = new Map<string, Transaction>();
  const duplicates = new Set<string>();
  for (const t of data.transactions) {
    if (!t.occurrenceKey) continue;
    const existing = seenOccurrence.get(t.occurrenceKey);
    if (!existing) {
      seenOccurrence.set(t.occurrenceKey, t);
    } else {
      // Behold den som ble laget først; den andre er en dublett.
      const loser = existing.createdAt <= t.createdAt ? t : existing;
      duplicates.add(loser.id);
      if (loser === existing) seenOccurrence.set(t.occurrenceKey, t);
    }
  }
  const transactions = duplicates.size
    ? data.transactions.filter((t) => !duplicates.has(t.id))
    : data.transactions;

  /* Underkategorier: unik per kategori og navn (uavhengig av store/små bokstaver). */
  const subByKey = new Map<string, Subcategory>();
  for (const s of data.subcategories) {
    const key = `${s.categoryId}::${s.name.toLowerCase()}`;
    const existing = subByKey.get(key);
    if (!existing) {
      subByKey.set(key, s);
    } else {
      subByKey.set(key, {
        ...existing,
        useCount: Math.max(existing.useCount, s.useCount),
        lastUsedAt:
          (s.lastUsedAt ?? '') > (existing.lastUsedAt ?? '') ? s.lastUsedAt : existing.lastUsedAt,
        source: existing.source === 'user' || s.source === 'user' ? 'user' : 'seed',
      });
    }
  }
  const subcategories =
    subByKey.size === data.subcategories.length ? data.subcategories : [...subByKey.values()];

  /* Perioder: høyst én aktiv. */
  let periods: BudgetPeriod[] = data.periods;
  const active = data.periods.filter((p) => p.status === 'active');
  if (active.length > 1) {
    const newest = active.reduce((a, b) => (b.startDate > a.startDate ? b : a));
    periods = data.periods.map((p) =>
      p.status === 'active' && p.id !== newest.id
        ? { ...p, status: 'closed' as const, closedAt: p.closedAt ?? new Date().toISOString() }
        : p,
    );
  }

  return { ...data, transactions, subcategories, periods };
}
