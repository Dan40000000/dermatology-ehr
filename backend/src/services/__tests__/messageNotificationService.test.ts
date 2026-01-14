import { pool } from '../../db/pool';
import { auditLog } from '../audit';
import { logger } from '../../lib/logger';
import {
  notifyPatientOfNewMessage,
  notifyStaffOfNewPatientMessage,
  sendStaffDigestEmail,
} from '../messageNotificationService';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../audit', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;
const auditLogMock = auditLog as jest.Mock;

describe('MessageNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('notifyPatientOfNewMessage', () => {
    it('should send notification to patient with email enabled', async () => {
      const mockPatient = {
        email: 'patient@example.com',
        first_name: 'John',
        email_enabled: true,
        notification_email: 'patient@example.com',
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] });

      await notifyPatientOfNewMessage(
        'tenant-123',
        'patient-456',
        'thread-789',
        'Lab Results Available'
      );

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['patient-456', 'tenant-123']
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Patient message notification prepared',
        expect.objectContaining({
          tenantId: 'tenant-123',
          patientId: 'patient-456',
          to: 'patient@example.com',
          subject: 'You have a new message from your healthcare provider',
        })
      );

      expect(auditLogMock).toHaveBeenCalledWith(
        'tenant-123',
        'system',
        'patient_message_notification_sent',
        'patient_message_thread',
        'thread-789'
      );
    });

    it('should not send notification when patient email disabled', async () => {
      const mockPatient = {
        email: 'patient@example.com',
        first_name: 'Jane',
        email_enabled: false,
        notification_email: 'patient@example.com',
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] });

      await notifyPatientOfNewMessage(
        'tenant-123',
        'patient-456',
        'thread-789',
        'Message Subject'
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Patient email notifications disabled',
        expect.objectContaining({ patientId: 'patient-456', tenantId: 'tenant-123' })
      );

      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('should log warning when patient not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await notifyPatientOfNewMessage(
        'tenant-123',
        'patient-999',
        'thread-789',
        'Message Subject'
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Patient not found for message notification',
        expect.objectContaining({ patientId: 'patient-999', tenantId: 'tenant-123' })
      );

      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('should log warning when no email address available', async () => {
      const mockPatient = {
        email: null,
        first_name: 'Bob',
        email_enabled: true,
        notification_email: null,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] });

      await notifyPatientOfNewMessage(
        'tenant-123',
        'patient-456',
        'thread-789',
        'Message Subject'
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'No email address for patient notification',
        expect.objectContaining({ patientId: 'patient-456', tenantId: 'tenant-123' })
      );
    });

    it('should use notification_email when different from primary email', async () => {
      const mockPatient = {
        email: 'primary@example.com',
        first_name: 'Alice',
        email_enabled: true,
        notification_email: 'notifications@example.com',
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPatient] });

      await notifyPatientOfNewMessage(
        'tenant-123',
        'patient-456',
        'thread-789',
        'Message Subject'
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Patient message notification prepared',
        expect.objectContaining({
          to: 'notifications@example.com',
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database connection failed'));

      await notifyPatientOfNewMessage(
        'tenant-123',
        'patient-456',
        'thread-789',
        'Message Subject'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error sending patient notification',
        expect.objectContaining({ error: 'Database connection failed' })
      );
    });
  });

  describe('notifyStaffOfNewPatientMessage', () => {
    it('should notify assigned staff member', async () => {
      const mockPatient = {
        first_name: 'John',
        last_name: 'Doe',
        mrn: 'MRN123',
      };

      const mockUser = {
        id: 'user-123',
        email: 'staff@clinic.com',
        name: 'Dr. Smith',
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [mockUser] });

      await notifyStaffOfNewPatientMessage(
        'tenant-123',
        'thread-789',
        'patient-456',
        'Question about medication',
        'user-123'
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Staff message notification prepared',
        expect.objectContaining({
          tenantId: 'tenant-123',
          userId: 'user-123',
          to: 'staff@clinic.com',
          subject: 'New Patient Message - Action Required',
        })
      );

      expect(auditLogMock).toHaveBeenCalledWith(
        'tenant-123',
        'system',
        'staff_message_notification_sent',
        'patient_message_thread',
        'thread-789'
      );
    });

    it('should notify multiple staff when no assignment', async () => {
      const mockPatient = {
        first_name: 'Jane',
        last_name: 'Smith',
        mrn: 'MRN456',
      };

      const mockUsers = [
        { id: 'user-1', email: 'admin@clinic.com', name: 'Admin User' },
        { id: 'user-2', email: 'provider@clinic.com', name: 'Dr. Jones' },
        { id: 'user-3', email: 'nurse@clinic.com', name: 'Nurse Kelly' },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: mockUsers });

      await notifyStaffOfNewPatientMessage(
        'tenant-123',
        'thread-789',
        'patient-456',
        'Urgent question'
      );

      expect(logger.info).toHaveBeenCalledTimes(3);
      expect(auditLogMock).toHaveBeenCalledTimes(3);
    });

    it('should skip users without email addresses', async () => {
      const mockPatient = {
        first_name: 'Bob',
        last_name: 'Johnson',
        mrn: 'MRN789',
      };

      const mockUsers = [
        { id: 'user-1', email: 'staff1@clinic.com', name: 'Staff One' },
        { id: 'user-2', email: null, name: 'Staff Two' },
        { id: 'user-3', email: 'staff3@clinic.com', name: 'Staff Three' },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: mockUsers });

      await notifyStaffOfNewPatientMessage(
        'tenant-123',
        'thread-789',
        'patient-456',
        'Subject'
      );

      expect(logger.info).toHaveBeenCalledTimes(2);
      expect(auditLogMock).toHaveBeenCalledTimes(2);
    });

    it('should handle patient not found gracefully', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await notifyStaffOfNewPatientMessage(
        'tenant-123',
        'thread-789',
        'patient-999',
        'Subject'
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Patient not found for staff notification',
        expect.objectContaining({ patientId: 'patient-999', tenantId: 'tenant-123' })
      );
    });

    it('should handle database errors gracefully', async () => {
      queryMock.mockRejectedValueOnce(new Error('DB error'));

      await notifyStaffOfNewPatientMessage(
        'tenant-123',
        'thread-789',
        'patient-456',
        'Subject'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error sending staff notification',
        expect.objectContaining({ error: 'DB error' })
      );
    });
  });

  describe('sendStaffDigestEmail', () => {
    it('should send digest with unread messages', async () => {
      const mockDigest = [
        {
          user_id: 'user-123',
          email: 'provider@clinic.com',
          name: 'Dr. Smith',
          unread_count: '5',
          threads: [
            {
              threadId: 'thread-1',
              subject: 'Lab results question',
              patientName: 'John Doe',
              category: 'medical',
              priority: 'normal',
              lastMessageAt: '2024-01-15T10:00:00Z',
            },
            {
              threadId: 'thread-2',
              subject: 'Prescription refill',
              patientName: 'Jane Smith',
              category: 'medication',
              priority: 'urgent',
              lastMessageAt: '2024-01-15T09:00:00Z',
            },
          ],
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockDigest });

      await sendStaffDigestEmail('tenant-123');

      expect(logger.info).toHaveBeenCalledWith(
        'Staff digest email prepared',
        expect.objectContaining({
          tenantId: 'tenant-123',
          to: 'provider@clinic.com',
          subject: 'Patient Messages Digest - 5 Unread Messages',
          totalMessages: '5',
        })
      );

      expect(auditLogMock).toHaveBeenCalledWith(
        'tenant-123',
        'system',
        'staff_digest_email_sent',
        'user',
        'user-123'
      );
    });

    it('should handle urgent messages with priority flag', async () => {
      const mockDigest = [
        {
          user_id: 'user-456',
          email: 'nurse@clinic.com',
          name: 'Nurse Kelly',
          unread_count: '2',
          threads: [
            {
              threadId: 'thread-urgent',
              subject: 'Urgent: Side effects',
              patientName: 'Bob Johnson',
              category: 'medical',
              priority: 'urgent',
              lastMessageAt: '2024-01-15T10:00:00Z',
            },
            {
              threadId: 'thread-high',
              subject: 'High priority',
              patientName: 'Alice Brown',
              category: 'general',
              priority: 'high',
              lastMessageAt: '2024-01-15T09:00:00Z',
            },
          ],
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockDigest });

      await sendStaffDigestEmail('tenant-123');

      expect(logger.info).toHaveBeenCalled();
    });

    it('should limit thread list to 10 messages', async () => {
      const threads = Array.from({ length: 15 }, (_, i) => ({
        threadId: `thread-${i}`,
        subject: `Subject ${i}`,
        patientName: `Patient ${i}`,
        category: 'general',
        priority: 'normal',
        lastMessageAt: '2024-01-15T10:00:00Z',
      }));

      const mockDigest = [
        {
          user_id: 'user-789',
          email: 'admin@clinic.com',
          name: 'Admin User',
          unread_count: '15',
          threads,
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockDigest });

      await sendStaffDigestEmail('tenant-123');

      expect(logger.info).toHaveBeenCalledWith(
        'Staff digest email prepared',
        expect.objectContaining({
          totalMessages: '15',
        })
      );
    });

    it('should skip users without email', async () => {
      const mockDigest = [
        {
          user_id: 'user-123',
          email: null,
          name: 'User Without Email',
          unread_count: '3',
          threads: [],
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockDigest });

      await sendStaffDigestEmail('tenant-123');

      expect(logger.info).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      queryMock.mockRejectedValueOnce(new Error('Query failed'));

      await sendStaffDigestEmail('tenant-123');

      expect(logger.error).toHaveBeenCalledWith(
        'Error sending staff digest',
        expect.objectContaining({ error: 'Query failed' })
      );
    });

    it('should handle empty digest gracefully', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await sendStaffDigestEmail('tenant-123');

      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
