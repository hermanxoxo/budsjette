import { useId, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { Subcategory } from '@/types';
import { normalizeSubcategoryName } from '@/lib/suggestions';
import { useAppStore } from '@/state/AppStore';
import { ConfirmDialog } from '@/ui/Sheet';
import { Badge, IconButton, TextInput, cx } from '@/ui/primitives';
import { useToast } from '@/ui/Toast';

/**
 * Administrasjon av underkategorier for én hovedkategori: søk, legg til,
 * gi nytt navn og slett. Endringer lagres umiddelbart.
 *
 * Regler:
 *  - Nytt navn følger med til eksisterende registreringer, favoritter og faste utgifter.
 *  - Gis en underkategori navnet til en annen, slås de sammen.
 *  - Sletting fjerner bare forslaget. Registreringer beholder navnet sitt.
 */
export function SubcategoryManager({ categoryId }: { categoryId: string }) {
  const { data, dispatch } = useAppStore();
  const toast = useToast();
  const ids = useId();

  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [toDelete, setToDelete] = useState<Subcategory | null>(null);

  /** Antall registreringer per underkategorinavn i denne kategorien. */
  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of data.transactions) {
      if (t.categoryId !== categoryId || !t.subcategoryName) continue;
      const key = t.subcategoryName.toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [data.transactions, categoryId]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.subcategories
      .filter((s) => s.categoryId === categoryId)
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (usage.get(b.name.toLowerCase()) ?? 0) - (usage.get(a.name.toLowerCase()) ?? 0) ||
          b.useCount - a.useCount ||
          a.name.localeCompare(b.name, 'nb'),
      );
  }, [data.subcategories, categoryId, query, usage]);

  const normalizedQuery = normalizeSubcategoryName(query);
  const canAdd =
    normalizedQuery.length > 0 &&
    !data.subcategories.some(
      (s) => s.categoryId === categoryId && s.name.toLowerCase() === normalizedQuery.toLowerCase(),
    );

  const add = () => {
    if (!canAdd) return;
    dispatch({ type: 'addSubcategory', name: normalizedQuery, categoryId });
    toast.success(`«${normalizedQuery}» er lagt til.`);
    setQuery('');
  };

  const startEdit = (sub: Subcategory) => {
    setEditingId(sub.id);
    setDraft(sub.name);
  };

  const commitEdit = (sub: Subcategory) => {
    const name = normalizeSubcategoryName(draft);
    setEditingId(null);
    if (!name || name === sub.name) return;
    const merging = data.subcategories.some(
      (s) => s.id !== sub.id && s.categoryId === categoryId && s.name.toLowerCase() === name.toLowerCase(),
    );
    dispatch({ type: 'renameSubcategory', id: sub.id, name });
    toast.success(merging ? `Slått sammen med «${name}».` : `Endret til «${name}».`);
  };

  const total = data.subcategories.filter((s) => s.categoryId === categoryId).length;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="label-base mb-0">Underkategorier</p>
        <span className="text-xs text-faint">{total} totalt</span>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <TextInput
            id={`${ids}-q`}
            aria-label="Søk eller legg til underkategori"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk eller skriv ny …"
            autoComplete="off"
            enterKeyHint="done"
            className="pl-9"
          />
        </div>
        <button
          type="submit"
          disabled={!canAdd}
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-medium text-white transition active:scale-95 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Legg til
        </button>
      </form>

      {items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
          {query.trim()
            ? 'Ingen treff. Trykk «Legg til» for å opprette den.'
            : 'Ingen underkategorier ennå. De dukker opp her når du registrerer.'}
        </p>
      ) : (
        <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {items.map((sub) => {
            const count = usage.get(sub.name.toLowerCase()) ?? 0;
            const isEditing = editingId === sub.id;
            return (
              <li key={sub.id} className="flex min-h-[3.25rem] items-center gap-1 pl-3 pr-1">
                {isEditing ? (
                  <form
                    className="flex flex-1 items-center gap-1 py-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      commitEdit(sub);
                    }}
                  >
                    <TextInput
                      aria-label={`Nytt navn for ${sub.name}`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setEditingId(null);
                        }
                      }}
                      autoFocus
                      data-escape-local
                      autoComplete="off"
                      enterKeyHint="done"
                      className="h-10 flex-1"
                    />
                    <IconButton icon={Check} label="Lagre navn" type="submit" />
                    <IconButton icon={X} label="Avbryt" onClick={() => setEditingId(null)} />
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1 py-2">
                      <p className="truncate text-sm text-ink">{sub.name}</p>
                      <p className={cx('text-xs', count ? 'text-muted' : 'text-faint')}>
                        {count
                          ? `${count} registrering${count === 1 ? '' : 'er'}`
                          : sub.source === 'seed'
                            ? 'Forslag'
                            : 'Ikke brukt'}
                      </p>
                    </div>
                    {sub.source === 'user' && count === 0 && <Badge>Egen</Badge>}
                    <IconButton icon={Pencil} label={`Gi nytt navn til ${sub.name}`} onClick={() => startEdit(sub)} />
                    <IconButton
                      icon={Trash2}
                      tone="danger"
                      label={`Slett ${sub.name}`}
                      onClick={() => setToDelete(sub)}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-xs leading-relaxed text-faint">
        Endringer her lagres med en gang. Nytt navn oppdateres også på tidligere registreringer.
      </p>

      <ConfirmDialog
        open={toDelete !== null}
        title={`Slette «${toDelete?.name ?? ''}»?`}
        message={
          toDelete && (usage.get(toDelete.name.toLowerCase()) ?? 0) > 0
            ? 'Underkategorien fjernes fra forslagene. Registreringene som bruker den, beholder navnet sitt i historikken.'
            : 'Underkategorien fjernes fra forslagene.'
        }
        confirmLabel="Slett"
        onConfirm={() => {
          if (toDelete) {
            dispatch({ type: 'deleteSubcategory', id: toDelete.id });
            toast.success(`«${toDelete.name}» er slettet.`);
          }
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
