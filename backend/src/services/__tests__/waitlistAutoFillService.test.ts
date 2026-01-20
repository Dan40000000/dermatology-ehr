import { pool } from '../../db/pool';
import { waitlistAutoFillService, WaitlistAutoFillService } from '../waitlistAutoFillService';
import * as audit from '../audit';
import { logger } from '../../lib/logger';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../audit', () => ({
  createAuditLog: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('WaitlistAutoFillService', () => {
  const tenantId = 'tenant-123';
  const patientId = 'patient-123';
  const providerId = 'provider-123';
  const locationId = 'location-123';
  const appointmentTypeId = 'type-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findMatchingWaitlistEntries', () => {
    const slot = {
      provider_id: providerId,
      location_id: locationId,
      appointment_type_id: appointmentTypeId,
      scheduled_start: '2024-01-15T09:00:00Z', // Monday morning
      scheduled_end: '2024-01-15T09:30:00Z',
    };

    it('should find matching waitlist entries with high scores', async () => {
      const mockWaitlistEntries = [
        {
          id: 'waitlist-1',
          tenant_id: tenantId,
          patient_id: patientId,
          provider_id: providerId, // Match
          appointment_type_id: appointmentTypeId, // Match
          location_id: locationId, // Match
          preferred_start_date: '2024-01-01',
          preferred_end_date: '2024-01-31',
          preferred_time_of_day: 'morning', // Match
          preferred_days_of_week: ['monday'], // Match
          priority: 'high' as const,
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockWaitlistEntries });

      const matches = await waitlistAutoFillService.findMatchingWaitlistEntries(tenantId, slot);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].score).toBeGreaterThan(0);
      expect(matches[0].matchDetails.providerMatch).toBe(true);
      expect(matches[0].matchDetails.appointmentTypeMatch).toBe(true);
      expect(matches[0].matchDetails.locationMatch).toBe(true);
      expect(matches[0].matchDetails.timeOfDayMatch).toBe(true);
      expect(matches[0].matchDetails.dayOfWeekMatch).toBe(true);
    });

    it('should filter out entries that require specific provider but do not match', async () => {
      const mockWaitlistEntries = [
        {
          id: 'waitlist-1',
          tenant_id: tenantId,
          patient_id: patientId,
          provider_id: 'different-provider', // Does not match
          appointment_type_id: appointmentTypeId,
          location_id: locationId,
          preferred_start_date: null,
          preferred_end_date: null,
          preferred_time_of_day: 'any',
          preferred_days_of_week: null,
          priority: 'normal' as const,
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockWaitlistEntries });

      const matches = await waitlistAutoFillService.findMatchingWaitlistEntries(tenantId, slot);

      expect(matches).toEqual([]); // Should be filtered out because provider doesn't match
    });

    it('should filter out entries that require specific appointment type but do not match', async () => {
      const mockWaitlistEntries = [
        {
          id: 'waitlist-1',
          tenant_id: tenantId,
          patient_id: patientId,
          provider_id: null, // No preference
          appointment_type_id: 'different-type', // Does not match
          location_id: locationId,
          preferred_start_date: null,
          preferred_end_date: null,
          preferred_time_of_day: 'any',
          preferred_days_of_week: null,
          priority: 'normal' as const,
          status: 'active',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValue({ rows: mockWaitlistEntries });

      const matches = await waitlistAutoFillService.findMatchingWaitlistEntries(tenantId, slot);

      expect(matches).toEqual([]); // Should be filtered out because appointment type doesn't match
    });

    it('should apply priority multipliers correctly', async () => {
      const mockUrgent = {
        id: 'waitlist-urgent',
        tenant_id: tenantId,
        patient_id: patientId,
        provider_id: null,
        appointment_type_id: null,
        location_id: null,
        preferred_start_date: null,
        preferred_end_date: null,
        preferred_time_of_day: 'any',
        preferred_days_of_week: null,
        priority: 'urgent' as const,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
      };

      const mockNormal = {
        ...mockUrgent,
        id: 'waitlist-normal',
        priority: 'normal' as const,
      };

      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockUrgent, mockNormal] });

      const matches = await waitlistAutoFillService.findMatchingWaitlistEntries(tenantId, slot);

      expect(matches.length).toBe(2);
      // Urgent should score higher due to multiplier
      expect(matches[0].waitlistEntry.id).toBe('waitlist-urgent');
      expect(matches[0].score).toBeGreaterThan(matches[1].score);
    });

    it('should handle time of day matching', async () => {
      const morningSlot = {
        ...slot,
        scheduled_start: '2024-01-15T09:00:00Z', // 9 AM
      };

      const afternoonSlot = {
        ...slot,
        scheduled_start: '2024-01-15T14:00:00Z', // 2 PM
      };

      const eveningSlot = {
        ...slot,
        scheduled_start: '2024-01-15T18:00:00Z', // 6 PM
      };

      const mockWaitlist = {
        id: 'waitlist-1',
        tenant_id: tenantId,
        patient_id: patientId,
        provider_id: null,
        appointment_type_id: null,
        location_id: null,
        preferred_start_date: null,
        preferred_end_date: null,
        preferred_time_of_day: 'morning',
        preferred_days_of_week: null,
        priority: 'normal' as const,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
      };

      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockWaitlist] });

      const morningMatches = await waitlistAutoFillService.findMatchingWaitlistEntries(tenantId, morningSlot);
      const afternoonMatches = await waitlistAutoFillService.findMatchingWaitlistEntries(tenantId, afternoonSlot);

      expect(morningMatches[0].matchDetails.timeOfDayMatch).toBe(true);
      expect(afternoonMatches[0].matchDetails.timeOfDayMatch).toBe(false);
    });

    it('should exclude entries with active holds', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] }); // Query already filters these out

      await waitlistAutoFillService.findMatchingWaitlistEntries(tenantId, slot);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('NOT EXISTS'),
        expect.arrayContaining([tenantId, '2024-01-15'])
      );
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      (pool.query as jest.Mock).mockRejectedValue(error);

      await expect(
        waitlistAutoFillService.findMatchingWaitlistEntries(tenantId, slot)
      ).rejects.toThrow('Database error');

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('createWaitlistHold', () => {
    const waitlistId = 'waitlist-123';
    const slot = {
      provider_id: providerId,
      location_id: locationId,
      appointment_type_id: appointmentTypeId,
      scheduled_start: '2024-01-15T09:00:00Z',
      scheduled_end: '2024-01-15T09:30:00Z',
    };

    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      (pool.connect as jest.Mock).mockResolvedValue(mockClient);
    });

    it('should create a waitlist hold successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: waitlistId, status: 'active', patient_id: patientId }] }) // Waitlist check
        .mockResolvedValueOnce({ rows: [] }) // No existing holds
        .mockResolvedValueOnce(undefined) // INSERT hold
        .mockResolvedValueOnce(undefined) // UPDATE waitlist status
        .mockResolvedValueOnce(undefined); // COMMIT

      const holdId = await waitlistAutoFillService.createWaitlistHold(tenantId, waitlistId, slot);

      expect(holdId).toBeDefined();
      expect(typeof holdId).toBe('string');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(audit.createAuditLog).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should fail if waitlist entry is not active', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No active waitlist entry
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(
        waitlistAutoFillService.createWaitlistHold(tenantId, waitlistId, slot)
      ).rejects.toThrow('Waitlist entry not found or no longer active');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should fail if there is already an active hold', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: waitlistId, status: 'active', patient_id: patientId }] }) // Waitlist check
        .mockResolvedValueOnce({ rows: [{ id: 'existing-hold' }] }) // Existing hold
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(
        waitlistAutoFillService.createWaitlistHold(tenantId, waitlistId, slot)
      ).rejects.toThrow('Waitlist entry already has an active hold');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should include notification method if provided', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: waitlistId, status: 'active', patient_id: patientId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined); // COMMIT

      await waitlistAutoFillService.createWaitlistHold(tenantId, waitlistId, slot, 'sms');

      const insertCall = mockClient.query.mock.calls.find((call: any) =>
        call[0]?.includes('INSERT INTO waitlist_holds')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall[1]).toContain('sms');
    });
  });

  describe('processAppointmentCancellation', () => {
    const appointmentId = 'appt-123';

    it('should process cancellation and create holds for matches', async () => {
      const mockAppointment = {
        id: appointmentId,
        provider_id: providerId,
        location_id: locationId,
        appointment_type_id: appointmentTypeId,
        scheduled_start: '2024-01-15T09:00:00Z',
        scheduled_end: '2024-01-15T09:30:00Z',
        provider_name: 'Dr. Smith',
        location_name: 'Main Clinic',
      };

      const mockWaitlistEntry = {
        id: 'waitlist-1',
        tenant_id: tenantId,
        patient_id: patientId,
        provider_id: providerId,
        appointment_type_id: appointmentTypeId,
        location_id: locationId,
        preferred_start_date: null,
        preferred_end_date: null,
        preferred_time_of_day: 'morning',
        preferred_days_of_week: null,
        priority: 'high' as const,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 'waitlist-1', status: 'active', patient_id: patientId }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockAppointment] }) // Get appointment
        .mockResolvedValueOnce({ rows: [mockWaitlistEntry] }) // Find matches
        .mockResolvedValueOnce({ rows: [{ patient_id: patientId }] }); // Get patient_id

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await waitlistAutoFillService.processAppointmentCancellation(tenantId, appointmentId);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].patientId).toBe(patientId);
      expect(result[0].score).toBeGreaterThan(0);
      expect(audit.createAuditLog).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it('should return empty array if no matches found', async () => {
      const mockAppointment = {
        id: appointmentId,
        provider_id: providerId,
        location_id: locationId,
        appointment_type_id: appointmentTypeId,
        scheduled_start: '2024-01-15T09:00:00Z',
        scheduled_end: '2024-01-15T09:30:00Z',
      };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockAppointment] })
        .mockResolvedValueOnce({ rows: [] }); // No matches

      const result = await waitlistAutoFillService.processAppointmentCancellation(tenantId, appointmentId);

      expect(result).toEqual([]);
    });

    it('should throw error if appointment not found', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(
        waitlistAutoFillService.processAppointmentCancellation(tenantId, appointmentId)
      ).rejects.toThrow('Appointment not found');
    });

    it('should limit matches to maxMatches parameter', async () => {
      const mockAppointment = {
        id: appointmentId,
        provider_id: providerId,
        location_id: locationId,
        appointment_type_id: appointmentTypeId,
        scheduled_start: '2024-01-15T09:00:00Z',
        scheduled_end: '2024-01-15T09:30:00Z',
      };

      // Create 10 mock waitlist entries
      const mockWaitlistEntries = Array.from({ length: 10 }, (_, i) => ({
        id: `waitlist-${i}`,
        tenant_id: tenantId,
        patient_id: `patient-${i}`,
        provider_id: null,
        appointment_type_id: null,
        location_id: null,
        preferred_start_date: null,
        preferred_end_date: null,
        preferred_time_of_day: 'any',
        preferred_days_of_week: null,
        priority: 'normal' as const,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
      }));

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockAppointment] })
        .mockResolvedValueOnce({ rows: mockWaitlistEntries });

      // Mock createWaitlistHold to always fail so we don't create actual holds
      const mockClient = {
        query: jest.fn().mockRejectedValue(new Error('Test error')),
        release: jest.fn(),
      };
      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const result = await waitlistAutoFillService.processAppointmentCancellation(tenantId, appointmentId, 3);

      // Should attempt to process only 3 matches
      expect(pool.connect).toHaveBeenCalledTimes(3);
    });
  });

  describe('expireOldHolds', () => {
    it('should expire old holds and return waitlist to active', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 'hold-1', waitlist_id: 'waitlist-1', tenant_id: tenantId }] }) // Find expired
          .mockResolvedValueOnce(undefined) // Update holds to expired
          .mockResolvedValueOnce({ rows: [] }) // No other active holds
          .mockResolvedValueOnce(undefined) // Update waitlist to active
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const count = await waitlistAutoFillService.expireOldHolds(tenantId);

      expect(count).toBe(1);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(audit.createAuditLog).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it('should return 0 if no holds to expire', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // No expired holds
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const count = await waitlistAutoFillService.expireOldHolds(tenantId);

      expect(count).toBe(0);
    });

    it('should handle errors and rollback transaction', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockRejectedValueOnce(new Error('Database error'))
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      await expect(waitlistAutoFillService.expireOldHolds(tenantId)).rejects.toThrow('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return statistics for waitlist auto-fill', async () => {
      const mockStats = {
        active_holds: '5',
        accepted_holds: '10',
        expired_holds: '3',
        cancelled_holds: '2',
        total_holds: '20',
        avg_accept_time_hours: '2.5',
      };

      (pool.query as jest.Mock).mockResolvedValue({ rows: [mockStats] });

      const stats = await waitlistAutoFillService.getStats(tenantId);

      expect(stats).toEqual(mockStats);
    });

    it('should include date filters when provided', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      (pool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await waitlistAutoFillService.getStats(tenantId, startDate, endDate);

      const call = (pool.query as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('wh.created_at >=');
      expect(call[0]).toContain('wh.created_at <=');
      expect(call[1]).toEqual([tenantId, startDate.toISOString(), endDate.toISOString()]);
    });

    it('should handle errors', async () => {
      const error = new Error('Database error');
      (pool.query as jest.Mock).mockRejectedValue(error);

      await expect(waitlistAutoFillService.getStats(tenantId)).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
