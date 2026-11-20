import { describe, expect, it } from 'vitest';
import type { RecurringTransaction } from '@/types';
import {
  nextOccurrence,
  occurrenceKey,
  occurrencesUntil,
  pendingOccurrences,
  upcomingOccurrences,
} from '@/lib/recurring';
import { reducer } from '@/state/reducer';
import { KR, dataWithPeriod } from './helpers';

const NOW = '2026-11-21T09:00:00.000Z';

function rule(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id: 'rec_1',
    name: 'Husleie',
    amountOre: KR(11500),
    kind: 'expense',
    categoryId: 'cat_bolig',
    subcategoryName: 'Husleie',
    interval: 'monthly',
    anchorDate: '2026-11-21',
    autoPost: true,
    active: true,
    skipped: [],
    createdAt: NOW,
    ...overrides,
  };
}

describe('forfallsdatoer', () => {
  it('regner neste forfall per intervall', () => {
    expect(nextOccurrence(rule({ interval: 'weekly' }), '2026-11-21')).toBe('2026-11-28');
    expect(nextOccurrence(rule({ interval: 'biweekly' }), '2026-11-21')).toBe('2026-12-05');
    expect(nextOccurrence(rule({ interval: 'monthly' }), '2026-11-21')).toBe('2026-12-21');
    expect(nextOccurrence(rule({ interval: 'quarterly' }), '2026-11-21')).toBe('2027-02-21');
    expect(nextOccurrence(rule({ interval: 'yearly' }), '2026-11-21')).toBe('2027-11-21');
  });

  it('klipper til siste dag i korte måneder', () => {
    expect(nextOccurrence(rule({ interval: 'monthly' }), '2026-01-31')).toBe('2026-02-28');
  });

  it('lister forfall frem til en dato', () => {
    const dates = occurrencesUntil(rule({ anchorDate: '2026-11-21' }), '2027-02-01');
    expect(dates).toEqual(['2026-11-21', '2026-12-21', '2027-01-21']);
  });
});

describe('idempotent bokføring', () => {
  it('finner forfall som ikke er bokført', () => {
    const due = pendingOccurrences([rule()], [], '2026-12-25');
    expect(due.map((d) => d.dueDate)).toEqual(['2026-11-21', '2026-12-21']);
  });

  it('hopper over forekomster som allerede er bokført', () => {
    const { data, cat } = dataWithPeriod();
    const r = rule({ categoryId: cat('bolig') });
    const posted = reducer(data, {
      type: 'addTransactions',
      now: NOW,
      inputs: [
        {
          kind: r.kind,
          amountOre: r.amountOre,
          categoryId: r.categoryId,
          subcategoryName: r.subcategoryName,
          date: '2026-11-21',
          recurringId: r.id,
          occurrenceKey: occurrenceKey(r.id, '2026-11-21'),
        },
      ],
    });

    expect(posted.transactions).toHaveLength(1);
    expect(pendingOccurrences([r], posted.transactions, '2026-11-25')).toHaveLength(0);
  });

  it('bokfører aldri samme forekomst to ganger – uansett hvor mange ganger appen åpnes', () => {
    const { data, cat } = dataWithPeriod();
    const r = rule({ categoryId: cat('bolig') });
    const input = {
      kind: r.kind,
      amountOre: r.amountOre,
      categoryId: r.categoryId,
      subcategoryName: r.subcategoryName,
      date: '2026-11-21',
      recurringId: r.id,
      occurrenceKey: occurrenceKey(r.id, '2026-11-21'),
    };

    let state = data;
    for (let i = 0; i < 5; i++) {
      state = reducer(state, { type: 'addTransactions', now: NOW, inputs: [input] });
    }

    expect(state.transactions).toHaveLength(1);
  });

  it('filtrerer bort duplikater innenfor samme bunke', () => {
    const { data, cat } = dataWithPeriod();
    const r = rule({ categoryId: cat('bolig') });
    const input = {
      kind: r.kind,
      amountOre: r.amountOre,
      categoryId: r.categoryId,
      subcategoryName: r.subcategoryName,
      date: '2026-11-21',
      recurringId: r.id,
      occurrenceKey: occurrenceKey(r.id, '2026-11-21'),
    };

    const state = reducer(data, { type: 'addTransactions', now: NOW, inputs: [input, input] });
    expect(state.transactions).toHaveLength(1);
  });

  it('respekterer forekomster brukeren har hoppet over', () => {
    const skipped = rule({ skipped: [occurrenceKey('rec_1', '2026-11-21')] });
    expect(pendingOccurrences([skipped], [], '2026-11-25')).toHaveLength(0);
  });

  it('tar bare med automatiske regler når det er bedt om', () => {
    const manual = rule({ id: 'rec_2', autoPost: false });
    expect(pendingOccurrences([manual], [], '2026-11-25', { onlyAutoPost: true })).toHaveLength(0);
    expect(pendingOccurrences([manual], [], '2026-11-25')).toHaveLength(1);
  });

  it('ser bort fra regler som er satt på pause', () => {
    expect(pendingOccurrences([rule({ active: false })], [], '2026-12-25')).toHaveLength(0);
  });
});

describe('kommende faste utgifter', () => {
  it('viser planlagte forfall fremover uten å telle dem som brukt', () => {
    const upcoming = upcomingOccurrences([rule()], [], '2026-11-22', '2026-12-19');
    expect(upcoming).toHaveLength(0);

    const later = upcomingOccurrences([rule()], [], '2026-11-22', '2026-12-31');
    expect(later).toHaveLength(1);
    expect(later[0].dueDate).toBe('2026-12-21');
    expect(later[0].daysUntil).toBe(29);
  });
});
