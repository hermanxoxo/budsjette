import { forwardRef, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { Ore } from '@/types';
import { formatOre, oreToInputValue, parseAmountToOre } from '@/lib/money';
import { today } from '@/lib/date';
import { cx } from './primitives';

/* ---------- Stort beløpsfelt ---------- */

export interface AmountInputProps {
  valueOre: Ore | null;
  onChange: (ore: Ore | null, raw: string) => void;
  id?: string;
  autoFocus?: boolean;
  placeholder?: string;
  error?: boolean;
  size?: 'hero' | 'normal';
  'aria-label'?: string;
}

/**
 * Beløpsfelt med norsk tallformat. Bruker inputMode="decimal" slik at
 * mobiltastaturet viser tall, og tolker både komma og punktum som desimalskille.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { valueOre, onChange, id, autoFocus, placeholder = '0', error, size = 'hero', ...rest },
  ref,
) {
  const [text, setText] = useState(() => (valueOre === null ? '' : oreToInputValue(valueOre)));
  const dirty = useRef(false);

  // Hold feltet i synk når beløpet endres utenfra (f.eks. ved valg av favoritt).
  useEffect(() => {
    if (dirty.current) {
      dirty.current = false;
      return;
    }
    setText(valueOre === null ? '' : oreToInputValue(valueOre));
  }, [valueOre]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    // Tillat bare siffer og ett desimalskille mens brukeren skriver.
    if (!/^[\d\s.,]*$/u.test(raw)) return;
    dirty.current = true;
    setText(raw);
    onChange(raw.trim() === '' ? null : parseAmountToOre(raw), raw);
  };

  return (
    <div className="relative flex items-baseline justify-center gap-2">
      <input
        ref={ref}
        id={id}
        value={text}
        onChange={handleChange}
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        data-autofocus={autoFocus ? '' : undefined}
        className={cx(
          'w-full bg-transparent text-center font-num font-semibold tabular text-ink outline-none placeholder:text-faint',
          size === 'hero' ? 'text-[2.75rem] leading-tight' : 'text-2xl',
          error && 'text-danger',
        )}
        {...rest}
      />
      <span
        className={cx(
          'pointer-events-none absolute right-0 font-medium text-faint',
          size === 'hero' ? 'text-xl' : 'text-base',
        )}
        aria-hidden
      >
        kr
      </span>
    </div>
  );
});

/* ---------- Kompakt beløpsfelt (budsjettsiden) ---------- */

export function AmountField({
  valueOre,
  onChange,
  id,
  label,
  className,
}: {
  valueOre: Ore;
  onChange: (ore: Ore) => void;
  id?: string;
  label?: string;
  className?: string;
}) {
  const [text, setText] = useState(() => oreToInputValue(valueOre));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(oreToInputValue(valueOre));
  }, [valueOre]);

  return (
    <div className={cx('relative', className)}>
      <input
        id={id}
        aria-label={label}
        value={text}
        inputMode="decimal"
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          const parsed = parseAmountToOre(text);
          if (parsed === null) setText(oreToInputValue(valueOre));
          else onChange(Math.max(0, parsed));
        }}
        onChange={(e) => {
          if (!/^[\d\s.,]*$/u.test(e.target.value)) return;
          setText(e.target.value);
          const parsed = parseAmountToOre(e.target.value);
          if (parsed !== null) onChange(Math.max(0, parsed));
        }}
        className="h-11 w-full rounded-xl border border-line bg-surface2 pl-3 pr-9 text-right font-num font-medium tabular text-ink transition focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-faint">
        kr
      </span>
    </div>
  );
}

/* ---------- Slider ---------- */

export function Slider({
  value,
  onChange,
  min,
  max,
  step,
  color,
  label,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  color?: string;
  label: string;
  id?: string;
}) {
  const progress = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0;
  return (
    <input
      id={id}
      type="range"
      className="range-input"
      min={min}
      max={max}
      step={step}
      value={Math.min(max, Math.max(min, value))}
      aria-label={label}
      aria-valuetext={formatOre(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      style={
        {
          '--range-progress': `${progress}%`,
          '--range-color': color ?? 'rgb(var(--c-accent))',
        } as React.CSSProperties
      }
    />
  );
}

/* ---------- Datofelt ---------- */

export function DateInput({
  value,
  onChange,
  id,
  max,
  min,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  max?: string;
  min?: string;
  label?: string;
}) {
  return (
    <input
      id={id}
      type="date"
      lang="nb"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value || today())}
      className="input-base h-12 appearance-none font-num tabular"
    />
  );
}

/* ---------- Hurtigvalg for dato ---------- */

export function QuickDates({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; date: string }[];
}) {
  const unique = useMemo(() => options.filter((o, i, arr) => arr.findIndex((x) => x.date === o.date) === i), [options]);
  return (
    <div className="flex gap-1.5">
      {unique.map((option) => (
        <button
          key={option.date}
          type="button"
          onClick={() => onChange(option.date)}
          className={cx('chip flex-1 justify-center', value === option.date && 'chip-active')}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
