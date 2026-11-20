import type { AppData, BudgetAllocation, Transaction } from '@/types';
import { createInitialData } from '@/lib/storage';
import { createPeriod, paydayOnOrBefore } from '@/lib/periods';
import { addDays, addMonths, diffDays, today } from '@/lib/date';
import { createId } from '@/lib/id';
import { normalizeSubcategoryName } from '@/lib/suggestions';

/**
 * Eksempeldata for demomodus. Brukes ALDRI automatisk –
 * en ny bruker starter alltid med tom historikk.
 *
 * Tallene er oppdiktede og genereres deterministisk (fast frø),
 * slik at demoen ser lik ut hver gang.
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Template {
  core: string;
  sub: string;
  kind: Transaction['kind'];
  min: number;
  max: number;
  /** Omtrentlig antall ganger per periode. */
  perPeriod: number;
}

const TEMPLATES: Template[] = [
  { core: 'mat', sub: 'Kiwi', kind: 'expense', min: 180, max: 620, perPeriod: 8 },
  { core: 'mat', sub: 'Rema 1000', kind: 'expense', min: 150, max: 540, perPeriod: 5 },
  { core: 'mat', sub: 'Meny', kind: 'expense', min: 220, max: 780, perPeriod: 2 },
  { core: 'mat', sub: 'Restaurant', kind: 'expense', min: 320, max: 980, perPeriod: 2 },
  { core: 'mat', sub: 'Kafé', kind: 'expense', min: 55, max: 190, perPeriod: 4 },
  { core: 'transport', sub: 'Bensin', kind: 'expense', min: 450, max: 900, perPeriod: 3 },
  { core: 'transport', sub: 'Bompenger', kind: 'expense', min: 40, max: 160, perPeriod: 4 },
  { core: 'transport', sub: 'Kollektiv', kind: 'expense', min: 42, max: 450, perPeriod: 2 },
  { core: 'klaer', sub: 'Klær', kind: 'expense', min: 300, max: 1400, perPeriod: 1 },
  { core: 'annet', sub: 'Strømming', kind: 'expense', min: 129, max: 199, perPeriod: 2 },
  { core: 'annet', sub: 'Trening', kind: 'expense', min: 399, max: 499, perPeriod: 1 },
  { core: 'annet', sub: 'Apotek', kind: 'expense', min: 110, max: 450, perPeriod: 1 },
  { core: 'annet', sub: 'Gaver', kind: 'expense', min: 200, max: 900, perPeriod: 1 },
];

const FIXED: Template[] = [
  { core: 'bolig', sub: 'Husleie', kind: 'expense', min: 11500, max: 11500, perPeriod: 1 },
  { core: 'bolig', sub: 'Strøm', kind: 'expense', min: 820, max: 1850, perPeriod: 1 },
  { core: 'bolig', sub: 'Internett', kind: 'expense', min: 549, max: 549, perPeriod: 1 },
  { core: 'sparing', sub: 'Bufferkonto', kind: 'saving', min: 4000, max: 4000, perPeriod: 1 },
  { core: 'sparing', sub: 'Fond', kind: 'saving', min: 3000, max: 3000, perPeriod: 1 },
  { core: 'gjeld', sub: 'Studielån', kind: 'debt', min: 3300, max: 3300, perPeriod: 1 },
  { core: 'gjeld', sub: 'Kredittkort', kind: 'debt', min: 1200, max: 2400, perPeriod: 1 },
];

const DEMO_SALARY_ORE = 4_500_000; // 45 000 kr
const DEMO_SHARES: Record<string, number> = {
  bolig: 1_500_000,
  mat: 600_000,
  transport: 300_000,
  klaer: 200_000,
  sparing: 1_000_000,
  annet: 400_000,
  gjeld: 500_000,
};

/** Bygger en komplett demotilstand med tre perioder. */
export function buildDemoData(reference = today()): AppData {
  const base = createInitialData();
  const rand = mulberry32(20_251_120);
  const payday = 20;

  const byCore = new Map(base.categories.map((c) => [c.coreKey ?? '', c]));
  const allocations: BudgetAllocation[] = base.categories.map((c) => ({
    categoryId: c.id,
    amountOre: DEMO_SHARES[c.coreKey ?? ''] ?? 0,
  }));

  // Start tre perioder tilbake fra siste lønningsdag.
  const currentStart = paydayOnOrBefore(reference, payday);
  const starts = [addMonths(currentStart, -2), addMonths(currentStart, -1), currentStart];

  const periods = starts.map((startDate, i) =>
    createPeriod({
      startDate,
      payday,
      useFixedPayday: true,
      netSalaryOre: i === 1 ? DEMO_SALARY_ORE + 250_000 : DEMO_SALARY_ORE,
      allocations,
      index: i + 1,
      now: new Date().toISOString(),
    }),
  );
  periods.forEach((p, i) => {
    if (i < periods.length - 1) {
      p.status = 'closed';
      p.closedAt = new Date().toISOString();
    }
  });

  const transactions: Transaction[] = [];
  const now = new Date().toISOString();

  for (const period of periods) {
    const lastDay = period.status === 'closed' ? period.endDate : reference;
    const span = Math.max(1, diffDays(period.startDate, lastDay) + 1);

    for (const template of FIXED) {
      const category = byCore.get(template.core);
      if (!category) continue;
      const day = Math.min(span - 1, 1 + Math.floor(rand() * 3));
      const kr = Math.round(template.min + rand() * (template.max - template.min));
      transactions.push(
        makeTx(period.id, template, category.id, addDays(period.startDate, day), kr, now),
      );
    }

    for (const template of TEMPLATES) {
      // Skaler antall registreringer etter hvor langt perioden har kommet.
      const count = Math.round(template.perPeriod * (span / 30));
      for (let i = 0; i < count; i++) {
        const category = byCore.get(template.core);
        if (!category) continue;
        const day = Math.floor(rand() * span);
        const kr = Math.round(template.min + rand() * (template.max - template.min));
        transactions.push(
          makeTx(period.id, template, category.id, addDays(period.startDate, day), kr, now),
        );
      }
    }
  }

  // Lær opp forslagene ut fra demoregistreringene.
  const subcategories = base.subcategories.map((s) => {
    const uses = transactions.filter(
      (t) => t.categoryId === s.categoryId && t.subcategoryName?.toLowerCase() === s.name.toLowerCase(),
    ).length;
    return uses ? { ...s, useCount: uses, lastUsedAt: now } : s;
  });

  const annet = byCore.get('annet');
  const bolig = byCore.get('bolig');

  return {
    ...base,
    settings: {
      ...base.settings,
      onboarded: true,
      payday,
      defaultNetSalaryOre: DEMO_SALARY_ORE,
      demoMode: true,
    },
    subcategories,
    periods,
    transactions: transactions.sort((a, b) => a.date.localeCompare(b.date)),
    recurring: bolig
      ? [
          {
            id: createId('rec'),
            name: 'Husleie',
            amountOre: 1_150_000,
            kind: 'expense',
            categoryId: bolig.id,
            subcategoryName: 'Husleie',
            interval: 'monthly',
            anchorDate: addDays(currentStart, 1),
            autoPost: false,
            active: true,
            skipped: [],
            createdAt: now,
          },
          {
            id: createId('rec'),
            name: 'Strømming',
            amountOre: 17_900,
            kind: 'expense',
            categoryId: annet?.id ?? null,
            subcategoryName: 'Strømming',
            interval: 'monthly',
            anchorDate: addDays(currentStart, 4),
            autoPost: true,
            active: true,
            skipped: [],
            createdAt: now,
          },
        ]
      : [],
    favorites: [
      {
        id: createId('fav'),
        label: 'Kiwi',
        amountOre: null,
        kind: 'expense',
        categoryId: byCore.get('mat')?.id ?? null,
        subcategoryName: 'Kiwi',
        useCount: 12,
        createdAt: now,
      },
      {
        id: createId('fav'),
        label: 'Kaffe',
        amountOre: 4900,
        kind: 'expense',
        categoryId: byCore.get('mat')?.id ?? null,
        subcategoryName: 'Kafé',
        useCount: 8,
        createdAt: now,
      },
    ],
  };
}

function makeTx(
  periodId: string,
  template: Template,
  categoryId: string,
  date: string,
  kroner: number,
  now: string,
): Transaction {
  return {
    id: createId('tx'),
    periodId,
    kind: template.kind,
    amountOre: kroner * 100,
    categoryId,
    subcategoryName: normalizeSubcategoryName(template.sub),
    date,
    createdAt: now,
    updatedAt: now,
  };
}
