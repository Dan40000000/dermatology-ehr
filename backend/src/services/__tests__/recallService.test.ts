import { pool } from '../../db/pool';
import * as recallService from '../recallService';
import crypto from 'crypto';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'test-uuid-123'),
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;

describe('RecallService', () => {
  const tenantId = 'tenant-123';
  const campaignId = 'campaign-123';
  const patientId = 'patient-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateRecalls', () => {
    it('should generate recalls for eligible patients', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      const mockCampaign = {
        id: campaignId,
        tenant_id: tenantId,
        name: 'Annual Skin Check',
        interval_months: 12,
        intervalMonths: 12,
      };

      const mockPatients = [
        { patient_id: 'patient-1', last_encounter_date: '2023-01-01' },
        { patient_id: 'patient-2', last_encounter_date: '2023-02-01' },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCampaign] })
        .mockResolvedValueOnce({ rows: mockPatients })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      connectMock.mockResolvedValueOnce(mockClient);

      const result = await recallService.generateRecalls(tenantId, campaignId);

      expect(result.created).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should skip patients with existing recalls', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      const mockCampaign = {
        id: campaignId,
        tenant_id: tenantId,
        name: 'Campaign',
        intervalMonths: 12,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCampaign] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      connectMock.mockResolvedValueOnce(mockClient);

      const result = await recallService.generateRecalls(tenantId, campaignId);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should throw error when campaign not found', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      connectMock.mockResolvedValueOnce(mockClient);

      await expect(recallService.generateRecalls(tenantId, 'nonexistent')).rejects.toThrow(
        'Campaign not found or inactive'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle errors when creating recalls', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      const mockCampaign = {
        id: campaignId,
        tenant_id: tenantId,
        intervalMonths: 12,
      };

      const mockPatients = [
        { patient_id: 'patient-1', last_encounter_date: '2023-01-01' },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCampaign] })
        .mockResolvedValueOnce({ rows: mockPatients })
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ rows: [] });

      connectMock.mockResolvedValueOnce(mockClient);

      const result = await recallService.generateRecalls(tenantId, campaignId);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to create recall');
    });

    it('should rollback on transaction error', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Transaction error'));

      connectMock.mockResolvedValueOnce(mockClient);

      await expect(recallService.generateRecalls(tenantId, campaignId)).rejects.toThrow(
        'Transaction error'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should calculate due date correctly', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      const mockCampaign = {
        id: campaignId,
        tenant_id: tenantId,
        intervalMonths: 12,
      };

      const mockPatients = [
        { patient_id: 'patient-1', last_encounter_date: '2023-01-01' },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCampaign] })
        .mockResolvedValueOnce({ rows: mockPatients })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      connectMock.mockResolvedValueOnce(mockClient);

      await recallService.generateRecalls(tenantId, campaignId);

      const insertCall = mockClient.query.mock.calls.find((call: any) =>
        call[0].includes('INSERT INTO patient_recalls')
      );

      expect(insertCall).toBeDefined();
      const [, params] = insertCall;
      const dueDate = new Date(params[4]);
      const today = new Date();
      const daysDiff = Math.floor(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBeGreaterThanOrEqual(6);
      expect(daysDiff).toBeLessThanOrEqual(8);
    });
  });

  describe('generateAllRecalls', () => {
    it('should generate recalls for all active campaigns', async () => {
      const mockCampaigns = [
        { id: 'campaign-1' },
        { id: 'campaign-2' },
        { id: 'campaign-3' },
      ];

      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      queryMock.mockResolvedValueOnce({ rows: mockCampaigns });

      mockClient.query
        .mockResolvedValue({ rows: [] });

      connectMock.mockResolvedValue(mockClient);

      const result = await recallService.generateAllRecalls(tenantId);

      expect(result.campaigns).toBe(3);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('FROM recall_campaigns'),
        [tenantId]
      );
    });

    it('should aggregate results from all campaigns', async () => {
      const mockCampaigns = [{ id: 'campaign-1' }, { id: 'campaign-2' }];

      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      queryMock.mockResolvedValueOnce({ rows: mockCampaigns });

      const mockCampaign1 = { id: 'campaign-1', intervalMonths: 12 };
      const mockCampaign2 = { id: 'campaign-2', intervalMonths: 6 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCampaign1] })
        .mockResolvedValueOnce({ rows: [{ patient_id: 'p1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCampaign2] })
        .mockResolvedValueOnce({ rows: [{ patient_id: 'p2' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      connectMock.mockResolvedValue(mockClient);

      const result = await recallService.generateAllRecalls(tenantId);

      expect(result.totalCreated).toBe(2);
    });

    it('should handle campaign errors gracefully', async () => {
      const mockCampaigns = [{ id: 'campaign-1' }, { id: 'campaign-2' }];

      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      queryMock.mockResolvedValueOnce({ rows: mockCampaigns });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Campaign error'));

      connectMock.mockResolvedValue(mockClient);

      const result = await recallService.generateAllRecalls(tenantId);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Campaign campaign-1');
    });

    it('should return zero campaigns when none active', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await recallService.generateAllRecalls(tenantId);

      expect(result.campaigns).toBe(0);
      expect(result.totalCreated).toBe(0);
      expect(result.totalSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('logReminder', () => {
    it('should log a reminder communication', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const logId = await recallService.logReminder(
        tenantId,
        patientId,
        'recall-123',
        'email',
        'Reminder email content',
        'user-123'
      );

      expect(logId).toBe('test-uuid-123');
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reminder_log'),
        expect.arrayContaining([
          'test-uuid-123',
          tenantId,
          patientId,
          'recall-123',
          'email',
          'sent',
          'Reminder email content',
          'user-123',
        ])
      );
    });

    it('should handle null recall ID', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await recallService.logReminder(
        tenantId,
        patientId,
        null,
        'sms',
        'SMS content',
        'user-123'
      );

      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null])
      );
    });

    it('should support different reminder types', async () => {
      queryMock.mockResolvedValue({ rows: [] });

      const types: Array<'email' | 'sms' | 'phone' | 'mail' | 'portal'> = [
        'email',
        'sms',
        'phone',
        'mail',
        'portal',
      ];

      for (const type of types) {
        await recallService.logReminder(
          tenantId,
          patientId,
          'recall-123',
          type,
          'Content',
          'user-123'
        );
      }

      expect(queryMock).toHaveBeenCalledTimes(5);
    });

    it('should support different delivery statuses', async () => {
      queryMock.mockResolvedValue({ rows: [] });

      const statuses: Array<'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'opted_out'> = [
        'pending',
        'sent',
        'delivered',
        'failed',
        'bounced',
        'opted_out',
      ];

      for (const status of statuses) {
        await recallService.logReminder(
          tenantId,
          patientId,
          'recall-123',
          'email',
          'Content',
          'user-123',
          status
        );
      }

      expect(queryMock).toHaveBeenCalledTimes(6);
    });

    it('should default to sent status when not provided', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await recallService.logReminder(
        tenantId,
        patientId,
        'recall-123',
        'email',
        'Content',
        'user-123'
      );

      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['sent'])
      );
    });
  });

  describe('getPatientPreferences', () => {
    it('should get patient communication preferences', async () => {
      const mockPrefs = {
        id: 'pref-123',
        tenant_id: tenantId,
        patient_id: patientId,
        allow_email: true,
        allow_sms: true,
        allow_phone: false,
        allow_mail: true,
        preferred_method: 'email',
        opted_out: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPrefs] });

      const result = await recallService.getPatientPreferences(tenantId, patientId);

      expect(result).not.toBeNull();
      expect(result?.allowEmail).toBe(true);
      expect(result?.allowSms).toBe(true);
      expect(result?.allowPhone).toBe(false);
      expect(result?.preferredMethod).toBe('email');
      expect(result?.optedOut).toBe(false);
    });

    it('should return null when no preferences found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await recallService.getPatientPreferences(tenantId, patientId);

      expect(result).toBeNull();
    });
  });

  describe('updatePatientPreferences', () => {
    it('should create new preferences', async () => {
      const newPrefs = {
        id: 'pref-123',
        tenant_id: tenantId,
        patient_id: patientId,
        allow_email: true,
        allow_sms: false,
        allow_phone: true,
        allow_mail: false,
        preferred_method: 'email',
        opted_out: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [newPrefs] });

      const result = await recallService.updatePatientPreferences(tenantId, patientId, {
        allowEmail: true,
        allowSms: false,
        allowPhone: true,
        allowMail: false,
        preferredMethod: 'email',
        optedOut: false,
      });

      expect(result).toBeDefined();
      expect(result.allowEmail).toBe(true);
      expect(result.preferredMethod).toBe('email');
    });

    it('should update existing preferences on conflict', async () => {
      const updatedPrefs = {
        id: 'pref-123',
        tenant_id: tenantId,
        patient_id: patientId,
        allow_email: false,
        allow_sms: true,
        allow_phone: false,
        allow_mail: false,
        preferred_method: 'sms',
        opted_out: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [updatedPrefs] });

      const result = await recallService.updatePatientPreferences(tenantId, patientId, {
        allowEmail: false,
        allowSms: true,
        preferredMethod: 'sms',
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      );
      expect(result.preferredMethod).toBe('sms');
    });

    it('should handle partial updates', async () => {
      const mockPrefs = {
        id: 'pref-123',
        tenant_id: tenantId,
        patient_id: patientId,
        allow_email: true,
        allow_sms: true,
        allow_phone: true,
        allow_mail: true,
        preferred_method: 'email',
        opted_out: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPrefs] });

      await recallService.updatePatientPreferences(tenantId, patientId, {
        preferredMethod: 'sms',
      });

      expect(queryMock).toHaveBeenCalled();
    });

    it('should handle opt-out', async () => {
      const mockPrefs = {
        id: 'pref-123',
        tenant_id: tenantId,
        patient_id: patientId,
        allow_email: true,
        allow_sms: true,
        allow_phone: true,
        allow_mail: true,
        preferred_method: 'email',
        opted_out: true,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPrefs] });

      const result = await recallService.updatePatientPreferences(tenantId, patientId, {
        optedOut: true,
      });

      expect(result.optedOut).toBe(true);
    });
  });

  describe('canContactPatient', () => {
    it('should allow contact when no preferences set', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await recallService.canContactPatient(tenantId, patientId, 'email');

      expect(result.canContact).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow contact when method is enabled', async () => {
      const mockPrefs = {
        allow_email: true,
        allow_sms: true,
        allow_phone: false,
        allow_mail: true,
        opted_out: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPrefs] });

      const result = await recallService.canContactPatient(tenantId, patientId, 'email');

      expect(result.canContact).toBe(true);
    });

    it('should block contact when method is disabled', async () => {
      const mockPrefs = {
        allow_email: true,
        allow_sms: false,
        allow_phone: false,
        allow_mail: true,
        opted_out: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPrefs] });

      const result = await recallService.canContactPatient(tenantId, patientId, 'sms');

      expect(result.canContact).toBe(false);
      expect(result.reason).toContain('opted out of sms');
    });

    it('should block all contact when patient opted out', async () => {
      const mockPrefs = {
        allow_email: true,
        allow_sms: true,
        allow_phone: true,
        allow_mail: true,
        opted_out: true,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPrefs] });

      const result = await recallService.canContactPatient(tenantId, patientId, 'email');

      expect(result.canContact).toBe(false);
      expect(result.reason).toContain('opted out of all communications');
    });

    it('should check email method', async () => {
      const mockPrefs = {
        allow_email: true,
        allow_sms: false,
        allow_phone: false,
        allow_mail: false,
        opted_out: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPrefs] });

      const result = await recallService.canContactPatient(tenantId, patientId, 'email');

      expect(result.canContact).toBe(true);
    });

    it('should check phone method', async () => {
      const mockPrefs = {
        allow_email: false,
        allow_sms: false,
        allow_phone: true,
        allow_mail: false,
        opted_out: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPrefs] });

      const result = await recallService.canContactPatient(tenantId, patientId, 'phone');

      expect(result.canContact).toBe(true);
    });

    it('should check mail method', async () => {
      const mockPrefs = {
        allow_email: false,
        allow_sms: false,
        allow_phone: false,
        allow_mail: true,
        opted_out: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [mockPrefs] });

      const result = await recallService.canContactPatient(tenantId, patientId, 'mail');

      expect(result.canContact).toBe(true);
    });
  });
});
