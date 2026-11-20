import { describe, expect, it } from 'vitest';
import {
  clampOre,
  formatOre,
  formatOreCompact,
  formatPercent,
  kronerToOre,
  oreToInputValue,
  parseAmountToOre,
  percentOf,
} from '@/lib/money';

const NBSP = ' ';

describe('parseAmountToOre', () => {
  it('tolker hele kroner', () => {
    expect(parseAmountToOre('200')).toBe(20000);
    expect(parseAmountToOre('0')).toBe(0);
  });

  it('tolker komma som desimalskille', () => {
    expect(parseAmountToOre('349,50')).toBe(34950);
    expect(parseAmountToOre('1,5')).toBe(150);
  });

  it('tolker punktum som desimalskille', () => {
    expect(parseAmountToOre('349.50')).toBe(34950);
  });

  it('fjerner mellomrom og kr-suffiks', () => {
    expect(parseAmountToOre('15 000 kr')).toBe(1_500_000);
    expect(parseAmountToOre(`1${NBSP}234,50`)).toBe(123450);
  });

  it('skiller tusenskille fra desimalskille', () => {
    expect(parseAmountToOre('1.234,50')).toBe(123450);
    expect(parseAmountToOre('1,234.50')).toBe(123450);
    // Norsk standard: ett komma er desimalskille, ikke tusenskille.
    expect(parseAmountToOre('1,234')).toBe(123);
    // Flere komma kan bare være tusenskille.
    expect(parseAmountToOre('1,234,567')).toBe(123456700);
    expect(parseAmountToOre('1.234.567')).toBe(123456700);
  });

  it('avviser ugyldige verdier', () => {
    expect(parseAmountToOre('')).toBeNull();
    expect(parseAmountToOre('abc')).toBeNull();
    expect(parseAmountToOre('12,,5')).toBeNull();
    expect(parseAmountToOre('   ')).toBeNull();
  });

  it('runder av til hele øre uten flyttallsfeil', () => {
    expect(parseAmountToOre('0,1')).toBe(10);
    expect(parseAmountToOre('1234,567')).toBe(123457);
  });
});

describe('formatOre', () => {
  it('formaterer med hardt mellomrom og kr', () => {
    expect(formatOre(1_500_000)).toBe(`15${NBSP}000${NBSP}kr`);
    expect(formatOre(20000)).toBe(`200${NBSP}kr`);
  });

  it('viser desimaler bare når beløpet har ører', () => {
    expect(formatOre(34950)).toBe(`349,50${NBSP}kr`);
    expect(formatOre(35000)).toBe(`350${NBSP}kr`);
  });

  it('bruker typografisk minus for negative beløp', () => {
    expect(formatOre(-20000)).toBe(`−200${NBSP}kr`);
  });

  it('kan utelate enheten og vise fortegn', () => {
    expect(formatOre(20000, { unit: false })).toBe('200');
    expect(formatOre(20000, { signed: true })).toBe(`+200${NBSP}kr`);
  });

  it('grupperer store tall riktig', () => {
    expect(formatOre(123_456_700)).toBe(`1${NBSP}234${NBSP}567${NBSP}kr`);
  });
});

describe('øvrige hjelpere', () => {
  it('formaterer kompakt til akser', () => {
    expect(formatOreCompact(1_500_000)).toBe('15k');
    expect(formatOreCompact(95_000)).toBe('950');
    expect(formatOreCompact(250_000)).toBe('2,5k');
  });

  it('konverterer til redigerbar verdi', () => {
    expect(oreToInputValue(1_500_000)).toBe('15000');
    expect(oreToInputValue(34950)).toBe('349,50');
  });

  it('regner prosent uten å dele på null', () => {
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(50, 0)).toBe(0);
    expect(formatPercent(80)).toBe(`80${NBSP}%`);
  });

  it('klipper beløp innenfor grenser', () => {
    expect(clampOre(-100, 0, 1000)).toBe(0);
    expect(clampOre(5000, 0, 1000)).toBe(1000);
    expect(kronerToOre(12.34)).toBe(1234);
  });
});
