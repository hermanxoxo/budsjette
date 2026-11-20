import type { AppData, BudgetCategory, Transaction } from '@/types';
import { isISODate } from './date';
import { APP_VERSION, SCHEMA_VERSION, normalize } from './storage';

/**
 * Eksport og import av data (JSON og CSV).
 * Importen valideres grundig – vi overskriver aldri data basert på en fil vi ikke stoler på.
 */

export interface ExportEnvelope {
  app: 'budsjette';
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  data: AppData;
}

export function buildExport(data: AppData): ExportEnvelope {
  return {
    app: 'budsjette',
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function exportFileName(extension: 'json' | 'csv'): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = extension === 'json' ? 'budsjette-eksport' : 'budsjette-transaksjoner';
  return `${base}-${stamp}.${extension}`;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  data?: AppData;
  stats?: { transactions: number; periods: number; categories: number; recurring: number };
}

const KINDS = new Set(['expense', 'saving', 'debt', 'income', 'adjustment']);

/** Validerer og normaliserer en importfil. Returnerer aldri delvis gyldige data. */
export function validateImport(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['Filen inneholder ikke gyldig JSON-innhold.'], warnings };
  }

  const envelope = input as Partial<ExportEnvelope> & Partial<AppData>;
  const raw = (envelope.data ?? envelope) as Partial<AppData>;

  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Fant ingen data i filen.'], warnings };
  }
  if (!Array.isArray(raw.categories) || raw.categories.length === 0) {
    errors.push('Filen mangler kategorier.');
  }
  if (!Array.isArray(raw.transactions)) {
    errors.push('Filen mangler transaksjonslisten.');
  }
  if (!Array.isArray(raw.periods)) {
    errors.push('Filen mangler lønnsperioder.');
  }
  if (errors.length) return { ok: false, errors, warnings };

  const categoryIds = new Set((raw.categories as BudgetCategory[]).map((c) => c.id));
  const periodIds = new Set((raw.periods ?? []).map((p) => p.id));

  const validTransactions: Transaction[] = [];
  let droppedAmount = 0;
  let droppedDate = 0;
  let droppedPeriod = 0;
  let droppedCategory = 0;

  for (const t of raw.transactions as Transaction[]) {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string') continue;
    if (!Number.isFinite(t.amountOre) || !Number.isInteger(t.amountOre) || t.amountOre < 0) {
      droppedAmount += 1;
      continue;
    }
    if (!isISODate(t.date)) {
      droppedDate += 1;
      continue;
    }
    if (!KINDS.has(t.kind)) {
      droppedAmount += 1;
      continue;
    }
    if (!periodIds.has(t.periodId)) {
      droppedPeriod += 1;
      continue;
    }
    if (t.categoryId !== null && !categoryIds.has(t.categoryId)) {
      droppedCategory += 1;
      continue;
    }
    validTransactions.push(t);
  }

  if (droppedAmount) warnings.push(`${droppedAmount} transaksjon(er) hadde ugyldig beløp eller type og ble utelatt.`);
  if (droppedDate) warnings.push(`${droppedDate} transaksjon(er) hadde ugyldig dato og ble utelatt.`);
  if (droppedPeriod) warnings.push(`${droppedPeriod} transaksjon(er) pekte på en ukjent periode og ble utelatt.`);
  if (droppedCategory) warnings.push(`${droppedCategory} transaksjon(er) pekte på en ukjent kategori og ble utelatt.`);

  const activePeriods = (raw.periods ?? []).filter((p) => p.status === 'active');
  if (activePeriods.length > 1) {
    warnings.push('Filen hadde flere aktive perioder. Bare den nyeste beholdes som aktiv.');
    const newest = activePeriods.slice().sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    for (const p of raw.periods ?? []) {
      if (p.status === 'active' && p.id !== newest.id) p.status = 'closed';
    }
  }

  const data = normalize({ ...(raw as AppData), transactions: validTransactions });

  return {
    ok: true,
    errors,
    warnings,
    data,
    stats: {
      transactions: data.transactions.length,
      periods: data.periods.length,
      categories: data.categories.length,
      recurring: data.recurring.length,
    },
  };
}

/* ---------- CSV ---------- */

const CSV_HEADER = [
  'dato',
  'type',
  'hovedkategori',
  'underkategori',
  'belop_kr',
  'notat',
  'periode_start',
  'periode_slutt',
];

const KIND_LABELS: Record<Transaction['kind'], string> = {
  expense: 'Utgift',
  saving: 'Sparing',
  debt: 'Gjeld',
  income: 'Inntekt',
  adjustment: 'Justering',
};

function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[";\n]/u.test(s) ? `"${s.replace(/"/gu, '""')}"` : s;
}

/**
 * CSV med semikolon som skilletegn og komma som desimaltegn –
 * åpnes korrekt i norsk Excel. BOM gjør at æøå vises riktig.
 */
export function transactionsToCsv(data: AppData): string {
  const categories = new Map(data.categories.map((c) => [c.id, c.name]));
  const periods = new Map(data.periods.map((p) => [p.id, p]));

  const rows = data.transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((t) => {
      const period = periods.get(t.periodId);
      return [
        t.date,
        KIND_LABELS[t.kind],
        t.categoryId ? categories.get(t.categoryId) ?? 'Ukjent' : '',
        t.subcategoryName ?? '',
        (t.amountOre / 100).toFixed(2).replace('.', ','),
        t.note ?? '',
        period?.startDate ?? '',
        period?.endDate ?? '',
      ]
        .map(csvCell)
        .join(';');
    });

  return `﻿${CSV_HEADER.join(';')}\n${rows.join('\n')}\n`;
}

/** Laster ned en tekstfil i nettleseren. */
export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Gi nettleseren et øyeblikk før objekt-URL-en frigjøres.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Klarte ikke lese filen.'));
    reader.readAsText(file);
  });
}
