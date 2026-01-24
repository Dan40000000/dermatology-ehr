import request from 'supertest';
import express from 'express';
import { recallsRouter } from '../recalls';
import { pool } from '../../db/pool';
import {
  generateRecalls,
  generateAllRecalls,
  logReminder,
  getPatientPreferences,
  updatePatientPreferences,
  canContactPatient,
} from '../../services/recallService';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-123', userId: 'user-123', tenantId: 'tenant-123', role: 'admin' };
    return next();
  },
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../services/recallService', () => ({
  generateRecalls: jest.fn(),
  generateAllRecalls: jest.fn(),
  logReminder: jest.fn(),
  getPatientPreferences: jest.fn(),
  updatePatientPreferences: jest.fn(),
  canContactPatient: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'recall-uuid-123'),
}));

const queryMock = pool.query as jest.Mock;
const generateRecallsMock = generateRecalls as jest.Mock;
const generateAllRecallsMock = generateAllRecalls as jest.Mock;
const logReminderMock = logReminder as jest.Mock;
const getPatientPreferencesMock = getPatientPreferences as jest.Mock;
const updatePatientPreferencesMock = updatePatientPreferences as jest.Mock;
const canContactPatientMock = canContactPatient as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/recalls', recallsRouter);

describe('Recalls Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/recalls/campaigns', () => {
    it('should list all recall campaigns', async () => {
      const mockCampaigns = [
        {
          id: 'campaign-1',
          tenant_id: 'tenant-123',
          name: 'Annual Skin Check',
          description: 'Yearly full body exam',
          recall_type: 'annual_exam',
          interval_months: 12,
          is_active: true,
        },
        {
          id: 'campaign-2',
          tenant_id: 'tenant-123',
          name: 'Acne Follow-up',
          description: '3-month acne treatment check',
          recall_type: 'follow_up',
          interval_months: 3,
          is_active: true,
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockCampaigns });

      const response = await request(app).get('/api/recalls/campaigns');

      expect(response.status).toBe(200);
      expect(response.body.campaigns).toHaveLength(2);
      expect(response.body.campaigns[0].name).toBe('Annual Skin Check');
    });

    it('should handle database errors', async () => {
      queryMock.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app).get('/api/recalls/campaigns');

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/recalls/campaigns', () => {
    it('should create new recall campaign', async () => {
      const newCampaign = {
        id: 'campaign-123',
        name: 'Isotretinoin Follow-up',
        description: 'Monthly monitoring for isotretinoin patients',
        recall_type: 'medication_check',
        interval_months: 1,
        is_active: true,
      };

      queryMock.mockResolvedValueOnce({ rows: [newCampaign] });

      const response = await request(app)
        .post('/api/recalls/campaigns')
        .send({
          name: 'Isotretinoin Follow-up',
          description: 'Monthly monitoring for isotretinoin patients',
          recallType: 'medication_check',
          intervalMonths: 1,
          isActive: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Isotretinoin Follow-up');
    });

    it('should validate required fields', async () => {
      const response = await request(app).post('/api/recalls/campaigns').send({
        description: 'Missing name and recallType',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Name and recall type are required');
    });
  });

  describe('PUT /api/recalls/campaigns/:id', () => {
    it('should update recall campaign', async () => {
      const updatedCampaign = {
        id: 'campaign-123',
        name: 'Updated Campaign',
        is_active: false,
      };

      queryMock.mockResolvedValueOnce({ rows: [updatedCampaign] });

      const response = await request(app)
        .put('/api/recalls/campaigns/campaign-123')
        .send({
          name: 'Updated Campaign',
          isActive: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Campaign');
    });

    it('should return 404 when campaign not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .put('/api/recalls/campaigns/campaign-999')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Campaign not found');
    });
  });

  describe('DELETE /api/recalls/campaigns/:id', () => {
    it('should delete recall campaign', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'campaign-123' }] });

      const response = await request(app).delete('/api/recalls/campaigns/campaign-123');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Campaign deleted successfully');
    });

    it('should return 404 when campaign not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).delete('/api/recalls/campaigns/campaign-999');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/recalls/campaigns/:id/generate', () => {
    it('should generate recalls for specific campaign', async () => {
      generateRecallsMock.mockResolvedValueOnce({
        created: 15,
        skipped: 3,
        errors: 0,
      });

      const response = await request(app).post(
        '/api/recalls/campaigns/campaign-123/generate'
      );

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Generated 15 recalls');
      expect(response.body.created).toBe(15);
      expect(generateRecallsMock).toHaveBeenCalledWith('tenant-123', 'campaign-123');
    });

    it('should handle service errors', async () => {
      generateRecallsMock.mockRejectedValueOnce(new Error('Service error'));

      const response = await request(app).post(
        '/api/recalls/campaigns/campaign-123/generate'
      );

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/recalls/generate-all', () => {
    it('should generate recalls for all active campaigns', async () => {
      generateAllRecallsMock.mockResolvedValueOnce({
        campaigns: 5,
        totalCreated: 47,
        totalSkipped: 12,
        totalErrors: 1,
      });

      const response = await request(app).post('/api/recalls/generate-all');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Processed 5 campaigns, created 47 recalls');
      expect(generateAllRecallsMock).toHaveBeenCalledWith('tenant-123');
    });
  });

  describe('GET /api/recalls/due', () => {
    it('should fetch recalls due with filters', async () => {
      const mockRecalls = [
        {
          id: 'recall-1',
          patient_id: 'patient-123',
          campaign_id: 'campaign-1',
          due_date: '2024-02-15',
          status: 'pending',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          phone: '+15551234567',
          campaign_name: 'Annual Exam',
          recall_type: 'annual_exam',
          contact_attempts: '1',
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockRecalls });

      const response = await request(app)
        .get('/api/recalls/due')
        .query({
          startDate: '2024-02-01',
          endDate: '2024-02-28',
          status: 'pending',
        });

      expect(response.status).toBe(200);
      expect(response.body.recalls).toHaveLength(1);
      expect(response.body.recalls[0].status).toBe('pending');
    });

    it('should filter by campaign ID', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get('/api/recalls/due').query({
        campaignId: 'campaign-123',
      });

      expect(response.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('pr.campaign_id'),
        expect.arrayContaining(['tenant-123', 'campaign-123'])
      );
    });
  });

  describe('POST /api/recalls/patient', () => {
    it('should create patient recall manually', async () => {
      const newRecall = {
        id: 'recall-uuid-123',
        patient_id: 'patient-456',
        due_date: '2024-03-15',
        status: 'pending',
      };

      queryMock.mockResolvedValueOnce({ rows: [newRecall] });

      const response = await request(app).post('/api/recalls/patient').send({
        patientId: 'patient-456',
        campaignId: 'campaign-123',
        dueDate: '2024-03-15',
        notes: 'Manual follow-up needed',
      });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('recall-uuid-123');
    });

    it('should validate required fields', async () => {
      const response = await request(app).post('/api/recalls/patient').send({
        campaignId: 'campaign-123',
        // Missing patientId and dueDate
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Patient ID and due date are required');
    });
  });

  describe('PUT /api/recalls/:id/status', () => {
    it('should update recall status', async () => {
      const updatedRecall = {
        id: 'recall-123',
        status: 'scheduled',
        appointment_id: 'appointment-456',
      };

      queryMock.mockResolvedValueOnce({ rows: [updatedRecall] });

      const response = await request(app).put('/api/recalls/recall-123/status').send({
        status: 'scheduled',
        appointmentId: 'appointment-456',
        notes: 'Appointment booked',
      });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('scheduled');
    });

    it('should validate status values', async () => {
      const response = await request(app).put('/api/recalls/recall-123/status').send({
        status: 'invalid_status',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid status');
    });

    it('should require status field', async () => {
      const response = await request(app).put('/api/recalls/recall-123/status').send({
        notes: 'Some notes',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Status is required');
    });
  });

  describe('POST /api/recalls/:id/contact', () => {
    it('should record contact attempt', async () => {
      const mockRecall = {
        id: 'recall-123',
        patient_id: 'patient-456',
        patientId: 'patient-456',
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockRecall] }) // Get recall
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // Update recall

      canContactPatientMock.mockResolvedValueOnce({
        canContact: true,
      });

      logReminderMock.mockResolvedValueOnce({ id: 'reminder-123' });

      const response = await request(app).post('/api/recalls/recall-123/contact').send({
        contactMethod: 'email',
        notes: 'Sent recall email',
        messageContent: 'Your appointment is due',
      });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Contact recorded successfully');
      expect(logReminderMock).toHaveBeenCalledWith(
        'tenant-123',
        'patient-456',
        'recall-123',
        'email',
        'Your appointment is due',
        'user-123'
      );
    });

    it('should validate contact method', async () => {
      const response = await request(app).post('/api/recalls/recall-123/contact').send({
        contactMethod: 'invalid_method',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid contact method');
    });

    it('should check patient contact preferences', async () => {
      const mockRecall = {
        id: 'recall-123',
        patient_id: 'patient-456',
        patientId: 'patient-456',
      };

      queryMock.mockResolvedValueOnce({ rows: [mockRecall] });

      canContactPatientMock.mockResolvedValueOnce({
        canContact: false,
        reason: 'Patient opted out of email',
      });

      const response = await request(app).post('/api/recalls/recall-123/contact').send({
        contactMethod: 'email',
      });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Patient opted out of email');
    });
  });

  describe('GET /api/recalls/history', () => {
    it('should fetch reminder history with filters', async () => {
      const mockHistory = [
        {
          id: 'reminder-1',
          patient_id: 'patient-123',
          recall_id: 'recall-456',
          contact_method: 'sms',
          sent_at: '2024-01-15T10:00:00Z',
          first_name: 'Jane',
          last_name: 'Smith',
          campaign_name: 'Annual Exam',
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockHistory });

      const response = await request(app).get('/api/recalls/history').query({
        patientId: 'patient-123',
        startDate: '2024-01-01',
        limit: 50,
      });

      expect(response.status).toBe(200);
      expect(response.body.history).toHaveLength(1);
    });
  });

  describe('GET /api/recalls/stats', () => {
    it('should fetch campaign statistics', async () => {
      const mockStats = {
        total_pending: '10',
        total_contacted: '25',
        total_scheduled: '15',
        total_completed: '50',
        total_dismissed: '5',
        total_recalls: '105',
      };

      const mockByCampaign = [
        {
          id: 'campaign-1',
          name: 'Annual Exam',
          recall_type: 'annual_exam',
          total_recalls: '60',
          pending: '5',
          contacted: '15',
          scheduled: '10',
          completed: '30',
        },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [mockStats] })
        .mockResolvedValueOnce({ rows: mockByCampaign });

      const response = await request(app).get('/api/recalls/stats');

      expect(response.status).toBe(200);
      expect(response.body.overall.total_recalls).toBe('105');
      expect(response.body.overall.contactRate).toBeGreaterThanOrEqual(0);
      expect(response.body.byCampaign).toHaveLength(1);
    });

    it('should filter stats by date range', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ total_recalls: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get('/api/recalls/stats').query({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/recalls/patient/:patientId/preferences', () => {
    it('should fetch patient preferences', async () => {
      const mockPreferences = {
        email_enabled: true,
        sms_enabled: true,
        phone_enabled: false,
        mail_enabled: true,
      };

      getPatientPreferencesMock.mockResolvedValueOnce(mockPreferences);

      const response = await request(app).get(
        '/api/recalls/patient/patient-123/preferences'
      );

      expect(response.status).toBe(200);
      expect(response.body.preferences.email_enabled).toBe(true);
      expect(getPatientPreferencesMock).toHaveBeenCalledWith('tenant-123', 'patient-123');
    });
  });

  describe('PUT /api/recalls/patient/:patientId/preferences', () => {
    it('should update patient preferences', async () => {
      const updatedPreferences = {
        email_enabled: false,
        sms_enabled: true,
      };

      updatePatientPreferencesMock.mockResolvedValueOnce(updatedPreferences);

      const response = await request(app)
        .put('/api/recalls/patient/patient-123/preferences')
        .send({
          email_enabled: false,
          sms_enabled: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.email_enabled).toBe(false);
      expect(updatePatientPreferencesMock).toHaveBeenCalledWith(
        'tenant-123',
        'patient-123',
        expect.objectContaining({ email_enabled: false })
      );
    });
  });

  describe('POST /api/recalls/bulk-notify', () => {
    it('should validate recallIds and notificationType', async () => {
      const missingIds = await request(app).post('/api/recalls/bulk-notify').send({
        notificationType: 'email',
      });

      expect(missingIds.status).toBe(400);
      expect(missingIds.body.error).toBe('Recall IDs are required');

      const missingType = await request(app).post('/api/recalls/bulk-notify').send({
        recallIds: ['recall-1'],
      });

      expect(missingType.status).toBe(400);
      expect(missingType.body.error).toBe('Notification type is required');
    });

    it('should process recalls with mixed outcomes', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'recall-2',
              patient_id: 'patient-2',
              patientId: 'patient-2',
              email: 'patient2@example.com',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'recall-3',
              patient_id: 'patient-3',
              patientId: 'patient-3',
              email: 'patient3@example.com',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      canContactPatientMock
        .mockResolvedValueOnce({ canContact: false, reason: 'Opted out' })
        .mockResolvedValueOnce({ canContact: true });
      logReminderMock.mockResolvedValueOnce({ id: 'reminder-1' });

      const response = await request(app).post('/api/recalls/bulk-notify').send({
        recallIds: ['recall-1', 'recall-2', 'recall-3'],
        notificationType: 'email',
        messageTemplate: 'Reminder message',
      });

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(3);
      expect(response.body.successful).toBe(1);
      expect(response.body.failed).toBe(2);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ recallId: 'recall-1', error: 'Recall not found' }),
          expect.objectContaining({ recallId: 'recall-2', error: 'Opted out' }),
        ])
      );
    });

    it('should capture errors during bulk notify processing', async () => {
      queryMock.mockRejectedValueOnce(new Error('Notify failed'));

      const response = await request(app).post('/api/recalls/bulk-notify').send({
        recallIds: ['recall-1'],
        notificationType: 'sms',
      });

      expect(response.status).toBe(200);
      expect(response.body.failed).toBe(1);
      expect(response.body.errors[0].error).toBe('Notify failed');
    });
  });

  describe('GET /api/recalls/:id/notification-history', () => {
    it('should return notification history', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'history-1' }] });

      const response = await request(app).get('/api/recalls/recall-123/notification-history');

      expect(response.status).toBe(200);
      expect(response.body.history).toHaveLength(1);
    });
  });

  describe('GET /api/recalls/export', () => {
    it('should export recalls to CSV', async () => {
      const mockRecalls = [
        {
          last_name: 'Doe',
          first_name: 'John',
          email: 'john@example.com',
          phone: '+15551234567',
          due_date: '2024-02-15',
          status: 'pending',
          last_contact_date: '2024-01-15',
          contact_method: 'email',
          campaign_name: 'Annual Exam',
          recall_type: 'annual_exam',
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockRecalls });

      const response = await request(app).get('/api/recalls/export');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('Last Name,First Name');
      expect(response.text).toContain('Doe');
    });

    it('should filter exported data by campaign and status', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get('/api/recalls/export').query({
        campaignId: 'campaign-123',
        status: 'pending',
      });

      expect(response.status).toBe(200);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('pr.campaign_id'),
        expect.arrayContaining(['tenant-123', 'campaign-123', 'pending'])
      );
    });
  });
});
