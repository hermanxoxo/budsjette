import type { Ore } from '@/types';

/**
 * Pengehåndtering. Alt regnes i heltall øre; visning skjer i kroner.
 * Format: «15 000 kr» (hardt mellomrom som tusenskille), norsk bokmål.
 */

const NBSP = ' ';

export function kronerToOre(kroner: number): Ore {
  return Math.round(kroner * 100);
}

export function oreToKroner(ore: Ore): number {
  return ore / 100;
}

/**
 * Tolker brukerinput til øre. Takler «1 234,50», «1.234,50», «1234.5», «200 kr».
 * Returnerer null ved ugyldig input, 0 regnes som gyldig.
 */
export function parseAmountToOre(input: string): Ore | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/kr\.?$/u, '').replace(/nok/gu, '').trim();
  s = s.replace(/[\s  ']/gu, '');
  if (!s) return null;

  const commas = (s.match(/,/gu) ?? []).length;
  const dots = (s.match(/\./gu) ?? []).length;

  /** Tusenskille godtas bare når sifrene faktisk er gruppert i trear. */
  const isGrouped = (value: string, separator: string) =>
    new RegExp(`^-?\\d{1,3}(${separator}\\d{3})+$`, 'u').test(value);

  if (commas && dots) {
    // Begge forekommer: den siste er desimalskille, den andre er tusenskille.
    const decimalIsComma = s.lastIndexOf(',') > s.lastIndexOf('.');
    const groupPattern = decimalIsComma ? '\\.' : ',';
    const parts = s.split(decimalIsComma ? ',' : '.');
    if (parts.length !== 2 || !isGrouped(parts[0], groupPattern)) return null;
    const intPart = parts[0].replace(decimalIsComma ? /\./gu : /,/gu, '');
    s = `${intPart}.${parts[1]}`;
  } else if (commas > 1) {
    // Flere komma kan bare være tusenskille: «1,234,567».
    if (!isGrouped(s, ',')) return null;
    s = s.replace(/,/gu, '');
  } else if (commas === 1) {
    // Norsk standard: ett komma er alltid desimalskille.
    s = s.replace(',', '.');
  } else if (dots > 1) {
    if (!isGrouped(s, '\\.')) return null;
    s = s.replace(/\./gu, '');
  }

  if (!/^-?\d*(\.\d*)?$/u.test(s)) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/gu, NBSP);
}

export interface FormatOptions {
  /** Ta med «kr». Standard: true. */
  unit?: boolean;
  /** Vis alltid to desimaler. Standard: bare når beløpet har ører. */
  decimals?: boolean | number;
  /** Vis «+» foran positive tall. */
  signed?: boolean;
}

/** «15 000 kr», «−1 250 kr», «349,50 kr» */
export function formatOre(ore: Ore, options: FormatOptions = {}): string {
  const { unit = true, signed = false } = options;
  const negative = ore < 0;
  const abs = Math.abs(Math.round(ore));

  let decimals: number;
  if (typeof options.decimals === 'number') decimals = options.decimals;
  else if (options.decimals === true) decimals = 2;
  else decimals = abs % 100 === 0 ? 0 : 2;

  const kroner = abs / 100;
  const fixed = kroner.toFixed(decimals);
  const [intPart, fracPart] = fixed.split('.');
  let out = groupDigits(intPart);
  if (fracPart) out += `,${fracPart}`;
  if (unit) out += `${NBSP}kr`;

  if (negative) return `−${out}`;
  if (signed) return `+${out}`;
  return out;
}

/** Kompakt visning til diagramakser: «15,0k», «950». */
export function formatOreCompact(ore: Ore): string {
  const kroner = Math.round(ore / 100);
  const abs = Math.abs(kroner);
  const sign = kroner < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')}M`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1000)}k`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1).replace('.', ',')}k`;
  return `${sign}${abs}`;
}

/** Ren tallstreng uten enhet, til redigeringsfelt: «15000» eller «349,50». */
export function oreToInputValue(ore: Ore): string {
  if (!Number.isFinite(ore)) return '';
  const abs = Math.abs(ore);
  const kroner = abs / 100;
  return (ore < 0 ? '-' : '') + (abs % 100 === 0 ? String(Math.round(kroner)) : kroner.toFixed(2).replace('.', ','));
}

/** Prosentandel som heltall. Deler på null gir 0. */
export function percentOf(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}

export function formatPercent(value: number, decimals = 0): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(decimals).replace('.', ',')}${NBSP}%`;
}

export function clampOre(ore: Ore, min: Ore, max: Ore): Ore {
  return Math.min(max, Math.max(min, Math.round(ore)));
}

export function sumOre(values: readonly Ore[]): Ore {
  return values.reduce((acc, v) => acc + v, 0);
}
