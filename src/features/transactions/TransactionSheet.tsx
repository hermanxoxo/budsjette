import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, CreditCard, PiggyBank, Receipt, Star, Trash2 } from 'lucide-react';
import type { ISODate, Ore, Transaction, TransactionKind } from '@/types';
import { addDays, formatDay, formatRange, today } from '@/lib/date';
import { formatOre } from '@/lib/money';
import { findPeriodForDate } from '@/lib/periods';
import { topSubcategories, suggestAmount } from '@/lib/suggestions';
import { useAppStore } from '@/state/AppStore';
import { Sheet, ConfirmDialog } from '@/ui/Sheet';
import { AmountInput, DateInput, QuickDates } from '@/ui/inputs';
import { Badge, Button, Field, Segmented, cx } from '@/ui/primitives';
import { useToast } from '@/ui/Toast';
import { CategoryPicker } from './CategoryPicker';
import { SubcategoryChips, SubcategoryInput } from './SubcategoryInput';

const KIND_OPTIONS: { value: TransactionKind; label: string; icon: typeof Receipt }[] = [
  { value: 'expense', label: 'Utgift', icon: Receipt },
  { value: 'saving', label: 'Sparing', icon: PiggyBank },
  { value: 'debt', label: 'Gjeld', icon: CreditCard },
  { value: 'income', label: 'Inntekt', icon: Banknote },
];

export interface TransactionSheetProps {
  open: boolean;
  onClose: () => void;
  /** Transaksjon som redigeres. Utelates ved ny registrering. */
  editing?: Transaction | null;
  defaultKind?: TransactionKind;
  defaultCategoryId?: string | null;
  defaultDate?: ISODate;
}

export function TransactionSheet({
  open,
  onClose,
  editing,
  defaultKind = 'expense',
  defaultCategoryId,
  defaultDate,
}: TransactionSheetProps) {
  const { data, dispatch } = useAppStore();
  const toast = useToast();
  const ids = useId();

  const categories = useMemo(
    () => data.categories.filter((c) => !c.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.categories],
  );

  const [amountOre, setAmountOre] = useState<Ore | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState('');
  const [date, setDate] = useState<ISODate>(today());
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<TransactionKind>(defaultKind);
  const [kindTouched, setKindTouched] = useState(false);
  const [showKindPicker, setShowKindPicker] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* Fyll skjemaet når arket åpnes. */
  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setKindTouched(false);
    if (editing) {
      setAmountOre(editing.amountOre);
      setCategoryId(editing.categoryId);
      setSubcategory(editing.subcategoryName ?? '');
      setDate(editing.date);
      setNote(editing.note ?? '');
      setKind(editing.kind);
      setShowKindPicker(true);
    } else {
      setAmountOre(null);
      // Forhåndsvelg sist brukte kategori, men lås ingenting.
      setCategoryId(defaultCategoryId ?? data.settings.lastUsed?.categoryId ?? null);
      setSubcategory('');
      setDate(defaultDate ?? today());
      setNote('');
      setKind(defaultKind);
      setShowKindPicker(defaultKind === 'income');
    }
  }, [open, editing, defaultCategoryId, defaultDate, defaultKind, data.settings.lastUsed]);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  /* Transaksjonstypen følger kategorien til brukeren eventuelt overstyrer den. */
  useEffect(() => {
    if (kindTouched || kind === 'income' || kind === 'adjustment') return;
    if (!selectedCategory) return;
    setKind(selectedCategory.kind);
  }, [selectedCategory, kindTouched, kind]);

  const quickNames = useMemo(() => {
    if (!categoryId) return [];
    return topSubcategories(data.subcategories, categoryId, 6).map((s) => s.name);
  }, [data.subcategories, categoryId]);

  const suggestedAmountOre = useMemo(
    () => (editing ? null : suggestAmount(data.transactions, categoryId, subcategory)),
    [data.transactions, categoryId, subcategory, editing],
  );

  const targetPeriod = findPeriodForDate(data.periods, date);
  const needsCategory = kind === 'expense' || kind === 'saving' || kind === 'debt';

  const amountError =
    submitted && (amountOre === null || amountOre <= 0)
      ? 'Skriv inn et beløp større enn 0.'
      : submitted && amountOre !== null && amountOre > 100_000_000
        ? 'Beløpet virker urimelig stort. Sjekk at det stemmer.'
        : undefined;
  const categoryError =
    submitted && needsCategory && !categoryId ? 'Velg en hovedkategori.' : undefined;

  const canSave = amountOre !== null && amountOre > 0 && (!needsCategory || Boolean(categoryId));

  const handleSave = () => {
    setSubmitted(true);
    if (!canSave || amountOre === null) return;

    if (!data.periods.length) {
      toast.error('Du må starte en lønnsperiode før du kan registrere.');
      return;
    }

    const payload = {
      kind,
      amountOre,
      categoryId: needsCategory ? categoryId : categoryId ?? null,
      subcategoryName: subcategory.trim() || null,
      date,
      note: note.trim() || undefined,
    };

    if (editing) {
      dispatch({ type: 'updateTransaction', id: editing.id, patch: payload });
      toast.success('Endringene er lagret.');
    } else {
      dispatch({ type: 'addTransaction', input: payload });
      toast.success(`${formatOre(amountOre)} registrert.`);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!editing) return;
    const removed = editing;
    dispatch({ type: 'deleteTransaction', id: removed.id });
    setConfirmDelete(false);
    onClose();
    toast.show('Transaksjonen er slettet.', {
      tone: 'success',
      action: {
        label: 'Angre',
        onClick: () =>
          dispatch({
            type: 'addTransaction',
            input: {
              kind: removed.kind,
              amountOre: removed.amountOre,
              categoryId: removed.categoryId,
              subcategoryName: removed.subcategoryName,
              date: removed.date,
              note: removed.note,
            },
          }),
      },
    });
  };

  const saveAsFavorite = () => {
    if (!amountOre && !subcategory.trim()) return;
    dispatch({
      type: 'addFavorite',
      favorite: {
        label: subcategory.trim() || selectedCategory?.name || 'Favoritt',
        amountOre: amountOre ?? null,
        kind,
        categoryId,
        subcategoryName: subcategory.trim() || null,
      },
    });
    toast.success('Lagt til som favoritt.');
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={editing ? 'Rediger registrering' : 'Ny registrering'}
        description={
          targetPeriod
            ? `Føres på perioden ${formatRange(targetPeriod.startDate, targetPeriod.endDate)}`
            : 'Datoen ligger utenfor lønnsperiodene dine'
        }
        footer={
          <div className="flex gap-2">
            {editing && (
              <Button
                variant="secondary"
                size="lg"
                icon={Trash2}
                aria-label="Slett transaksjon"
                onClick={() => setConfirmDelete(true)}
                className="!px-4 text-danger"
              >
                <span className="sr-only sm:not-sr-only">Slett</span>
              </Button>
            )}
            <Button size="lg" fullWidth onClick={handleSave} disabled={submitted && !canSave}>
              {editing ? 'Lagre endringer' : 'Lagre'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Beløp */}
          <div>
            <div
              className={cx(
                'rounded-2xl border px-4 py-5 transition',
                amountError ? 'border-danger/50 bg-danger/5' : 'border-line bg-surface2',
              )}
            >
              <AmountInput
                id={`${ids}-amount`}
                valueOre={amountOre}
                onChange={(ore) => setAmountOre(ore)}
                autoFocus={!editing}
                error={Boolean(amountError)}
                aria-label="Beløp i kroner"
              />
            </div>
            {amountError && (
              <p className="mt-1.5 text-xs text-danger" role="alert">
                {amountError}
              </p>
            )}
            {!amountError && suggestedAmountOre && amountOre === null && (
              <button
                type="button"
                onClick={() => setAmountOre(suggestedAmountOre)}
                className="mt-2 w-full rounded-xl bg-accent/8 px-3 py-2 text-xs text-accent transition active:scale-[0.99]"
              >
                Du pleier å bruke {formatOre(suggestedAmountOre)} her – trykk for å fylle inn
              </button>
            )}
          </div>

          {/* Favoritter */}
          {!editing && data.favorites.length > 0 && (
            <div>
              <p className="label-base">Hurtigvalg</p>
              <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                {data.favorites.map((fav) => (
                  <button
                    key={fav.id}
                    type="button"
                    onClick={() => {
                      if (fav.amountOre) setAmountOre(fav.amountOre);
                      setCategoryId(fav.categoryId);
                      setSubcategory(fav.subcategoryName ?? '');
                      setKind(fav.kind);
                      setKindTouched(true);
                    }}
                    className="chip shrink-0"
                  >
                    <Star className="h-3.5 w-3.5 text-warning" aria-hidden />
                    {fav.label}
                    {fav.amountOre ? (
                      <span className="text-faint">{formatOre(fav.amountOre, { unit: false })}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Type */}
          {showKindPicker ? (
            <Field label="Type" className="">
              <Segmented
                options={KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label, icon: o.icon }))}
                value={kind === 'adjustment' ? 'expense' : kind}
                onChange={(value) => {
                  setKind(value);
                  setKindTouched(true);
                }}
                size="sm"
                label="Type registrering"
              />
            </Field>
          ) : (
            <button
              type="button"
              onClick={() => setShowKindPicker(true)}
              className="text-xs text-muted underline-offset-2 hover:underline"
            >
              Registrer som inntekt eller annen type
            </button>
          )}

          {/* Hovedkategori */}
          <Field
            label={needsCategory ? 'Hovedkategori' : 'Hovedkategori (valgfritt)'}
            error={categoryError}
          >
            <CategoryPicker
              categories={categories}
              value={categoryId}
              onChange={(id) => {
                setCategoryId(id);
                if (id && !kindTouched && kind !== 'income') {
                  const category = categories.find((c) => c.id === id);
                  if (category) setKind(category.kind);
                }
              }}
              allowNone={!needsCategory}
            />
          </Field>

          {/* Underkategori */}
          <Field label="Underkategori (valgfritt)" htmlFor={`${ids}-sub`}>
            <SubcategoryInput
              id={`${ids}-sub`}
              subcategories={data.subcategories}
              categoryId={categoryId}
              value={subcategory}
              onChange={setSubcategory}
            />
            <SubcategoryChips names={quickNames} value={subcategory} onSelect={setSubcategory} />
          </Field>

          {/* Dato */}
          <Field label="Dato" htmlFor={`${ids}-date`}>
            <div className="space-y-2">
              <QuickDates
                value={date}
                onChange={setDate}
                options={[
                  { label: 'I dag', date: today() },
                  { label: 'I går', date: addDays(today(), -1) },
                  { label: formatDay(addDays(today(), -2)), date: addDays(today(), -2) },
                ]}
              />
              <DateInput id={`${ids}-date`} value={date} onChange={setDate} label="Dato" />
            </div>
          </Field>

          {targetPeriod?.status === 'closed' && (
            <div className="flex gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <p>
                Datoen hører til en avsluttet periode ({formatRange(targetPeriod.startDate, targetPeriod.endDate)}).
                Registreringen blir lagt til der og endrer historikken for den perioden.
              </p>
            </div>
          )}
          {!targetPeriod && data.periods.length > 0 && (
            <div className="flex gap-2.5 rounded-xl border border-line bg-surface2 p-3 text-xs text-muted">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <p>Datoen ligger utenfor periodene dine. Registreringen knyttes til nærmeste periode.</p>
            </div>
          )}

          {/* Notat */}
          <Field label="Notat (valgfritt)" htmlFor={`${ids}-note`}>
            <textarea
              id={`${ids}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={280}
              placeholder="F.eks. «ukehandel» eller «delt med Kari»"
              className="input-base resize-none"
            />
          </Field>

          {!editing && (amountOre || subcategory.trim()) && (
            <button
              type="button"
              onClick={saveAsFavorite}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2.5 text-xs text-muted transition hover:text-ink"
            >
              <Star className="h-3.5 w-3.5" aria-hidden />
              Lagre som favoritt for raskere registrering
            </button>
          )}

          {editing && (
            <p className="text-center text-[0.7rem] text-faint">
              Registrert {formatDay(editing.createdAt.slice(0, 10))}
              {editing.recurringId ? ' · fra fast utgift' : ''}
            </p>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title="Slette registreringen?"
        message={
          editing ? (
            <>
              {formatOre(editing.amountOre)} · {editing.subcategoryName ?? 'uten underkategori'} ·{' '}
              {formatDay(editing.date)}. Du kan angre rett etterpå.
            </>
          ) : undefined
        }
        confirmLabel="Slett"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

/** Liten etikett som viser transaksjonstype der det er relevant. */
export function KindBadge({ kind }: { kind: TransactionKind }) {
  if (kind === 'expense') return null;
  const map = {
    saving: { label: 'Sparing', tone: 'positive' as const },
    debt: { label: 'Gjeld', tone: 'warning' as const },
    income: { label: 'Inntekt', tone: 'accent' as const },
    adjustment: { label: 'Justering', tone: 'neutral' as const },
  };
  const item = map[kind as keyof typeof map];
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
