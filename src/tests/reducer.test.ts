import { describe, expect, it } from 'vitest';
import type { AppData } from '@/types';
import { reducer } from '@/state/reducer';
import { periodTotals, allocationFor } from '@/lib/calc';
import { KR, dataWithPeriod } from './helpers';

const NOW = '2026-11-21T09:00:00.000Z';

describe('registrering av utgift', () => {
  it('legger til transaksjonen i riktig periode', () => {
    const { data, period, cat } = dataWithPeriod();

    const next = reducer(data, {
      type: 'addTransaction',
      now: NOW,
      input: {
        kind: 'expense',
        amountOre: KR(349),
        categoryId: cat('mat'),
        subcategoryName: 'Kiwi',
        date: '2026-11-21',
      },
    });

    expect(next.transactions).toHaveLength(1);
    expect(next.transactions[0].periodId).toBe(period.id);
    expect(next.transactions[0].amountOre).toBe(KR(349));
    expect(periodTotals(period, next.transactions).expenseOre).toBe(KR(349));
  });

  it('lærer underkategorien og teller bruken', () => {
    const { data, cat } = dataWithPeriod();
    const input = {
      kind: 'expense' as const,
      amountOre: KR(100),
      categoryId: cat('mat'),
      subcategoryName: 'Kiwi',
      date: '2026-11-21',
    };

    const once = reducer(data, { type: 'addTransaction', now: NOW, input });
    const twice = reducer(once, { type: 'addTransaction', now: NOW, input });

    const kiwi = twice.subcategories.find(
      (s) => s.categoryId === cat('mat') && s.name === 'Kiwi',
    );
    expect(kiwi?.useCount).toBe(2);
    expect(kiwi?.source).toBe('seed');
    expect(twice.settings.lastUsed).toEqual({ categoryId: cat('mat'), subcategoryName: 'Kiwi' });
  });

  it('oppretter nye underkategorier fra brukerens egne navn', () => {
    const { data, cat } = dataWithPeriod();
    const next = reducer(data, {
      type: 'addTransaction',
      now: NOW,
      input: {
        kind: 'expense',
        amountOre: KR(250),
        categoryId: cat('mat'),
        subcategoryName: '  joker  ',
        date: '2026-11-21',
      },
    });

    const created = next.subcategories.find((s) => s.name === 'joker');
    expect(created?.source).toBe('user');
    expect(next.transactions[0].subcategoryName).toBe('joker');
  });

  it('lagrer alltid beløpet som positivt heltall', () => {
    const { data, cat } = dataWithPeriod();
    const next = reducer(data, {
      type: 'addTransaction',
      now: NOW,
      input: {
        kind: 'expense',
        amountOre: -KR(100),
        categoryId: cat('mat'),
        subcategoryName: null,
        date: '2026-11-21',
      },
    });
    expect(next.transactions[0].amountOre).toBe(KR(100));
  });
});

describe('redigering og sletting', () => {
  function withTransaction(): { state: AppData; id: string; cat: (key: string) => string } {
    const { data, cat } = dataWithPeriod();
    const state = reducer(data, {
      type: 'addTransaction',
      now: NOW,
      input: {
        kind: 'expense',
        amountOre: KR(349),
        categoryId: cat('mat'),
        subcategoryName: 'Kiwi',
        date: '2026-11-21',
      },
    });
    return { state, id: state.transactions[0].id, cat };
  }

  it('oppdaterer beløp og kategori', () => {
    const { state, id, cat } = withTransaction();
    const next = reducer(state, {
      type: 'updateTransaction',
      id,
      now: NOW,
      patch: { amountOre: KR(400), categoryId: cat('transport'), subcategoryName: 'Bensin' },
    });

    expect(next.transactions[0].amountOre).toBe(KR(400));
    expect(next.transactions[0].categoryId).toBe(cat('transport'));
    expect(next.transactions[0].subcategoryName).toBe('Bensin');
  });

  it('flytter transaksjonen når datoen havner i en annen periode', () => {
    const { data, cat } = dataWithPeriod();
    const second = reducer(data, {
      type: 'startNewPeriod',
      now: NOW,
      input: { startDate: '2026-12-20', netSalaryOre: KR(45000), allocations: [] },
    });
    const withTx = reducer(second, {
      type: 'addTransaction',
      now: NOW,
      input: {
        kind: 'expense',
        amountOre: KR(100),
        categoryId: cat('mat'),
        subcategoryName: null,
        date: '2026-12-21',
      },
    });
    const newPeriodId = withTx.periods[1].id;
    expect(withTx.transactions[0].periodId).toBe(newPeriodId);

    const moved = reducer(withTx, {
      type: 'updateTransaction',
      id: withTx.transactions[0].id,
      now: NOW,
      patch: { date: '2026-11-25' },
    });
    expect(moved.transactions[0].periodId).toBe(withTx.periods[0].id);
  });

  it('sletter transaksjonen', () => {
    const { state, id } = withTransaction();
    const next = reducer(state, { type: 'deleteTransaction', id });
    expect(next.transactions).toHaveLength(0);
  });

  it('ignorerer oppdatering av ukjent id', () => {
    const { state } = withTransaction();
    expect(reducer(state, { type: 'updateTransaction', id: 'finnes-ikke', patch: {} })).toBe(state);
  });
});

describe('budsjett', () => {
  it('setter budsjett per kategori', () => {
    const { data, period, cat } = dataWithPeriod();
    const next = reducer(data, {
      type: 'setAllocation',
      periodId: period.id,
      categoryId: cat('klaer'),
      amountOre: KR(2000),
    });
    expect(allocationFor(next.periods[0], cat('klaer'))).toBe(KR(2000));
  });

  it('avviser negative budsjetter', () => {
    const { data, period, cat } = dataWithPeriod();
    const next = reducer(data, {
      type: 'setAllocation',
      periodId: period.id,
      categoryId: cat('mat'),
      amountOre: -KR(500),
    });
    expect(allocationFor(next.periods[0], cat('mat'))).toBe(0);
  });

  it('endrer nettolønn for perioden uten å røre standardlønnen', () => {
    const { data, period } = dataWithPeriod();
    const next = reducer(data, {
      type: 'setPeriodSalary',
      periodId: period.id,
      amountOre: KR(52000),
    });
    expect(next.periods[0].netSalaryOre).toBe(KR(52000));
    expect(next.settings.defaultNetSalaryOre).toBe(data.settings.defaultNetSalaryOre);
  });
});

describe('ny lønnsperiode', () => {
  it('arkiverer forrige periode og beholder historikken', () => {
    const { data, cat } = dataWithPeriod();
    const withTx = reducer(data, {
      type: 'addTransaction',
      now: NOW,
      input: {
        kind: 'expense',
        amountOre: KR(1000),
        categoryId: cat('mat'),
        subcategoryName: 'Kiwi',
        date: '2026-11-25',
      },
    });

    const next = reducer(withTx, {
      type: 'startNewPeriod',
      now: NOW,
      input: {
        startDate: '2026-12-20',
        netSalaryOre: KR(47000),
        allocations: withTx.periods[0].allocations,
      },
    });

    expect(next.periods).toHaveLength(2);
    expect(next.periods[0].status).toBe('closed');
    expect(next.periods[0].closedAt).toBe(NOW);
    expect(next.periods[1].status).toBe('active');
    expect(next.periods[1].index).toBe(2);
    // Transaksjonen er urørt og ligger fortsatt i den gamle perioden.
    expect(next.transactions).toHaveLength(1);
    expect(next.transactions[0].periodId).toBe(next.periods[0].id);
  });

  it('bevarer det historiske budsjettet når det nye endres', () => {
    const { data, cat } = dataWithPeriod();
    const next = reducer(data, {
      type: 'startNewPeriod',
      now: NOW,
      input: {
        startDate: '2026-12-20',
        netSalaryOre: KR(45000),
        allocations: data.periods[0].allocations,
      },
    });

    const changed = reducer(next, {
      type: 'setAllocation',
      periodId: next.periods[1].id,
      categoryId: cat('mat'),
      amountOre: KR(9000),
    });

    expect(allocationFor(changed.periods[0], cat('mat'))).toBe(KR(6000));
    expect(allocationFor(changed.periods[1], cat('mat'))).toBe(KR(9000));
  });

  it('avslutter forrige periode dagen før den nye starter ved tidlig lønn', () => {
    const { data } = dataWithPeriod();
    const next = reducer(data, {
      type: 'startNewPeriod',
      now: NOW,
      input: { startDate: '2026-12-18', netSalaryOre: KR(45000), allocations: [] },
    });
    expect(next.periods[0].endDate).toBe('2026-12-17');
    expect(next.periods[1].startDate).toBe('2026-12-18');
  });

  it('støtter varierende nettolønn per periode', () => {
    const { data } = dataWithPeriod();
    const next = reducer(data, {
      type: 'startNewPeriod',
      now: NOW,
      input: { startDate: '2026-12-20', netSalaryOre: KR(61000), allocations: [] },
    });
    expect(next.periods[0].netSalaryOre).toBe(KR(45000));
    expect(next.periods[1].netSalaryOre).toBe(KR(61000));
    expect(next.settings.defaultNetSalaryOre).toBe(KR(61000));
  });
});

describe('underkategorier og kategorier', () => {
  it('endrer navn i både forslag og historikk', () => {
    const { data, cat } = dataWithPeriod();
    const withTx = reducer(data, {
      type: 'addTransaction',
      now: NOW,
      input: {
        kind: 'expense',
        amountOre: KR(100),
        categoryId: cat('mat'),
        subcategoryName: 'Kiwi',
        date: '2026-11-21',
      },
    });
    const sub = withTx.subcategories.find((s) => s.name === 'Kiwi' && s.categoryId === cat('mat'))!;

    const renamed = reducer(withTx, { type: 'renameSubcategory', id: sub.id, name: 'Kiwi Torget' });

    expect(renamed.subcategories.find((s) => s.id === sub.id)?.name).toBe('Kiwi Torget');
    expect(renamed.transactions[0].subcategoryName).toBe('Kiwi Torget');
  });

  it('slår sammen underkategorier når en får navnet til en annen', () => {
    const { data, cat } = dataWithPeriod();
    const input = (name: string) => ({
      kind: 'expense' as const,
      amountOre: KR(100),
      categoryId: cat('mat'),
      subcategoryName: name,
      date: '2026-11-21',
    });
    let state = reducer(data, { type: 'addTransaction', now: NOW, input: input('Kiwi') });
    state = reducer(state, { type: 'addTransaction', now: NOW, input: input('Kiwii') });
    state = reducer(state, {
      type: 'addFavorite',
      favorite: { label: 'Kiwii', amountOre: null, kind: 'expense', categoryId: cat('mat'), subcategoryName: 'Kiwii' },
    });
    const typo = state.subcategories.find((s) => s.name === 'Kiwii')!;
    const kiwi = state.subcategories.find((s) => s.name === 'Kiwi' && s.categoryId === cat('mat'))!;

    const next = reducer(state, { type: 'renameSubcategory', id: typo.id, name: 'kiwi' });

    const matSubs = next.subcategories.filter((s) => s.categoryId === cat('mat') && s.name.toLowerCase() === 'kiwi');
    expect(matSubs).toHaveLength(1);
    expect(matSubs[0].id).toBe(kiwi.id);
    expect(matSubs[0].useCount).toBe(kiwi.useCount + typo.useCount);
    expect(next.transactions.map((t) => t.subcategoryName)).toEqual(['Kiwi', 'Kiwi']);
    expect(next.favorites[0]).toMatchObject({ label: 'Kiwi', subcategoryName: 'Kiwi' });
  });

  it('beholder historikken når en underkategori slettes', () => {
    const { data, cat } = dataWithPeriod();
    const withTx = reducer(data, {
      type: 'addTransaction',
      now: NOW,
      input: {
        kind: 'expense',
        amountOre: KR(100),
        categoryId: cat('mat'),
        subcategoryName: 'Kiwi',
        date: '2026-11-21',
      },
    });
    const sub = withTx.subcategories.find((s) => s.name === 'Kiwi' && s.categoryId === cat('mat'))!;
    const next = reducer(withTx, { type: 'deleteSubcategory', id: sub.id });

    expect(next.subcategories.some((s) => s.id === sub.id)).toBe(false);
    expect(next.transactions[0].subcategoryName).toBe('Kiwi');
  });

  it('arkiverer en hovedkategori uten å slette den', () => {
    const { data, cat } = dataWithPeriod();
    const next = reducer(data, { type: 'archiveCategory', id: cat('klaer'), archived: true });
    expect(next.categories.find((c) => c.id === cat('klaer'))?.archived).toBe(true);
    expect(next.categories).toHaveLength(7);
  });
});
