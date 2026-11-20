import type { AppData, BudgetPeriod, ISODate, Transaction } from '@/types';
import { formatDays, today } from './date';
import { formatOre, formatPercent } from './money';
import { periodPace } from './periods';
import {
  allocationTotal,
  categoryStatuses,
  comparableSpend,
  periodTotals,
  spendingPace,
  subcategoryTotals,
} from './calc';

/**
 * Regelbaserte innsikter. Alt beregnes lokalt – ingen eksterne tjenester.
 * Prognoser merkes eksplisitt, og vises bare når datagrunnlaget er godt nok.
 */

export type InsightTone = 'neutral' | 'positive' | 'warning' | 'critical';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  /** true når innsikten bygger på en fremskrivning og ikke bare registrerte tall. */
  isEstimate: boolean;
  /** Høyere tall vises først. */
  priority: number;
  categoryId?: string;
}

export interface InsightContext {
  data: AppData;
  period: BudgetPeriod;
  previousPeriod?: BudgetPeriod;
  reference?: ISODate;
}

export function buildInsights(ctx: InsightContext): Insight[] {
  const reference = ctx.reference ?? today();
  const { data, period, previousPeriod } = ctx;
  const transactions = data.transactions;
  const insights: Insight[] = [];

  const totals = periodTotals(period, transactions);
  const pace = periodPace(period, reference);
  const statuses = categoryStatuses(data.categories, period, transactions);
  const hasAnyTransaction = transactions.some((t) => t.periodId === period.id);

  if (!hasAnyTransaction) {
    insights.push({
      id: 'empty',
      tone: 'neutral',
      title: 'Ingen registreringer ennå',
      body: 'Trykk på pluss-knappen for å registrere den første utgiften i denne perioden.',
      isEstimate: false,
      priority: 10,
    });
    return insights;
  }

  /* --- Overforbruk per kategori --- */
  for (const status of statuses) {
    if (status.status === 'over') {
      insights.push({
        id: `over-${status.category.id}`,
        tone: 'critical',
        title: `${status.category.name} er over budsjett`,
        body: `Du har brukt ${formatOre(status.actualOre)} av ${formatOre(status.budgetOre)} – ${formatOre(
          Math.abs(status.remainingOre),
        )} mer enn planlagt.`,
        isEstimate: false,
        priority: 95,
        categoryId: status.category.id,
      });
    }
  }

  /* --- Høyt forbruk med mange dager igjen --- */
  for (const status of statuses) {
    if (status.status !== 'warning' || status.budgetOre <= 0) continue;
    if (pace.daysRemaining < 3) continue;
    insights.push({
      id: `pace-${status.category.id}`,
      tone: 'warning',
      title: `${formatPercent(status.percent)} av ${status.category.name.toLowerCase()}budsjettet er brukt`,
      body: `Du har fortsatt ${formatDays(pace.daysRemaining)} igjen til lønn, og ${formatOre(
        status.remainingOre,
      )} igjen av budsjettet.`,
      isEstimate: false,
      priority: 80,
      categoryId: status.category.id,
    });
  }

  /* --- Prognose for totalt forbruk (merket som estimat) --- */
  const budgetTotal = allocationTotal(period);
  const overall = spendingPace(period, totals.expenseOre + totals.savingOre + totals.debtOre, budgetTotal, reference);
  if (overall.reliable && pace.daysRemaining > 1) {
    if (overall.projectedOverrunOre > 0 && budgetTotal > 0) {
      insights.push({
        id: 'forecast-total',
        tone: 'warning',
        title: 'Du ligger an til å bruke mer enn budsjettet',
        body: `Med dagens tempo (${formatOre(overall.perDayOre)} per dag) ender perioden på ca. ${formatOre(
          overall.projectedOre,
        )} – rundt ${formatOre(overall.projectedOverrunOre)} over budsjettet.`,
        isEstimate: true,
        priority: 85,
      });
    } else if (budgetTotal > 0 && overall.projectedOverrunOre < -budgetTotal * 0.05) {
      insights.push({
        id: 'forecast-total-ok',
        tone: 'positive',
        title: 'Du ligger godt an',
        body: `Med dagens tempo ender du på ca. ${formatOre(overall.projectedOre)} – omtrent ${formatOre(
          Math.abs(overall.projectedOverrunOre),
        )} under budsjettet.`,
        isEstimate: true,
        priority: 55,
      });
    }
  }

  /* --- Prognose per kategori --- */
  for (const status of statuses) {
    if (status.budgetOre <= 0 || status.status === 'over') continue;
    const catPace = spendingPace(period, status.actualOre, status.budgetOre, reference);
    if (!catPace.reliable || catPace.daysRemaining <= 1) continue;
    if (catPace.projectedOverrunOre > Math.max(20000, status.budgetOre * 0.05)) {
      insights.push({
        id: `forecast-${status.category.id}`,
        tone: 'warning',
        title: `${status.category.name} kan sprekke`,
        body: `Fortsetter du i samme tempo, kan du overstige budsjettet for ${status.category.name.toLowerCase()} med ca. ${formatOre(
          catPace.projectedOverrunOre,
        )}.`,
        isEstimate: true,
        priority: 70,
        categoryId: status.category.id,
      });
    }
  }

  /* --- Dagsforbruk på største kategori --- */
  const biggest = statuses
    .filter((s) => s.category.kind === 'expense' && s.actualOre > 0)
    .sort((a, b) => b.actualOre - a.actualOre)[0];
  if (biggest && pace.daysElapsed >= 3) {
    const perDay = Math.round(biggest.actualOre / Math.max(1, pace.daysElapsed));
    insights.push({
      id: `perday-${biggest.category.id}`,
      tone: 'neutral',
      title: `${formatOre(perDay)} per dag på ${biggest.category.name.toLowerCase()}`,
      body: `Det er snittet ditt over ${formatDays(pace.daysElapsed)} i denne perioden.`,
      isEstimate: false,
      priority: 40,
      categoryId: biggest.category.id,
    });
  }

  /* --- Sammenligning med forrige periode (samme antall dager) --- */
  if (previousPeriod) {
    const dayLimit = pace.daysElapsed;
    for (const status of statuses) {
      if (status.category.kind !== 'expense') continue;
      const prev = comparableSpend(previousPeriod, transactions, dayLimit, status.category.id);
      if (prev < 50000 && status.actualOre < 50000) continue; // under 500 kr: for små tall til å si noe
      const delta = status.actualOre - prev;
      const pct = prev > 0 ? (delta / prev) * 100 : null;
      if (pct === null || Math.abs(pct) < 15) continue;
      insights.push({
        id: `compare-${status.category.id}`,
        tone: delta < 0 ? 'positive' : 'neutral',
        title:
          delta < 0
            ? `${status.category.name} er ned ${formatPercent(Math.abs(pct))}`
            : `${status.category.name} er opp ${formatPercent(pct)}`,
        body: `${formatOre(status.actualOre)} hittil mot ${formatOre(prev)} på samme tid forrige periode (${formatOre(
          Math.abs(delta),
        )} ${delta < 0 ? 'mindre' : 'mer'}).`,
        isEstimate: false,
        priority: delta < 0 ? 50 : 60,
        categoryId: status.category.id,
      });
    }
  }

  /* --- Største underkategori --- */
  const topSub = subcategoryTotals(transactions, { periodId: period.id })[0];
  if (topSub && topSub.count >= 2) {
    insights.push({
      id: 'top-sub',
      tone: 'neutral',
      title: `${topSub.name} er største utgiftspost`,
      body: `${formatOre(topSub.amountOre)} fordelt på ${topSub.count} registreringer denne perioden.`,
      isEstimate: false,
      priority: 35,
    });
  }

  /* --- Sparing --- */
  if (totals.savingOre > 0) {
    const share = totals.totalIncomeOre > 0 ? (totals.savingOre / totals.totalIncomeOre) * 100 : 0;
    insights.push({
      id: 'saving',
      tone: 'positive',
      title: `Du har spart ${formatOre(totals.savingOre)}`,
      body: `Det tilsvarer ${formatPercent(share)} av inntekten i perioden.`,
      isEstimate: false,
      priority: 45,
    });
  }

  /* --- Disponibelt per dag --- */
  if (pace.daysRemaining > 0 && totals.availableOre > 0) {
    insights.push({
      id: 'daily-allowance',
      tone: 'neutral',
      title: `${formatOre(Math.round(totals.availableOre / pace.daysRemaining))} per dag resten av perioden`,
      body: `Du har ${formatOre(totals.availableOre)} igjen og ${formatDays(pace.daysRemaining)} til neste lønn.`,
      isEstimate: false,
      priority: 65,
    });
  } else if (totals.availableOre < 0) {
    insights.push({
      id: 'negative-available',
      tone: 'critical',
      title: 'Du har brukt mer enn du har fått inn',
      body: `Perioden er ${formatOre(Math.abs(totals.availableOre))} i minus. Juster budsjettet eller registrer ekstra inntekt om noe mangler.`,
      isEstimate: false,
      priority: 100,
    });
  }

  return insights.sort((a, b) => b.priority - a.priority);
}

/** Enkel oppsummering som vises før en periode avsluttes. */
export interface ClosingSummary {
  totals: ReturnType<typeof periodTotals>;
  topCategories: { name: string; amountOre: number }[];
  transactionCount: number;
  perDayOre: number;
  days: number;
}

export function closingSummary(
  data: AppData,
  period: BudgetPeriod,
  reference: ISODate = today(),
): ClosingSummary {
  const totals = periodTotals(period, data.transactions);
  const statuses = categoryStatuses(data.categories, period, data.transactions);
  const pace = periodPace(period, reference);
  const days = Math.max(1, Math.min(pace.daysTotal, pace.daysElapsed));
  const rows: Transaction[] = data.transactions.filter((t) => t.periodId === period.id);

  return {
    totals,
    transactionCount: rows.length,
    days,
    perDayOre: Math.round(totals.expenseOre / days),
    topCategories: statuses
      .filter((s) => s.actualOre > 0)
      .sort((a, b) => b.actualOre - a.actualOre)
      .slice(0, 3)
      .map((s) => ({ name: s.category.name, amountOre: s.actualOre })),
  };
}
