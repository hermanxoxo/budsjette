import type {
  BudgetCategory,
  BudgetPeriod,
  CategoryStatus,
  ISODate,
  Ore,
  PeriodTotals,
  Transaction,
} from '@/types';
import { addDays, diffDays, today } from './date';
import { periodLength, periodPace } from './periods';

/**
 * Økonomiberegninger.
 *
 * Viktige regler:
 *  - Sparing og gjeldsbetaling reduserer tilgjengelige penger, men regnes IKKE
 *    som ordinært forbruk (og holdes utenfor forbruksdiagrammene).
 *  - Ekstra inntekt legges til nettolønnen uten å overskrive den.
 *  - Justeringer (f.eks. refusjon) trekkes fra forbruket.
 */

export function transactionsForPeriod(
  transactions: readonly Transaction[],
  periodId: string,
): Transaction[] {
  return transactions.filter((t) => t.periodId === periodId);
}

/** Transaksjoner som teller som ordinært forbruk (brukes i forbruksdiagrammer). */
export function isSpending(t: Transaction): boolean {
  return t.kind === 'expense';
}

/** Alt som tapper kontoen: utgifter, sparing og gjeld. */
export function isOutflow(t: Transaction): boolean {
  return t.kind === 'expense' || t.kind === 'saving' || t.kind === 'debt';
}

/** Beløp med fortegn sett fra lommeboka. */
export function signedAmount(t: Transaction): Ore {
  if (t.kind === 'income' || t.kind === 'adjustment') return t.amountOre;
  return -t.amountOre;
}

export function allocationTotal(period: BudgetPeriod): Ore {
  return period.allocations.reduce((sum, a) => sum + a.amountOre, 0);
}

export function allocationFor(period: BudgetPeriod, categoryId: string): Ore {
  return period.allocations.find((a) => a.categoryId === categoryId)?.amountOre ?? 0;
}

export function periodTotals(
  period: BudgetPeriod,
  transactions: readonly Transaction[],
): PeriodTotals {
  let expenseOre = 0;
  let savingOre = 0;
  let debtOre = 0;
  let extraIncomeOre = 0;
  let adjustmentOre = 0;

  for (const t of transactions) {
    if (t.periodId !== period.id) continue;
    switch (t.kind) {
      case 'expense':
        expenseOre += t.amountOre;
        break;
      case 'saving':
        savingOre += t.amountOre;
        break;
      case 'debt':
        debtOre += t.amountOre;
        break;
      case 'income':
        extraIncomeOre += t.amountOre;
        break;
      case 'adjustment':
        adjustmentOre += t.amountOre;
        break;
    }
  }

  const salaryOre = period.netSalaryOre;
  const totalIncomeOre = salaryOre + extraIncomeOre + adjustmentOre;
  const totalOutOre = expenseOre + savingOre + debtOre;
  const budgetedOre = allocationTotal(period);

  return {
    salaryOre,
    extraIncomeOre,
    totalIncomeOre,
    expenseOre,
    savingOre,
    debtOre,
    totalOutOre,
    availableOre: totalIncomeOre - totalOutOre,
    adjustmentOre,
    budgetedOre,
    unallocatedOre: salaryOre + extraIncomeOre - budgetedOre,
  };
}

export function statusFromRatio(ratio: number, hasBudget: boolean): CategoryStatus['status'] {
  if (!hasBudget) return 'none';
  if (ratio > 1) return 'over';
  if (ratio >= 0.85) return 'warning';
  return 'ok';
}

export function categoryStatus(
  category: BudgetCategory,
  period: BudgetPeriod,
  transactions: readonly Transaction[],
): CategoryStatus {
  const budgetOre = allocationFor(period, category.id);
  const rows = transactions.filter((t) => t.periodId === period.id && t.categoryId === category.id);
  // Refusjoner og inntekter ført på en kategori reduserer forbruket der.
  const actualOre = rows.reduce(
    (sum, t) => sum + (t.kind === 'adjustment' || t.kind === 'income' ? -t.amountOre : t.amountOre),
    0,
  );
  const hasBudget = budgetOre > 0;
  const ratio = hasBudget ? actualOre / budgetOre : actualOre > 0 ? 1 : 0;

  return {
    category,
    budgetOre,
    actualOre,
    remainingOre: budgetOre - actualOre,
    ratio,
    percent: hasBudget ? (actualOre / budgetOre) * 100 : 0,
    status: statusFromRatio(ratio, hasBudget),
    transactionCount: rows.length,
  };
}

export function categoryStatuses(
  categories: readonly BudgetCategory[],
  period: BudgetPeriod,
  transactions: readonly Transaction[],
): CategoryStatus[] {
  return categories
    .filter((c) => !c.archived)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => categoryStatus(c, period, transactions));
}

/* ---------- Tempo og prognoser ---------- */

export interface SpendingPace {
  /** Hvor mye som burde vært brukt nå ved helt jevnt forbruk. */
  expectedOre: Ore;
  actualOre: Ore;
  /** Snitt per dag hittil i perioden. */
  perDayOre: Ore;
  /** Estimert totalforbruk ved samme tempo ut perioden. */
  projectedOre: Ore;
  /** projected − budsjett. Positivt = ligger an til overforbruk. */
  projectedOverrunOre: Ore;
  /** Hvor mye som kan brukes per gjenstående dag uten å sprekke. */
  dailyAllowanceOre: Ore;
  daysRemaining: number;
  daysElapsed: number;
  daysTotal: number;
  /** false når datagrunnlaget er for tynt til å vise prognose. */
  reliable: boolean;
}

export function spendingPace(
  period: BudgetPeriod,
  spentOre: Ore,
  budgetOre: Ore,
  reference: ISODate = today(),
): SpendingPace {
  const pace = periodPace(period, reference);
  const daysElapsed = Math.max(1, pace.daysElapsed);
  const perDayOre = Math.round(spentOre / daysElapsed);
  const projectedOre = Math.round(perDayOre * pace.daysTotal);
  const remainingBudget = budgetOre - spentOre;
  const dailyAllowanceOre =
    pace.daysRemaining > 0 ? Math.round(remainingBudget / pace.daysRemaining) : remainingBudget;

  return {
    expectedOre: Math.round((budgetOre * daysElapsed) / pace.daysTotal),
    actualOre: spentOre,
    perDayOre,
    projectedOre,
    projectedOverrunOre: projectedOre - budgetOre,
    dailyAllowanceOre,
    daysRemaining: pace.daysRemaining,
    daysElapsed: pace.daysElapsed,
    daysTotal: pace.daysTotal,
    // Krever minst 3 dagers data og minst én registrering før vi uttaler oss om tempoet.
    reliable: pace.daysElapsed >= 3 && spentOre > 0,
  };
}

/* ---------- Serier til diagrammer ---------- */

export interface CumulativePoint {
  date: ISODate;
  label: string;
  dayIndex: number;
  /** Akkumulert ordinært forbruk til og med denne dagen. null for fremtidige dager. */
  spentOre: Ore | null;
  /** Jevn referanselinje: budsjettet fordelt likt utover dagene. */
  idealOre: Ore;
}

/**
 * Akkumulert forbruk gjennom perioden. Punkter etter referansedatoen får null,
 * slik at linjen stopper ved i dag i stedet for å vise oppdiktede tall.
 */
export function cumulativeSpending(
  period: BudgetPeriod,
  transactions: readonly Transaction[],
  budgetOre: Ore,
  reference: ISODate = today(),
): CumulativePoint[] {
  const days = periodLength(period);
  const perDay = new Map<ISODate, Ore>();

  for (const t of transactions) {
    if (t.periodId !== period.id) continue;
    if (t.kind === 'expense') perDay.set(t.date, (perDay.get(t.date) ?? 0) + t.amountOre);
    else if (t.kind === 'adjustment') perDay.set(t.date, (perDay.get(t.date) ?? 0) - t.amountOre);
  }

  const points: CumulativePoint[] = [];
  let running = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(period.startDate, i);
    running += perDay.get(date) ?? 0;
    points.push({
      date,
      dayIndex: i + 1,
      label: String(Number(date.slice(8, 10))),
      spentOre: date > reference ? null : running,
      idealOre: Math.round((budgetOre * (i + 1)) / days),
    });
  }
  return points;
}

export interface SubcategoryTotal {
  name: string;
  categoryId: string | null;
  amountOre: Ore;
  count: number;
}

export function subcategoryTotals(
  transactions: readonly Transaction[],
  options: {
    periodId?: string;
    categoryId?: string | null;
    kinds?: Transaction['kind'][];
  } = {},
): SubcategoryTotal[] {
  const kinds = options.kinds ?? ['expense'];
  const map = new Map<string, SubcategoryTotal>();

  for (const t of transactions) {
    if (options.periodId && t.periodId !== options.periodId) continue;
    if (options.categoryId !== undefined && t.categoryId !== options.categoryId) continue;
    if (!kinds.includes(t.kind)) continue;

    const name = t.subcategoryName?.trim() || 'Uten underkategori';
    const key = `${t.categoryId ?? 'none'}::${name.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.amountOre += t.amountOre;
      existing.count += 1;
    } else {
      map.set(key, { name, categoryId: t.categoryId, amountOre: t.amountOre, count: 1 });
    }
  }

  return [...map.values()].sort((a, b) => b.amountOre - a.amountOre);
}

export interface PeriodSummary {
  period: BudgetPeriod;
  totals: PeriodTotals;
  /** Snitt ordinært forbruk per dag. */
  perDayOre: Ore;
  days: number;
}

export function periodSummary(
  period: BudgetPeriod,
  transactions: readonly Transaction[],
  reference: ISODate = today(),
): PeriodSummary {
  const totals = periodTotals(period, transactions);
  const pace = periodPace(period, reference);
  const days = period.status === 'closed' ? pace.daysTotal : Math.max(1, pace.daysElapsed);
  return { period, totals, days, perDayOre: Math.round(totals.expenseOre / days) };
}

export interface AmountComparison {
  currentOre: Ore;
  previousOre: Ore;
  deltaOre: Ore;
  /** Endring i prosent. null når forrige verdi var 0 (ingen meningsfull endring). */
  deltaPercent: number | null;
}

export function compareAmounts(currentOre: Ore, previousOre: Ore): AmountComparison {
  const deltaOre = currentOre - previousOre;
  return {
    currentOre,
    previousOre,
    deltaOre,
    deltaPercent: previousOre > 0 ? (deltaOre / previousOre) * 100 : null,
  };
}

/**
 * Forbruk i en periode begrenset til de `dayLimit` første dagene.
 * Gir rettferdig sammenligning mot en periode som bare er delvis gjennomført.
 */
export function comparableSpend(
  period: BudgetPeriod,
  transactions: readonly Transaction[],
  dayLimit: number,
  categoryId?: string,
): Ore {
  const cutoff = addDays(period.startDate, Math.max(0, dayLimit - 1));
  let sum = 0;
  for (const t of transactions) {
    if (t.periodId !== period.id || t.kind !== 'expense') continue;
    if (categoryId && t.categoryId !== categoryId) continue;
    if (t.date <= cutoff) sum += t.amountOre;
  }
  return sum;
}

export function daysBetweenInclusive(start: ISODate, end: ISODate): number {
  return Math.max(1, diffDays(start, end) + 1);
}
