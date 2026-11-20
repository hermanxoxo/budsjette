import { describe, expect, it } from 'vitest';
import type { Transaction, TransactionKind } from '@/types';
import {
  categoryStatus,
  comparableSpend,
  cumulativeSpending,
  periodTotals,
  spendingPace,
  subcategoryTotals,
} from '@/lib/calc';
import { suggestedAllocations } from '@/lib/defaults';
import { createInitialData } from '@/lib/storage';
import { KR, dataWithPeriod } from './helpers';

function tx(
  periodId: string,
  categoryId: string | null,
  amountOre: number,
  date: string,
  kind: TransactionKind = 'expense',
  subcategoryName: string | null = null,
): Transaction {
  return {
    id: `tx_${Math.random().toString(36).slice(2)}`,
    periodId,
    kind,
    amountOre,
    categoryId,
    subcategoryName,
    date,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
  };
}

describe('periodTotals', () => {
  it('skiller forbruk, sparing og gjeld', () => {
    const { data, period, cat } = dataWithPeriod();
    const transactions = [
      tx(period.id, cat('mat'), KR(1200), '2026-11-21'),
      tx(period.id, cat('bolig'), KR(12000), '2026-11-21'),
      tx(period.id, cat('sparing'), KR(10000), '2026-11-21', 'saving'),
      tx(period.id, cat('gjeld'), KR(5000), '2026-11-22', 'debt'),
    ];

    const totals = periodTotals(period, transactions);

    expect(totals.expenseOre).toBe(KR(13200));
    expect(totals.savingOre).toBe(KR(10000));
    expect(totals.debtOre).toBe(KR(5000));
    expect(totals.totalOutOre).toBe(KR(28200));
    // Tilgjengelig = nettolønn − (forbruk + sparing + gjeld)
    expect(totals.availableOre).toBe(KR(45000) - KR(28200));
    expect(data.categories).toHaveLength(7);
  });

  it('legger ekstra inntekt til uten å overskrive nettolønnen', () => {
    const { period } = dataWithPeriod();
    const transactions = [tx(period.id, null, KR(3000), '2026-11-25', 'income')];
    const totals = periodTotals(period, transactions);

    expect(totals.salaryOre).toBe(KR(45000));
    expect(totals.extraIncomeOre).toBe(KR(3000));
    expect(totals.totalIncomeOre).toBe(KR(48000));
    expect(totals.availableOre).toBe(KR(48000));
  });

  it('gir negativ saldo ved overforbruk', () => {
    const { period, cat } = dataWithPeriod();
    const transactions = [tx(period.id, cat('bolig'), KR(50000), '2026-11-21')];
    expect(periodTotals(period, transactions).availableOre).toBe(KR(-5000));
  });

  it('holder transaksjoner fra andre perioder utenfor', () => {
    const { period, cat } = dataWithPeriod();
    const transactions = [tx('annen-periode', cat('mat'), KR(999), '2026-11-21')];
    expect(periodTotals(period, transactions).expenseOre).toBe(0);
  });

  it('regner ut ufordelt beløp', () => {
    const { period } = dataWithPeriod();
    const totals = periodTotals(period, []);
    expect(totals.budgetedOre).toBe(KR(34000));
    expect(totals.unallocatedOre).toBe(KR(11000));
  });
});

describe('categoryStatus', () => {
  it('regner gjenstående budsjett og prosent', () => {
    const { data, period, cat } = dataWithPeriod();
    const bolig = data.categories.find((c) => c.id === cat('bolig'))!;
    const transactions = [tx(period.id, bolig.id, KR(12000), '2026-11-21')];

    const status = categoryStatus(bolig, period, transactions);

    expect(status.budgetOre).toBe(KR(15000));
    expect(status.actualOre).toBe(KR(12000));
    expect(status.remainingOre).toBe(KR(3000));
    expect(status.percent).toBe(80);
    expect(status.status).toBe('ok');
  });

  it('markerer overforbruk', () => {
    const { data, period, cat } = dataWithPeriod();
    const mat = data.categories.find((c) => c.id === cat('mat'))!;
    const transactions = [tx(period.id, mat.id, KR(6500), '2026-11-21')];

    const status = categoryStatus(mat, period, transactions);
    expect(status.remainingOre).toBe(KR(-500));
    expect(status.status).toBe('over');
  });

  it('advarer når 85 % er brukt', () => {
    const { data, period, cat } = dataWithPeriod();
    const mat = data.categories.find((c) => c.id === cat('mat'))!;
    const status = categoryStatus(mat, period, [tx(period.id, mat.id, KR(5100), '2026-11-21')]);
    expect(status.status).toBe('warning');
  });

  it('lar refusjon redusere forbruket', () => {
    const { data, period, cat } = dataWithPeriod();
    const mat = data.categories.find((c) => c.id === cat('mat'))!;
    const transactions = [
      tx(period.id, mat.id, KR(1000), '2026-11-21'),
      tx(period.id, mat.id, KR(400), '2026-11-22', 'adjustment'),
    ];
    expect(categoryStatus(mat, period, transactions).actualOre).toBe(KR(600));
  });

  it('håndterer kategori uten budsjett', () => {
    const { data, period, cat } = dataWithPeriod();
    const klaer = data.categories.find((c) => c.id === cat('klaer'))!;
    const status = categoryStatus(klaer, period, [tx(period.id, klaer.id, KR(500), '2026-11-21')]);
    expect(status.budgetOre).toBe(0);
    expect(status.status).toBe('none');
    expect(Number.isFinite(status.ratio)).toBe(true);
  });
});

describe('spendingPace', () => {
  it('fremskriver forbruket ut perioden', () => {
    const { period } = dataWithPeriod();
    // 10 dager inn i en 30-dagers periode, 10 000 kr brukt av 24 000 kr.
    const pace = spendingPace(period, KR(10000), KR(24000), '2026-11-29');

    expect(pace.daysElapsed).toBe(10);
    expect(pace.daysRemaining).toBe(21);
    expect(pace.perDayOre).toBe(KR(1000));
    expect(pace.projectedOre).toBe(KR(30000));
    expect(pace.projectedOverrunOre).toBe(KR(6000));
    expect(pace.reliable).toBe(true);
  });

  it('merker prognosen som upålitelig tidlig i perioden', () => {
    const { period } = dataWithPeriod();
    expect(spendingPace(period, KR(500), KR(24000), '2026-11-21').reliable).toBe(false);
    expect(spendingPace(period, 0, KR(24000), '2026-12-01').reliable).toBe(false);
  });

  it('regner ut disponibelt per gjenstående dag', () => {
    const { period } = dataWithPeriod();
    const pace = spendingPace(period, KR(10000), KR(20000), '2026-11-29');
    expect(pace.dailyAllowanceOre).toBe(Math.round(KR(10000) / 21));
  });
});

describe('serier til diagrammer', () => {
  it('akkumulerer forbruk og stopper ved dagens dato', () => {
    const { period, cat } = dataWithPeriod();
    const transactions = [
      tx(period.id, cat('mat'), KR(300), '2026-11-20'),
      tx(period.id, cat('mat'), KR(200), '2026-11-22'),
    ];

    const series = cumulativeSpending(period, transactions, KR(30000), '2026-11-23');

    expect(series).toHaveLength(30);
    expect(series[0].spentOre).toBe(KR(300));
    expect(series[1].spentOre).toBe(KR(300));
    expect(series[2].spentOre).toBe(KR(500));
    expect(series[3].spentOre).toBe(KR(500));
    // Fremtidige dager har ingen verdi – vi dikter ikke opp tall.
    expect(series[4].spentOre).toBeNull();
    expect(series[29].idealOre).toBe(KR(30000));
  });

  it('summerer og sorterer underkategorier', () => {
    const { period, cat } = dataWithPeriod();
    const transactions = [
      tx(period.id, cat('mat'), KR(300), '2026-11-20', 'expense', 'Kiwi'),
      tx(period.id, cat('mat'), KR(200), '2026-11-21', 'expense', 'kiwi'),
      tx(period.id, cat('mat'), KR(900), '2026-11-22', 'expense', 'Restaurant'),
      tx(period.id, cat('sparing'), KR(5000), '2026-11-22', 'saving', 'Fond'),
    ];

    const totals = subcategoryTotals(transactions, { periodId: period.id });

    expect(totals[0]).toMatchObject({ name: 'Restaurant', amountOre: KR(900), count: 1 });
    // Ulik skrivemåte slås sammen.
    expect(totals[1]).toMatchObject({ amountOre: KR(500), count: 2 });
    // Sparing er ikke ordinært forbruk.
    expect(totals.some((t) => t.name === 'Fond')).toBe(false);
  });

  it('sammenligner like mange dager av forrige periode', () => {
    const { period, cat } = dataWithPeriod();
    const transactions = [
      tx(period.id, cat('mat'), KR(400), '2026-11-20'),
      tx(period.id, cat('mat'), KR(600), '2026-11-25'),
    ];
    expect(comparableSpend(period, transactions, 3)).toBe(KR(400));
    expect(comparableSpend(period, transactions, 10)).toBe(KR(1000));
    expect(comparableSpend(period, transactions, 10, cat('bolig'))).toBe(0);
  });
});

describe('foreslåtte budsjetter', () => {
  const categories = createInitialData().categories;

  it('summerer seg nøyaktig til nettolønnen', () => {
    for (const kroner of [45000, 38750, 51234, 29900, 100000]) {
      const total = suggestedAllocations(KR(kroner), categories).reduce(
        (sum, a) => sum + a.amountOre,
        0,
      );
      expect(total).toBe(KR(kroner));
    }
  });

  it('gir bare nullbeløp når lønnen er null', () => {
    const allocations = suggestedAllocations(0, categories);
    expect(allocations.every((a) => a.amountOre === 0)).toBe(true);
  });

  it('holder alle poster positive', () => {
    const allocations = suggestedAllocations(KR(12345), categories);
    expect(allocations.every((a) => a.amountOre >= 0)).toBe(true);
  });
});
