import { useId, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { Subcategory } from '@/types';
import { suggestSubcategories } from '@/lib/suggestions';
import { cx } from '@/ui/primitives';

/**
 * Søkbart underkategorifelt med forslag.
 * Forslagene kombinerer forhåndsdefinerte navn med brukerens egne,
 * sortert slik at de mest brukte kommer først.
 */
export function SubcategoryInput({
  subcategories,
  categoryId,
  value,
  onChange,
  id,
  placeholder = 'Søk eller skriv ny …',
}: {
  subcategories: Subcategory[];
  categoryId: string | null;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const suggestions = useMemo(
    () => suggestSubcategories(subcategories, categoryId, value, 8),
    [subcategories, categoryId, value],
  );

  const exactMatch = suggestions.some((s) => s.name.toLowerCase() === value.trim().toLowerCase());
  const showList = focused && (suggestions.length > 0 || (value.trim().length > 0 && !exactMatch));

  const commit = (name: string) => {
    onChange(name);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          value={value}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setActiveIndex(-1);
          }}
          onFocus={() => setFocused(true)}
          // Forsinkelse slik at klikk på et forslag rekker å registreres.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => Math.min(suggestions.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(-1, i - 1));
            } else if (e.key === 'Enter' && activeIndex >= 0) {
              e.preventDefault();
              commit(suggestions[activeIndex].name);
            } else if (e.key === 'Escape') {
              setFocused(false);
            }
          }}
          className="input-base h-12 pl-9 pr-9"
        />
        {value && (
          <button
            type="button"
            aria-label="Tøm underkategori"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-56 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1 shadow-float"
        >
          {value.trim() && !exactMatch && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(value.trim())}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-accent transition hover:bg-accent/10"
              >
                <Check className="h-4 w-4" aria-hidden />
                Bruk «{value.trim()}»
              </button>
            </li>
          )}
          {suggestions.map((item, index) => (
            <li key={`${item.categoryId}-${item.name}`} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(item.name)}
                className={cx(
                  'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition',
                  index === activeIndex ? 'bg-surface2 text-ink' : 'text-ink hover:bg-surface2',
                )}
              >
                <span className="truncate">{item.name}</span>
                {item.useCount > 0 && (
                  <span className="shrink-0 text-xs text-faint">{item.useCount}×</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Hurtigvalg: de mest brukte underkategoriene i valgt hovedkategori. */
export function SubcategoryChips({
  names,
  value,
  onSelect,
}: {
  names: string[];
  value: string;
  onSelect: (name: string) => void;
}) {
  if (!names.length) return null;
  return (
    <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onSelect(name)}
          className={cx(
            'chip shrink-0',
            name.toLowerCase() === value.trim().toLowerCase() && 'chip-active',
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
