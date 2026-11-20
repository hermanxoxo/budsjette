import { useEffect, useId, useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import type { BudgetCategory, CategoryKind, ColorToken } from '@/types';
import { COLOR_TOKENS, COLOR_TOKEN_LIST, colorFor } from '@/lib/colors';
import { ICON_KEYS, iconFor } from '@/lib/icons';
import { useAppStore } from '@/state/AppStore';
import { ConfirmDialog, Sheet } from '@/ui/Sheet';
import { Button, Field, Segmented, TextInput, cx } from '@/ui/primitives';
import { useToast } from '@/ui/Toast';
import { SubcategoryManager } from './SubcategoryManager';

const KIND_OPTIONS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Utgift' },
  { value: 'saving', label: 'Sparing' },
  { value: 'debt', label: 'Gjeld' },
];

/**
 * Redigerer en kategori, eller oppretter en ny.
 * De syv hovedkategoriene kan endres (navn, ikon, farge), men ikke slettes –
 * de kan arkiveres slik at historikken består.
 */
export function CategorySheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: BudgetCategory | null;
}) {
  const { data, dispatch, resolvedTheme } = useAppStore();
  const toast = useToast();
  const ids = useId();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('tag');
  const [color, setColor] = useState<ColorToken>('blue');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    if (editing) {
      setName(editing.name);
      setIcon(editing.icon);
      setColor(editing.color);
      setKind(editing.kind);
    } else {
      setName('');
      setIcon('tag');
      // Foreslå en farge som ikke allerede er i bruk.
      const used = new Set(data.categories.map((c) => c.color));
      setColor(COLOR_TOKEN_LIST.find((token) => !used.has(token)) ?? 'blue');
      setKind('expense');
    }
  }, [open, editing, data.categories]);

  const nameError = submitted && !name.trim() ? 'Gi kategorien et navn.' : undefined;

  const handleSave = () => {
    setSubmitted(true);
    if (!name.trim()) return;

    if (editing) {
      dispatch({ type: 'updateCategory', id: editing.id, patch: { name: name.trim(), icon, color, kind } });
      toast.success('Kategorien er oppdatert.');
    } else {
      dispatch({ type: 'addCategory', category: { name: name.trim(), icon, color, kind } });
      toast.success('Kategori lagt til.');
    }
    onClose();
  };

  const transactionCount = editing
    ? data.transactions.filter((t) => t.categoryId === editing.id).length
    : 0;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={editing ? 'Rediger kategori' : 'Ny kategori'}
        footer={
          <Button size="lg" fullWidth onClick={handleSave}>
            {editing ? 'Lagre' : 'Legg til'}
          </Button>
        }
      >
        <div className="space-y-5">
          <Field label="Navn" htmlFor={`${ids}-name`} error={nameError}>
            <TextInput
              id={`${ids}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="F.eks. Hobby"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Type"
            hint="Sparing og gjeld holdes utenfor diagrammene for ordinært forbruk."
          >
            <Segmented
              options={KIND_OPTIONS}
              value={kind}
              onChange={setKind}
              label="Kategoritype"
              size="sm"
            />
          </Field>

          <Field label="Farge">
            <div className="flex flex-wrap gap-2">
              {COLOR_TOKEN_LIST.map((token) => {
                const hex = colorFor(token, resolvedTheme);
                const selected = token === color;
                return (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setColor(token)}
                    aria-label={COLOR_TOKENS[token].label}
                    aria-pressed={selected}
                    className={cx(
                      'h-10 w-10 rounded-xl transition',
                      selected ? 'ring-2 ring-offset-2 ring-offset-surface' : 'opacity-80',
                    )}
                    style={{ background: hex, boxShadow: selected ? `0 0 0 2px ${hex}` : undefined }}
                  />
                );
              })}
            </div>
          </Field>

          <Field label="Ikon">
            <div className="grid max-h-48 grid-cols-6 gap-1.5 overflow-y-auto rounded-xl border border-line p-2">
              {ICON_KEYS.map((key) => {
                const Icon = iconFor(key);
                const selected = key === icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    aria-label={`Ikon ${key}`}
                    aria-pressed={selected}
                    className={cx(
                      'flex h-10 items-center justify-center rounded-lg transition',
                      selected ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-surface2',
                    )}
                  >
                    <Icon className="h-[1.1rem] w-[1.1rem]" aria-hidden />
                  </button>
                );
              })}
            </div>
          </Field>

          {editing && <SubcategoryManager categoryId={editing.id} />}

          {editing && (
            <div className="card-flat p-3.5">
              <p className="text-xs text-muted">
                {transactionCount} registrering(er) bruker denne kategorien.
                {editing.coreKey && ' Dette er en av hovedkategoriene og kan ikke slettes.'}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                icon={editing.archived ? ArchiveRestore : Archive}
                onClick={() => setConfirmArchive(true)}
              >
                {editing.archived ? 'Hent frem igjen' : 'Arkiver kategori'}
              </Button>
            </div>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmArchive}
        title={editing?.archived ? 'Hente frem kategorien?' : 'Arkivere kategorien?'}
        tone={editing?.archived ? 'primary' : 'danger'}
        message={
          editing?.archived
            ? 'Kategorien blir synlig igjen i registrering og budsjett.'
            : 'Kategorien skjules fra registrering og budsjett. Historikken beholdes i sin helhet.'
        }
        confirmLabel={editing?.archived ? 'Hent frem' : 'Arkiver'}
        onConfirm={() => {
          if (editing) {
            dispatch({ type: 'archiveCategory', id: editing.id, archived: !editing.archived });
            toast.success(editing.archived ? 'Kategorien er aktiv igjen.' : 'Kategorien er arkivert.');
          }
          setConfirmArchive(false);
          onClose();
        }}
        onCancel={() => setConfirmArchive(false)}
      />
    </>
  );
}
