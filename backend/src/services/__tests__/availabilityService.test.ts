process.env.PATIENT_SCHEDULING_TIME_ZONE = 'America/Denver';

import {
  getBookingSettings,
  isDateInBookingWindow,
  calculateAvailableSlots,
  getProviderInfo,
  canCancelAppointment,
  getAvailableDatesInMonth,
} from '../availabilityService';
import { pool } from '../../db/pool';
import { getUtcInstantForPracticeDateTime } from '../../lib/practiceTimeZone';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

describe('availabilityService', () => {
  const buildPracticeDate = (dateKey: string, hour: number, minute: number) =>
    getUtcInstantForPracticeDateTime(dateKey, hour, minute, 'America/Denver').toISOString();

  beforeEach(() => {
    queryMock.mockReset();
    jest.useRealTimers();
  });

  it('returns default booking rules when none configured', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const rules = await getBookingSettings('tenant-1');

    expect(rules).toEqual({
      isEnabled: true,
      minAdvanceHours: 24,
      maxAdvanceDays: 90,
      bookingWindowDays: 60,
    });
  });

  it('returns configured booking rules', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          isEnabled: false,
          minAdvanceHours: 5,
          maxAdvanceDays: 30,
          bookingWindowDays: 10,
        },
      ],
    });

    const rules = await getBookingSettings('tenant-1');

    expect(rules).toEqual({
      isEnabled: false,
      minAdvanceHours: 5,
      maxAdvanceDays: 30,
      bookingWindowDays: 10,
    });
  });

  it('checks booking window boundaries', () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
    const rules = {
      isEnabled: true,
      minAdvanceHours: 24,
      maxAdvanceDays: 2,
      bookingWindowDays: 60,
    };

    expect(isDateInBookingWindow(new Date('2023-12-31T12:00:00.000Z'), rules)).toBe(false);
    expect(isDateInBookingWindow(new Date('2024-01-04T00:00:00.000Z'), rules)).toBe(false);
    expect(isDateInBookingWindow(new Date('2024-01-03T00:00:00.000Z'), rules)).toBe(true);
  });

  it('returns false when booking is disabled', () => {
    const rules = {
      isEnabled: false,
      minAdvanceHours: 24,
      maxAdvanceDays: 90,
      bookingWindowDays: 60,
    };

    expect(isDateInBookingWindow(new Date(), rules)).toBe(false);
  });

  it('returns empty slots when booking disabled', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          isEnabled: false,
          minAdvanceHours: 24,
          maxAdvanceDays: 90,
          bookingWindowDays: 60,
        },
      ],
    });

    const slots = await calculateAvailableSlots({
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      appointmentTypeId: 'type-1',
      date: new Date('2024-01-05T00:00:00.000Z'),
    });

    expect(slots).toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('returns empty slots when date is outside booking window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          isEnabled: true,
          minAdvanceHours: 48,
          maxAdvanceDays: 2,
          bookingWindowDays: 60,
        },
      ],
    });

    const slots = await calculateAvailableSlots({
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      appointmentTypeId: 'type-1',
      date: new Date('2024-01-05T00:00:00.000Z'),
    });

    expect(slots).toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('returns empty slots when no template exists', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            isEnabled: true,
            minAdvanceHours: 0,
            maxAdvanceDays: 30,
            bookingWindowDays: 60,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const slots = await calculateAvailableSlots({
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      appointmentTypeId: 'type-1',
      date: new Date('2024-01-02T00:00:00.000Z'),
    });

    expect(slots).toEqual([]);
  });

  it('returns empty slots for all-day time off', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            isEnabled: true,
            minAdvanceHours: 0,
            maxAdvanceDays: 30,
            bookingWindowDays: 60,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            startTime: '09:00',
            endTime: '11:00',
            slotDuration: 30,
            allowOnlineBooking: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            startDatetime: '2024-01-02T00:00:00.000Z',
            endDatetime: '2024-01-03T00:00:00.000Z',
            isAllDay: true,
          },
        ],
      });

    const slots = await calculateAvailableSlots({
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      appointmentTypeId: 'type-1',
      date: new Date('2024-01-02T00:00:00.000Z'),
    });

    expect(slots).toEqual([]);
  });

  it('throws when appointment type is missing', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            isEnabled: true,
            minAdvanceHours: 0,
            maxAdvanceDays: 30,
            bookingWindowDays: 60,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            startTime: '09:00',
            endTime: '10:00',
            slotDuration: 30,
            allowOnlineBooking: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      calculateAvailableSlots({
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        appointmentTypeId: 'missing-type',
        date: new Date('2024-01-02T00:00:00.000Z'),
      })
    ).rejects.toThrow('Appointment type not found');
  });

  it('filters time off and appointment conflicts', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const dateKey = '2024-01-02';

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            isEnabled: true,
            minAdvanceHours: 0,
            maxAdvanceDays: 30,
            bookingWindowDays: 60,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            startTime: '09:00',
            endTime: '11:00',
            slotDuration: 30,
            allowOnlineBooking: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            startDatetime: buildPracticeDate(dateKey, 10, 30),
            endDatetime: buildPracticeDate(dateKey, 11, 0),
            isAllDay: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            scheduledStart: buildPracticeDate(dateKey, 9, 30),
            scheduledEnd: buildPracticeDate(dateKey, 10, 0),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ durationMinutes: 30 }] });

    const slots = await calculateAvailableSlots({
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      appointmentTypeId: 'type-1',
      date: dateKey,
    });

    expect(slots.map(slot => slot.startTime)).toEqual([
      buildPracticeDate(dateKey, 9, 0),
      buildPracticeDate(dateKey, 10, 0),
    ]);
  });

  it('filters provider time blocks', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const dateKey = '2024-01-02';

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            isEnabled: true,
            minAdvanceHours: 0,
            maxAdvanceDays: 30,
            bookingWindowDays: 60,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            startTime: '09:00',
            endTime: '10:30',
            slotDuration: 30,
            allowOnlineBooking: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            startTime: buildPracticeDate(dateKey, 9, 30),
            endTime: buildPracticeDate(dateKey, 10, 0),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ durationMinutes: 30 }] });

    const slots = await calculateAvailableSlots({
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      appointmentTypeId: 'type-1',
      date: dateKey,
    });

    expect(slots.map(slot => slot.startTime)).toEqual([
      buildPracticeDate(dateKey, 9, 0),
      buildPracticeDate(dateKey, 10, 0),
    ]);
  });

  it('filters slots that exceed provider availability', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            isEnabled: true,
            minAdvanceHours: 0,
            maxAdvanceDays: 30,
            bookingWindowDays: 60,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            startTime: '09:00',
            endTime: '10:00',
            slotDuration: 60,
            allowOnlineBooking: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ durationMinutes: 120 }] });

    const slots = await calculateAvailableSlots({
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      appointmentTypeId: 'type-1',
      date: new Date('2024-01-02T00:00:00.000Z'),
    });

    expect(slots).toEqual([]);
  });

  it('returns slot end times using the appointment duration', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const dateKey = '2024-01-02';

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            isEnabled: true,
            minAdvanceHours: 0,
            maxAdvanceDays: 30,
            bookingWindowDays: 60,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            startTime: '09:00',
            endTime: '10:00',
            slotDuration: 15,
            allowOnlineBooking: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ durationMinutes: 45 }] });

    const slots = await calculateAvailableSlots({
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      appointmentTypeId: 'type-1',
      date: dateKey,
    });

    expect(slots[0]).toMatchObject({
      startTime: buildPracticeDate(dateKey, 9, 0),
      endTime: buildPracticeDate(dateKey, 9, 45),
    });
    expect(slots[1]).toMatchObject({
      startTime: buildPracticeDate(dateKey, 9, 15),
      endTime: buildPracticeDate(dateKey, 10, 0),
    });
  });

  it('returns provider info or null', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'provider-1', fullName: 'Dr. Smith' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(getProviderInfo('tenant-1', 'provider-1')).resolves.toEqual({
      id: 'provider-1',
      fullName: 'Dr. Smith',
    });
    await expect(getProviderInfo('tenant-1', 'provider-2')).resolves.toBeNull();
  });

  it('prevents cancellation when disabled or missing appointment', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ allowCancellation: true, cutoffHours: 24 }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(canCancelAppointment('tenant-1', 'appt-1')).resolves.toEqual({
      canCancel: false,
      reason: 'Online cancellation is not allowed',
    });
    await expect(canCancelAppointment('tenant-1', 'missing')).resolves.toEqual({
      canCancel: false,
      reason: 'Appointment not found',
    });
  });

  it('enforces cancellation cutoff windows', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    queryMock
      .mockResolvedValueOnce({
        rows: [{ allowCancellation: true, cutoffHours: 24 }],
      })
      .mockResolvedValueOnce({
        rows: [{ scheduledStart: '2024-01-01T10:00:00.000Z' }],
      })
      .mockResolvedValueOnce({
        rows: [{ allowCancellation: true, cutoffHours: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [{ scheduledStart: '2024-01-02T10:00:00.000Z' }],
      });

    await expect(canCancelAppointment('tenant-1', 'appt-1')).resolves.toEqual({
      canCancel: false,
      reason: 'Appointments must be cancelled at least 24 hours in advance',
    });
    await expect(canCancelAppointment('tenant-1', 'appt-2')).resolves.toEqual({
      canCancel: true,
    });
  });

  it('returns available dates in month', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            isEnabled: true,
            minAdvanceHours: 0,
            maxAdvanceDays: 0,
            bookingWindowDays: 60,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'template-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            isEnabled: true,
            minAdvanceHours: 0,
            maxAdvanceDays: 0,
            bookingWindowDays: 60,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            startTime: '09:00',
            endTime: '10:00',
            slotDuration: 30,
            allowOnlineBooking: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ durationMinutes: 30 }] });

    const dates = await getAvailableDatesInMonth('tenant-1', 'provider-1', 'type-1', 2024, 0);

    const expectedDate = '2024-01-01';
    expect(dates).toContain(expectedDate);
  });

  it('returns empty dates when booking disabled', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          isEnabled: false,
          minAdvanceHours: 0,
          maxAdvanceDays: 30,
          bookingWindowDays: 60,
        },
      ],
    });

    const dates = await getAvailableDatesInMonth('tenant-1', 'provider-1', 'type-1', 2024, 0);

    expect(dates).toEqual([]);
  });
});
