/**
 * Datamodell for Budsjette.
 *
 * Konvensjoner:
 *  - Alle beløp lagres som heltall i ØRE (Ore) for å unngå avrundingsfeil.
 *  - Alle datoer lagres som ISO-datostreng 'YYYY-MM-DD' i lokal (norsk) tid.
 *  - Tidsstempler (createdAt/updatedAt) lagres som full ISO-streng i UTC.
 */

/** Dato uten klokkeslett, format 'YYYY-MM-DD'. */
export type ISODate = string;
/** Heltall i øre. 15 000 kr = 1 500 000 øre. */
export type Ore = number;

/** Hva slags pengebevegelse en transaksjon representerer. */
export type TransactionKind =
  | 'expense' // ordinær utgift
  | 'saving' // overføring til sparing
  | 'debt' // nedbetaling av gjeld (avdrag/renter)
  | 'income' // ekstra inntekt i perioden
  | 'adjustment'; // korreksjon (f.eks. refusjon)

/** Hvilken «bøtte» en kategori hører til. Styrer om forbruket telles som ordinært forbruk. */
export type CategoryKind = 'expense' | 'saving' | 'debt';

export type CoreCategoryKey =
  | 'bolig'
  | 'mat'
  | 'transport'
  | 'klaer'
  | 'sparing'
  | 'annet'
  | 'gjeld';

/** Navngitt fargetoken – løses til konkrete hex-verdier per tema i lib/colors.ts. */
export type ColorToken =
  | 'blue'
  | 'aqua'
  | 'yellow'
  | 'magenta'
  | 'green'
  | 'violet'
  | 'orange'
  | 'red';

export interface BudgetCategory {
  id: string;
  /** Satt for de syv forhåndsdefinerte kategoriene. Egendefinerte har undefined. */
  coreKey?: CoreCategoryKey;
  name: string;
  /** Nøkkel inn i ikonregisteret (lib/icons.ts). */
  icon: string;
  color: ColorToken;
  kind: CategoryKind;
  sortOrder: number;
  archived: boolean;
}

export interface Subcategory {
  id: string;
  name: string;
  categoryId: string;
  /** Hvor mange ganger brukeren har registrert denne. Styrer rekkefølgen på forslag. */
  useCount: number;
  lastUsedAt?: string;
  source: 'seed' | 'user';
}

export interface BudgetAllocation {
  categoryId: string;
  amountOre: Ore;
}

export interface BudgetPeriod {
  id: string;
  /** Løpenummer, 1-basert. Brukes til sortering og visning. */
  index: number;
  /** Lønningsdato – første dag i perioden (inklusiv). */
  startDate: ISODate;
  /** Siste dag i perioden (inklusiv) – dagen før neste lønn. */
  endDate: ISODate;
  /** Forventet neste lønningsdato. Oppdateres hvis faktisk lønn kom en annen dag. */
  expectedNextPayday: ISODate;
  /** Nettolønn for denne perioden (kan variere fra standardlønn). */
  netSalaryOre: Ore;
  /** Fryst kopi av budsjettet for perioden – historiske budsjetter endres aldri av nye perioder. */
  allocations: BudgetAllocation[];
  status: 'active' | 'closed';
  createdAt: string;
  closedAt?: string;
  note?: string;
}

export interface Transaction {
  id: string;
  /** Perioden transaksjonen tilhører. Utledes av datoen ved opprettelse/endring. */
  periodId: string;
  kind: TransactionKind;
  /** Alltid positivt tall. Fortegn følger av `kind`. */
  amountOre: Ore;
  /** Kan være null for ekstra inntekt og justeringer. */
  categoryId: string | null;
  subcategoryName: string | null;
  date: ISODate;
  note?: string;
  createdAt: string;
  updatedAt: string;
  /** Satt når raden kommer fra en fast utgift. */
  recurringId?: string;
  /** '<recurringId>:<forfallsdato>' – garanterer at samme forekomst bare bokføres én gang. */
  occurrenceKey?: string;
}

/** Ekstra inntekt er en transaksjon med kind === 'income'. */
export type IncomeEntry = Transaction & { kind: 'income' };

export type RecurrenceInterval = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringTransaction {
  id: string;
  name: string;
  amountOre: Ore;
  kind: TransactionKind;
  categoryId: string | null;
  subcategoryName: string | null;
  interval: RecurrenceInterval;
  /** Første forfallsdato. Alle senere forfall beregnes fra denne. */
  anchorDate: ISODate;
  /** true = bokføres automatisk ved forfall, false = krever bekreftelse. */
  autoPost: boolean;
  active: boolean;
  note?: string;
  /** Forekomster brukeren aktivt har hoppet over (occurrenceKey). */
  skipped: string[];
  createdAt: string;
}

export interface Favorite {
  id: string;
  label: string;
  /** null = spør om beløp ved bruk. */
  amountOre: Ore | null;
  kind: TransactionKind;
  categoryId: string | null;
  subcategoryName: string | null;
  useCount: number;
  createdAt: string;
}

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserSettings {
  onboarded: boolean;
  /** Dag i måneden lønnen vanligvis kommer (1–31). Klippes til siste dag i korte måneder. */
  payday: number;
  /** false = brukeren registrerer lønnsdato manuelt hver gang. */
  useFixedPayday: boolean;
  defaultNetSalaryOre: Ore;
  theme: ThemePreference;
  /** Antall dager før lønn appen skal minne om ny periode. */
  paydayReminderDays: number;
  /** Sist brukte kombinasjon – forhåndsvelges (men låser ikke) ved ny registrering. */
  lastUsed?: { categoryId: string | null; subcategoryName: string | null };
  /** true når appen er fylt med eksempeldata via demomodus. */
  demoMode: boolean;
}

export interface AppMeta {
  createdAt: string;
  updatedAt: string;
  appVersion: string;
}

/** Hele den persisterte tilstanden. Alt som lagres ligger her. */
export interface AppData {
  schemaVersion: number;
  settings: UserSettings;
  categories: BudgetCategory[];
  subcategories: Subcategory[];
  periods: BudgetPeriod[];
  transactions: Transaction[];
  recurring: RecurringTransaction[];
  favorites: Favorite[];
  meta: AppMeta;
}

/* ---------- Avledede typer brukt i UI ---------- */

export type BudgetStatus = 'none' | 'ok' | 'warning' | 'over';

export interface CategoryStatus {
  category: BudgetCategory;
  budgetOre: Ore;
  actualOre: Ore;
  remainingOre: Ore;
  /** 0–∞. 1 = budsjettet er brukt opp. */
  ratio: number;
  percent: number;
  status: BudgetStatus;
  transactionCount: number;
}

export interface PeriodTotals {
  /** Nettolønn registrert på perioden. */
  salaryOre: Ore;
  /** Sum ekstra inntekter registrert i perioden. */
  extraIncomeOre: Ore;
  /** salary + extraIncome + justeringer. */
  totalIncomeOre: Ore;
  /** Ordinære utgifter (ekskl. sparing og gjeld). */
  expenseOre: Ore;
  savingOre: Ore;
  debtOre: Ore;
  /** expense + saving + debt. */
  totalOutOre: Ore;
  /** totalIncome − totalOut. Dette er «igjen å bruke». */
  availableOre: Ore;
  adjustmentOre: Ore;
  budgetedOre: Ore;
  unallocatedOre: Ore;
}

export interface PeriodPace {
  daysTotal: number;
  /** Antall dager som er gått, inkludert i dag (minimum 1 når perioden er i gang). */
  daysElapsed: number;
  /** Dager igjen inkludert i dag. 0 når perioden er over. */
  daysRemaining: number;
  /** 0–1: hvor langt ut i perioden vi er. */
  progress: number;
  isActiveNow: boolean;
}
