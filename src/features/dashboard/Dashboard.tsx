import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  Lightbulb,
  PiggyBank,
  Plus,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { BudgetPeriod, CategoryStatus } from '@/types';
import { addDays, diffDays, formatDays, formatRange, today } from '@/lib/date';
import { formatOre, formatPercent } from '@/lib/money';
import { colorFor, statusColor, withAlpha } from '@/lib/colors';
import {
  allocationTotal,
  categoryStatuses,
  periodTotals,
  spendingPace,
} from '@/lib/calc';
import { buildInsights } from '@/lib/insights';
import { periodPace, shouldRemindAboutPayday, isPeriodOverdue } from '@/lib/periods';
import { upcomingOccurrences } from '@/lib/recurring';
import { useAppStore, usePeriods } from '@/state/AppStore';
import { PageHeader } from '@/app/AppShell';
import { CategoryDot } from '@/features/transactions/CategoryPicker';
import { Badge, Button, Card, EmptyState, ProgressBar, SectionHeading, cx } from '@/ui/primitives';
import type { Route } from '@/app/router';

interface DashboardProps {
  onNavigate: (route: Route) => void;
  onAdd: () => void;
  onStartPeriod: () => void;
  onOpenSettings: () => void;
}

export function Dashboard(props: DashboardProps) {
  const { active, previous } = usePeriods();

  if (!active) {
    return (
      <>
        <PageHeader title="Min økonomi" subtitle="Ingen aktiv lønnsperiode" />
        <div className="px-4">
          <EmptyState
            icon={CalendarClock}
            title="Ingen aktiv lønnsperiode"
            description="Start en ny lønnsperiode for å begynne å registrere utgifter og følge budsjettet."
            action={
              <Button onClick={props.onStartPeriod} icon={Plus}>
                Start lønnsperiode
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return <DashboardContent {...props} active={active} previous={previous} />;
}

function DashboardContent({
  onNavigate,
  onAdd,
  onStartPeriod,
  onOpenSettings,
  active,
  previous,
}: DashboardProps & { active: BudgetPeriod; previous?: BudgetPeriod }) {
  const { data, resolvedTheme } = useAppStore();
  const reference = today();

  const totals = periodTotals(active, data.transactions);
  const statuses = categoryStatuses(data.categories, active, data.transactions);
  const pace = periodPace(active, reference);
  const budgetTotal = allocationTotal(active);
  const overallPace = spendingPace(active, totals.totalOutOre, budgetTotal, reference);
  const insights = useMemo(
    () => buildInsights({ data, period: active, previousPeriod: previous, reference }),
    [data, active, previous, reference],
  );

  const upcoming = useMemo(
    () =>
      upcomingOccurrences(data.recurring, data.transactions, addDays(reference, 1), active.endDate).slice(0, 4),
    [data.recurring, data.transactions, reference, active.endDate],
  );

  const dailyAllowance =
    pace.daysRemaining > 0 ? Math.round(totals.availableOre / pace.daysRemaining) : totals.availableOre;

  return (
    <>
      <PageHeader
        title="Min økonomi"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {formatRange(active.startDate, active.endDate)}
          </span>
        }
        action={
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Åpne innstillinger"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition hover:bg-surface2 hover:text-ink"
          >
            <Settings className="h-5 w-5" aria-hidden />
          </button>
        }
      />

      <div className="space-y-5 px-4 pb-6">
        <PeriodBanner period={active} reminderDays={data.settings.paydayReminderDays} onStartPeriod={onStartPeriod} />

        {/* Hovedkort */}
        <section
          className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card"
          aria-label="Oppsummering for perioden"
        >
          <div
            className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full opacity-[0.12]"
            style={{ background: `radial-gradient(circle, rgb(var(--c-accent)), transparent 70%)` }}
            aria-hidden
          />

          <p className="text-sm text-muted">Igjen å bruke</p>
          <p
            className={cx(
              'mt-1 font-num text-[2.6rem] font-semibold leading-none tabular',
              totals.availableOre < 0 ? 'text-danger' : 'text-ink',
            )}
          >
            {formatOre(totals.availableOre)}
          </p>
          <p className="mt-2 text-xs text-muted">
            av {formatOre(totals.totalIncomeOre)} i inntekt
            {totals.extraIncomeOre > 0 && (
              <> · inkl. {formatOre(totals.extraIncomeOre)} ekstra</>
            )}
          </p>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <Stat label="Nettolønn" value={formatOre(totals.salaryOre)} />
            <Stat label="Totalt brukt" value={formatOre(totals.expenseOre)} hint="ekskl. sparing" />
            <Stat
              label="Dager igjen"
              value={String(pace.daysRemaining)}
              hint={pace.daysRemaining === 1 ? 'dag til lønn' : 'dager til lønn'}
            />
          </div>

          {/* Tidslinje for perioden med forbruk */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="text-muted">
                Brukt {formatOre(totals.totalOutOre)}
                {budgetTotal > 0 && <> av {formatOre(budgetTotal)} budsjettert</>}
              </span>
              {budgetTotal > 0 && (
                <span
                  className={cx(
                    'font-medium tabular',
                    totals.totalOutOre > budgetTotal ? 'text-danger' : 'text-muted',
                  )}
                >
                  {formatPercent((totals.totalOutOre / budgetTotal) * 100)}
                </span>
              )}
            </div>
            <ProgressBar
              value={budgetTotal > 0 ? totals.totalOutOre / budgetTotal : 0}
              color={
                budgetTotal > 0 && totals.totalOutOre > budgetTotal
                  ? statusColor('over', resolvedTheme)
                  : `rgb(var(--c-accent))`
              }
              marker={pace.progress}
              height={10}
              label="Forbruk mot budsjett"
            />
            <p className="mt-1.5 text-[0.7rem] text-faint">
              Markøren viser hvor langt ut i perioden du er ({formatPercent(pace.progress * 100)}).
            </p>
          </div>

          {pace.daysRemaining > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-surface2 px-3.5 py-3">
              <div>
                <p className="text-xs text-muted">Disponibelt per dag</p>
                <p
                  className={cx(
                    'font-num text-lg font-semibold tabular',
                    dailyAllowance < 0 ? 'text-danger' : 'text-ink',
                  )}
                >
                  {formatOre(dailyAllowance)}
                </p>
              </div>
              <p className="max-w-[55%] text-right text-[0.7rem] leading-snug text-faint">
                hvis du fordeler resten jevnt på {formatDays(pace.daysRemaining)}
              </p>
            </div>
          )}
        </section>

        {/* Fordeling: forbruk / sparing / gjeld */}
        {(totals.savingOre > 0 || totals.debtOre > 0) && (
          <div className="grid grid-cols-3 gap-2.5">
            <MiniCard label="Forbruk" value={formatOre(totals.expenseOre)} icon={Wallet} tone="accent" />
            <MiniCard label="Spart" value={formatOre(totals.savingOre)} icon={PiggyBank} tone="positive" />
            <MiniCard label="Gjeld" value={formatOre(totals.debtOre)} icon={TrendingUp} tone="warning" />
          </div>
        )}

        {/* Innsikter */}
        {insights.length > 0 && <InsightList insights={insights.slice(0, 3)} />}

        {/* Kategorier */}
        <section>
          <SectionHeading
            title="Budsjett per kategori"
            action={
              <button
                type="button"
                onClick={() => onNavigate('budsjett')}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent"
              >
                Juster
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            }
          />
          {budgetTotal === 0 ? (
            <EmptyState
              compact
              icon={Wallet}
              title="Ingen budsjetter satt"
              description="Sett budsjetter per kategori for å følge forbruket ditt."
              action={
                <Button size="sm" variant="soft" onClick={() => onNavigate('budsjett')}>
                  Sett budsjett
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {statuses.map((status) => (
                <CategoryRow
                  key={status.category.id}
                  status={status}
                  daysRemaining={pace.daysRemaining}
                  periodProgress={pace.progress}
                  onClick={() => onNavigate('historikk')}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Kommende faste utgifter */}
        {upcoming.length > 0 && (
          <section>
            <SectionHeading
              title="Kommende faste utgifter"
              description="Planlagt, ikke trukket fra saldoen ennå"
            />
            <ul className="space-y-2">
              {upcoming.map((item) => {
                const category = data.categories.find((c) => c.id === item.rule.categoryId);
                return (
                  <li key={item.key} className="card flex items-center gap-3 p-3">
                    <CategoryDot category={category} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{item.rule.name}</p>
                      <p className="text-xs text-muted">
                        om {formatDays(item.daysUntil)} · {category?.name ?? 'Ukategorisert'}
                      </p>
                    </div>
                    <span className="font-num text-sm font-medium tabular text-muted">
                      {formatOre(item.rule.amountOre)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => onNavigate('budsjett')}
              className="mt-2 inline-flex items-center gap-1 px-1 text-xs font-medium text-accent"
            >
              Se alle faste utgifter
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </section>
        )}

        {/* Prognose */}
        {overallPace.reliable && budgetTotal > 0 && pace.daysRemaining > 1 && (
          <Card className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                Estimert sluttsum: {formatOre(overallPace.projectedOre)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Basert på {formatOre(overallPace.perDayOre)} per dag over {formatDays(overallPace.daysElapsed)}.
                {overallPace.projectedOverrunOre > 0
                  ? ` Det er ${formatOre(overallPace.projectedOverrunOre)} over budsjettet.`
                  : ` Det er ${formatOre(Math.abs(overallPace.projectedOverrunOre))} under budsjettet.`}
              </p>
              <Badge tone="neutral" className="mt-2">
                Estimat
              </Badge>
            </div>
          </Card>
        )}

        {data.transactions.filter((t) => t.periodId === active.id).length === 0 && (
          <EmptyState
            icon={Plus}
            title="Ingen registreringer i denne perioden"
            description="Trykk på pluss-knappen for å registrere den første utgiften. Det tar noen sekunder."
            action={<Button onClick={onAdd} icon={Plus}>Registrer utgift</Button>}
          />
        )}
      </div>
    </>
  );
}

/* ---------- Delkomponenter ---------- */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[0.7rem] text-muted">{label}</p>
      <p className="mt-0.5 truncate font-num text-[0.95rem] font-semibold tabular text-ink">{value}</p>
      {hint && <p className="truncate text-[0.65rem] text-faint">{hint}</p>}
    </div>
  );
}

function MiniCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone: 'accent' | 'positive' | 'warning';
}) {
  const toneClass = {
    accent: 'text-accent bg-accent/10',
    positive: 'text-positive bg-positive/10',
    warning: 'text-warning bg-warning/10',
  }[tone];
  return (
    <div className="card p-3">
      <span className={cx('mb-2 flex h-7 w-7 items-center justify-center rounded-lg', toneClass)}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <p className="text-[0.7rem] text-muted">{label}</p>
      <p className="truncate font-num text-sm font-semibold tabular text-ink">{value}</p>
    </div>
  );
}

function CategoryRow({
  status,
  daysRemaining,
  periodProgress,
  onClick,
}: {
  status: CategoryStatus;
  daysRemaining: number;
  periodProgress: number;
  onClick: () => void;
}) {
  const { resolvedTheme } = useAppStore();
  const color = colorFor(status.category.color, resolvedTheme);
  const over = status.remainingOre < 0;
  // Varsel når forbruket ligger godt foran tiden som er gått.
  const aheadOfPace =
    !over && status.budgetOre > 0 && status.ratio > periodProgress + 0.18 && daysRemaining > 1;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="card w-full p-3.5 text-left transition active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <CategoryDot category={status.category} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium text-ink">{status.category.name}</span>
              <span className="shrink-0 font-num text-sm font-semibold tabular text-ink">
                {formatOre(status.actualOre)}
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted">
                {status.budgetOre > 0 ? <>av {formatOre(status.budgetOre)}</> : 'uten budsjett'}
              </span>
              <span
                className={cx(
                  'shrink-0 tabular',
                  over ? 'font-medium text-danger' : 'text-muted',
                )}
              >
                {status.budgetOre > 0
                  ? over
                    ? `${formatOre(Math.abs(status.remainingOre))} over`
                    : `${formatOre(status.remainingOre)} igjen`
                  : ''}
              </span>
            </div>
          </div>
        </div>

        {status.budgetOre > 0 && (
          <div className="mt-3">
            <ProgressBar
              value={status.ratio}
              color={over ? statusColor('over', resolvedTheme) : color}
              track={withAlpha(color, 0.12)}
              marker={periodProgress}
              label={`${status.category.name}: ${formatPercent(status.percent)} brukt`}
            />
            {(over || aheadOfPace) && (
              <p
                className={cx(
                  'mt-1.5 text-[0.7rem]',
                  over ? 'font-medium text-danger' : 'text-warning',
                )}
              >
                {over
                  ? 'Over budsjett'
                  : `Ligger foran planen – ${formatPercent(status.percent)} brukt med ${formatDays(daysRemaining)} igjen`}
              </p>
            )}
          </div>
        )}
      </button>
    </li>
  );
}

function InsightList({ insights }: { insights: ReturnType<typeof buildInsights> }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? insights : insights.slice(0, 2);

  const toneStyles = {
    neutral: 'border-line bg-surface',
    positive: 'border-positive/25 bg-positive/8',
    warning: 'border-warning/30 bg-warning/8',
    critical: 'border-danger/30 bg-danger/8',
  } as const;

  return (
    <section>
      <SectionHeading title="Innsikt" description="Beregnet lokalt på dine egne tall" />
      <ul className="space-y-2">
        {visible.map((insight) => (
          <li
            key={insight.id}
            className={cx('flex items-start gap-3 rounded-2xl border p-3.5', toneStyles[insight.tone])}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface/70">
              <Lightbulb className="h-4 w-4 text-warning" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{insight.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{insight.body}</p>
              {insight.isEstimate && (
                <Badge tone="neutral" className="mt-2">
                  Estimat
                </Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
      {insights.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 px-1 text-xs font-medium text-accent"
        >
          {expanded ? 'Vis færre' : `Vis ${insights.length - 2} til`}
        </button>
      )}
    </section>
  );
}

function PeriodBanner({
  period,
  reminderDays,
  onStartPeriod,
}: {
  period: BudgetPeriod;
  reminderDays: number;
  onStartPeriod: () => void;
}) {
  const reference = today();
  const overdue = isPeriodOverdue(period, reference);
  const remind = shouldRemindAboutPayday(period, reminderDays, reference);
  if (!overdue && !remind) return null;

  const days = diffDays(reference, period.expectedNextPayday);

  return (
    <div
      className={cx(
        'flex items-center gap-3 rounded-2xl border p-3.5',
        overdue ? 'border-accent/30 bg-accent/8' : 'border-line bg-surface2',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12">
        <CalendarClock className="h-4 w-4 text-accent" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {overdue ? 'Perioden er ferdig' : days <= 0 ? 'Lønn i dag' : `Lønn om ${formatDays(days)}`}
        </p>
        <p className="text-xs text-muted">
          {overdue
            ? 'Start en ny lønnsperiode for å nullstille forbrukstellerne.'
            : 'Husk å starte ny periode når lønnen kommer.'}
        </p>
      </div>
      <Button size="sm" variant={overdue ? 'primary' : 'secondary'} onClick={onStartPeriod}>
        Start
      </Button>
    </div>
  );
}
