import type { ColorToken } from '@/types';

/**
 * Kategorifarger.
 *
 * Paletten er validert for fargeblindhet og kontrast i både lys og mørk modus
 * (ΔE for nabopar i visningsrekkefølgen: 9,1 lys / 8,4 mørk ved CVD,
 * 19,6 / 19,3 ved normalt syn). Mørk modus er egne steg – ikke en automatisk
 * invertering av lys modus.
 *
 * Fargen følger alltid kategorien, aldri rangeringen: filtrering i et diagram
 * skal aldri føre til at gjenværende kategorier bytter farge.
 */
export const COLOR_TOKENS: Record<ColorToken, { light: string; dark: string; label: string }> = {
  blue: { light: '#2a78d6', dark: '#3987e5', label: 'Blå' },
  aqua: { light: '#1baf7a', dark: '#199e70', label: 'Akvagrønn' },
  yellow: { light: '#eda100', dark: '#c98500', label: 'Gul' },
  magenta: { light: '#e87ba4', dark: '#d55181', label: 'Rosa' },
  green: { light: '#008300', dark: '#008300', label: 'Grønn' },
  violet: { light: '#4a3aa7', dark: '#9085e9', label: 'Fiolett' },
  orange: { light: '#eb6834', dark: '#d95926', label: 'Oransje' },
  red: { light: '#e34948', dark: '#e66767', label: 'Rød' },
};

export const COLOR_TOKEN_LIST = Object.keys(COLOR_TOKENS) as ColorToken[];

export type ResolvedMode = 'light' | 'dark';

export function colorFor(token: ColorToken, mode: ResolvedMode): string {
  return (COLOR_TOKENS[token] ?? COLOR_TOKENS.blue)[mode];
}

/**
 * Statusfarger er reservert for budsjettstatus og gjenbrukes aldri som
 * kategorifarge. De opptrer alltid sammen med tekst, aldri som eneste signal.
 */
export function statusColor(status: 'ok' | 'warning' | 'over' | 'none', mode: ResolvedMode): string {
  const map = {
    ok: { light: '#047857', dark: '#34d399' },
    warning: { light: '#b45309', dark: '#fbbf24' },
    over: { light: '#be123c', dark: '#fb7185' },
    none: { light: '#94a3b8', dark: '#64748b' },
  } as const;
  return map[status][mode];
}

/** Nøytrale farger til akser, rutenett og referanselinjer. */
export function chartNeutrals(mode: ResolvedMode) {
  return {
    grid: mode === 'light' ? '#e8ebf0' : '#243044',
    axis: mode === 'light' ? '#64748b' : '#8da0bb',
    ink: mode === 'light' ? '#0f172a' : '#e7ecf3',
    muted: mode === 'light' ? '#64748b' : '#8da0bb',
    surface: mode === 'light' ? '#ffffff' : '#131922',
    line: mode === 'light' ? '#e5e7eb' : '#263142',
    reference: mode === 'light' ? '#94a3b8' : '#64748b',
    /** Egen tone til «budsjettert»-søylene, som ikke er en kategorifarge. */
    budget: mode === 'light' ? '#cbd5e1' : '#3a4a63',
  };
}

/** Hex → rgba med gitt gjennomsiktighet. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
