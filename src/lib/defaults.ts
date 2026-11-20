import type { BudgetCategory, CoreCategoryKey, Subcategory, UserSettings } from '@/types';
import { createId } from './id';

/** De syv forhåndsdefinerte hovedkategoriene. */
export interface CoreCategoryDef {
  key: CoreCategoryKey;
  name: string;
  icon: string;
  color: BudgetCategory['color'];
  kind: BudgetCategory['kind'];
  /** Anbefalt andel av nettolønn – kun forslag i onboarding. */
  suggestedShare: number;
}

export const CORE_CATEGORIES: CoreCategoryDef[] = [
  { key: 'bolig', name: 'Bolig', icon: 'home', color: 'blue', kind: 'expense', suggestedShare: 0.3 },
  { key: 'mat', name: 'Mat', icon: 'cart', color: 'aqua', kind: 'expense', suggestedShare: 0.15 },
  { key: 'transport', name: 'Transport', icon: 'car', color: 'yellow', kind: 'expense', suggestedShare: 0.08 },
  { key: 'klaer', name: 'Klær', icon: 'shirt', color: 'magenta', kind: 'expense', suggestedShare: 0.04 },
  { key: 'sparing', name: 'Sparing', icon: 'piggy', color: 'green', kind: 'saving', suggestedShare: 0.2 },
  { key: 'annet', name: 'Annet', icon: 'package', color: 'violet', kind: 'expense', suggestedShare: 0.12 },
  { key: 'gjeld', name: 'Gjeld', icon: 'bank', color: 'orange', kind: 'debt', suggestedShare: 0.11 },
];

/** Forhåndsdefinerte underkategoriforslag per hovedkategori. */
export const SEED_SUBCATEGORIES: Record<CoreCategoryKey, string[]> = {
  bolig: ['Husleie', 'Boliglån', 'Strøm', 'Internett', 'Felleskostnader', 'Forsikring', 'Vedlikehold', 'Kommunale avgifter', 'Møbler'],
  mat: ['Kiwi', 'Rema 1000', 'Meny', 'Coop', 'Extra', 'Bunnpris', 'Restaurant', 'Takeaway', 'Kafé', 'Lunsj', 'Vinmonopolet'],
  transport: ['Bensin', 'Diesel', 'Lading', 'Bompenger', 'Parkering', 'Kollektiv', 'Bilforsikring', 'Verksted', 'Taxi', 'Årsavgift'],
  klaer: ['Klær', 'Sko', 'Sportsklær', 'Barneklær', 'Tilbehør', 'Frisør'],
  sparing: ['Bufferkonto', 'BSU', 'Fond', 'Aksjesparekonto', 'Pensjon', 'Feriepenger', 'Sparemål'],
  annet: ['Abonnementer', 'Strømming', 'Mobil', 'Trening', 'Helse', 'Apotek', 'Gaver', 'Ferie', 'Hobby', 'Uteliv', 'Kjæledyr'],
  gjeld: ['Boliglån', 'Billån', 'Studielån', 'Forbrukslån', 'Kredittkort', 'Renter', 'Avdrag'],
};

export function createCoreCategories(): BudgetCategory[] {
  return CORE_CATEGORIES.map((def, index) => ({
    id: createId('cat'),
    coreKey: def.key,
    name: def.name,
    icon: def.icon,
    color: def.color,
    kind: def.kind,
    sortOrder: index,
    archived: false,
  }));
}

export function createSeedSubcategories(categories: BudgetCategory[]): Subcategory[] {
  const out: Subcategory[] = [];
  for (const category of categories) {
    if (!category.coreKey) continue;
    for (const name of SEED_SUBCATEGORIES[category.coreKey] ?? []) {
      out.push({
        id: createId('sub'),
        name,
        categoryId: category.id,
        useCount: 0,
        source: 'seed',
      });
    }
  }
  return out;
}

export const DEFAULT_SETTINGS: UserSettings = {
  onboarded: false,
  payday: 20,
  useFixedPayday: true,
  defaultNetSalaryOre: 0,
  theme: 'system',
  paydayReminderDays: 3,
  demoMode: false,
};

/**
 * Foreslåtte budsjetter ut fra nettolønn, avrundet til hele 100 kr slik at
 * tallene ser ryddige ut. Avrundingsresten legges på (eller trekkes fra) den
 * største posten, slik at summen aldri overstiger nettolønnen – en ny bruker
 * skal ikke møte «overbudsjettert» rett etter onboardingen.
 */
export function suggestedAllocations(netSalaryOre: number, categories: BudgetCategory[]) {
  const ROUND_TO = 10_000; // 100 kr i øre

  const allocations = categories.map((category) => {
    const def = CORE_CATEGORIES.find((c) => c.key === category.coreKey);
    const share = def?.suggestedShare ?? 0;
    return {
      categoryId: category.id,
      amountOre: Math.round((netSalaryOre * share) / ROUND_TO) * ROUND_TO,
      share,
    };
  });

  const total = allocations.reduce((sum, a) => sum + a.amountOre, 0);
  const diff = netSalaryOre - total;

  if (diff !== 0) {
    // Korriger den største posten; den tåler justeringen best relativt sett.
    let largest = 0;
    for (let i = 1; i < allocations.length; i++) {
      if (allocations[i].amountOre > allocations[largest].amountOre) largest = i;
    }
    if (allocations.length) {
      allocations[largest].amountOre = Math.max(0, allocations[largest].amountOre + diff);
    }
  }

  return allocations.map(({ categoryId, amountOre }) => ({ categoryId, amountOre }));
}
