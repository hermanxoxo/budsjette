import type {
  AppData,
  BudgetAllocation,
  BudgetCategory,
  Favorite,
  ISODate,
  Ore,
  RecurringTransaction,
  Subcategory,
  Transaction,
  TransactionKind,
  UserSettings,
} from '@/types';
import { createId } from '@/lib/id';
import { today } from '@/lib/date';
import { createPeriod, findActivePeriod, resolvePeriodForDate, sortPeriods } from '@/lib/periods';
import { normalizeSubcategoryName } from '@/lib/suggestions';
import { APP_VERSION, SCHEMA_VERSION } from '@/lib/storage';

/**
 * Rene tilstandsoverganger. Reduceren har ingen sideeffekter –
 * lagring og tid håndteres av kallstedet (via `now`-feltet der det trengs).
 */

export interface TransactionInput {
  kind: TransactionKind;
  amountOre: Ore;
  categoryId: string | null;
  subcategoryName: string | null;
  date: ISODate;
  note?: string;
  recurringId?: string;
  occurrenceKey?: string;
}

export interface StartPeriodInput {
  startDate: ISODate;
  netSalaryOre: Ore;
  allocations: BudgetAllocation[];
  note?: string;
}

export interface OnboardingInput {
  netSalaryOre: Ore;
  payday: number;
  useFixedPayday: boolean;
  startDate: ISODate;
  allocations: BudgetAllocation[];
  startPeriodNow: boolean;
}

export type Action =
  | { type: 'hydrate'; data: AppData }
  | { type: 'completeOnboarding'; input: OnboardingInput; now?: string }
  | { type: 'addTransaction'; input: TransactionInput; now?: string }
  | { type: 'addTransactions'; inputs: TransactionInput[]; now?: string }
  | { type: 'updateTransaction'; id: string; patch: Partial<TransactionInput>; now?: string }
  | { type: 'deleteTransaction'; id: string }
  | { type: 'setPeriodSalary'; periodId: string; amountOre: Ore }
  | { type: 'setAllocation'; periodId: string; categoryId: string; amountOre: Ore }
  | { type: 'setAllocations'; periodId: string; allocations: BudgetAllocation[] }
  | { type: 'setPeriodStartDate'; periodId: string; startDate: ISODate }
  | { type: 'startNewPeriod'; input: StartPeriodInput; now?: string }
  | { type: 'updateSettings'; patch: Partial<UserSettings> }
  | { type: 'addCategory'; category: Omit<BudgetCategory, 'id' | 'sortOrder' | 'archived'> }
  | { type: 'updateCategory'; id: string; patch: Partial<BudgetCategory> }
  | { type: 'archiveCategory'; id: string; archived: boolean }
  | { type: 'addSubcategory'; name: string; categoryId: string }
  | { type: 'renameSubcategory'; id: string; name: string }
  | { type: 'deleteSubcategory'; id: string }
  | { type: 'addFavorite'; favorite: Omit<Favorite, 'id' | 'createdAt' | 'useCount'> }
  | { type: 'deleteFavorite'; id: string }
  | { type: 'addRecurring'; rule: Omit<RecurringTransaction, 'id' | 'createdAt' | 'skipped'> }
  | { type: 'updateRecurring'; id: string; patch: Partial<RecurringTransaction> }
  | { type: 'deleteRecurring'; id: string }
  | { type: 'skipOccurrence'; recurringId: string; occurrenceKey: string }
  | { type: 'replaceData'; data: AppData }
  | { type: 'reset'; data: AppData };

function touch(state: AppData): AppData {
  return {
    ...state,
    schemaVersion: SCHEMA_VERSION,
    meta: { ...state.meta, updatedAt: new Date().toISOString(), appVersion: APP_VERSION },
  };
}

/** Oppretter eller oppdaterer underkategorien som ble brukt, og teller bruken. */
function learnSubcategory(
  subcategories: Subcategory[],
  categoryId: string | null,
  rawName: string | null,
  now: string,
): Subcategory[] {
  if (!categoryId || !rawName) return subcategories;
  const name = normalizeSubcategoryName(rawName);
  if (!name) return subcategories;

  const index = subcategories.findIndex(
    (s) => s.categoryId === categoryId && s.name.toLowerCase() === name.toLowerCase(),
  );

  if (index >= 0) {
    const next = subcategories.slice();
    next[index] = { ...next[index], useCount: next[index].useCount + 1, lastUsedAt: now };
    return next;
  }

  return [
    ...subcategories,
    { id: createId('sub'), name, categoryId, useCount: 1, lastUsedAt: now, source: 'user' },
  ];
}

function buildTransaction(state: AppData, input: TransactionInput, now: string): Transaction {
  const active = findActivePeriod(state.periods);
  const periodId = resolvePeriodForDate(state.periods, input.date, active?.id);
  if (!periodId) throw new Error('Ingen lønnsperiode å registrere på. Start en periode først.');

  return {
    id: createId('tx'),
    periodId,
    kind: input.kind,
    amountOre: Math.abs(Math.round(input.amountOre)),
    categoryId: input.categoryId,
    subcategoryName: input.subcategoryName ? normalizeSubcategoryName(input.subcategoryName) : null,
    date: input.date,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    recurringId: input.recurringId,
    occurrenceKey: input.occurrenceKey,
  };
}

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'hydrate':
    case 'replaceData':
    case 'reset':
      return action.data;

    case 'completeOnboarding': {
      const now = action.now ?? new Date().toISOString();
      const { input } = action;
      const settings: UserSettings = {
        ...state.settings,
        onboarded: true,
        payday: input.payday,
        useFixedPayday: input.useFixedPayday,
        defaultNetSalaryOre: input.netSalaryOre,
      };
      const periods = input.startPeriodNow
        ? [
            createPeriod({
              startDate: input.startDate,
              payday: input.payday,
              useFixedPayday: input.useFixedPayday,
              netSalaryOre: input.netSalaryOre,
              allocations: input.allocations,
              index: 1,
              now,
            }),
          ]
        : state.periods;
      return touch({ ...state, settings, periods });
    }

    case 'addTransaction': {
      const now = action.now ?? new Date().toISOString();
      const tx = buildTransaction(state, action.input, now);
      return touch({
        ...state,
        transactions: [...state.transactions, tx],
        subcategories: learnSubcategory(state.subcategories, tx.categoryId, tx.subcategoryName, now),
        settings: {
          ...state.settings,
          lastUsed: { categoryId: tx.categoryId, subcategoryName: tx.subcategoryName },
        },
      });
    }

    case 'addTransactions': {
      const now = action.now ?? new Date().toISOString();
      let subcategories = state.subcategories;
      const added: Transaction[] = [];
      // Hopp over forekomster som allerede er bokført (idempotens for faste utgifter).
      const existingKeys = new Set(
        state.transactions.map((t) => t.occurrenceKey).filter((k): k is string => Boolean(k)),
      );
      for (const input of action.inputs) {
        if (input.occurrenceKey && existingKeys.has(input.occurrenceKey)) continue;
        const tx = buildTransaction(state, input, now);
        if (tx.occurrenceKey) existingKeys.add(tx.occurrenceKey);
        added.push(tx);
        subcategories = learnSubcategory(subcategories, tx.categoryId, tx.subcategoryName, now);
      }
      if (!added.length) return state;
      return touch({ ...state, transactions: [...state.transactions, ...added], subcategories });
    }

    case 'updateTransaction': {
      const now = action.now ?? new Date().toISOString();
      const index = state.transactions.findIndex((t) => t.id === action.id);
      if (index < 0) return state;
      const current = state.transactions[index];
      const patch = action.patch;
      const date = patch.date ?? current.date;
      const next: Transaction = {
        ...current,
        ...patch,
        amountOre:
          patch.amountOre !== undefined ? Math.abs(Math.round(patch.amountOre)) : current.amountOre,
        subcategoryName:
          patch.subcategoryName !== undefined
            ? patch.subcategoryName
              ? normalizeSubcategoryName(patch.subcategoryName)
              : null
            : current.subcategoryName,
        note: patch.note !== undefined ? patch.note?.trim() || undefined : current.note,
        date,
        // Datoendring kan flytte transaksjonen til en annen lønnsperiode.
        periodId: resolvePeriodForDate(state.periods, date, current.periodId) ?? current.periodId,
        updatedAt: now,
      };
      const transactions = state.transactions.slice();
      transactions[index] = next;
      const learned =
        patch.subcategoryName && next.subcategoryName !== current.subcategoryName
          ? learnSubcategory(state.subcategories, next.categoryId, next.subcategoryName, now)
          : state.subcategories;
      return touch({ ...state, transactions, subcategories: learned });
    }

    case 'deleteTransaction':
      return touch({
        ...state,
        transactions: state.transactions.filter((t) => t.id !== action.id),
      });

    case 'setPeriodSalary':
      return touch({
        ...state,
        periods: state.periods.map((p) =>
          p.id === action.periodId ? { ...p, netSalaryOre: Math.max(0, Math.round(action.amountOre)) } : p,
        ),
      });

    case 'setAllocation':
      return touch({
        ...state,
        periods: state.periods.map((p) => {
          if (p.id !== action.periodId) return p;
          const amountOre = Math.max(0, Math.round(action.amountOre));
          const exists = p.allocations.some((a) => a.categoryId === action.categoryId);
          const allocations = exists
            ? p.allocations.map((a) => (a.categoryId === action.categoryId ? { ...a, amountOre } : a))
            : [...p.allocations, { categoryId: action.categoryId, amountOre }];
          return { ...p, allocations };
        }),
      });

    case 'setAllocations':
      return touch({
        ...state,
        periods: state.periods.map((p) =>
          p.id === action.periodId ? { ...p, allocations: action.allocations.map((a) => ({ ...a })) } : p,
        ),
      });

    case 'setPeriodStartDate': {
      const period = state.periods.find((p) => p.id === action.periodId);
      if (!period) return state;
      const updated = createPeriod({
        startDate: action.startDate,
        payday: state.settings.payday,
        useFixedPayday: state.settings.useFixedPayday,
        netSalaryOre: period.netSalaryOre,
        allocations: period.allocations,
        index: period.index,
      });
      const periods = state.periods.map((p) =>
        p.id === action.periodId
          ? { ...period, startDate: updated.startDate, endDate: updated.endDate, expectedNextPayday: updated.expectedNextPayday }
          : p,
      );
      // Transaksjoner kan ha falt utenfor den nye perioden – koble dem på nytt.
      const transactions = state.transactions.map((t) => ({
        ...t,
        periodId: resolvePeriodForDate(periods, t.date, t.periodId) ?? t.periodId,
      }));
      return touch({ ...state, periods, transactions });
    }

    case 'startNewPeriod': {
      const now = action.now ?? new Date().toISOString();
      const { input } = action;
      const active = findActivePeriod(state.periods);
      const sorted = sortPeriods(state.periods);
      const nextIndex = (sorted[sorted.length - 1]?.index ?? 0) + 1;

      const periods = state.periods.map((p) => {
        if (!active || p.id !== active.id) return p;
        // Forrige periode arkiveres og avsluttes dagen før den nye starter.
        const endDate = input.startDate > p.startDate ? addDayBefore(input.startDate) : p.endDate;
        return { ...p, status: 'closed' as const, closedAt: now, endDate };
      });

      const period = createPeriod({
        startDate: input.startDate,
        payday: state.settings.payday,
        useFixedPayday: state.settings.useFixedPayday,
        netSalaryOre: input.netSalaryOre,
        allocations: input.allocations,
        index: nextIndex,
        note: input.note,
        now,
      });

      const nextPeriods = [...periods, period];
      // Transaksjoner datert inn i den nye perioden flyttes med.
      const transactions = state.transactions.map((t) => ({
        ...t,
        periodId: resolvePeriodForDate(nextPeriods, t.date, t.periodId) ?? t.periodId,
      }));

      return touch({
        ...state,
        periods: nextPeriods,
        transactions,
        settings: { ...state.settings, defaultNetSalaryOre: input.netSalaryOre },
      });
    }

    case 'updateSettings':
      return touch({ ...state, settings: { ...state.settings, ...action.patch } });

    case 'addCategory': {
      const maxOrder = state.categories.reduce((m, c) => Math.max(m, c.sortOrder), -1);
      const category: BudgetCategory = {
        ...action.category,
        id: createId('cat'),
        sortOrder: maxOrder + 1,
        archived: false,
      };
      return touch({ ...state, categories: [...state.categories, category] });
    }

    case 'updateCategory':
      return touch({
        ...state,
        categories: state.categories.map((c) =>
          c.id === action.id ? { ...c, ...action.patch, id: c.id, coreKey: c.coreKey } : c,
        ),
      });

    case 'archiveCategory':
      return touch({
        ...state,
        categories: state.categories.map((c) =>
          c.id === action.id ? { ...c, archived: action.archived } : c,
        ),
      });

    case 'addSubcategory': {
      const name = normalizeSubcategoryName(action.name);
      if (!name) return state;
      const exists = state.subcategories.some(
        (s) => s.categoryId === action.categoryId && s.name.toLowerCase() === name.toLowerCase(),
      );
      if (exists) return state;
      return touch({
        ...state,
        subcategories: [
          ...state.subcategories,
          { id: createId('sub'), name, categoryId: action.categoryId, useCount: 0, source: 'user' },
        ],
      });
    }

    case 'renameSubcategory': {
      const name = normalizeSubcategoryName(action.name);
      if (!name) return state;
      const target = state.subcategories.find((s) => s.id === action.id);
      if (!target) return state;
      if (name === target.name) return state;
      // Finnes navnet fra før i samme kategori, slås de to sammen i stedet for å lage en duplikat.
      const duplicate = state.subcategories.find(
        (s) =>
          s.id !== target.id &&
          s.categoryId === target.categoryId &&
          s.name.toLowerCase() === name.toLowerCase(),
      );
      const subcategories = duplicate
        ? state.subcategories
            .filter((s) => s.id !== target.id)
            .map((s) =>
              s.id === duplicate.id
                ? {
                    ...s,
                    useCount: s.useCount + target.useCount,
                    lastUsedAt:
                      (target.lastUsedAt ?? '') > (s.lastUsedAt ?? '') ? target.lastUsedAt : s.lastUsedAt,
                    source: 'user' as const,
                  }
                : s,
            )
        : state.subcategories.map((s) => (s.id === action.id ? { ...s, name, source: 'user' as const } : s));
      const finalName = duplicate ? duplicate.name : name;
      const matches = (categoryId: string | null, subName: string | null) =>
        categoryId === target.categoryId &&
        (subName ?? '').toLowerCase() === target.name.toLowerCase();
      return touch({
        ...state,
        subcategories,
        // Behold koblingen i historikken: eksisterende transaksjoner, favoritter og
        // faste utgifter følger med på det nye navnet.
        transactions: state.transactions.map((t) =>
          matches(t.categoryId, t.subcategoryName) ? { ...t, subcategoryName: finalName } : t,
        ),
        favorites: state.favorites.map((f) =>
          matches(f.categoryId, f.subcategoryName)
            ? {
                ...f,
                subcategoryName: finalName,
                label: f.label.toLowerCase() === target.name.toLowerCase() ? finalName : f.label,
              }
            : f,
        ),
        recurring: state.recurring.map((r) =>
          matches(r.categoryId, r.subcategoryName) ? { ...r, subcategoryName: finalName } : r,
        ),
      });
    }

    case 'deleteSubcategory':
      // Transaksjoner beholder navnet sitt – vi fjerner bare forslaget.
      return touch({
        ...state,
        subcategories: state.subcategories.filter((s) => s.id !== action.id),
      });

    case 'addFavorite':
      return touch({
        ...state,
        favorites: [
          ...state.favorites,
          { ...action.favorite, id: createId('fav'), useCount: 0, createdAt: new Date().toISOString() },
        ],
      });

    case 'deleteFavorite':
      return touch({ ...state, favorites: state.favorites.filter((f) => f.id !== action.id) });

    case 'addRecurring':
      return touch({
        ...state,
        recurring: [
          ...state.recurring,
          { ...action.rule, id: createId('rec'), skipped: [], createdAt: new Date().toISOString() },
        ],
      });

    case 'updateRecurring':
      return touch({
        ...state,
        recurring: state.recurring.map((r) => (r.id === action.id ? { ...r, ...action.patch, id: r.id } : r)),
      });

    case 'deleteRecurring':
      return touch({ ...state, recurring: state.recurring.filter((r) => r.id !== action.id) });

    case 'skipOccurrence':
      return touch({
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === action.recurringId && !r.skipped.includes(action.occurrenceKey)
            ? { ...r, skipped: [...r.skipped, action.occurrenceKey] }
            : r,
        ),
      });

    default:
      return state;
  }
}

function addDayBefore(iso: ISODate): ISODate {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Standard startdato for en ny periode: i dag. */
export function defaultNewPeriodStart(): ISODate {
  return today();
}
