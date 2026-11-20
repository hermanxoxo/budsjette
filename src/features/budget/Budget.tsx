import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CalendarPlus,
  CheckCircle2,
  Pencil,
  Plus,
  Repeat,
  Shapes,
  Sparkles,
} from 'lucide-react';
import type { BudgetCategory, BudgetPeriod, Transaction } from '@/types';
import { formatDay, formatRange, today } from '@/lib/date';
import { formatOre, formatPercent } from '@/lib/money';
import { colorFor } from '@/lib/colors';
import { allocationFor, allocationTotal, periodTotals } from '@/lib/calc';
import { intervalLabel, pendingOccurrences, upcomingOccurrences } from '@/lib/recurring';
import { useAppStore, usePeriods } from '@/state/AppStore';
import { PageHeader } from '@/app/AppShell';
import { CategoryDot } from '@/features/transactions/CategoryPicker';
import { AmountField, Slider } from '@/ui/inputs';
import { Badge, Button, EmptyState, SectionHeading, cx } from '@/ui/primitives';
import { useToast } from '@/ui/Toast';
import { NewPeriodSheet } from './NewPeriodSheet';
import { RecurringSheet } from './RecurringSheet';
import { CategorySheet } from './CategorySheet';

/** Steg på 100 kr gir presise nok sliders uten å bli hakkete. */
const STEP_ORE = 10_000;

export function Budget({ onAddIncome }: { onAddIncome: () => void }) {
  const { active } = usePeriods();
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);

  if (!active) {
    return (
      <>
        <PageHeader title="Budsjett" subtitle="Ingen aktiv lønnsperiode" />
        <div className="px-4">
          <EmptyState
            icon={CalendarPlus}
            title="Start en lønnsperiode"
            description="Budsjettet settes per lønnsperiode, slik at historikken alltid beholder sine egne tall."
            action={
              <Button icon={Plus} onClick={() => setNewPeriodOpen(true)}>
                Start lønnsperiode
              </Button>
            }
          />
        </div>
        <NewPeriodSheet open={newPeriodOpen} onClose={() => setNewPeriodOpen(false)} />
      </>
    );
  }

  return <BudgetContent period={active} onAddIncome={onAddIncome} />;
}

function BudgetContent({
  period,
  onAddIncome,
}: {
  period: BudgetPeriod;
  onAddIncome: () => void;
}) {
  const { data, dispatch, resolvedTheme } = useAppStore();
  const toast = useToast();

  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const totals = periodTotals(period, data.transactions);
  const categories = useMemo(
    () =>
      data.categories
        .filter((c) => showArchived || !c.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [data.categories, showArchived],
  );

  const budgetedOre = allocationTotal(period);
  const unallocatedOre = totals.salaryOre + totals.extraIncomeOre - budgetedOre;
  const overBudgeted = unallocatedOre < 0;

  const incomeEntries = useMemo(
    () =>
      data.transactions
        .filter((t) => t.periodId === period.id && t.kind === 'income')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.transactions, period.id],
  );

  const pending = useMemo(
    () => pendingOccurrences(data.recurring, data.transactions, today()).filter((o) => o.dueDate >= period.startDate),
    [data.recurring, data.transactions, period.startDate],
  );
  const upcoming = useMemo(
    () => upcomingOccurrences(data.recurring, data.transactions, today(), period.endDate),
    [data.recurring, data.transactions, period.endDate],
  );

  const sliderMax = Math.max(totals.salaryOre, budgetedOre, 500_000);

  const postOccurrence = (key: string) => {
    const item = pending.find((o) => o.key === key);
    if (!item) return;
    dispatch({
      type: 'addTransactions',
      inputs: [
        {
          kind: item.rule.kind,
          amountOre: item.rule.amountOre,
          categoryId: item.rule.categoryId,
          subcategoryName: item.rule.subcategoryName,
          date: item.dueDate,
          note: item.rule.note,
          recurringId: item.rule.id,
          occurrenceKey: item.key,
        },
      ],
    });
    toast.success(`${item.rule.name} er bokført.`);
  };

  return (
    <>
      <PageHeader
        title="Budsjett"
        subtitle={formatRange(period.startDate, period.endDate)}
        action={
          <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => setNewPeriodOpen(true)}>
            Ny periode
          </Button>
        }
      />

      <div className="space-y-6 px-4 pb-6">
        {/* Nettolønn */}
        <section className="card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-[0.95rem] font-semibold text-ink">Nettolønn</h2>
              <p className="mt-0.5 text-xs text-muted">Gjelder kun denne perioden</p>
            </div>
            <div className="w-36">
              <AmountField
                valueOre={totals.salaryOre}
                label="Nettolønn"
                onChange={(ore) => dispatch({ type: 'setPeriodSalary', periodId: period.id, amountOre: ore })}
              />
            </div>
          </div>

          <div className="mt-3">
            <Slider
              label="Nettolønn"
              value={totals.salaryOre}
              min={0}
              max={Math.max(10_000_000, totals.salaryOre)}
              step={STEP_ORE}
              onChange={(value) => dispatch({ type: 'setPeriodSalary', periodId: period.id, amountOre: value })}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">Ekstra inntekt i perioden</p>
              <p className="font-num text-sm font-medium tabular text-ink">
                {formatOre(totals.extraIncomeOre)}
              </p>
            </div>
            <Button size="sm" variant="soft" icon={Banknote} onClick={onAddIncome}>
              Registrer inntekt
            </Button>
          </div>

          {incomeEntries.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {incomeEntries.map((entry: Transaction) => (
                <li key={entry.id} className="flex justify-between text-xs text-muted">
                  <span className="truncate">
                    {entry.subcategoryName || entry.note || 'Ekstra inntekt'} · {formatDay(entry.date)}
                  </span>
                  <span className="font-num tabular text-positive">
                    +{formatOre(entry.amountOre)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ufordelt beløp */}
        <section
          className={cx(
            'rounded-2xl border p-4',
            overBudgeted ? 'border-danger/30 bg-danger/8' : 'border-line bg-surface',
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                overBudgeted ? 'bg-danger/15' : 'bg-positive/12',
              )}
            >
              {overBudgeted ? (
                <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-positive" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {overBudgeted ? 'Overbudsjettert' : 'Ufordelt beløp'}
              </p>
              <p className="text-xs text-muted">
                {formatOre(totals.salaryOre + totals.extraIncomeOre)} inntekt −{' '}
                {formatOre(budgetedOre)} budsjettert
              </p>
            </div>
            <p
              className={cx(
                'shrink-0 font-num text-lg font-semibold tabular',
                overBudgeted ? 'text-danger' : 'text-ink',
              )}
            >
              {formatOre(Math.abs(unallocatedOre))}
            </p>
          </div>
          {overBudgeted && (
            <p className="mt-2.5 text-xs text-danger">
              Budsjettene dine er {formatOre(Math.abs(unallocatedOre))} høyere enn inntekten i perioden.
              Juster ned en eller flere kategorier.
            </p>
          )}
        </section>

        {/* Kategoribudsjetter */}
        <section>
          <SectionHeading
            title="Budsjett per kategori"
            description="Dra i slideren eller skriv inn nøyaktig beløp"
          />
          <ul className="space-y-3">
            {categories.map((category) => (
              <CategoryBudgetRow
                key={category.id}
                category={category}
                period={period}
                salaryOre={totals.salaryOre + totals.extraIncomeOre}
                maxOre={sliderMax}
                color={colorFor(category.color, resolvedTheme)}
                onEdit={() => {
                  setEditingCategory(category.id);
                  setCategoryOpen(true);
                }}
              />
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={Shapes}
              onClick={() => {
                setEditingCategory(null);
                setCategoryOpen(true);
              }}
            >
              Ny kategori
            </Button>
            {data.categories.some((c) => c.archived) && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="text-xs text-muted underline-offset-2 hover:underline"
              >
                {showArchived ? 'Skjul arkiverte' : 'Vis arkiverte'}
              </button>
            )}
          </div>
        </section>

        {/* Faste utgifter */}
        <section>
          <SectionHeading
            title="Faste utgifter"
            description="Planlagte utgifter trekkes først fra når de er registrert"
            action={
              <Button
                size="sm"
                variant="soft"
                icon={Plus}
                onClick={() => {
                  setEditingRecurring(null);
                  setRecurringOpen(true);
                }}
              >
                Ny
              </Button>
            }
          />

          {pending.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="px-1 text-xs font-medium text-warning">Venter på bekreftelse</p>
              {pending.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/8 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{item.rule.name}</p>
                    <p className="text-xs text-muted">
                      Forfalt {formatDay(item.dueDate)} · {formatOre(item.rule.amountOre)}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'skipOccurrence', recurringId: item.rule.id, occurrenceKey: item.key })}>
                    Hopp over
                  </Button>
                  <Button size="sm" onClick={() => postOccurrence(item.key)}>
                    Bokfør
                  </Button>
                </div>
              ))}
            </div>
          )}

          {data.recurring.length === 0 ? (
            <EmptyState
              compact
              icon={Repeat}
              title="Ingen faste utgifter"
              description="Legg inn husleie, strøm og abonnementer så slipper du å registrere dem manuelt."
            />
          ) : (
            <ul className="space-y-2">
              {data.recurring.map((rule) => {
                const category = data.categories.find((c) => c.id === rule.categoryId);
                const next = upcoming.find((o) => o.rule.id === rule.id);
                return (
                  <li key={rule.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRecurring(rule.id);
                        setRecurringOpen(true);
                      }}
                      className="card flex w-full items-center gap-3 p-3 text-left transition active:scale-[0.99]"
                    >
                      <CategoryDot category={category} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink">{rule.name}</span>
                          {!rule.active && <Badge tone="neutral">Pause</Badge>}
                          {rule.autoPost && rule.active && <Badge tone="accent">Automatisk</Badge>}
                        </div>
                        <p className="truncate text-xs text-muted">
                          {intervalLabel(rule.interval)}
                          {next ? ` · neste ${formatDay(next.dueDate)}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 font-num text-sm font-medium tabular text-ink">
                        {formatOre(rule.amountOre)}
                      </span>
                      <Pencil className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {upcoming.length > 0 && (
            <p className="mt-2 px-1 text-xs text-muted">
              Planlagt resten av perioden:{' '}
              <span className="font-medium text-ink">
                {formatOre(upcoming.reduce((sum, o) => sum + o.rule.amountOre, 0))}
              </span>{' '}
              – ikke trukket fra saldoen ennå.
            </p>
          )}
        </section>

        {/* Ny periode */}
        <section className="card p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
              <Sparkles className="h-5 w-5 text-accent" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[0.95rem] font-semibold text-ink">Start ny lønnsperiode</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Arkiverer perioden som pågår, viderefører budsjettene og nullstiller
                forbrukstellerne. All historikk beholdes.
              </p>
              <Button className="mt-3" icon={CalendarPlus} onClick={() => setNewPeriodOpen(true)}>
                Start ny periode
              </Button>
            </div>
          </div>
        </section>
      </div>

      <NewPeriodSheet open={newPeriodOpen} onClose={() => setNewPeriodOpen(false)} />
      <RecurringSheet
        open={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        editing={data.recurring.find((r) => r.id === editingRecurring) ?? null}
      />
      <CategorySheet
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        editing={data.categories.find((c) => c.id === editingCategory) ?? null}
      />
    </>
  );
}

function CategoryBudgetRow({
  category,
  period,
  salaryOre,
  maxOre,
  color,
  onEdit,
}: {
  category: BudgetCategory;
  period: BudgetPeriod;
  salaryOre: number;
  maxOre: number;
  color: string;
  onEdit: () => void;
}) {
  const { dispatch } = useAppStore();
  const amountOre = allocationFor(period, category.id);
  const share = salaryOre > 0 ? (amountOre / salaryOre) * 100 : 0;

  const setAmount = (ore: number) =>
    dispatch({ type: 'setAllocation', periodId: period.id, categoryId: category.id, amountOre: ore });

  return (
    <li className={cx('card p-3.5', category.archived && 'opacity-60')}>
      <div className="flex items-center gap-3">
        <CategoryDot category={category} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-ink">{category.name}</span>
            {category.archived && <Badge tone="neutral">Arkivert</Badge>}
            {category.kind === 'saving' && <Badge tone="positive">Sparing</Badge>}
            {category.kind === 'debt' && <Badge tone="warning">Gjeld</Badge>}
          </div>
          <p className="text-xs text-muted">{formatPercent(share, 1)} av inntekten</p>
        </div>
        <div className="w-28 shrink-0">
          <AmountField
            valueOre={amountOre}
            onChange={setAmount}
            label={`Budsjett for ${category.name}`}
          />
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Rediger ${category.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint transition hover:bg-surface2 hover:text-ink"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-1.5">
        <Slider
          label={`Budsjett for ${category.name}`}
          value={amountOre}
          min={0}
          max={maxOre}
          step={STEP_ORE}
          color={color}
          onChange={setAmount}
        />
      </div>
    </li>
  );
}
