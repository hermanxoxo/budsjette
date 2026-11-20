import type { Subcategory, Transaction } from '@/types';

/**
 * Forslag på underkategorier.
 *
 * Rangering:
 *  1. Treff som starter med søketeksten før treff som bare inneholder den.
 *  2. Deretter hvor ofte brukeren har brukt den (useCount).
 *  3. Deretter sist brukt.
 *  4. Brukerens egne kommer foran forhåndsdefinerte forslag ved likhet.
 */

export interface SuggestionItem {
  name: string;
  categoryId: string;
  useCount: number;
  source: Subcategory['source'];
  lastUsedAt?: string;
}

function scoreMatch(name: string, query: string): number {
  if (!query) return 1;
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return 4;
  if (n.startsWith(q)) return 3;
  if (n.includes(q)) return 2;
  // Ordstart inne i navnet: «rema 1000» skal treffe på «1000».
  if (n.split(/\s+/u).some((word) => word.startsWith(q))) return 2;
  return 0;
}

export function suggestSubcategories(
  subcategories: readonly Subcategory[],
  categoryId: string | null,
  query: string,
  limit = 8,
): SuggestionItem[] {
  const trimmed = query.trim();
  const pool = categoryId ? subcategories.filter((s) => s.categoryId === categoryId) : subcategories;

  return pool
    .map((s) => ({ item: s, score: scoreMatch(s.name, trimmed) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.item.useCount !== a.item.useCount) return b.item.useCount - a.item.useCount;
      if (a.item.source !== b.item.source) return a.item.source === 'user' ? -1 : 1;
      const aLast = a.item.lastUsedAt ?? '';
      const bLast = b.item.lastUsedAt ?? '';
      if (aLast !== bLast) return bLast.localeCompare(aLast);
      return a.item.name.localeCompare(b.item.name, 'nb');
    })
    .slice(0, limit)
    .map(({ item }) => ({
      name: item.name,
      categoryId: item.categoryId,
      useCount: item.useCount,
      source: item.source,
      lastUsedAt: item.lastUsedAt,
    }));
}

/** De mest brukte underkategoriene i en hovedkategori – vises som hurtigvalg. */
export function topSubcategories(
  subcategories: readonly Subcategory[],
  categoryId: string,
  limit = 6,
): Subcategory[] {
  return subcategories
    .filter((s) => s.categoryId === categoryId && s.useCount > 0)
    .slice()
    .sort((a, b) => b.useCount - a.useCount || (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
    .slice(0, limit);
}

/** Foreslår beløp basert på hva brukeren pleier å registrere på kombinasjonen. */
export function suggestAmount(
  transactions: readonly Transaction[],
  categoryId: string | null,
  subcategoryName: string | null,
): number | null {
  if (!subcategoryName) return null;
  const needle = subcategoryName.trim().toLowerCase();
  const matches = transactions
    .filter(
      (t) =>
        t.categoryId === categoryId &&
        (t.subcategoryName ?? '').trim().toLowerCase() === needle,
    )
    .slice(-5);
  if (matches.length < 2) return null;

  // Median er mindre følsom for enkeltstående store kjøp enn gjennomsnitt.
  const sorted = matches.map((t) => t.amountOre).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];

  // Bare foreslå når beløpene er noenlunde stabile (maks 25 % spredning).
  const spread = (sorted[sorted.length - 1] - sorted[0]) / Math.max(1, median);
  return spread <= 0.25 ? median : null;
}

/** Normaliserer navn slik at «kiwi» og «Kiwi » blir samme underkategori. */
export function normalizeSubcategoryName(name: string): string {
  return name.trim().replace(/\s+/gu, ' ');
}

export function sameSubcategory(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return normalizeSubcategoryName(a).toLowerCase() === normalizeSubcategoryName(b).toLowerCase();
}
