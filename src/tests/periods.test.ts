import { describe, expect, it } from 'vitest';
import {
  clampPaydayToMonth,
  createPeriod,
  daysUntilNextPayday,
  findPeriodForDate,
  isPeriodOverdue,
  paydayAfter,
  paydayOnOrAfter,
  paydayOnOrBefore,
  periodLength,
  periodPace,
  periodRangeFrom,
  resolvePeriodForDate,
  shouldRemindAboutPayday,
} from '@/lib/periods';
import { addDays, addMonths, diffDays, isISODate } from '@/lib/date';

describe('lønningsdato', () => {
  it('klipper lønningsdagen til siste dag i korte måneder', () => {
    expect(clampPaydayToMonth(2026, 1, 31)).toBe(28); // februar 2026
    expect(clampPaydayToMonth(2028, 1, 31)).toBe(29); // skuddår
    expect(clampPaydayToMonth(2026, 3, 31)).toBe(30); // april
    expect(clampPaydayToMonth(2026, 0, 31)).toBe(31); // januar
  });

  it('finner neste lønningsdato over et månedsskifte', () => {
    expect(paydayOnOrAfter('2026-11-20', 20)).toBe('2026-11-20');
    expect(paydayOnOrAfter('2026-11-21', 20)).toBe('2026-12-20');
    expect(paydayAfter('2026-11-20', 20)).toBe('2026-12-20');
  });

  it('håndterer årsskiftet', () => {
    expect(paydayAfter('2026-12-20', 20)).toBe('2027-01-20');
    expect(paydayOnOrBefore('2027-01-05', 20)).toBe('2026-12-20');
  });

  it('håndterer lønningsdag 31 gjennom hele året', () => {
    expect(paydayAfter('2026-01-31', 31)).toBe('2026-02-28');
    expect(paydayAfter('2026-02-28', 31)).toBe('2026-03-31');
    expect(paydayAfter('2026-03-31', 31)).toBe('2026-04-30');
  });
});

describe('periodeintervall', () => {
  it('varer fra lønningsdato til dagen før neste', () => {
    const range = periodRangeFrom('2026-11-20', 20);
    expect(range.startDate).toBe('2026-11-20');
    expect(range.endDate).toBe('2026-12-19');
    expect(range.expectedNextPayday).toBe('2026-12-20');
  });

  it('krysser årsskiftet riktig', () => {
    const range = periodRangeFrom('2026-12-20', 20);
    expect(range.endDate).toBe('2027-01-19');
    expect(range.expectedNextPayday).toBe('2027-01-20');
  });

  it('bruker én måned når brukeren ikke har fast lønningsdag', () => {
    const range = periodRangeFrom('2026-11-07', 20, false);
    expect(range.startDate).toBe('2026-11-07');
    expect(range.endDate).toBe('2026-12-06');
  });

  it('gir riktig antall dager også i februar', () => {
    expect(periodLength(makePeriod('2026-02-20', 20))).toBe(diffDays('2026-02-20', '2026-03-19') + 1);
    expect(periodLength(makePeriod('2026-11-20', 20))).toBe(30);
    expect(periodLength(makePeriod('2026-01-20', 20))).toBe(31);
  });
});

function makePeriod(startDate: string, payday: number) {
  return createPeriod({
    startDate,
    payday,
    netSalaryOre: 4_500_000,
    allocations: [],
    index: 1,
    now: '2026-01-01T00:00:00.000Z',
  });
}

describe('fremdrift i perioden', () => {
  const period = makePeriod('2026-11-20', 20);

  it('teller dager som er gått og som gjenstår', () => {
    const pace = periodPace(period, '2026-11-20');
    expect(pace.daysTotal).toBe(30);
    expect(pace.daysElapsed).toBe(1);
    expect(pace.daysRemaining).toBe(30);
    expect(pace.isActiveNow).toBe(true);
  });

  it('er ferdig på siste dag', () => {
    const pace = periodPace(period, '2026-12-19');
    expect(pace.daysElapsed).toBe(30);
    expect(pace.daysRemaining).toBe(1);
    expect(pace.progress).toBe(1);
  });

  it('gir null gjenstående dager etter perioden', () => {
    const pace = periodPace(period, '2026-12-25');
    expect(pace.daysRemaining).toBe(0);
    expect(pace.isActiveNow).toBe(false);
  });

  it('teller dager til neste lønn', () => {
    expect(daysUntilNextPayday(period, '2026-12-15')).toBe(5);
    expect(daysUntilNextPayday(period, '2026-12-20')).toBe(0);
    expect(daysUntilNextPayday(period, '2026-12-25')).toBe(0);
  });

  it('varsler først når lønn nærmer seg', () => {
    expect(shouldRemindAboutPayday(period, 3, '2026-12-10')).toBe(false);
    expect(shouldRemindAboutPayday(period, 3, '2026-12-18')).toBe(true);
    expect(shouldRemindAboutPayday(period, 0, '2026-12-19')).toBe(false);
  });

  it('markerer perioden som utløpt etter sluttdato', () => {
    expect(isPeriodOverdue(period, '2026-12-19')).toBe(false);
    expect(isPeriodOverdue(period, '2026-12-20')).toBe(true);
  });
});

describe('tilordning av dato til periode', () => {
  const a = makePeriod('2026-10-20', 20);
  const b = makePeriod('2026-11-20', 20);
  const periods = [a, b];

  it('finner perioden som dekker datoen', () => {
    expect(findPeriodForDate(periods, '2026-11-01')?.id).toBe(a.id);
    expect(findPeriodForDate(periods, '2026-11-20')?.id).toBe(b.id);
    expect(findPeriodForDate(periods, '2026-11-19')?.id).toBe(a.id);
  });

  it('faller tilbake til nærmeste periode for datoer utenfor', () => {
    expect(resolvePeriodForDate(periods, '2026-09-01')).toBe(a.id);
    expect(resolvePeriodForDate(periods, '2027-05-01')).toBe(b.id);
  });

  it('genererer gyldige ISO-datoer', () => {
    expect(isISODate(addDays('2026-12-31', 1))).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(isISODate('2026-02-30')).toBe(false);
  });
});
