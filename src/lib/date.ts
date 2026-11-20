import type { ISODate } from '@/types';

/**
 * Dato-hjelpere som utelukkende regner på kalenderdatoer ('YYYY-MM-DD').
 * All aritmetikk skjer i UTC-midnatt for å unngå feil ved sommertid,
 * mens `today()` leser brukerens lokale dato (norsk tid på telefonen).
 */

const MS_PER_DAY = 86_400_000;

export const MONTHS_NB = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

export const MONTHS_NB_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des',
];

export const WEEKDAYS_NB = [
  'søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag',
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m - 1);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function isoFrom(year: number, monthIndex: number, day: number): ISODate {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return date.toISOString().slice(0, 10);
}

/** Lokal dato i dag, som ISO-datostreng. */
export function today(): ISODate {
  const now = new Date();
  return isoFrom(now.getFullYear(), now.getMonth(), now.getDate());
}

export function parseISO(iso: ISODate): { year: number; monthIndex: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, monthIndex: month - 1, day };
}

/** UTC-tidspunkt for datoen – kun til intern aritmetikk. */
function toUtc(iso: ISODate): number {
  const { year, monthIndex, day } = parseISO(iso);
  return Date.UTC(year, monthIndex, day);
}

export function addDays(iso: ISODate, days: number): ISODate {
  return new Date(toUtc(iso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Legger til måneder og klipper dagen til siste gyldige dag i målmåneden. */
export function addMonths(iso: ISODate, months: number): ISODate {
  const { year, monthIndex, day } = parseISO(iso);
  const target = monthIndex + months;
  const targetYear = year + Math.floor(target / 12);
  const targetMonth = ((target % 12) + 12) % 12;
  return isoFrom(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** Antall hele dager fra `from` til `to`. Negativt hvis `to` er før `from`. */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function isBetween(iso: ISODate, start: ISODate, end: ISODate): boolean {
  return iso >= start && iso <= end;
}

export function weekdayIndex(iso: ISODate): number {
  return new Date(toUtc(iso)).getUTCDay();
}

/* ---------- Formattering (norsk bokmål) ---------- */

/** «12. november» */
export function formatDay(iso: ISODate): string {
  const { monthIndex, day } = parseISO(iso);
  return `${day}. ${MONTHS_NB[monthIndex]}`;
}

/** «12. nov» */
export function formatDayShort(iso: ISODate): string {
  const { monthIndex, day } = parseISO(iso);
  return `${day}. ${MONTHS_NB_SHORT[monthIndex]}`;
}

/** «12. november 2026» */
export function formatDayFull(iso: ISODate): string {
  const { year } = parseISO(iso);
  return `${formatDay(iso)} ${year}`;
}

/** «onsdag 12. november» */
export function formatDayWithWeekday(iso: ISODate): string {
  return `${WEEKDAYS_NB[weekdayIndex(iso)]} ${formatDay(iso)}`;
}

/** «20. november – 19. desember» (tar med årstall når perioden krysser årsskiftet) */
export function formatRange(start: ISODate, end: ISODate): string {
  const a = parseISO(start);
  const b = parseISO(end);
  if (a.year !== b.year) return `${formatDayFull(start)} – ${formatDayFull(end)}`;
  return `${formatDay(start)} – ${formatDay(end)}`;
}

/** «nov. 2026» – kompakt merkelapp til diagrammer. */
export function formatMonthLabel(iso: ISODate): string {
  const { year, monthIndex } = parseISO(iso);
  return `${MONTHS_NB_SHORT[monthIndex]}. ${String(year).slice(2)}`;
}

/** «i dag», «i går», ellers «12. november». */
export function formatRelativeDay(iso: ISODate, reference: ISODate = today()): string {
  const delta = diffDays(reference, iso);
  if (delta === 0) return 'I dag';
  if (delta === -1) return 'I går';
  if (delta === 1) return 'I morgen';
  return formatDayWithWeekday(iso);
}

/** «3 dager», «1 dag», «0 dager» – med riktig entall/flertall. */
export function formatDays(count: number): string {
  return `${count} ${Math.abs(count) === 1 ? 'dag' : 'dager'}`;
}
