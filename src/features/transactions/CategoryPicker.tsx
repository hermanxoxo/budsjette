import type { BudgetCategory } from '@/types';
import { colorFor, withAlpha } from '@/lib/colors';
import { iconFor } from '@/lib/icons';
import { useAppStore } from '@/state/AppStore';
import { cx } from '@/ui/primitives';

/** Rutenett med hovedkategorier – stort nok til å treffes med tommelen. */
export function CategoryPicker({
  categories,
  value,
  onChange,
  allowNone,
  columns = 4,
}: {
  categories: BudgetCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
  columns?: 3 | 4;
}) {
  const { resolvedTheme } = useAppStore();

  return (
    <div
      role="radiogroup"
      aria-label="Hovedkategori"
      className={cx('grid gap-2', columns === 4 ? 'grid-cols-4' : 'grid-cols-3')}
    >
      {allowNone && (
        <CategoryTile
          selected={value === null}
          label="Ingen"
          color={resolvedTheme === 'light' ? '#94a3b8' : '#64748b'}
          iconKey="tag"
          onClick={() => onChange(null)}
        />
      )}
      {categories.map((category) => (
        <CategoryTile
          key={category.id}
          selected={value === category.id}
          label={category.name}
          color={colorFor(category.color, resolvedTheme)}
          iconKey={category.icon}
          onClick={() => onChange(category.id)}
        />
      ))}
    </div>
  );
}

function CategoryTile({
  selected,
  label,
  color,
  iconKey,
  onClick,
}: {
  selected: boolean;
  label: string;
  color: string;
  iconKey: string;
  onClick: () => void;
}) {
  const Icon = iconFor(iconKey);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        'flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 transition active:scale-[0.96]',
        selected ? 'border-transparent shadow-sm' : 'border-line bg-surface2',
      )}
      style={selected ? { background: withAlpha(color, 0.14), borderColor: withAlpha(color, 0.45) } : undefined}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ background: selected ? color : withAlpha(color, 0.14) }}
      >
        <Icon className="h-[1.15rem] w-[1.15rem]" style={{ color: selected ? '#fff' : color }} aria-hidden />
      </span>
      <span
        className={cx('max-w-full truncate text-[0.7rem] font-medium', selected ? 'text-ink' : 'text-muted')}
      >
        {label}
      </span>
    </button>
  );
}

/** Liten rund kategoriindikator brukt i lister. */
export function CategoryDot({
  category,
  size = 'md',
}: {
  category?: BudgetCategory;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { resolvedTheme } = useAppStore();
  const color = category ? colorFor(category.color, resolvedTheme) : '#94a3b8';
  const Icon = iconFor(category?.icon ?? 'tag');
  const dimensions = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-10 w-10';
  const iconSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-5 w-5' : 'h-[1.1rem] w-[1.1rem]';

  return (
    <span
      className={cx('flex shrink-0 items-center justify-center rounded-xl', dimensions)}
      style={{ background: withAlpha(color, 0.14) }}
      aria-hidden
    >
      <Icon className={iconSize} style={{ color }} />
    </span>
  );
}
