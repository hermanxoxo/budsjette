import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDown, ArrowUp, BarChart3, Minus, TrendingUp } from 'lucide-react';
import type { BudgetPeriod } from '@/types';
import { formatDayShort, formatRange, today } from '@/lib/date';
import { formatOre, formatPercent } from '@/lib/money';
import { chartNeutrals, colorFor, withAlpha } from '@/lib/colors';
import {
  allocationTotal,
  categoryStatuses,
  comparableSpend,
  cumulativeSpending,
  periodSummary,
  periodTotals,
  subcategoryTotals,
} from '@/lib/calc';
import { periodPace } from '@/lib/periods';
import { useAppStore, usePeriods } from '@/state/AppStore';
import { PageHeader } from '@/app/AppShell';
import { Badge, EmptyState, SectionHeading, cx } from '@/ui/primitives';
import { ChartCard, DataTable, Legend, TooltipBox, axisStyle, axisTickFormatter } from './charts';

export function Analysis() {
  const { all: periods, active } = usePeriods();
  const [periodId, setPeriodId] = useState<string>(active?.id ?? periods[periods.length - 1]?.id ?? '');

  const period = periods.find((p) => p.id === periodId) ?? active ?? periods[periods.length - 1];

  if (!period) {
    return (
      <>
        <PageHeader title="Analyse" />
        <div className="px-4">
          <EmptyState
            icon={BarChart3}
            title="Ingen data å analysere"
            description="Start en lønnsperiode og registrer noen utgifter, så dukker grafene opp her."
          />
        </div>
      </>
    );
  }

  return (
    <AnalysisContent
      period={period}
      periods={periods}
      onSelectPeriod={setPeriodId}
    />
  );
}

function AnalysisContent({
  period,
  periods,
  onSelectPeriod,
}: {
  period: BudgetPeriod;
  periods: BudgetPeriod[];
  onSelectPeriod: (id: string) => void;
}) {
  const { data, resolvedTheme } = useAppStore();
  const neutrals = chartNeutrals(resolvedTheme);
  const axis = axisStyle(resolvedTheme);
  const reference = today();

  const index = periods.findIndex((p) => p.id === period.id);
  const previous = index > 0 ? periods[index - 1] : undefined;

  const statuses = useMemo(
    () => categoryStatuses(data.categories, period, data.transactions),
    [data.categories, period, data.transactions],
  );
  const totals = useMemo(() => periodTotals(period, data.transactions), [period, data.transactions]);
  const pace = periodPace(period, reference);
  const hasData = data.transactions.some((t) => t.periodId === period.id);

  /* A. Budsjett mot faktisk */
  const budgetVsActual = statuses
    .filter((s) => s.budgetOre > 0 || s.actualOre > 0)
    .map((s) => ({
      name: s.category.name,
      budsjett: s.budgetOre,
      faktisk: s.actualOre,
      color: colorFor(s.category.color, resolvedTheme),
      over: s.actualOre > s.budgetOre,
    }));

  /* B. Fordeling av ordinære utgifter */
  const expenseShare = statuses
    .filter((s) => s.category.kind === 'expense' && s.actualOre > 0)
    .map((s) => ({
      name: s.category.name,
      value: s.actualOre,
      color: colorFor(s.category.color, resolvedTheme),
    }));
  const expenseTotal = expenseShare.reduce((sum, s) => sum + s.value, 0);

  /* C. Akkumulert forbruk */
  const expenseBudget = statuses
    .filter((s) => s.category.kind === 'expense')
    .reduce((sum, s) => sum + s.budgetOre, 0);
  const cumulative = useMemo(
    () => cumulativeSpending(period, data.transactions, expenseBudget, reference),
    [period, data.transactions, expenseBudget, reference],
  );
  const todayIndex = cumulative.findIndex((p) => p.date === reference);

  /* D. Utvikling over flere perioder */
  const trend = useMemo(
    () =>
      periods.map((p) => {
        const summary = periodSummary(p, data.transactions, reference);
        return {
          id: p.id,
          name: formatDayShort(p.startDate),
          forbruk: summary.totals.expenseOre,
          sparing: summary.totals.savingOre,
          gjeld: summary.totals.debtOre,
          perDag: summary.perDayOre,
          current: p.id === period.id,
        };
      }),
    [periods, data.transactions, reference, period.id],
  );

  /* E. Underkategorier */
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);
  const subTotals = useMemo(
    () =>
      subcategoryTotals(data.transactions, {
        periodId: period.id,
        categoryId: subcategoryFilter ?? undefined,
      }).slice(0, 8),
    [data.transactions, period.id, subcategoryFilter],
  );
  const subMax = subTotals[0]?.amountOre ?? 0;

  /* F. Sammenligning med forrige periode */
  const comparisons = useMemo(() => {
    if (!previous) return [];
    const dayLimit = period.status === 'closed' ? pace.daysTotal : pace.daysElapsed;
    return statuses
      .filter((s) => s.category.kind === 'expense' && (s.actualOre > 0 || s.budgetOre > 0))
      .map((s) => {
        const prev = comparableSpend(previous, data.transactions, dayLimit, s.category.id);
        return {
          id: s.category.id,
          name: s.category.name,
          color: colorFor(s.category.color, resolvedTheme),
          current: s.actualOre,
          previous: prev,
          delta: s.actualOre - prev,
        };
      })
      .filter((row) => row.current > 0 || row.previous > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [previous, statuses, data.transactions, pace, period.status, resolvedTheme]);

  return (
    <>
      <PageHeader
        title="Analyse"
        subtitle={`${formatRange(period.startDate, period.endDate)}${period.status === 'active' ? ' · pågår' : ''}`}
      />

      {/* Periodevelger */}
      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto px-4">
        {[...periods].reverse().map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectPeriod(p.id)}
            className={cx('chip shrink-0', p.id === period.id && 'chip-active')}
          >
            {formatDayShort(p.startDate)}
            {p.status === 'active' && <span className="text-[0.65rem]">· nå</span>}
          </button>
        ))}
      </div>

      {!hasData ? (
        <div className="px-4">
          <EmptyState
            icon={BarChart3}
            title="Ingen registreringer i denne perioden"
            description="Når du registrerer utgifter, viser vi utviklingen her. Vi finner ikke på tall."
          />
        </div>
      ) : (
        <div className="space-y-4 px-4 pb-6">
          {/* Nøkkeltall */}
          <div className="grid grid-cols-2 gap-2.5">
            <KeyFigure label="Ordinært forbruk" value={formatOre(totals.expenseOre)} />
            <KeyFigure label="Spart" value={formatOre(totals.savingOre)} tone="positive" />
            <KeyFigure label="Gjeld nedbetalt" value={formatOre(totals.debtOre)} />
            <KeyFigure
              label="Snitt per dag"
              value={formatOre(Math.round(totals.expenseOre / Math.max(1, pace.daysElapsed)))}
              hint={`over ${pace.daysElapsed} dager`}
            />
          </div>

          {/* A. Budsjett mot faktisk */}
          <ChartCard
            title="Budsjett mot faktisk forbruk"
            description="Alle beløp i kroner. Søyler som passerer budsjettet markeres."
            legend={
              <Legend
                items={[
                  { label: 'Budsjett', color: neutrals.budget },
                  { label: 'Registrert', color: resolvedTheme === 'light' ? '#2a78d6' : '#3987e5' },
                ]}
              />
            }
          >
            {budgetVsActual.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Ingen budsjetter eller registreringer.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(200, budgetVsActual.length * 46)}>
                  <BarChart
                    data={budgetVsActual}
                    layout="vertical"
                    margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                    barGap={2}
                  >
                    <CartesianGrid horizontal={false} stroke={neutrals.grid} />
                    <XAxis
                      type="number"
                      tickFormatter={axisTickFormatter}
                      tick={axis.tick}
                      axisLine={axis.axisLine}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={78}
                      tick={axis.tick}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: withAlpha(neutrals.axis, 0.08) }}
                      content={({ active: isActive, payload, label }) =>
                        isActive && payload?.length ? (
                          <TooltipBox
                            title={String(label)}
                            rows={[
                              {
                                label: 'Budsjett',
                                value: formatOre(Number(payload[0]?.payload?.budsjett ?? 0)),
                                color: neutrals.budget,
                              },
                              {
                                label: 'Registrert',
                                value: formatOre(Number(payload[0]?.payload?.faktisk ?? 0)),
                                color: payload[0]?.payload?.color,
                              },
                            ]}
                          />
                        ) : null
                      }
                    />
                    <Bar dataKey="budsjett" fill={neutrals.budget} radius={[0, 4, 4, 0]} maxBarSize={10} />
                    <Bar dataKey="faktisk" radius={[0, 4, 4, 0]} maxBarSize={10}>
                      {budgetVsActual.map((row) => (
                        <Cell key={row.name} fill={row.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <DataTable
                  caption="Budsjett mot faktisk forbruk per kategori"
                  columns={['Kategori', 'Budsjett', 'Registrert']}
                  rows={budgetVsActual.map((row) => ({
                    key: row.name,
                    cells: [row.name, formatOre(row.budsjett), formatOre(row.faktisk)],
                  }))}
                />
              </>
            )}
          </ChartCard>

          {/* B. Fordeling */}
          <ChartCard
            title="Forbruk fordelt på kategorier"
            description="Kun ordinære utgifter. Sparing og gjeldsbetaling er holdt utenfor."
          >
            {expenseShare.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Ingen ordinære utgifter registrert.</p>
            ) : (
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="relative h-44 w-44 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseShare}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke={neutrals.surface}
                        strokeWidth={2}
                      >
                        {expenseShare.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active: isActive, payload }) =>
                          isActive && payload?.length ? (
                            <TooltipBox
                              title={String(payload[0].name)}
                              rows={[
                                {
                                  label: 'Beløp',
                                  value: formatOre(Number(payload[0].value ?? 0)),
                                  color: payload[0].payload?.color,
                                },
                                {
                                  label: 'Andel',
                                  value: formatPercent(
                                    (Number(payload[0].value ?? 0) / expenseTotal) * 100,
                                    1,
                                  ),
                                },
                              ]}
                            />
                          ) : null
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[0.65rem] text-muted">Totalt</span>
                    <span className="font-num text-sm font-semibold tabular text-ink">
                      {formatOre(expenseTotal)}
                    </span>
                  </div>
                </div>
                <ul className="w-full flex-1 space-y-1.5">
                  {expenseShare.map((entry) => (
                    <li key={entry.name} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: entry.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-ink">{entry.name}</span>
                      <span className="font-num text-xs tabular text-muted">
                        {formatPercent((entry.value / expenseTotal) * 100)}
                      </span>
                      <span className="w-20 text-right font-num text-xs font-medium tabular text-ink">
                        {formatOre(entry.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </ChartCard>

          {/* C. Akkumulert forbruk */}
          <ChartCard
            title="Forbruk gjennom lønnsperioden"
            description="Akkumulert ordinært forbruk, dag for dag."
            legend={
              <Legend
                items={[
                  { label: 'Faktisk forbruk', color: resolvedTheme === 'light' ? '#2a78d6' : '#3987e5' },
                  ...(expenseBudget > 0
                    ? [{ label: 'Jevnt forbruk av budsjettet', color: neutrals.reference, dashed: true }]
                    : []),
                ]}
              />
            }
            footer={
              expenseBudget > 0
                ? `Den stiplede linjen viser hvordan ${formatOre(expenseBudget)} ville blitt brukt jevnt over ${cumulative.length} dager.`
                : 'Sett et budsjett for å se referanselinjen for jevnt forbruk.'
            }
          >
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cumulative} margin={{ top: 8, right: 10, bottom: 4, left: -8 }}>
                <CartesianGrid vertical={false} stroke={neutrals.grid} />
                <XAxis
                  dataKey="label"
                  tick={axis.tick}
                  axisLine={axis.axisLine}
                  tickLine={false}
                  interval={Math.max(1, Math.floor(cumulative.length / 8))}
                />
                <YAxis
                  tickFormatter={axisTickFormatter}
                  tick={axis.tick}
                  axisLine={false}
                  tickLine={false}
                  width={46}
                />
                <Tooltip
                  cursor={{ stroke: neutrals.axis, strokeWidth: 1 }}
                  content={({ active: isActive, payload }) => {
                    if (!isActive || !payload?.length) return null;
                    const point = payload[0].payload as (typeof cumulative)[number];
                    return (
                      <TooltipBox
                        title={`Dag ${point.dayIndex} · ${formatDayShort(point.date)}`}
                        rows={[
                          {
                            label: 'Brukt hittil',
                            value: point.spentOre === null ? '–' : formatOre(point.spentOre),
                            color: resolvedTheme === 'light' ? '#2a78d6' : '#3987e5',
                          },
                          ...(expenseBudget > 0
                            ? [
                                {
                                  label: 'Jevnt forbruk',
                                  value: formatOre(point.idealOre),
                                  color: neutrals.reference,
                                  dashed: true,
                                },
                              ]
                            : []),
                        ]}
                      />
                    );
                  }}
                />
                {expenseBudget > 0 && (
                  <Line
                    type="linear"
                    dataKey="idealOre"
                    stroke={neutrals.reference}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="spentOre"
                  stroke={resolvedTheme === 'light' ? '#2a78d6' : '#3987e5'}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: neutrals.surface }}
                  connectNulls={false}
                />
                {todayIndex >= 0 && period.status === 'active' && (
                  <ReferenceLine
                    x={cumulative[todayIndex].label}
                    stroke={neutrals.axis}
                    strokeDasharray="2 3"
                    label={{ value: 'I dag', position: 'top', fill: neutrals.muted, fontSize: 10 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* E. Underkategorier */}
          <ChartCard
            title="Største underkategorier"
            description="Ordinære utgifter i perioden, sortert etter beløp."
          >
            <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
              <button
                type="button"
                onClick={() => setSubcategoryFilter(null)}
                className={cx('chip shrink-0', subcategoryFilter === null && 'chip-active')}
              >
                Alle
              </button>
              {statuses
                .filter((s) => s.category.kind === 'expense' && s.actualOre > 0)
                .map((s) => (
                  <button
                    key={s.category.id}
                    type="button"
                    onClick={() => setSubcategoryFilter(s.category.id)}
                    className={cx('chip shrink-0', subcategoryFilter === s.category.id && 'chip-active')}
                  >
                    {s.category.name}
                  </button>
                ))}
            </div>

            {subTotals.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Ingen registreringer å vise.</p>
            ) : (
              <ul className="space-y-2.5">
                {subTotals.map((row) => {
                  const category = data.categories.find((c) => c.id === row.categoryId);
                  const color = category ? colorFor(category.color, resolvedTheme) : neutrals.axis;
                  return (
                    <li key={`${row.categoryId}-${row.name}`}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-ink">{row.name}</span>
                        <span className="shrink-0 font-num text-xs font-medium tabular text-ink">
                          {formatOre(row.amountOre)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 flex-1 overflow-hidden rounded-full"
                          style={{ background: withAlpha(color, 0.12) }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${subMax > 0 ? (row.amountOre / subMax) * 100 : 0}%`,
                              background: color,
                            }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right text-[0.7rem] text-muted">
                          {row.count}×
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ChartCard>

          {/* F. Sammenligning med forrige periode */}
          {previous && comparisons.length > 0 && (
            <ChartCard
              title="Sammenlignet med forrige periode"
              description={`Samme antall dager inn i perioden (${period.status === 'closed' ? pace.daysTotal : pace.daysElapsed} dager).`}
            >
              <ul className="divide-y divide-line">
                {comparisons.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: row.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.name}</span>
                    <span className="font-num text-xs tabular text-muted">
                      {formatOre(row.previous)} → {formatOre(row.current)}
                    </span>
                    <DeltaBadge delta={row.delta} />
                  </li>
                ))}
              </ul>
            </ChartCard>
          )}

          {/* D. Utvikling over flere perioder */}
          <section>
            <SectionHeading
              title="Utvikling over flere perioder"
              description={
                periods.length < 2
                  ? 'Trenden blir tilgjengelig når du har fullført minst to perioder.'
                  : undefined
              }
            />
            {periods.length < 2 ? (
              <EmptyState
                compact
                icon={TrendingUp}
                title="For lite historikk"
                description="Når du har startet din andre lønnsperiode, kan du sammenligne periodene her."
              />
            ) : (
              <ChartCard
                title="Forbruk, sparing og gjeld per periode"
                description="Hver søyle er én lønnsperiode. Alle beløp i kroner."
                legend={
                  <Legend
                    items={[
                      { label: 'Forbruk', color: colorFor('blue', resolvedTheme) },
                      { label: 'Sparing', color: colorFor('green', resolvedTheme) },
                      { label: 'Gjeld', color: colorFor('orange', resolvedTheme) },
                    ]}
                  />
                }
              >
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 4, left: -8 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke={neutrals.grid} />
                    <XAxis dataKey="name" tick={axis.tick} axisLine={axis.axisLine} tickLine={false} />
                    <YAxis
                      tickFormatter={axisTickFormatter}
                      tick={axis.tick}
                      axisLine={false}
                      tickLine={false}
                      width={46}
                    />
                    <Tooltip
                      cursor={{ fill: withAlpha(neutrals.axis, 0.08) }}
                      content={({ active: isActive, payload, label }) => {
                        if (!isActive || !payload?.length) return null;
                        const row = payload[0].payload as (typeof trend)[number];
                        return (
                          <TooltipBox
                            title={`Periode fra ${label}`}
                            rows={[
                              { label: 'Forbruk', value: formatOre(row.forbruk), color: colorFor('blue', resolvedTheme) },
                              { label: 'Sparing', value: formatOre(row.sparing), color: colorFor('green', resolvedTheme) },
                              { label: 'Gjeld', value: formatOre(row.gjeld), color: colorFor('orange', resolvedTheme) },
                              { label: 'Snitt per dag', value: formatOre(row.perDag) },
                            ]}
                          />
                        );
                      }}
                    />
                    <Bar dataKey="forbruk" fill={colorFor('blue', resolvedTheme)} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="sparing" fill={colorFor('green', resolvedTheme)} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="gjeld" fill={colorFor('orange', resolvedTheme)} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
                <DataTable
                  caption="Forbruk, sparing og gjeld per lønnsperiode"
                  columns={['Periode', 'Forbruk', 'Sparing', 'Gjeld', 'Per dag']}
                  rows={trend.map((row) => ({
                    key: row.id,
                    cells: [
                      row.name,
                      formatOre(row.forbruk),
                      formatOre(row.sparing),
                      formatOre(row.gjeld),
                      formatOre(row.perDag),
                    ],
                  }))}
                />
              </ChartCard>
            )}
          </section>

          <p className="px-1 text-center text-[0.7rem] text-faint">
            Alle tall er beregnet fra dine egne registreringer. Budsjett for perioden:{' '}
            {formatOre(allocationTotal(period))}.
          </p>
        </div>
      )}
    </>
  );
}

function KeyFigure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'positive';
}) {
  return (
    <div className="card p-3.5">
      <p className="text-[0.7rem] text-muted">{label}</p>
      <p
        className={cx(
          'mt-0.5 truncate font-num text-lg font-semibold tabular',
          tone === 'positive' ? 'text-positive' : 'text-ink',
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[0.65rem] text-faint">{hint}</p>}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <Badge tone="neutral">
        <Minus className="h-3 w-3" aria-hidden />
        Uendret
      </Badge>
    );
  }
  const down = delta < 0;
  return (
    <Badge tone={down ? 'positive' : 'warning'}>
      {down ? <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUp className="h-3 w-3" aria-hidden />}
      {formatOre(Math.abs(delta))}
    </Badge>
  );
}
