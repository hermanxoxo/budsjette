import type { BudgetPeriod, ISODate, Ore, BudgetAllocation, PeriodPace } from '@/types';
import { addDays, addMonths, daysInMonth, diffDays, isoFrom, parseISO, today } from './date';
import { createId } from './id';

/**
 * Lønnsperioder: en periode går fra én lønningsdato til dagen før neste.
 * Lønningsdagen klippes til siste dag i måneden når måneden er kortere
 * (payday 31 → 28/29 i februar, 30 i april).
 */

export function clampPaydayToMonth(year: number, monthIndex: number, payday: number): number {
  return Math.min(Math.max(1, Math.round(payday)), daysInMonth(year, monthIndex));
}

export function paydayInMonth(year: number, monthIndex: number, payday: number): ISODate {
  return isoFrom(year, monthIndex, clampPaydayToMonth(year, monthIndex, payday));
}

/** Første lønningsdato som er lik eller etter `from`. */
export function paydayOnOrAfter(from: ISODate, payday: number): ISODate {
  const { year, monthIndex, day } = parseISO(from);
  const candidate = clampPaydayToMonth(year, monthIndex, payday);
  if (day <= candidate) return isoFrom(year, monthIndex, candidate);
  const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextYear = monthIndex === 11 ? year + 1 : year;
  return paydayInMonth(nextYear, nextMonth, payday);
}

/** Neste lønningsdato strengt etter `from`. */
export function paydayAfter(from: ISODate, payday: number): ISODate {
  return paydayOnOrAfter(addDays(from, 1), payday);
}

/** Siste lønningsdato som er lik eller før `from`. */
export function paydayOnOrBefore(from: ISODate, payday: number): ISODate {
  const { year, monthIndex, day } = parseISO(from);
  const candidate = clampPaydayToMonth(year, monthIndex, payday);
  if (day >= candidate) return isoFrom(year, monthIndex, candidate);
  const prevMonth = monthIndex === 0 ? 11 : monthIndex - 1;
  const prevYear = monthIndex === 0 ? year - 1 : year;
  return paydayInMonth(prevYear, prevMonth, payday);
}

export interface PeriodRange {
  startDate: ISODate;
  endDate: ISODate;
  expectedNextPayday: ISODate;
}

/**
 * Regner ut perioden som starter på `startDate`.
 * Med fast lønningsdag styres slutten av neste lønningsdato,
 * ellers brukes «én måned minus én dag».
 */
export function periodRangeFrom(
  startDate: ISODate,
  payday: number,
  useFixedPayday = true,
): PeriodRange {
  const expectedNextPayday = useFixedPayday
    ? paydayAfter(startDate, payday)
    : addMonths(startDate, 1);
  return {
    startDate,
    endDate: addDays(expectedNextPayday, -1),
    expectedNextPayday,
  };
}

export interface CreatePeriodInput {
  startDate: ISODate;
  payday: number;
  useFixedPayday?: boolean;
  netSalaryOre: Ore;
  allocations: BudgetAllocation[];
  index: number;
  note?: string;
  now?: string;
}

export function createPeriod(input: CreatePeriodInput): BudgetPeriod {
  const range = periodRangeFrom(input.startDate, input.payday, input.useFixedPayday ?? true);
  return {
    id: createId('per'),
    index: input.index,
    startDate: range.startDate,
    endDate: range.endDate,
    expectedNextPayday: range.expectedNextPayday,
    netSalaryOre: input.netSalaryOre,
    allocations: input.allocations.map((a) => ({ ...a })),
    status: 'active',
    createdAt: input.now ?? new Date().toISOString(),
    note: input.note,
  };
}

export function periodContains(period: BudgetPeriod, date: ISODate): boolean {
  return date >= period.startDate && date <= period.endDate;
}

/** Antall dager i perioden, inklusiv både start- og sluttdato. */
export function periodLength(period: BudgetPeriod): number {
  return Math.max(1, diffDays(period.startDate, period.endDate) + 1);
}

/** Fremdrift i perioden sett fra `reference` (standard: i dag). */
export function periodPace(period: BudgetPeriod, reference: ISODate = today()): PeriodPace {
  const daysTotal = periodLength(period);
  const elapsedRaw = diffDays(period.startDate, reference) + 1;
  const daysElapsed = Math.min(daysTotal, Math.max(1, elapsedRaw));
  const beforeStart = reference < period.startDate;
  const afterEnd = reference > period.endDate;
  const daysRemaining = afterEnd ? 0 : beforeStart ? daysTotal : daysTotal - daysElapsed + 1;
  return {
    daysTotal,
    daysElapsed: beforeStart ? 0 : daysElapsed,
    daysRemaining,
    progress: Math.min(1, Math.max(0, (beforeStart ? 0 : daysElapsed) / daysTotal)),
    isActiveNow: !beforeStart && !afterEnd,
  };
}

/** Dager igjen til neste lønn (0 når lønningsdagen er i dag eller passert). */
export function daysUntilNextPayday(period: BudgetPeriod, reference: ISODate = today()): number {
  return Math.max(0, diffDays(reference, period.expectedNextPayday));
}

/** Finner perioden en dato hører til, eller undefined. */
export function findPeriodForDate(
  periods: readonly BudgetPeriod[],
  date: ISODate,
): BudgetPeriod | undefined {
  return periods.find((p) => periodContains(p, date));
}

/** Den aktive perioden (det skal alltid finnes maks én). */
export function findActivePeriod(periods: readonly BudgetPeriod[]): BudgetPeriod | undefined {
  return periods.find((p) => p.status === 'active');
}

export function sortPeriods(periods: readonly BudgetPeriod[]): BudgetPeriod[] {
  return [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Velger hvilken periode en transaksjon skal høre til.
 * 1) Perioden som dekker datoen.
 * 2) Ellers: nærmeste periode i tid (slik at data aldri forsvinner).
 */
export function resolvePeriodForDate(
  periods: readonly BudgetPeriod[],
  date: ISODate,
  fallbackPeriodId?: string,
): string | undefined {
  const exact = findPeriodForDate(periods, date);
  if (exact) return exact.id;
  if (!periods.length) return fallbackPeriodId;
  let best = periods[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const p of periods) {
    const distance =
      date < p.startDate ? diffDays(date, p.startDate) : date > p.endDate ? diffDays(p.endDate, date) : 0;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = p;
    }
  }
  return best.id;
}

/** Skal appen minne om at ny lønnsperiode nærmer seg? */
export function shouldRemindAboutPayday(
  period: BudgetPeriod,
  reminderDays: number,
  reference: ISODate = today(),
): boolean {
  if (reminderDays <= 0) return false;
  const days = diffDays(reference, period.expectedNextPayday);
  return days <= reminderDays;
}

/** Perioden er passert sluttdato og bør avsluttes. */
export function isPeriodOverdue(period: BudgetPeriod, reference: ISODate = today()): boolean {
  return period.status === 'active' && reference > period.endDate;
}
