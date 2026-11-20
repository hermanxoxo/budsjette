import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';

/** Slår sammen klassenavn og hopper over tomme verdier. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ---------- Knapp ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white shadow-sm hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface2 text-ink border border-line hover:bg-surface active:bg-surface2',
  ghost: 'text-muted hover:text-ink hover:bg-surface2',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95',
  soft: 'bg-accent/10 text-accent hover:bg-accent/15',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-[0.95rem] rounded-xl gap-2',
  lg: 'h-13 px-5 text-base rounded-2xl gap-2 min-h-[3.25rem]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, loading, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-medium transition-all select-none',
        'disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-[1.15rem] w-[1.15rem]'} aria-hidden />
      )}
      {children}
      {IconRight && !loading && <IconRight className="h-4 w-4" aria-hidden />}
    </button>
  );
});

/* ---------- Ikonknapp ---------- */

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  tone?: 'default' | 'danger';
}

export function IconButton({ icon: Icon, label, tone = 'default', className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-11 w-11 items-center justify-center rounded-xl transition active:scale-95',
        tone === 'danger' ? 'text-danger hover:bg-danger/10' : 'text-muted hover:bg-surface2 hover:text-ink',
        className,
      )}
      {...rest}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

/* ---------- Kort ---------- */

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return <Tag className={cx('card p-4', className)}>{children}</Tag>;
}

export function SectionHeading({
  title,
  action,
  description,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-0.5">
      <div>
        <h2 className="text-[0.95rem] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Fremdriftslinje ---------- */

export function ProgressBar({
  value,
  color,
  track,
  height = 8,
  marker,
  label,
}: {
  /** 0–1, verdier over 1 vises som overforbruk. */
  value: number;
  color: string;
  track?: string;
  height?: number;
  /** 0–1: posisjon for en referansemarkør (f.eks. forventet forbruk i dag). */
  marker?: number;
  label?: string;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const over = value > 1;
  return (
    <div
      className="relative w-full overflow-hidden rounded-full"
      style={{ height, background: track ?? 'rgb(var(--c-surface-2))' }}
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${clamped * 100}%`, background: color }}
      />
      {over && (
        <div
          className="absolute inset-y-0 right-0 rounded-full"
          style={{
            width: `${Math.min(28, (value - 1) * 100)}%`,
            background: 'rgb(var(--c-danger))',
            opacity: 0.85,
          }}
        />
      )}
      {marker !== undefined && marker > 0 && marker < 1 && (
        <div
          className="absolute top-0 h-full w-[2px] bg-ink/35"
          style={{ left: `${marker * 100}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}

/* ---------- Merkelapp ---------- */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'accent';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface2 text-muted',
    positive: 'bg-positive/12 text-positive',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/12 text-danger',
    accent: 'bg-accent/12 text-accent',
  } as const;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Skjemafelt ---------- */

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={className}>
      <label className="label-base" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} className={cx('input-base', className)} {...rest} />;
  },
);

/* ---------- Segmentkontroll ---------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  label,
}: {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'inline-flex w-full gap-1 rounded-xl border border-line bg-surface2 p-1',
        size === 'sm' ? 'text-xs' : 'text-sm',
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg font-medium transition',
              size === 'sm' ? 'h-8 px-2' : 'h-10 px-3',
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Tomtilstand ---------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-line text-center',
        compact ? 'px-4 py-7' : 'px-6 py-12',
      )}
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface2">
        <Icon className="h-6 w-6 text-faint" aria-hidden />
      </div>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- Laste- og feiltilstand ---------- */

export function LoadingState({ label = 'Laster …' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-surface2', className)} />;
}

/* ---------- Bryter ---------- */

export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-[0.95rem] text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface2 border border-line',
        )}
      >
        <span
          className={cx(
            'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </label>
  );
}
