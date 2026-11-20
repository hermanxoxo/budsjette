import { describe, expect, it } from 'vitest';
import { buildExport, transactionsToCsv, validateImport } from '@/lib/transfer';
import { createInitialData, migrate, normalize, SCHEMA_VERSION } from '@/lib/storage';
import { reducer } from '@/state/reducer';
import { KR, dataWithPeriod } from './helpers';

const NOW = '2026-11-21T09:00:00.000Z';

function populated() {
  const { data, cat } = dataWithPeriod();
  return reducer(data, {
    type: 'addTransaction',
    now: NOW,
    input: {
      kind: 'expense',
      amountOre: KR(349),
      categoryId: cat('mat'),
      subcategoryName: 'Kiwi',
      date: '2026-11-21',
      note: 'ukehandel',
    },
  });
}

describe('eksport og import', () => {
  it('går tur-retur uten tap av data', () => {
    const data = populated();
    const envelope = buildExport(data);
    const parsed = JSON.parse(JSON.stringify(envelope));

    const result = validateImport(parsed);

    expect(result.ok).toBe(true);
    expect(result.data?.transactions).toHaveLength(1);
    expect(result.data?.transactions[0].amountOre).toBe(KR(349));
    expect(result.data?.periods).toHaveLength(1);
    expect(result.data?.categories).toHaveLength(7);
    expect(result.warnings).toHaveLength(0);
  });

  it('godtar også en rå tilstand uten konvolutt', () => {
    const result = validateImport(JSON.parse(JSON.stringify(populated())));
    expect(result.ok).toBe(true);
  });

  it('avviser filer uten kategorier eller transaksjoner', () => {
    expect(validateImport({ hei: 'verden' }).ok).toBe(false);
    expect(validateImport(null).ok).toBe(false);
    expect(validateImport({ categories: [], transactions: [], periods: [] }).ok).toBe(false);
  });

  it('forkaster ugyldige transaksjoner, men beholder resten', () => {
    const data = populated();
    const broken = {
      ...data,
      transactions: [
        ...data.transactions,
        { ...data.transactions[0], id: 'tx_bad_amount', amountOre: Number.NaN },
        { ...data.transactions[0], id: 'tx_bad_date', date: '2026-02-30' },
        { ...data.transactions[0], id: 'tx_bad_period', periodId: 'finnes-ikke' },
        { ...data.transactions[0], id: 'tx_bad_cat', categoryId: 'finnes-ikke' },
      ],
    };

    const result = validateImport(broken);

    expect(result.ok).toBe(true);
    expect(result.data?.transactions).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('sørger for at bare én periode er aktiv', () => {
    const { data } = dataWithPeriod();
    const twoActive = {
      ...data,
      periods: [
        data.periods[0],
        { ...data.periods[0], id: 'per_2', startDate: '2026-12-20', endDate: '2027-01-19' },
      ],
    };

    const result = validateImport(twoActive);
    expect(result.data?.periods.filter((p) => p.status === 'active')).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('aktive perioder'))).toBe(true);
  });
});

describe('CSV-eksport', () => {
  it('bruker semikolon, komma som desimaltegn og BOM', () => {
    const csv = transactionsToCsv(populated());
    const lines = csv.split('\n');

    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toContain('dato;type;hovedkategori');
    expect(lines[1]).toContain('2026-11-21;Utgift;Mat;Kiwi;349,00');
  });

  it('escaper felt med semikolon og anførselstegn', () => {
    const { data, cat } = dataWithPeriod();
    const withNote = reducer(data, {
      type: 'addTransaction',
      now: NOW,
      input: {
        kind: 'expense',
        amountOre: KR(100),
        categoryId: cat('mat'),
        subcategoryName: 'Kiwi',
        date: '2026-11-21',
        note: 'delt; "halvparten"',
      },
    });

    const csv = transactionsToCsv(withNote);
    expect(csv).toContain('"delt; ""halvparten"""');
  });
});

describe('lagring og migrering', () => {
  it('setter gjeldende skjemaversjon på nye data', () => {
    expect(createInitialData().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('starter tomt for en ny bruker', () => {
    const data = createInitialData();
    expect(data.transactions).toHaveLength(0);
    expect(data.periods).toHaveLength(0);
    expect(data.settings.onboarded).toBe(false);
    expect(data.categories).toHaveLength(7);
    expect(data.subcategories.length).toBeGreaterThan(20);
  });

  it('migrerer data uten versjonsnummer uten å miste noe', () => {
    const data = populated();
    const legacy = JSON.parse(JSON.stringify({ ...data, schemaVersion: undefined }));

    const migrated = migrate(legacy);

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.transactions).toHaveLength(1);
    expect(migrated.periods).toHaveLength(1);
  });

  it('fyller inn felter som mangler', () => {
    const data = populated();
    const partial = JSON.parse(JSON.stringify(data));
    delete partial.favorites;
    delete partial.recurring;

    const normalized = normalize(partial);

    expect(normalized.favorites).toEqual([]);
    expect(normalized.recurring).toEqual([]);
    expect(normalized.transactions).toHaveLength(1);
  });

  it('kaster en forståelig feil på ugyldig innhold', () => {
    expect(() => migrate('ikke et objekt')).toThrow();
  });
});
