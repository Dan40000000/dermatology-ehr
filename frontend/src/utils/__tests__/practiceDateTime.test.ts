import { describe, expect, it } from 'vitest';
import {
  addDaysToDateKey,
  getCivilDayDifference,
  getDayOfWeekForDateKey,
  getPracticeDateKey,
  getPracticeDateTime,
  setClinicBusinessDate,
} from '../practiceDateTime';

describe('practiceDateTime', () => {
  it('converts clinic wall time to the correct instant independent of browser time zone', () => {
    expect(
      getPracticeDateTime('2026-04-27', '09:30', 'America/Los_Angeles')?.toISOString()
    ).toBe('2026-04-27T16:30:00.000Z');
    expect(
      getPracticeDateTime('2026-12-27', '09:30', 'America/Los_Angeles')?.toISOString()
    ).toBe('2026-12-27T17:30:00.000Z');
  });

  it('rejects nonexistent clinic wall time during the spring DST transition', () => {
    expect(getPracticeDateTime('2026-03-08', '02:30', 'America/Denver')).toBeNull();
  });

  it('chooses the earlier instant for an ambiguous fall DST wall time', () => {
    expect(
      getPracticeDateTime('2026-11-01', '01:30', 'America/New_York')?.toISOString()
    ).toBe('2026-11-01T05:30:00.000Z');
  });

  it('keeps date-only clinical values on their stated civil date', () => {
    expect(getPracticeDateKey('2026-04-27', 'America/Los_Angeles')).toBe('2026-04-27');
    expect(getPracticeDateKey('2026-02-30', 'America/Los_Angeles')).toBeNull();
  });

  it('refuses to persist an impossible clinic business date', () => {
    localStorage.removeItem('clinic:businessDate');
    expect(setClinicBusinessDate('2026-02-30')).toBe(false);
    expect(localStorage.getItem('clinic:businessDate')).toBeNull();
  });

  it('calculates civil weekdays and day differences without browser-local parsing', () => {
    expect(getDayOfWeekForDateKey('2026-04-27')).toBe(1);
    expect(getCivilDayDifference('2025-06-30', '2026-04-27')).toBe(301);
    expect(addDaysToDateKey('2026-03-08', 1)).toBe('2026-03-09');
  });
});
