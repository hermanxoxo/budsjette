import type { ISODate, RecurringTransaction, Transaction } from '@/types';
import { addDays, addMonths, diffDays, today } from './date';

/**
 * Faste og gjentakende utgifter.
 *
 * Idempotens: hver forekomst får nøkkelen `<recurringId>:<forfallsdato>`.
 * Før noe bokføres sjekkes det at nøkkelen ikke allerede finnes blant
 * transaksjonene, slik at gjentatte appstarter aldri gir duplikater.
 */

export function occurrenceKey(recurringId: string, dueDate: ISODate): string {
  return `${recurringId}:${dueDate}`;
}

const INTERVAL_LABELS: Record<RecurringTransaction['interval'], string> = {
  weekly: 'Hver uke',
  biweekly: 'Annenhver uke',
  monthly: 'Hver måned',
  quarterly: 'Hvert kvartal',
  yearly: 'Hvert år',
};

export function intervalLabel(interval: RecurringTransaction['interval']): string {
  return INTERVAL_LABELS[interval];
}

/** Neste forfall etter en gitt forekomst. */
export function nextOccurrence(rule: RecurringTransaction, from: ISODate): ISODate {
  switch (rule.interval) {
    case 'weekly':
      return addDays(from, 7);
    case 'biweekly':
      return addDays(from, 14);
    case 'monthly':
      return addMonths(from, 1);
    case 'quarterly':
      return addMonths(from, 3);
    case 'yearly':
      return addMonths(from, 12);
  }
}

/**
 * Alle forfallsdatoer fra og med `anchorDate` til og med `until`.
 * Begrenset til 500 forekomster som sikring mot uendelige løkker.
 */
export function occurrencesUntil(rule: RecurringTransaction, until: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cursor = rule.anchorDate;
  let guard = 0;
  while (cursor <= until && guard < 500) {
    out.push(cursor);
    cursor = nextOccurrence(rule, cursor);
    guard += 1;
  }
  return out;
}

/** Forfallsdatoer innenfor et intervall (brukes til «kommende faste utgifter»). */
export function occurrencesBetween(
  rule: RecurringTransaction,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  return occurrencesUntil(rule, to).filter((d) => d >= from);
}

export interface DueOccurrence {
  rule: RecurringTransaction;
  dueDate: ISODate;
  key: string;
}

/** Forekomster som har forfalt (til og med `reference`) og ennå ikke er bokført. */
export function pendingOccurrences(
  rules: readonly RecurringTransaction[],
  transactions: readonly Transaction[],
  reference: ISODate = today(),
  options: { onlyAutoPost?: boolean } = {},
): DueOccurrence[] {
  const posted = new Set(
    transactions.map((t) => t.occurrenceKey).filter((k): k is string => Boolean(k)),
  );
  const out: DueOccurrence[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    if (options.onlyAutoPost && !rule.autoPost) continue;
    for (const dueDate of occurrencesUntil(rule, reference)) {
      const key = occurrenceKey(rule.id, dueDate);
      if (posted.has(key) || rule.skipped.includes(key)) continue;
      out.push({ rule, dueDate, key });
    }
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export interface UpcomingOccurrence extends DueOccurrence {
  daysUntil: number;
}

/** Fremtidige forfall i et vindu fremover – vises som «planlagt», ikke som brukt. */
export function upcomingOccurrences(
  rules: readonly RecurringTransaction[],
  transactions: readonly Transaction[],
  from: ISODate,
  to: ISODate,
): UpcomingOccurrence[] {
  const posted = new Set(
    transactions.map((t) => t.occurrenceKey).filter((k): k is string => Boolean(k)),
  );
  const out: UpcomingOccurrence[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    for (const dueDate of occurrencesBetween(rule, from, to)) {
      const key = occurrenceKey(rule.id, dueDate);
      if (posted.has(key) || rule.skipped.includes(key)) continue;
      out.push({ rule, dueDate, key, daysUntil: diffDays(from, dueDate) });
    }
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Sum av planlagte (ikke bokførte) faste utgifter i et intervall. */
export function plannedTotal(occurrences: readonly UpcomingOccurrence[]): number {
  return occurrences.reduce((sum, o) => sum + o.rule.amountOre, 0);
}
