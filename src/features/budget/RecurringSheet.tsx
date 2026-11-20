import { useEffect, useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { ISODate, Ore, RecurringTransaction, RecurrenceInterval } from '@/types';
import { today } from '@/lib/date';
import { intervalLabel } from '@/lib/recurring';
import { useAppStore } from '@/state/AppStore';
import { ConfirmDialog, Sheet } from '@/ui/Sheet';
import { AmountField, DateInput } from '@/ui/inputs';
import { Button, Field, Switch, TextInput, cx } from '@/ui/primitives';
import { useToast } from '@/ui/Toast';
import { CategoryPicker } from '@/features/transactions/CategoryPicker';
import { SubcategoryInput } from '@/features/transactions/SubcategoryInput';

const INTERVALS: RecurrenceInterval[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];

/** Oppretter og redigerer faste utgifter. */
export function RecurringSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: RecurringTransaction | null;
}) {
  const { data, dispatch } = useAppStore();
  const toast = useToast();
  const ids = useId();

  const [name, setName] = useState('');
  const [amountOre, setAmountOre] = useState<Ore>(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState('');
  const [interval, setInterval] = useState<RecurrenceInterval>('monthly');
  const [anchorDate, setAnchorDate] = useState<ISODate>(today());
  const [autoPost, setAutoPost] = useState(false);
  const [active, setActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    if (editing) {
      setName(editing.name);
      setAmountOre(editing.amountOre);
      setCategoryId(editing.categoryId);
      setSubcategory(editing.subcategoryName ?? '');
      setInterval(editing.interval);
      setAnchorDate(editing.anchorDate);
      setAutoPost(editing.autoPost);
      setActive(editing.active);
    } else {
      setName('');
      setAmountOre(0);
      setCategoryId(null);
      setSubcategory('');
      setInterval('monthly');
      setAnchorDate(today());
      setAutoPost(false);
      setActive(true);
    }
  }, [open, editing]);

  const categories = data.categories
    .filter((c) => !c.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const selectedCategory = categories.find((c) => c.id === categoryId);

  const nameError = submitted && !name.trim() ? 'Gi den faste utgiften et navn.' : undefined;
  const amountError = submitted && amountOre <= 0 ? 'Beløpet må være større enn 0.' : undefined;
  const categoryError = submitted && !categoryId ? 'Velg en hovedkategori.' : undefined;

  const handleSave = () => {
    setSubmitted(true);
    if (!name.trim() || amountOre <= 0 || !categoryId) return;

    const payload = {
      name: name.trim(),
      amountOre,
      kind: selectedCategory?.kind ?? ('expense' as const),
      categoryId,
      subcategoryName: subcategory.trim() || null,
      interval,
      anchorDate,
      autoPost,
      active,
    };

    if (editing) {
      dispatch({ type: 'updateRecurring', id: editing.id, patch: payload });
      toast.success('Fast utgift oppdatert.');
    } else {
      dispatch({ type: 'addRecurring', rule: payload });
      toast.success('Fast utgift lagt til.');
    }
    onClose();
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={editing ? 'Rediger fast utgift' : 'Ny fast utgift'}
        description="Gjentakende utgifter som husleie, strøm og abonnementer."
        footer={
          <div className="flex gap-2">
            {editing && (
              <Button
                variant="secondary"
                size="lg"
                icon={Trash2}
                onClick={() => setConfirmDelete(true)}
                className="!px-4 text-danger"
                aria-label="Slett fast utgift"
              />
            )}
            <Button size="lg" fullWidth onClick={handleSave}>
              {editing ? 'Lagre' : 'Legg til'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <Field label="Navn" htmlFor={`${ids}-name`} error={nameError}>
            <TextInput
              id={`${ids}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="F.eks. Husleie"
              autoComplete="off"
            />
          </Field>

          <Field label="Beløp" error={amountError}>
            <AmountField valueOre={amountOre} onChange={setAmountOre} label="Beløp" />
          </Field>

          <Field label="Hovedkategori" error={categoryError}>
            <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          </Field>

          <Field label="Underkategori (valgfritt)" htmlFor={`${ids}-sub`}>
            <SubcategoryInput
              id={`${ids}-sub`}
              subcategories={data.subcategories}
              categoryId={categoryId}
              value={subcategory}
              onChange={setSubcategory}
            />
          </Field>

          <Field label="Gjentakelse">
            <div className="grid grid-cols-3 gap-1.5">
              {INTERVALS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setInterval(option)}
                  className={cx(
                    'rounded-xl border px-2 py-2.5 text-xs font-medium transition',
                    interval === option
                      ? 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-line bg-surface2 text-muted',
                  )}
                >
                  {intervalLabel(option)}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Første forfallsdato" htmlFor={`${ids}-date`} hint="Alle senere forfall beregnes fra denne datoen.">
            <DateInput id={`${ids}-date`} value={anchorDate} onChange={setAnchorDate} label="Forfallsdato" />
          </Field>

          <div className="card-flat space-y-3 p-3.5">
            <Switch
              id={`${ids}-auto`}
              checked={autoPost}
              onChange={setAutoPost}
              label="Bokfør automatisk"
              description="Registreres ved forfall. Samme forfall bokføres aldri to ganger."
            />
            <div className="border-t border-line pt-3">
              <Switch
                id={`${ids}-active`}
                checked={active}
                onChange={setActive}
                label="Aktiv"
                description="Slå av for å sette den på pause uten å slette."
              />
            </div>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title="Slette fast utgift?"
        message="Allerede registrerte transaksjoner beholdes. Bare regelen for fremtidige forfall fjernes."
        confirmLabel="Slett"
        onConfirm={() => {
          if (editing) dispatch({ type: 'deleteRecurring', id: editing.id });
          setConfirmDelete(false);
          onClose();
          toast.success('Fast utgift slettet.');
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
