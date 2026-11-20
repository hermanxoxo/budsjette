import { useMemo, useState } from 'react';
import { ArrowDownUp, Check, Receipt, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Transaction } from '@/types';
import { formatDay, formatRange, formatRelativeDay } from '@/lib/date';
import { formatOre } from '@/lib/money';
import { useAppStore, usePeriods } from '@/state/AppStore';
import { PageHeader } from '@/app/AppShell';
import { CategoryDot } from '@/features/transactions/CategoryPicker';
import { KindBadge } from '@/features/transactions/TransactionSheet';
import { Badge, Button, EmptyState, cx } from '@/ui/primitives';
import { Sheet } from '@/ui/Sheet';

type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

const SORT_LABELS: Record<SortKey, string> = {
  'date-desc': 'Nyeste først',
  'date-asc': 'Eldste først',
  'amount-desc': 'Største beløp',
  'amount-asc': 'Minste beløp',
};

export function History({ onEdit }: { onEdit: (transaction: Transaction) => void }) {
  const { data } = useAppStore();
  const { all: periods, active } = usePeriods();

  const [query, setQuery] = useState('');
  const [periodId, setPeriodId] = useState<string>(active?.id ?? 'all');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('date-desc');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const categoriesById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = data.transactions.filter((t) => {
      if (periodId !== 'all' && t.periodId !== periodId) return false;
      if (categoryIds.length && (!t.categoryId || !categoryIds.includes(t.categoryId))) return false;
      if (subcategory && (t.subcategoryName ?? '').toLowerCase() !== subcategory.toLowerCase()) return false;
      if (!q) return true;
      const category = t.categoryId ? categoriesById.get(t.categoryId)?.name ?? '' : '';
      const haystack = `${t.subcategoryName ?? ''} ${category} ${t.note ?? ''} ${formatOre(t.amountOre, {
        unit: false,
      })}`.toLowerCase();
      return haystack.includes(q);
    });

    return rows.sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
        case 'amount-desc':
          return b.amountOre - a.amountOre;
        case 'amount-asc':
          return a.amountOre - b.amountOre;
        default:
          return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [data.transactions, periodId, categoryIds, subcategory, query, sort, categoriesById]);

  const grouped = useMemo(() => {
    if (sort.startsWith('amount')) return null;
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const list = map.get(t.date);
      if (list) list.push(t);
      else map.set(t.date, [t]);
    }
    return [...map.entries()];
  }, [filtered, sort]);

  const spentOre = filtered
    .filter((t) => t.kind !== 'income' && t.kind !== 'adjustment')
    .reduce((sum, t) => sum + t.amountOre, 0);

  const activeFilterCount = categoryIds.length + (subcategory ? 1 : 0) + (periodId !== 'all' ? 1 : 0);

  const usedSubcategories = useMemo(() => {
    const names = new Set<string>();
    for (const t of data.transactions) {
      if (categoryIds.length && (!t.categoryId || !categoryIds.includes(t.categoryId))) continue;
      if (t.subcategoryName) names.add(t.subcategoryName);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'nb'));
  }, [data.transactions, categoryIds]);

  const selectedPeriod = periods.find((p) => p.id === periodId);

  return (
    <>
      <PageHeader
        title="Historikk"
        subtitle={
          selectedPeriod
            ? formatRange(selectedPeriod.startDate, selectedPeriod.endDate)
            : 'Alle perioder'
        }
        action={
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filtre og sortering"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted transition hover:bg-surface2 hover:text-ink"
          >
            <SlidersHorizontal className="h-5 w-5" aria-hidden />
            {activeFilterCount > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" aria-hidden />
            )}
          </button>
        }
      />

      <div className="px-4 pb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk i registreringer …"
            aria-label="Søk i registreringer"
            className="input-base h-11 pl-9"
          />
        </div>

        {(activeFilterCount > 0 || query) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {periodId !== 'all' && selectedPeriod && (
              <FilterChip
                label={formatRange(selectedPeriod.startDate, selectedPeriod.endDate)}
                onClear={() => setPeriodId('all')}
              />
            )}
            {categoryIds.map((id) => (
              <FilterChip
                key={id}
                label={categoriesById.get(id)?.name ?? 'Ukjent'}
                onClear={() => setCategoryIds((prev) => prev.filter((c) => c !== id))}
              />
            ))}
            {subcategory && <FilterChip label={subcategory} onClear={() => setSubcategory(null)} />}
            {query && <FilterChip label={`«${query}»`} onClear={() => setQuery('')} />}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between px-0.5 text-xs text-muted">
          <span>
            {filtered.length} {filtered.length === 1 ? 'registrering' : 'registreringer'}
          </span>
          <span className="tabular">Sum: {formatOre(spentOre)}</span>
        </div>
      </div>

      <div className="px-4 pb-6">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={data.transactions.length === 0 ? 'Ingen registreringer ennå' : 'Ingen treff'}
            description={
              data.transactions.length === 0
                ? 'Alle utgifter du registrerer dukker opp her.'
                : 'Prøv et annet søk eller fjern noen filtre.'
            }
            action={
              activeFilterCount > 0 || query ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setCategoryIds([]);
                    setSubcategory(null);
                    setPeriodId('all');
                  }}
                >
                  Nullstill filtre
                </Button>
              ) : undefined
            }
          />
        ) : grouped ? (
          <div className="space-y-5">
            {grouped.map(([date, rows]) => (
              <section key={date}>
                <div className="mb-2 flex items-baseline justify-between px-0.5">
                  <h2 className="text-sm font-semibold text-ink">{formatRelativeDay(date)}</h2>
                  <span className="font-num text-xs tabular text-muted">
                    {formatOre(
                      rows
                        .filter((t) => t.kind !== 'income' && t.kind !== 'adjustment')
                        .reduce((sum, t) => sum + t.amountOre, 0),
                    )}
                  </span>
                </div>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {rows.map((t) => (
                    <TransactionRow key={t.id} transaction={t} onEdit={onEdit} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {filtered.map((t) => (
              <TransactionRow key={t.id} transaction={t} onEdit={onEdit} showDate />
            ))}
          </ul>
        )}
      </div>

      {/* Filterark */}
      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtre og sortering"
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={() => {
                setCategoryIds([]);
                setSubcategory(null);
                setPeriodId('all');
                setSort('date-desc');
              }}
            >
              Nullstill
            </Button>
            <Button size="lg" fullWidth onClick={() => setFiltersOpen(false)}>
              Vis {filtered.length}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="label-base">Periode</p>
            <div className="space-y-1.5">
              <FilterOption
                label="Alle perioder"
                selected={periodId === 'all'}
                onClick={() => setPeriodId('all')}
              />
              {[...periods].reverse().map((p) => (
                <FilterOption
                  key={p.id}
                  label={formatRange(p.startDate, p.endDate)}
                  hint={p.status === 'active' ? 'Aktiv' : undefined}
                  selected={periodId === p.id}
                  onClick={() => setPeriodId(p.id)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="label-base">Hovedkategori</p>
            <div className="flex flex-wrap gap-1.5">
              {data.categories
                .filter((c) => !c.archived)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((category) => {
                  const selected = categoryIds.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() =>
                        setCategoryIds((prev) =>
                          selected ? prev.filter((id) => id !== category.id) : [...prev, category.id],
                        )
                      }
                      className={cx('chip', selected && 'chip-active')}
                    >
                      {category.name}
                    </button>
                  );
                })}
            </div>
          </div>

          {usedSubcategories.length > 0 && (
            <div>
              <p className="label-base">Underkategori</p>
              <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                {usedSubcategories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSubcategory((prev) => (prev === name ? null : name))}
                    className={cx('chip', subcategory === name && 'chip-active')}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="label-base">
              <span className="inline-flex items-center gap-1.5">
                <ArrowDownUp className="h-3.5 w-3.5" aria-hidden />
                Sortering
              </span>
            </p>
            <div className="space-y-1.5">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <FilterOption
                  key={key}
                  label={SORT_LABELS[key]}
                  selected={sort === key}
                  onClick={() => setSort(key)}
                />
              ))}
            </div>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function TransactionRow({
  transaction,
  onEdit,
  showDate,
}: {
  transaction: Transaction;
  onEdit: (t: Transaction) => void;
  showDate?: boolean;
}) {
  const { data } = useAppStore();
  const category = data.categories.find((c) => c.id === transaction.categoryId);
  const positive = transaction.kind === 'income' || transaction.kind === 'adjustment';

  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(transaction)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition active:bg-surface2"
      >
        <CategoryDot category={category} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[0.95rem] text-ink">
              {transaction.subcategoryName || category?.name || 'Registrering'}
            </span>
            <KindBadge kind={transaction.kind} />
          </div>
          <p className="truncate text-xs text-muted">
            {showDate && <>{formatDay(transaction.date)} · </>}
            {category?.name ?? 'Uten kategori'}
            {transaction.note ? ` · ${transaction.note}` : ''}
          </p>
        </div>
        <span
          className={cx(
            'shrink-0 font-num text-[0.95rem] font-medium tabular',
            positive ? 'text-positive' : 'text-ink',
          )}
        >
          {positive ? '+' : ''}
          {formatOre(transaction.amountOre)}
        </span>
      </button>
    </li>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 py-1 pl-2.5 pr-1 text-xs text-accent">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Fjern filter ${label}`}
        className="flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-accent/15"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

function FilterOption({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm transition',
        selected ? 'border-accent/40 bg-accent/8 text-ink' : 'border-line bg-surface2 text-muted',
      )}
    >
      <span className="truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {hint && <Badge tone="accent">{hint}</Badge>}
        {selected && <Check className="h-4 w-4 text-accent" aria-hidden />}
      </span>
    </button>
  );
}
