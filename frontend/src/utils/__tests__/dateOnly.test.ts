import {
  calculateAgeFromDateOnly,
  formatDateOnly,
  getDateOnlySortValue,
  parseDateOnly,
} from '../dateOnly';

describe('dateOnly utilities', () => {
  it('keeps date-only DOBs on the entered calendar day', () => {
    const dateOnly = parseDateOnly('1988-06-17');
    const isoMidnight = parseDateOnly('1988-06-17T00:00:00.000Z');

    expect(dateOnly?.getFullYear()).toBe(1988);
    expect(dateOnly?.getMonth()).toBe(5);
    expect(dateOnly?.getDate()).toBe(17);
    expect(isoMidnight?.getFullYear()).toBe(1988);
    expect(isoMidnight?.getMonth()).toBe(5);
    expect(isoMidnight?.getDate()).toBe(17);
    expect(formatDateOnly('1988-06-17')).toBe('6/17/1988');
    expect(formatDateOnly('1988-06-17T00:00:00.000Z')).toBe('6/17/1988');
  });

  it('calculates age from date-only values without timestamp drift', () => {
    expect(calculateAgeFromDateOnly('1988-06-17', new Date(2026, 5, 16))).toBe(37);
    expect(calculateAgeFromDateOnly('1988-06-17', new Date(2026, 5, 17))).toBe(38);
  });

  it('supports sorting and rejects impossible calendar dates', () => {
    expect(getDateOnlySortValue('1988-06-17')).toBeGreaterThan(0);
    expect(parseDateOnly('2026-02-31')).toBeNull();
    expect(formatDateOnly('not a date')).toBe('');
  });
});
