import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, PiggyBank, Sparkles, Wallet } from 'lucide-react';
import type { BudgetAllocation, ISODate } from '@/types';
import { formatDay, formatRange, today } from '@/lib/date';
import { formatOre, formatPercent } from '@/lib/money';
import { colorFor } from '@/lib/colors';
import { suggestedAllocations } from '@/lib/defaults';
import { paydayOnOrBefore, periodRangeFrom } from '@/lib/periods';
import { useAppStore } from '@/state/AppStore';
import { CategoryDot } from '@/features/transactions/CategoryPicker';
import { AmountField, AmountInput, DateInput, Slider } from '@/ui/inputs';
import { Button, Field, Switch, cx } from '@/ui/primitives';
import { useCloudSync } from '@/state/CloudSync';
import { SyncPanel } from '@/features/settings/SyncPanel';

const STEPS = ['Velkommen', 'Lønn', 'Budsjett', 'Start'] as const;

/** Førstegangsoppsett. Alle valg kan endres senere i innstillinger. */
export function Onboarding() {
  const { data, dispatch, resolvedTheme } = useAppStore();

  const [step, setStep] = useState(0);
  const sync = useCloudSync();
  const [showLogin, setShowLogin] = useState(false);
  const [salaryOre, setSalaryOre] = useState<number | null>(null);
  const [payday, setPayday] = useState(data.settings.payday);
  const [useFixedPayday, setUseFixedPayday] = useState(true);
  const [startDate, setStartDate] = useState<ISODate>(() => paydayOnOrBefore(today(), data.settings.payday));
  const [startNow, setStartNow] = useState(true);
  const [allocations, setAllocations] = useState<BudgetAllocation[]>([]);
  const [touchedBudget, setTouchedBudget] = useState(false);

  const categories = useMemo(
    () => data.categories.filter((c) => !c.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.categories],
  );

  const effectiveSalary = salaryOre ?? 0;

  // Foreslåtte budsjetter regnes ut fra lønnen til brukeren selv endrer noe.
  const currentAllocations = touchedBudget
    ? allocations
    : suggestedAllocations(effectiveSalary, categories);

  const budgetedOre = currentAllocations.reduce((sum, a) => sum + a.amountOre, 0);
  const unallocatedOre = effectiveSalary - budgetedOre;

  const range = periodRangeFrom(startDate, payday, useFixedPayday);

  const setAllocation = (categoryId: string, amountOre: number) => {
    const base = touchedBudget ? allocations : suggestedAllocations(effectiveSalary, categories);
    setTouchedBudget(true);
    setAllocations(
      base.some((a) => a.categoryId === categoryId)
        ? base.map((a) => (a.categoryId === categoryId ? { ...a, amountOre } : a))
        : [...base, { categoryId, amountOre }],
    );
  };

  const finish = () => {
    dispatch({
      type: 'completeOnboarding',
      input: {
        netSalaryOre: effectiveSalary,
        payday,
        useFixedPayday,
        startDate,
        allocations: currentAllocations,
        startPeriodNow: startNow,
      },
    });
  };

  const canContinue = step !== 1 || (salaryOre !== null && salaryOre > 0);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(2rem+env(safe-area-inset-top,0px))]">
      {/* Fremdrift */}
      <div className="mb-8 flex items-center gap-2" aria-label={`Steg ${step + 1} av ${STEPS.length}`}>
        {STEPS.map((label, index) => (
          <div key={label} className="flex-1">
            <div
              className={cx(
                'h-1 rounded-full transition-colors',
                index <= step ? 'bg-accent' : 'bg-surface2',
              )}
            />
            <p className={cx('mt-1.5 text-[0.65rem]', index === step ? 'text-ink' : 'text-faint')}>
              {label}
            </p>
          </div>
        ))}
      </div>

      <div className="flex-1">
        {step === 0 && (
          <div className="animate-rise">
            <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent/12">
              <Wallet className="h-8 w-8 text-accent" aria-hidden />
            </span>
            <h1 className="text-[1.75rem] leading-tight text-ink">
              Full oversikt fra lønning til lønning
            </h1>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">
              Budsjette følger lønnsperioden din – ikke kalendermåneden. Du ser hvor mye du har
              igjen, hva pengene går til, og om du ligger an til å sprekke før neste lønn.
            </p>
            <ul className="mt-6 space-y-3">
              <Bullet icon={Sparkles} title="Registrer på sekunder" text="Beløp, kategori og underkategori – ferdig." />
              <Bullet icon={PiggyBank} title="Sparing teller riktig" text="Sparing og gjeld skilles fra ordinært forbruk." />
              <Bullet icon={Check} title="Dataene er dine" text="Alt lagres lokalt i nettleseren. Ingen konto nødvendig." />
            </ul>

            {sync.configured && (
              <div className="mt-8 rounded-2xl border border-line bg-surface p-4">
                {sync.status === 'signedOut' && !showLogin ? (
                  <button
                    type="button"
                    onClick={() => setShowLogin(true)}
                    className="w-full text-left text-sm text-muted"
                  >
                    Har du brukt appen på en annen enhet?{' '}
                    <span className="font-medium text-accent">Logg inn og hent dataene</span>
                  </button>
                ) : (
                  <>
                    <p className="mb-3 text-sm font-medium text-ink">Hent data fra en annen enhet</p>
                    <SyncPanel compact />
                    {sync.status === 'synced' && (
                      <p className="mt-3 text-xs text-muted">
                        Fant ingen data i skyen ennå. Fortsett oppsettet, så lastes det opp automatisk.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="animate-rise space-y-6">
            <div>
              <h1 className="text-[1.5rem] text-ink">Hva får du utbetalt?</h1>
              <p className="mt-1.5 text-sm text-muted">
                Nettolønn er beløpet som faktisk kommer inn på konto.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface2 px-4 py-6">
              <AmountInput
                id="onboarding-salary"
                valueOre={salaryOre}
                onChange={(ore) => setSalaryOre(ore)}
                autoFocus
                aria-label="Nettolønn i kroner"
              />
            </div>

            <Field
              label="Hvilken dato får du vanligvis lønn?"
              hint="I korte måneder flyttes lønningsdagen til siste dag i måneden."
            >
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setPayday(day);
                      setStartDate(paydayOnOrBefore(today(), day));
                    }}
                    className={cx(
                      'flex h-9 items-center justify-center rounded-lg text-sm transition',
                      payday === day
                        ? 'bg-accent font-medium text-white'
                        : 'bg-surface2 text-muted hover:text-ink',
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </Field>

            <div className="card-flat p-3.5">
              <Switch
                checked={useFixedPayday}
                onChange={setUseFixedPayday}
                label="Fast månedlig lønningsdag"
                description="Slå av hvis lønnen kommer på varierende datoer. Du kan alltid registrere faktisk dato."
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-rise space-y-5">
            <div>
              <h1 className="text-[1.5rem] text-ink">Fordel lønnen</h1>
              <p className="mt-1.5 text-sm text-muted">
                Dette er bare forslag basert på vanlige fordelinger – juster fritt.
              </p>
            </div>

            <div
              className={cx(
                'flex items-center justify-between rounded-2xl border p-3.5 text-sm',
                unallocatedOre < 0 ? 'border-danger/30 bg-danger/8' : 'border-line bg-surface2',
              )}
            >
              <span className={unallocatedOre < 0 ? 'text-danger' : 'text-ink'}>
                {unallocatedOre < 0 ? 'Overbudsjettert' : 'Ufordelt'}
              </span>
              <span
                className={cx(
                  'font-num font-semibold tabular',
                  unallocatedOre < 0 ? 'text-danger' : 'text-ink',
                )}
              >
                {formatOre(Math.abs(unallocatedOre))}
              </span>
            </div>

            <ul className="space-y-3">
              {categories.map((category) => {
                const amountOre =
                  currentAllocations.find((a) => a.categoryId === category.id)?.amountOre ?? 0;
                return (
                  <li key={category.id} className="card p-3.5">
                    <div className="flex items-center gap-3">
                      <CategoryDot category={category} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{category.name}</p>
                        <p className="text-xs text-muted">
                          {formatPercent(effectiveSalary > 0 ? (amountOre / effectiveSalary) * 100 : 0, 1)}
                        </p>
                      </div>
                      <div className="w-28">
                        <AmountField
                          valueOre={amountOre}
                          label={`Budsjett for ${category.name}`}
                          onChange={(ore) => setAllocation(category.id, ore)}
                        />
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <Slider
                        label={`Budsjett for ${category.name}`}
                        value={amountOre}
                        min={0}
                        max={Math.max(effectiveSalary, amountOre, 500_000)}
                        step={10_000}
                        color={colorFor(category.color, resolvedTheme)}
                        onChange={(value) => setAllocation(category.id, value)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {step === 3 && (
          <div className="animate-rise space-y-5">
            <div>
              <h1 className="text-[1.5rem] text-ink">Klar til å starte</h1>
              <p className="mt-1.5 text-sm text-muted">
                Vi oppretter din første lønnsperiode. Du kan endre alt senere.
              </p>
            </div>

            <div className="card-flat p-3.5">
              <Switch
                checked={startNow}
                onChange={setStartNow}
                label="Start en lønnsperiode nå"
                description="Slå av hvis du heller vil vente til neste lønning."
              />
            </div>

            {startNow && (
              <Field
                label="Startdato for perioden"
                hint={`Perioden varer ${formatRange(range.startDate, range.endDate)}. Neste lønn forventes ${formatDay(range.expectedNextPayday)}.`}
              >
                <DateInput value={startDate} onChange={setStartDate} label="Startdato" />
              </Field>
            )}

            <dl className="card-flat divide-y divide-line p-0 text-sm">
              <Row label="Nettolønn" value={formatOre(effectiveSalary)} />
              <Row label="Lønningsdag" value={useFixedPayday ? `Den ${payday}.` : 'Manuell'} />
              <Row label="Budsjettert" value={formatOre(budgetedOre)} />
              <Row
                label={unallocatedOre < 0 ? 'Overbudsjettert' : 'Ufordelt'}
                value={formatOre(Math.abs(unallocatedOre))}
                tone={unallocatedOre < 0 ? 'danger' : undefined}
              />
            </dl>

            <p className="text-xs leading-relaxed text-muted">
              Dataene lagres bare i denne nettleseren. Ta jevnlig sikkerhetskopi via
              Innstillinger → Eksporter data hvis du vil ha dem trygt lagret.
            </p>
          </div>
        )}
      </div>

      {/* Navigasjon */}
      <div className="mt-8 flex gap-2">
        {step > 0 && (
          <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={() => setStep((s) => s - 1)}>
            Tilbake
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            size="lg"
            fullWidth
            iconRight={ArrowRight}
            disabled={!canContinue}
            onClick={() => setStep((s) => s + 1)}
          >
            {step === 0 ? 'Kom i gang' : 'Neste'}
          </Button>
        ) : (
          <Button size="lg" fullWidth icon={Check} onClick={finish}>
            Fullfør
          </Button>
        )}
      </div>
    </div>
  );
}

function Bullet({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Wallet;
  title: string;
  text: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface2">
        <Icon className="h-4 w-4 text-accent" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-muted">{text}</p>
      </div>
    </li>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className={cx('font-num font-medium tabular', tone === 'danger' ? 'text-danger' : 'text-ink')}>
        {value}
      </dd>
    </div>
  );
}
