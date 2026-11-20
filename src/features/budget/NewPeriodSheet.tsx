import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, Check, PiggyBank, Receipt, Wallet } from 'lucide-react';
import type { BudgetAllocation, ISODate } from '@/types';
import { formatDays, formatRange, today } from '@/lib/date';
import { formatOre } from '@/lib/money';
import { closingSummary } from '@/lib/insights';
import { paydayOnOrAfter, periodRangeFrom } from '@/lib/periods';
import { useAppStore, usePeriods } from '@/state/AppStore';
import { Sheet } from '@/ui/Sheet';
import { AmountField, DateInput } from '@/ui/inputs';
import { Button, Field, Switch, cx } from '@/ui/primitives';
import { useToast } from '@/ui/Toast';

/**
 * Starter en ny lønnsperiode.
 * Viser først en oppsummering av perioden som avsluttes, deretter
 * lønn og budsjett for den nye. Ingenting slettes – forrige periode arkiveres.
 */
export function NewPeriodSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, dispatch } = useAppStore();
  const { active } = usePeriods();
  const toast = useToast();

  const [step, setStep] = useState<'summary' | 'setup'>(active ? 'summary' : 'setup');
  const [startDate, setStartDate] = useState<ISODate>(today());
  const [salaryOre, setSalaryOre] = useState(0);
  const [allocations, setAllocations] = useState<BudgetAllocation[]>([]);
  const [carryBudget, setCarryBudget] = useState(true);

  useEffect(() => {
    if (!open) return;
    setStep(active ? 'summary' : 'setup');
    // Foreslå neste forventede lønningsdato, men aldri frem i tid forbi i dag
    // med mer enn det brukeren faktisk venter på.
    const suggested = active
      ? active.expectedNextPayday <= today()
        ? active.expectedNextPayday
        : today()
      : paydayOnOrAfter(today(), data.settings.payday);
    setStartDate(suggested);
    setSalaryOre(active?.netSalaryOre ?? data.settings.defaultNetSalaryOre);
    setAllocations(
      active
        ? active.allocations.map((a) => ({ ...a }))
        : data.categories.filter((c) => !c.archived).map((c) => ({ categoryId: c.id, amountOre: 0 })),
    );
    setCarryBudget(true);
  }, [open, active, data.settings.payday, data.settings.defaultNetSalaryOre, data.categories]);

  const summary = useMemo(
    () => (active ? closingSummary(data, active) : null),
    [data, active],
  );

  const range = useMemo(
    () => periodRangeFrom(startDate, data.settings.payday, data.settings.useFixedPayday),
    [startDate, data.settings.payday, data.settings.useFixedPayday],
  );

  const budgetedOre = allocations.reduce((sum, a) => sum + a.amountOre, 0);
  const unallocatedOre = salaryOre - budgetedOre;

  const categories = data.categories
    .filter((c) => !c.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const handleStart = () => {
    dispatch({
      type: 'startNewPeriod',
      input: {
        startDate,
        netSalaryOre: salaryOre,
        allocations: carryBudget
          ? allocations
          : allocations.map((a) => ({ ...a, amountOre: 0 })),
      },
    });
    toast.success('Ny lønnsperiode er startet.');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={step === 'summary' ? 'Avslutt perioden' : 'Start ny lønnsperiode'}
      description={
        step === 'summary' && active
          ? formatRange(active.startDate, active.endDate)
          : formatRange(range.startDate, range.endDate)
      }
      size="lg"
      footer={
        step === 'summary' ? (
          <Button size="lg" fullWidth iconRight={ArrowRight} onClick={() => setStep('setup')}>
            Fortsett
          </Button>
        ) : (
          <div className="flex gap-2">
            {active && (
              <Button variant="secondary" size="lg" onClick={() => setStep('summary')}>
                Tilbake
              </Button>
            )}
            <Button size="lg" fullWidth icon={Check} onClick={handleStart}>
              Start perioden
            </Button>
          </div>
        )
      }
    >
      {step === 'summary' && summary && active ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            Perioden arkiveres med all historikk. Ingenting blir slettet, og du kan se den igjen
            under analyse og historikk.
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <SummaryTile
              icon={Wallet}
              label="Inntekt"
              value={formatOre(summary.totals.totalIncomeOre)}
            />
            <SummaryTile
              icon={Receipt}
              label="Ordinært forbruk"
              value={formatOre(summary.totals.expenseOre)}
            />
            <SummaryTile icon={PiggyBank} label="Spart" value={formatOre(summary.totals.savingOre)} />
            <SummaryTile
              icon={CalendarClock}
              label="Igjen"
              value={formatOre(summary.totals.availableOre)}
              tone={summary.totals.availableOre < 0 ? 'danger' : 'positive'}
            />
          </div>

          <div className="card-flat p-3.5">
            <p className="text-xs text-muted">
              {summary.transactionCount} registreringer over {formatDays(summary.days)} ·{' '}
              {formatOre(summary.perDayOre)} per dag i snitt
            </p>
            {summary.topCategories.length > 0 && (
              <ul className="mt-2.5 space-y-1.5">
                {summary.topCategories.map((row) => (
                  <li key={row.name} className="flex justify-between text-sm">
                    <span className="text-ink">{row.name}</span>
                    <span className="font-num tabular text-muted">{formatOre(row.amountOre)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {summary.totals.budgetedOre > 0 && (
            <p className="text-xs text-muted">
              Budsjettet var {formatOre(summary.totals.budgetedOre)}, og du brukte{' '}
              {formatOre(summary.totals.totalOutOre)} totalt (inkludert sparing og gjeld).
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <Field
            label="Lønnsdato"
            hint={
              data.settings.useFixedPayday
                ? `Perioden varer til ${formatRange(range.startDate, range.endDate).split('–')[1]?.trim()}. Juster datoen hvis lønnen kom en annen dag.`
                : 'Du har valgt manuell lønnsdato – sett datoen lønnen faktisk kom.'
            }
          >
            <DateInput value={startDate} onChange={setStartDate} label="Lønnsdato" />
          </Field>

          <Field label="Nettolønn denne perioden" hint="Kan avvike fra din vanlige lønn ved bonus eller ferie.">
            <AmountField valueOre={salaryOre} onChange={setSalaryOre} label="Nettolønn" />
          </Field>

          <div className="card-flat p-3.5">
            <Switch
              checked={carryBudget}
              onChange={setCarryBudget}
              label="Viderefør budsjettene"
              description="Behold fordelingen fra forrige periode. Du kan justere alt etterpå."
            />
          </div>

          {carryBudget && (
            <div>
              <p className="label-base">Budsjett per kategori</p>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {categories.map((category) => {
                  const value = allocations.find((a) => a.categoryId === category.id)?.amountOre ?? 0;
                  return (
                    <li key={category.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{category.name}</span>
                      <div className="w-32">
                        <AmountField
                          valueOre={value}
                          label={`Budsjett for ${category.name}`}
                          onChange={(ore) =>
                            setAllocations((prev) => {
                              const exists = prev.some((a) => a.categoryId === category.id);
                              return exists
                                ? prev.map((a) =>
                                    a.categoryId === category.id ? { ...a, amountOre: ore } : a,
                                  )
                                : [...prev, { categoryId: category.id, amountOre: ore }];
                            })
                          }
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div
            className={cx(
              'rounded-2xl border p-3.5 text-sm',
              unallocatedOre < 0
                ? 'border-danger/30 bg-danger/8 text-danger'
                : 'border-line bg-surface2 text-ink',
            )}
          >
            <div className="flex items-center justify-between">
              <span>{unallocatedOre < 0 ? 'Overbudsjettert' : 'Ufordelt beløp'}</span>
              <span className="font-num font-semibold tabular">{formatOre(Math.abs(unallocatedOre))}</span>
            </div>
            <p className="mt-1 text-xs opacity-80">
              Nettolønn {formatOre(salaryOre)} − budsjetter {formatOre(budgetedOre)}
            </p>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: 'positive' | 'danger';
}) {
  return (
    <div className="card-flat p-3.5">
      <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
        <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
      </span>
      <p className="text-[0.7rem] text-muted">{label}</p>
      <p
        className={cx(
          'truncate font-num text-base font-semibold tabular',
          tone === 'danger' ? 'text-danger' : tone === 'positive' ? 'text-positive' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}
