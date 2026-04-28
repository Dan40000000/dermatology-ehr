import { describe, expect, it } from 'vitest';
import { getDowntimeTargetDate, hasReachedDowntimePacketCutoff } from '../downtime';

describe('getDowntimeTargetDate', () => {
  it('always targets the next business day before the cutoff', () => {
    expect(getDowntimeTargetDate('12:00', new Date('2026-04-14T10:30:00'))).toBe('2026-04-15');
  });

  it('returns the next business day after the cutoff', () => {
    expect(getDowntimeTargetDate('12:00', new Date('2026-04-14T13:30:00'))).toBe('2026-04-15');
  });

  it('returns Monday for Friday afternoon', () => {
    expect(getDowntimeTargetDate('12:00', new Date('2026-04-17T13:30:00'))).toBe('2026-04-20');
  });

  it('returns Monday on weekends', () => {
    expect(getDowntimeTargetDate('12:00', new Date('2026-04-18T09:00:00'))).toBe('2026-04-20');
  });
});

describe('hasReachedDowntimePacketCutoff', () => {
  it('waits for the configured cutoff on weekdays', () => {
    expect(hasReachedDowntimePacketCutoff('12:00', new Date('2026-04-14T10:30:00'))).toBe(false);
    expect(hasReachedDowntimePacketCutoff('12:00', new Date('2026-04-14T12:00:00'))).toBe(true);
  });

  it('treats weekends as ready for the next business day packet', () => {
    expect(hasReachedDowntimePacketCutoff('12:00', new Date('2026-04-18T09:00:00'))).toBe(true);
  });
});
