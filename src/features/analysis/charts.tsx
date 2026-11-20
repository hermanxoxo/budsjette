import type { ReactNode } from 'react';
import { chartNeutrals, type ResolvedMode } from '@/lib/colors';
import { formatOre } from '@/lib/money';
import { cx } from '@/ui/primitives';

/**
 * Felles byggeklosser for diagrammene.
 *
 * Regler som gjelder alle diagrammer i appen:
 *  - Én akse. Aldri to y-skalaer i samme diagram.
 *  - Farge følger kategorien, ikke rangeringen.
 *  - Tekst bruker tekstfarger; fargeprikken ved siden av bærer identiteten.
 *  - Alle serier er direkte merket eller har forklaring, slik at farge
 *    aldri er eneste informasjonsbærer.
 */

export function ChartCard({
  title,
  description,
  children,
  footer,
  legend,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  legend?: ReactNode;
}) {
  return (
    <section className="card p-4">
      <header className="mb-3">
        <h3 className="text-[0.95rem] font-semibold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
      </header>
      {legend && <div className="mb-3">{legend}</div>}
      {children}
      {footer && <div className="mt-3 border-t border-line pt-3 text-xs text-muted">{footer}</div>}
    </section>
  );
}

/** Forklaring med fargeprikk og navn – alltid til stede ved to eller flere serier. */
export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string; dashed?: boolean }[];
  className?: string;
}) {
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5 text-xs text-muted">
          {item.dashed ? (
            <span
              className="h-0.5 w-4 rounded-full"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 7px)`,
              }}
              aria-hidden
            />
          ) : (
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: item.color }}
              aria-hidden
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
  dashed?: boolean;
}

export function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="pointer-events-none min-w-[9rem] rounded-xl border border-line bg-surface px-3 py-2 shadow-float">
      <p className="mb-1.5 text-[0.7rem] font-medium text-muted">{title}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-ink">
              {row.color && (
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{
                    background: row.dashed ? 'transparent' : row.color,
                    border: row.dashed ? `1px dashed ${row.color}` : undefined,
                  }}
                  aria-hidden
                />
              )}
              {row.label}
            </span>
            <span className="font-num font-medium tabular text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Formatterer akseverdier kompakt («12k»). */
export function axisTickFormatter(value: number): string {
  const kroner = Math.round(value / 100);
  const abs = Math.abs(kroner);
  if (abs >= 1000) return `${Math.round(abs / 1000)}k`;
  return String(kroner);
}

export function axisStyle(mode: ResolvedMode) {
  const neutrals = chartNeutrals(mode);
  return {
    tick: { fill: neutrals.axis, fontSize: 11 },
    axisLine: { stroke: neutrals.line },
    tickLine: false as const,
    neutrals,
  };
}

/** Tekstlig tabellvisning – alternativ til farge for skjermlesere og utskrift. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <details className="mt-3 border-t border-line pt-3">
      <summary className="cursor-pointer text-xs text-muted">Vis tallene som tabell</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-muted">
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cx('py-1.5 font-medium', index > 0 && 'text-right')}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, index) => (
                  <td
                    key={index}
                    className={cx(
                      'py-1.5 text-ink',
                      index > 0 && 'text-right font-num tabular',
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function formatAmountCell(ore: number): string {
  return formatOre(ore);
}
