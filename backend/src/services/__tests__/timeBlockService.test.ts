import {
  expandRecurrence,
  parseRecurrencePattern,
  hasTimeBlockConflict,
  hasAppointmentConflict,
  hasSchedulingConflict,
  getExpandedTimeBlocks,
} from '../timeBlockService';
import { pool } from '../../db/pool';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

describe('timeBlockService', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  describe('expandRecurrence', () => {
    it('expands daily patterns', () => {
      const start = new Date('2024-01-01T09:00:00.000Z');
      const end = new Date('2024-01-01T10:00:00.000Z');
      const instances = expandRecurrence(start, end, {
        pattern: 'daily',
        until: '2024-01-03T23:59:59.000Z',
      });

      expect(instances).toHaveLength(3);
    });

    it('expands weekly patterns on matching days', () => {
      const start = new Date('2024-01-01T09:00:00.000Z'); // Monday
      const end = new Date('2024-01-01T10:00:00.000Z');
      const instances = expandRecurrence(start, end, {
        pattern: 'weekly',
        days: [1],
        until: '2024-01-15T23:59:59.000Z',
      });

      expect(instances).toHaveLength(3);
    });

    it('expands biweekly patterns', () => {
      const start = new Date('2024-01-01T09:00:00.000Z'); // Monday
      const end = new Date('2024-01-01T10:00:00.000Z');
      const instances = expandRecurrence(start, end, {
        pattern: 'biweekly',
        days: [1],
        until: '2024-01-29T23:59:59.000Z',
      });

      expect(instances).toHaveLength(3);
    });

    it('expands monthly patterns', () => {
      const start = new Date('2024-01-05T09:00:00.000Z');
      const end = new Date('2024-01-05T10:00:00.000Z');
      const instances = expandRecurrence(start, end, {
        pattern: 'monthly',
        dayOfMonth: 5,
        until: '2024-03-05T23:59:59.000Z',
      });

      expect(instances).toHaveLength(3);
    });

    it('expands monthly patterns using start day when dayOfMonth missing', () => {
      const start = new Date('2024-01-05T09:00:00.000Z');
      const end = new Date('2024-01-05T10:00:00.000Z');
      const instances = expandRecurrence(start, end, {
        pattern: 'monthly',
        until: '2024-03-05T23:59:59.000Z',
      });

      expect(instances).toHaveLength(3);
    });
  });

  describe('parseRecurrencePattern', () => {
    it('parses json string patterns', () => {
      const pattern = parseRecurrencePattern('{"pattern":"daily"}');
      expect(pattern).toEqual({ pattern: 'daily' });
    });

    it('returns null for invalid patterns', () => {
      expect(parseRecurrencePattern(null)).toBeNull();
      expect(parseRecurrencePattern('not-json')).toBeNull();
    });

    it('returns object patterns unchanged', () => {
      const pattern = parseRecurrencePattern({ pattern: 'daily' } as any);
      expect(pattern).toEqual({ pattern: 'daily' });
    });
  });

  describe('conflict checks', () => {
    it('detects time block conflicts', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      const result = await hasTimeBlockConflict(
        'tenant-1',
        'provider-1',
        '2024-01-01T10:00:00.000Z',
        '2024-01-01T11:00:00.000Z'
      );

      expect(result).toBe(true);
    });

    it('detects appointment conflicts', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      const result = await hasAppointmentConflict(
        'tenant-1',
        'provider-1',
        '2024-01-01T10:00:00.000Z',
        '2024-01-01T11:00:00.000Z'
      );

      expect(result).toBe(true);
    });

    it('returns scheduling conflict from time blocks', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      const result = await hasSchedulingConflict(
        'tenant-1',
        'provider-1',
        '2024-01-01T10:00:00.000Z',
        '2024-01-01T11:00:00.000Z'
      );

      expect(result).toEqual({ hasConflict: true, conflictType: 'time_block' });
      expect(queryMock).toHaveBeenCalledTimes(1);
    });

    it('returns scheduling conflict from appointments', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 1 });
      const result = await hasSchedulingConflict(
        'tenant-1',
        'provider-1',
        '2024-01-01T10:00:00.000Z',
        '2024-01-01T11:00:00.000Z'
      );

      expect(result).toEqual({ hasConflict: true, conflictType: 'appointment' });
      expect(queryMock).toHaveBeenCalledTimes(2);
    });

    it('returns no conflicts when free', async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 0 });
      const result = await hasSchedulingConflict(
        'tenant-1',
        'provider-1',
        '2024-01-01T10:00:00.000Z',
        '2024-01-01T11:00:00.000Z'
      );

      expect(result).toEqual({ hasConflict: false });
    });
  });

  describe('getExpandedTimeBlocks', () => {
    it('expands recurring and non-recurring time blocks', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            id: 'block-1',
            start_time: '2024-01-05T10:00:00.000Z',
            end_time: '2024-01-05T11:00:00.000Z',
            is_recurring: false,
            recurrence_pattern: null,
            recurrence_end_date: null,
          },
          {
            id: 'block-2',
            start_time: '2024-01-02T09:00:00.000Z',
            end_time: '2024-01-02T10:00:00.000Z',
            is_recurring: true,
            recurrence_pattern: JSON.stringify({
              pattern: 'daily',
              until: '2024-01-04T23:59:59.000Z',
            }),
            recurrence_end_date: '2024-01-04T23:59:59.000Z',
          },
        ],
      });

      const instances = await getExpandedTimeBlocks(
        'tenant-1',
        null,
        null,
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-10T00:00:00.000Z')
      );

      expect(instances).toHaveLength(4);
      expect(instances.some(inst => inst.startTime.toISOString() === '2024-01-05T10:00:00.000Z')).toBe(true);
    });

    it('filters by provider and location', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await getExpandedTimeBlocks(
        'tenant-1',
        'provider-1',
        'location-1',
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-10T00:00:00.000Z')
      );

      const [query, values] = queryMock.mock.calls[0];
      expect(query).toContain('provider_id');
      expect(query).toContain('location_id');
      expect(values).toEqual([
        'tenant-1',
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-10T00:00:00.000Z'),
        'provider-1',
        'location-1',
      ]);
    });
  });
});
