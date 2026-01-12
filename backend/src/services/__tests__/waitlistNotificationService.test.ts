import { pool } from '../../db/pool';
import { logger } from '../../lib/logger';
import { createAuditLog } from '../audit';
import { TwilioService } from '../twilioService';
import {
  sendWaitlistNotification,
  processWaitlistSMSReply,
  getWaitlistNotificationHistory,
} from '../waitlistNotificationService';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../audit', () => ({
  createAuditLog: jest.fn(),
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'notification-uuid-123'),
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const createAuditLogMock = createAuditLog as jest.Mock;

describe('WaitlistNotificationService', () => {
  let mockClient: any;
  let mockTwilioService: jest.Mocked<TwilioService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    connectMock.mockResolvedValue(mockClient);

    mockTwilioService = {
      sendSMS: jest.fn(),
    } as any;
  });

  describe('sendWaitlistNotification', () => {
    const mockParams = {
      waitlistId: 'waitlist-123',
      patientId: 'patient-456',
      patientName: 'John Doe',
      patientPhone: '+15551234567',
      patientEmail: 'patient@example.com',
      providerName: 'Smith',
      appointmentDate: '2024-02-15',
      appointmentTime: '14:30',
      slotId: 'slot-789',
      tenantId: 'tenant-123',
    };

    it('should send SMS notification successfully', async () => {
      // Mock rate limit check - allowed
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Hourly check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Daily check
        .mockResolvedValueOnce({ rows: [] }) // Last notification check
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Insert notification
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Update with Twilio SID
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Update waitlist

      mockTwilioService.sendSMS.mockResolvedValueOnce({
        sid: 'SM123456',
        status: 'queued',
      } as any);

      const result = await sendWaitlistNotification(mockParams, mockTwilioService);

      expect(result.success).toBe(true);
      expect(result.notificationId).toBe('notification-uuid-123');
      expect(mockTwilioService.sendSMS).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+15551234567',
          body: expect.stringContaining('John'),
        })
      );
      expect(createAuditLogMock).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should reject notification when hourly limit exceeded', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Hourly limit exceeded
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Daily check (won't reach)

      const result = await sendWaitlistNotification(mockParams, mockTwilioService);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Hourly limit exceeded');
      expect(mockTwilioService.sendSMS).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Rate limit exceeded for waitlist notification',
        expect.objectContaining({
          patientId: 'patient-456',
          waitlistId: 'waitlist-123',
        })
      );
    });

    it('should reject notification when daily limit exceeded', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Hourly check
        .mockResolvedValueOnce({ rows: [{ count: '4' }] }); // Daily limit exceeded

      const result = await sendWaitlistNotification(mockParams, mockTwilioService);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Daily limit exceeded');
      expect(mockTwilioService.sendSMS).not.toHaveBeenCalled();
    });

    it('should reject notification during cooldown period', async () => {
      const recentTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Hourly check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Daily check
        .mockResolvedValueOnce({ rows: [{ created_at: recentTime }] }); // Last notification

      const result = await sendWaitlistNotification(mockParams, mockTwilioService);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cooldown period active');
      expect(mockTwilioService.sendSMS).not.toHaveBeenCalled();
    });

    it('should handle Twilio SMS failure', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Update notification to failed

      mockTwilioService.sendSMS.mockRejectedValueOnce(new Error('Twilio error'));

      const result = await sendWaitlistNotification(mockParams, mockTwilioService);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Twilio error');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send waitlist SMS',
        expect.objectContaining({ error: 'Twilio error' })
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE waitlist_notifications'),
        expect.arrayContaining(['Twilio error', 'notification-uuid-123'])
      );
    });

    it('should log email notification when email provided', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      mockTwilioService.sendSMS.mockResolvedValueOnce({ sid: 'SM123' } as any);

      const result = await sendWaitlistNotification(mockParams, mockTwilioService);

      expect(result.success).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        'Waitlist email notification',
        expect.objectContaining({
          notificationId: 'notification-uuid-123',
          to: 'patient@example.com',
        })
      );
    });

    it('should rollback transaction on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        sendWaitlistNotification(mockParams, mockTwilioService)
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should use custom rate limit config', async () => {
      const customConfig = {
        maxNotificationsPerDay: 5,
        maxNotificationsPerHour: 2,
        cooldownMinutes: 30,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // Hourly
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Daily
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      mockTwilioService.sendSMS.mockResolvedValueOnce({ sid: 'SM123' } as any);

      const result = await sendWaitlistNotification(
        mockParams,
        mockTwilioService,
        customConfig
      );

      expect(result.success).toBe(true);
    });
  });

  describe('processWaitlistSMSReply', () => {
    it('should process YES reply and accept notification', async () => {
      const mockPatient = {
        id: 'patient-123',
        first_name: 'Jane',
        last_name: 'Doe',
      };

      const mockNotification = {
        id: 'notification-456',
        waitlist_id: 'waitlist-789',
        appointment_date: '2024-02-15',
        appointment_time: '14:30',
        provider_name: 'Smith',
        slot_id: 'slot-123',
        patient_id: 'patient-123',
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockPatient] }) // Find patient
        .mockResolvedValueOnce({ rows: [mockNotification] }) // Find notification
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Update notification
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Update waitlist

      const result = await processWaitlistSMSReply(
        'tenant-123',
        '+15551234567',
        'YES'
      );

      expect(result.matched).toBe(true);
      expect(result.action).toBe('accepted');
      expect(result.waitlistId).toBe('waitlist-789');
      expect(result.notificationId).toBe('notification-456');
      expect(createAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'waitlist_notification_accepted',
          resourceType: 'waitlist',
          resourceId: 'waitlist-789',
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Waitlist notification accepted by patient',
        expect.any(Object)
      );
    });

    it('should handle various YES variations', async () => {
      const mockPatient = {
        id: 'patient-123',
        first_name: 'John',
        last_name: 'Smith',
      };

      const mockNotification = {
        id: 'notification-456',
        waitlist_id: 'waitlist-789',
        appointment_date: '2024-02-15',
        appointment_time: '14:30',
        provider_name: 'Jones',
        slot_id: 'slot-123',
        patient_id: 'patient-123',
      };

      for (const reply of ['YES', 'yes', 'Y', 'y', 'ACCEPT', 'accept']) {
        jest.clearAllMocks();
        mockClient.query
          .mockResolvedValueOnce({ rows: [mockPatient] })
          .mockResolvedValueOnce({ rows: [mockNotification] })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await processWaitlistSMSReply('tenant-123', '+15551234567', reply);

        expect(result.matched).toBe(true);
        expect(result.action).toBe('accepted');
      }
    });

    it('should process NO reply and decline notification', async () => {
      const mockPatient = {
        id: 'patient-456',
        first_name: 'Bob',
        last_name: 'Johnson',
      };

      const mockNotification = {
        id: 'notification-789',
        waitlist_id: 'waitlist-123',
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [mockNotification] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await processWaitlistSMSReply('tenant-123', '+15551234567', 'NO');

      expect(result.matched).toBe(true);
      expect(result.action).toBe('declined');
      expect(result.waitlistId).toBe('waitlist-123');
      expect(createAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'waitlist_notification_declined',
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Waitlist notification declined by patient',
        expect.any(Object)
      );
    });

    it('should return not matched for unknown patient', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await processWaitlistSMSReply(
        'tenant-123',
        '+15559999999',
        'YES'
      );

      expect(result.matched).toBe(false);
    });

    it('should return not matched for non-YES/NO reply', async () => {
      const mockPatient = {
        id: 'patient-123',
        first_name: 'Alice',
        last_name: 'Brown',
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockPatient] });

      const result = await processWaitlistSMSReply(
        'tenant-123',
        '+15551234567',
        'MAYBE'
      );

      expect(result.matched).toBe(false);
    });

    it('should return not matched if no recent notification found', async () => {
      const mockPatient = {
        id: 'patient-123',
        first_name: 'Charlie',
        last_name: 'Davis',
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] }); // No notification found

      const result = await processWaitlistSMSReply('tenant-123', '+15551234567', 'YES');

      expect(result.matched).toBe(false);
    });

    it('should rollback on database error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        processWaitlistSMSReply('tenant-123', '+15551234567', 'YES')
      ).rejects.toThrow('DB error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getWaitlistNotificationHistory', () => {
    it('should fetch notification history for waitlist entry', async () => {
      const mockHistory = [
        {
          id: 'notification-1',
          notification_method: 'sms',
          appointment_date: '2024-02-15',
          appointment_time: '14:30',
          provider_name: 'Smith',
          status: 'sent',
          patient_response: null,
          created_at: '2024-01-10T10:00:00Z',
          sent_at: '2024-01-10T10:00:05Z',
          responded_at: null,
          error_message: null,
        },
        {
          id: 'notification-2',
          notification_method: 'sms',
          appointment_date: '2024-02-20',
          appointment_time: '10:00',
          provider_name: 'Jones',
          status: 'accepted',
          patient_response: 'accepted',
          created_at: '2024-01-12T14:00:00Z',
          sent_at: '2024-01-12T14:00:05Z',
          responded_at: '2024-01-12T14:05:00Z',
          error_message: null,
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockHistory });

      const result = await getWaitlistNotificationHistory('tenant-123', 'waitlist-456');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('notification-1');
      expect(result[1].patient_response).toBe('accepted');
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['tenant-123', 'waitlist-456']
      );
    });

    it('should return empty array when no history found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await getWaitlistNotificationHistory('tenant-123', 'waitlist-789');

      expect(result).toEqual([]);
    });
  });
});
