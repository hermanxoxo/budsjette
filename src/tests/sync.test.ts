/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData } from '@/types';
import { reducer, type Action } from '@/state/reducer';
import { syncOnce, type RemoteStore } from '@/lib/sync/cloud';
import { mergeData } from '@/lib/sync/merge';
import { createInitialData } from '@/lib/storage';
import { KR, dataWithPeriod } from './helpers';

const USER = 'user-1';
const SYNC_KEY = 'budsjette.sync.v1';
const NOW = '2026-11-21T09:00:00.000Z';

/** Skyen i minnet, med samme revisjonsregler som Supabase-tabellen. */
function memoryStore() {
  let row: { data: string; revision: number } | null = null;
  let failNextPush = false;
  const store: RemoteStore = {
    async fetch() {
      return row ? { data: JSON.parse(row.data), revision: row.revision } : null;
    },
    async push(_user, data, expected) {
      if (failNextPush) {
        failNextPush = false;
        // Simulerer at en annen enhet skrev rett før oss.
        if (row) row = { ...row, revision: row.revision + 1 };
        return null;
      }
      if (expected === null) {
        if (row) return null;
        row = { data: JSON.stringify(data), revision: 1 };
        return 1;
      }
      if (!row || row.revision !== expected) return null;
      row = { data: JSON.stringify(data), revision: expected + 1 };
      return expected + 1;
    },
  };
  return {
    store,
    remote: () => (row ? (JSON.parse(row.data) as AppData) : null),
    revision: () => row?.revision ?? 0,
    conflictOnNextPush: () => {
      failNextPush = true;
    },
  };
}

/** En enhet med egne lokale data og egen synk-tilstand. */
function device(initial: AppData) {
  let data = initial;
  let syncState: string | null = null;
  return {
    get data() {
      return data;
    },
    do(action: Action) {
      data = reducer(data, action);
    },
    async sync(store: RemoteStore, mode: 'push' | 'pull' = 'pull') {
      if (syncState) localStorage.setItem(SYNC_KEY, syncState);
      else localStorage.removeItem(SYNC_KEY);
      data = await syncOnce(store, USER, data, mode);
      syncState = localStorage.getItem(SYNC_KEY);
    },
  };
}

function setup() {
  const { data, cat } = dataWithPeriod();
  return { data: { ...data, settings: { ...data.settings, onboarded: true } }, cat };
}

const expense = (categoryId: string, amount: number, sub: string, date = '2026-11-21'): Action => ({
  type: 'addTransaction',
  now: NOW,
  input: { kind: 'expense', amountOre: KR(amount), categoryId, subcategoryName: sub, date },
});

beforeEach(() => localStorage.clear());

describe('synkronisering mellom enheter', () => {
  it('laster ikke opp en tom app', async () => {
    const cloud = memoryStore();
    const fresh = device(createInitialData());
    await fresh.sync(cloud.store);
    expect(cloud.remote()).toBeNull();
  });

  it('en ny enhet uten egne data henter alt fra skyen', async () => {
    const cloud = memoryStore();
    const { data, cat } = setup();
    const phone = device(data);
    phone.do(expense(cat('mat'), 349, 'Kiwi'));
    await phone.sync(cloud.store);

    const pc = device(createInitialData());
    await pc.sync(cloud.store);

    expect(pc.data.settings.onboarded).toBe(true);
    expect(pc.data.transactions).toHaveLength(1);
    expect(pc.data.categories).toHaveLength(7);
    expect(pc.data.categories.map((c) => c.id)).toEqual(phone.data.categories.map((c) => c.id));
  });

  it('beholder føringer gjort på begge enheter uten nett', async () => {
    const cloud = memoryStore();
    const { data, cat } = setup();
    const phone = device(data);
    await phone.sync(cloud.store);
    const pc = device(createInitialData());
    await pc.sync(cloud.store);

    // Begge registrerer hver sin utgift før de synker.
    phone.do(expense(cat('mat'), 349, 'Kiwi'));
    pc.do(expense(cat('transport'), 599, 'Bensin'));

    await phone.sync(cloud.store, 'push');
    await pc.sync(cloud.store, 'push');
    await phone.sync(cloud.store);

    const amounts = (d: AppData) => d.transactions.map((t) => t.amountOre).sort((a, b) => a - b);
    expect(amounts(phone.data)).toEqual([KR(349), KR(599)]);
    expect(amounts(pc.data)).toEqual([KR(349), KR(599)]);
    expect(amounts(cloud.remote()!)).toEqual([KR(349), KR(599)]);
  });

  it('sletting på én enhet slår gjennom på den andre', async () => {
    const cloud = memoryStore();
    const { data, cat } = setup();
    const phone = device(data);
    phone.do(expense(cat('mat'), 349, 'Kiwi'));
    phone.do(expense(cat('mat'), 120, 'Rema 1000'));
    await phone.sync(cloud.store);
    const pc = device(createInitialData());
    await pc.sync(cloud.store);

    const kiwi = pc.data.transactions.find((t) => t.subcategoryName === 'Kiwi')!;
    pc.do({ type: 'deleteTransaction', id: kiwi.id });
    await pc.sync(cloud.store, 'push');
    await phone.sync(cloud.store);

    expect(phone.data.transactions.map((t) => t.subcategoryName)).toEqual(['Rema 1000']);
  });

  it('en endring vinner over en sletting av samme føring', async () => {
    const cloud = memoryStore();
    const { data, cat } = setup();
    const phone = device(data);
    phone.do(expense(cat('mat'), 349, 'Kiwi'));
    await phone.sync(cloud.store);
    const pc = device(createInitialData());
    await pc.sync(cloud.store);
    const id = phone.data.transactions[0].id;

    phone.do({ type: 'deleteTransaction', id });
    pc.do({ type: 'updateTransaction', id, patch: { amountOre: KR(400) }, now: '2026-11-21T10:00:00.000Z' });

    await phone.sync(cloud.store, 'push');
    await pc.sync(cloud.store, 'push');
    await phone.sync(cloud.store);

    expect(phone.data.transactions).toHaveLength(1);
    expect(phone.data.transactions[0].amountOre).toBe(KR(400));
  });

  it('samme faste utgift bokført på begge enheter blir bare én føring', async () => {
    const cloud = memoryStore();
    const { data, cat } = setup();
    const phone = device(data);
    await phone.sync(cloud.store);
    const pc = device(createInitialData());
    await pc.sync(cloud.store);

    const rent = (now: string): Action => ({
      type: 'addTransaction',
      now,
      input: {
        kind: 'expense',
        amountOre: KR(12000),
        categoryId: cat('bolig'),
        subcategoryName: 'Husleie',
        date: '2026-11-20',
        recurringId: 'rec-1',
        occurrenceKey: 'rec-1:2026-11-20',
      },
    });
    phone.do(rent('2026-11-20T07:00:00.000Z'));
    pc.do(rent('2026-11-20T07:05:00.000Z'));

    await phone.sync(cloud.store, 'push');
    await pc.sync(cloud.store, 'push');
    await phone.sync(cloud.store);

    expect(phone.data.transactions).toHaveLength(1);
    expect(pc.data.transactions).toHaveLength(1);
  });

  it('kobler sammen to enheter som har vært brukt hver for seg', async () => {
    const cloud = memoryStore();
    const phoneSetup = setup();
    const phone = device(phoneSetup.data);
    phone.do(expense(phoneSetup.cat('mat'), 349, 'Kiwi'));
    await phone.sync(cloud.store);

    // PC-en har egen onboarding med egne kategori- og periode-ID-er.
    const pcSetup = setup();
    const pc = device(pcSetup.data);
    pc.do(expense(pcSetup.cat('mat'), 99, 'Kiwi', '2026-11-22'));
    await pc.sync(cloud.store);

    expect(pc.data.categories).toHaveLength(7);
    expect(pc.data.periods).toHaveLength(1);
    const matId = phone.data.categories.find((c) => c.coreKey === 'mat')!.id;
    expect(pc.data.transactions).toHaveLength(2);
    expect(pc.data.transactions.every((t) => t.categoryId === matId)).toBe(true);
    expect(pc.data.transactions.every((t) => t.periodId === phone.data.periods[0].id)).toBe(true);
    const kiwis = pc.data.subcategories.filter((s) => s.categoryId === matId && s.name === 'Kiwi');
    expect(kiwis).toHaveLength(1);
  });

  it('prøver igjen når en annen enhet skrev samtidig', async () => {
    const cloud = memoryStore();
    const { data, cat } = setup();
    const phone = device(data);
    await phone.sync(cloud.store);

    phone.do(expense(cat('mat'), 349, 'Kiwi'));
    cloud.conflictOnNextPush();
    await phone.sync(cloud.store, 'push');

    expect(cloud.remote()!.transactions).toHaveLength(1);
    expect(cloud.revision()).toBe(3);
  });

  it('hopper over nettverket ved push når ingenting er endret', async () => {
    const cloud = memoryStore();
    const { data } = setup();
    const phone = device(data);
    await phone.sync(cloud.store);
    let calls = 0;
    const counting: RemoteStore = {
      fetch: (u) => {
        calls += 1;
        return cloud.store.fetch(u);
      },
      push: cloud.store.push,
    };
    await phone.sync(counting, 'push');
    expect(calls).toBe(0);
  });

  it('innstillinger endret ett sted vinner over uendrede', () => {
    const { data } = setup();
    const local = { ...data, settings: { ...data.settings, payday: 25 } };
    const remote = { ...data, settings: { ...data.settings, theme: 'dark' as const } };
    const merged = mergeData(data, local, remote);
    expect(merged.settings.payday).toBe(25);
    expect(merged.settings.theme).toBe('dark');
  });
});
