import type { AppData, BudgetAllocation, BudgetPeriod } from '@/types';
import { createInitialData } from '@/lib/storage';
import { createPeriod } from '@/lib/periods';

/** Testhjelpere som bygger en forutsigbar tilstand uten tilfeldigheter. */

export const KR = (kroner: number) => kroner * 100;

export function baseData(): AppData {
  return createInitialData('2026-01-01T00:00:00.000Z');
}

export function categoryIdByKey(data: AppData, key: string): string {
  const category = data.categories.find((c) => c.coreKey === key);
  if (!category) throw new Error(`Fant ikke kategorien ${key}`);
  return category.id;
}

export interface SetupOptions {
  startDate?: string;
  payday?: number;
  netSalaryOre?: number;
  allocations?: Record<string, number>;
}

/** Tilstand med én aktiv periode og budsjetter satt per hovedkategori. */
export function dataWithPeriod(options: SetupOptions = {}): {
  data: AppData;
  period: BudgetPeriod;
  cat: (key: string) => string;
} {
  const data = baseData();
  const cat = (key: string) => categoryIdByKey(data, key);

  const allocations: BudgetAllocation[] = Object.entries(
    options.allocations ?? { bolig: KR(15000), mat: KR(6000), transport: KR(3000), sparing: KR(10000) },
  ).map(([key, amountOre]) => ({ categoryId: cat(key), amountOre }));

  const period = createPeriod({
    startDate: options.startDate ?? '2026-11-20',
    payday: options.payday ?? 20,
    useFixedPayday: true,
    netSalaryOre: options.netSalaryOre ?? KR(45000),
    allocations,
    index: 1,
    now: '2026-11-20T08:00:00.000Z',
  });

  return { data: { ...data, periods: [period] }, period, cat };
}
