import request from 'supertest';
import express from 'express';
import waitlistRouter from '../waitlist';
import { pool } from '../../db/pool';
import { auditLog } from '../../services/audit';
import { sendWaitlistNotification, getWaitlistNotificationHistory } from '../../services/waitlistNotificationService';
import { waitlistAutoFillService } from '../../services/waitlistAutoFillService';
import { getTwilioServiceFromEnv } from '../../services/twilioService';

let authUser: { id?: string; tenantId: string };

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = authUser;
    return next();
  },
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../../services/audit', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../services/waitlistNotificationService', () => ({
  sendWaitlistNotification: jest.fn(),
  getWaitlistNotificationHistory: jest.fn(),
}));

jest.mock('../../services/waitlistAutoFillService', () => ({
  waitlistAutoFillService: {
    processAppointmentCancellation: jest.fn(),
    getStats: jest.fn(),
  },
}));

jest.mock('../../services/twilioService', () => ({
  getTwilioServiceFromEnv: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/waitlist', waitlistRouter);

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const sendNotificationMock = sendWaitlistNotification as jest.Mock;
const historyMock = getWaitlistNotificationHistory as jest.Mock;
const auditLogMock = auditLog as jest.Mock;
const autoFillMock = waitlistAutoFillService.processAppointmentCancellation as jest.Mock;
const autoFillStatsMock = waitlistAutoFillService.getStats as jest.Mock;
const getTwilioMock = getTwilioServiceFromEnv as jest.Mock;

const patientId = '00000000-0000-4000-8000-000000000001';
const providerId = '00000000-0000-4000-8000-000000000002';
const appointmentId = '00000000-0000-4000-8000-000000000003';

beforeEach(() => {
  authUser = { id: 'user-1', tenantId: 'tenant-1' };
  queryMock.mockReset();
  connectMock.mockReset();
  sendNotificationMock.mockReset();
  historyMock.mockReset();
  auditLogMock.mockReset();
  autoFillMock.mockReset();
  autoFillStatsMock.mockReset();
  getTwilioMock.mockReset();
});

describe('Waitlist routes', () => {
  it('GET /waitlist returns entries', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w1' }] });

    const res = await request(app).get('/waitlist');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'w1' }]);
  });

  it('GET /waitlist supports query filters', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/waitlist?status=contacted&priority=high&providerId=${providerId}`);

    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][1]).toEqual(['tenant-1', 'contacted', 'high', providerId]);
  });

  it('GET /waitlist returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/waitlist');

    expect(res.status).toBe(500);
  });

  it('POST /waitlist creates an entry', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w1', patient_id: patientId }] });

    const res = await request(app).post('/waitlist').send({
      patientId,
      providerId,
      reason: 'Needs earlier slot',
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('w1');
  });

  it('POST /waitlist creates an entry without optional fields', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w2', patient_id: patientId }] });

    const res = await request(app).post('/waitlist').send({
      patientId,
      reason: 'Needs sooner',
    });

    expect(res.status).toBe(201);
    expect(queryMock.mock.calls[0][1][3]).toBeNull();
  });

  it('POST /waitlist rejects invalid payload', async () => {
    const res = await request(app).post('/waitlist').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('POST /waitlist returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/waitlist').send({
      patientId,
      providerId,
      reason: 'Needs earlier slot',
    });

    expect(res.status).toBe(500);
  });

  it('PATCH /waitlist/:id updates an entry', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w1', status: 'scheduled' }] });

    const res = await request(app).patch('/waitlist/w1').send({ status: 'scheduled' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('scheduled');
  });

  it('PATCH /waitlist/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).patch('/waitlist/w1').send({ status: 'scheduled' });

    expect(res.status).toBe(404);
  });

  it('PATCH /waitlist/:id updates additional fields', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w1', status: 'contacted' }] });

    const res = await request(app).patch('/waitlist/w1').send({
      status: 'contacted',
      patientNotifiedAt: '2024-01-02T10:00:00Z',
      notificationMethod: 'sms',
      scheduledAppointmentId: appointmentId,
      notes: 'Follow up',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('contacted');
  });

  it('PATCH /waitlist/:id updates entry without status', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w1', patient_notified_at: '2024-01-02T10:00:00Z' }] });

    const res = await request(app).patch('/waitlist/w1').send({
      patientNotifiedAt: '2024-01-02T10:00:00Z',
    });

    expect(res.status).toBe(200);
  });

  it('PATCH /waitlist/:id rejects invalid payload', async () => {
    const res = await request(app).patch('/waitlist/w1').send({ status: 'nope' });

    expect(res.status).toBe(400);
  });

  it('PATCH /waitlist/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).patch('/waitlist/w1').send({ status: 'contacted' });

    expect(res.status).toBe(500);
  });

  it('DELETE /waitlist/:id deletes an entry', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w1' }] });

    const res = await request(app).delete('/waitlist/w1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Waitlist entry deleted');
  });

  it('DELETE /waitlist/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete('/waitlist/w1');

    expect(res.status).toBe(404);
  });

  it('POST /waitlist/auto-fill validates required fields', async () => {
    const res = await request(app).post('/waitlist/auto-fill').send({});

    expect(res.status).toBe(400);
  });

  it('POST /waitlist/auto-fill notifies eligible patients', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: appointmentId,
            scheduled_start: '2024-01-01T09:00:00Z',
            scheduled_end: '2024-01-01T09:30:00Z',
            provider_id: providerId,
            location_id: 'loc-1',
            provider_name: 'Dr. Gomez',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'w1',
            patient_id: patientId,
            first_name: 'Pat',
            last_name: 'Lee',
            phone: '555-0100',
            email: 'pat@example.com',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    sendNotificationMock.mockResolvedValue({ success: true });

    const res = await request(app).post('/waitlist/auto-fill').send({
      appointmentId,
      providerId,
      appointmentDate: '2024-01-02',
      appointmentTime: '09:00',
    });

    expect(res.status).toBe(200);
    expect(res.body.eligibleCount).toBe(1);
  });

  it('POST /waitlist/auto-fill returns 404 when appointment missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/waitlist/auto-fill').send({
      appointmentId,
      providerId,
      appointmentDate: '2024-01-02',
      appointmentTime: '09:00',
    });

    expect(res.status).toBe(404);
  });

  it('POST /waitlist/auto-fill handles morning slots without contact info', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: appointmentId,
            scheduled_start: '2024-01-01T08:00:00',
            scheduled_end: '2024-01-01T08:30:00',
            provider_id: providerId,
            location_id: 'loc-1',
            provider_name: 'Dr. Gomez',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'w1',
            patient_id: patientId,
            first_name: 'Pat',
            last_name: 'Lee',
            phone: null,
            email: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    sendNotificationMock.mockResolvedValue({ success: true });

    const res = await request(app).post('/waitlist/auto-fill').send({
      appointmentId,
      providerId,
      appointmentDate: '2024-01-02',
      appointmentTime: '08:00',
    });

    expect(res.status).toBe(200);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('POST /waitlist/auto-fill handles afternoon slots with contact info', async () => {
    authUser = { tenantId: 'tenant-1' };
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: appointmentId,
            scheduled_start: '2024-01-01T13:00:00',
            scheduled_end: '2024-01-01T13:30:00',
            provider_id: providerId,
            location_id: 'loc-1',
            provider_name: 'Dr. Gomez',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'w1',
            patient_id: patientId,
            first_name: 'Pat',
            last_name: 'Lee',
            phone: '555-0100',
            email: 'pat@example.com',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    sendNotificationMock.mockResolvedValue({ success: true });

    const res = await request(app).post('/waitlist/auto-fill').send({
      appointmentId,
      providerId,
      appointmentDate: '2024-01-02',
      appointmentTime: '13:00',
    });

    expect(res.status).toBe(200);
    expect(sendNotificationMock).toHaveBeenCalledTimes(3);
  });

  it('POST /waitlist/auto-fill handles evening slots when notifications fail', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: appointmentId,
            scheduled_start: '2024-01-01T18:00:00',
            scheduled_end: '2024-01-01T18:30:00',
            provider_id: providerId,
            location_id: 'loc-1',
            provider_name: 'Dr. Gomez',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'w1',
            patient_id: patientId,
            first_name: 'Pat',
            last_name: 'Lee',
            phone: '555-0100',
            email: null,
          },
        ],
      });

    sendNotificationMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/waitlist/auto-fill').send({
      appointmentId,
      providerId,
      appointmentDate: '2024-01-02',
      appointmentTime: '18:00',
    });

    expect(res.status).toBe(200);
    expect(res.body.notifications[0].success).toBe(false);
  });

  it('POST /waitlist/auto-fill returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/waitlist/auto-fill').send({
      appointmentId,
      providerId,
      appointmentDate: '2024-01-02',
      appointmentTime: '09:00',
    });

    expect(res.status).toBe(500);
  });

  it('POST /waitlist/:id/notify validates required fields', async () => {
    const res = await request(app).post('/waitlist/w1/notify').send({});

    expect(res.status).toBe(400);
  });

  it('POST /waitlist/:id/notify returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/waitlist/w1/notify').send({
      method: 'sms',
      appointmentDate: '2024-01-03',
      appointmentTime: '10:00',
      providerName: 'Dr. Gomez',
    });

    expect(res.status).toBe(404);
  });

  it('POST /waitlist/:id/notify sends SMS notifications', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'w1',
          patient_id: patientId,
          first_name: 'Pat',
          last_name: 'Lee',
          phone: '555-0100',
          email: 'pat@example.com',
        },
      ],
    });

    sendNotificationMock.mockResolvedValue({ success: true, notificationId: 'n1' });
    getTwilioMock.mockReturnValue({ sendSMS: jest.fn() });

    const res = await request(app).post('/waitlist/w1/notify').send({
      method: 'sms',
      appointmentDate: '2024-01-03',
      appointmentTime: '10:00',
      providerName: 'Dr. Gomez',
    });

    expect(res.status).toBe(200);
    expect(res.body.notificationId).toBe('n1');
  });

  it('POST /waitlist/:id/notify returns 400 when SMS notification fails', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'w1',
          patient_id: patientId,
          first_name: 'Pat',
          last_name: 'Lee',
          phone: '555-0100',
          email: 'pat@example.com',
        },
      ],
    });

    sendNotificationMock.mockResolvedValue({ success: false, error: 'bad number' });
    getTwilioMock.mockReturnValue({ sendSMS: jest.fn() });

    const res = await request(app).post('/waitlist/w1/notify').send({
      method: 'sms',
      appointmentDate: '2024-01-03',
      appointmentTime: '10:00',
      providerName: 'Dr. Gomez',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad number');
  });

  it('POST /waitlist/:id/notify handles email notifications', async () => {
    authUser = { tenantId: 'tenant-1' };
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'w1',
            patient_id: patientId,
            first_name: 'Pat',
            last_name: 'Lee',
            phone: '555-0100',
            email: 'pat@example.com',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/waitlist/w1/notify').send({
      method: 'email',
      appointmentDate: '2024-01-03',
      appointmentTime: '10:00',
      providerName: 'Dr. Gomez',
    });

    expect(res.status).toBe(200);
    expect(res.body.method).toBe('email');
  });

  it('POST /waitlist/:id/notify handles portal notifications', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'w1',
            patient_id: patientId,
            first_name: 'Pat',
            last_name: 'Lee',
            phone: '555-0100',
            email: 'pat@example.com',
          },
        ],
      })
      .mockRejectedValueOnce(new Error('missing table'))
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/waitlist/w1/notify').send({
      method: 'portal',
      appointmentDate: '2024-01-03',
      appointmentTime: '10:00',
      providerName: 'Dr. Gomez',
    });

    expect(res.status).toBe(200);
    expect(res.body.method).toBe('portal');
  });

  it('POST /waitlist/:id/notify returns 500 on error', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'w1',
          patient_id: patientId,
          first_name: 'Pat',
          last_name: 'Lee',
          phone: '555-0100',
          email: 'pat@example.com',
        },
      ],
    });

    sendNotificationMock.mockRejectedValueOnce(new Error('boom'));
    getTwilioMock.mockReturnValue({ sendSMS: jest.fn() });

    const res = await request(app).post('/waitlist/w1/notify').send({
      method: 'sms',
      appointmentDate: '2024-01-03',
      appointmentTime: '10:00',
      providerName: 'Dr. Gomez',
    });

    expect(res.status).toBe(500);
  });

  it('GET /waitlist/:id/notifications returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/waitlist/w1/notifications');

    expect(res.status).toBe(404);
  });

  it('GET /waitlist/:id/notifications returns history', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w1' }] });
    historyMock.mockResolvedValue([{ id: 'n1' }]);

    const res = await request(app).get('/waitlist/w1/notifications');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'n1' }]);
  });

  it('GET /waitlist/:id/notifications returns 500 on error', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w1' }] });
    historyMock.mockRejectedValue(new Error('boom'));

    const res = await request(app).get('/waitlist/w1/notifications');

    expect(res.status).toBe(500);
  });

  it('POST /waitlist/:id/fill validates appointment id', async () => {
    const res = await request(app).post('/waitlist/w1/fill').send({});

    expect(res.status).toBe(400);
  });

  it('POST /waitlist/:id/fill schedules entry', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w1' }] });

    const res = await request(app).post('/waitlist/w1/fill').send({
      appointmentId,
    });

    expect(res.status).toBe(200);
    expect(res.body.waitlist.id).toBe('w1');
  });

  it('POST /waitlist/:id/fill uses system actor when user is missing', async () => {
    authUser = { tenantId: 'tenant-1' };
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'w1' }] });

    const res = await request(app).post('/waitlist/w1/fill').send({
      appointmentId,
    });

    expect(res.status).toBe(200);
  });

  it('POST /waitlist/:id/fill returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/waitlist/w1/fill').send({
      appointmentId,
    });

    expect(res.status).toBe(404);
  });

  it('POST /waitlist/:id/fill returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/waitlist/w1/fill').send({
      appointmentId,
    });

    expect(res.status).toBe(500);
  });

  it('GET /waitlist/:id/holds returns holds', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'h1' }] });

    const res = await request(app).get('/waitlist/w1/holds');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'h1' }]);
  });

  it('GET /waitlist/holds returns active holds', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'h1' }] });

    const res = await request(app).get('/waitlist/holds');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'h1' }]);
  });

  it('GET /waitlist/holds supports status filter', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'h2' }] });

    const res = await request(app).get('/waitlist/holds?status=cancelled');

    expect(res.status).toBe(200);
    expect(queryMock.mock.calls[0][1]).toEqual(['tenant-1', 'cancelled']);
  });

  it('POST /waitlist/holds/:holdId/accept returns 404 when missing', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockImplementation(async (query: any) => {
      const text = typeof query === 'string' ? query : query.text;
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('SELECT wh')) return { rows: [] };
      return { rows: [] };
    });

    connectMock.mockResolvedValue(client);

    const res = await request(app).post('/waitlist/holds/h1/accept');

    expect(res.status).toBe(404);
  });

  it('POST /waitlist/holds/:holdId/accept rejects expired holds', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockImplementation(async (query: any) => {
      const text = typeof query === 'string' ? query : query.text;
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('SELECT wh')) {
        return {
          rows: [
            {
              id: 'h1',
              hold_until: '2000-01-01T00:00:00Z',
              waitlist_id: 'w1',
              patient_id: patientId,
            },
          ],
        };
      }
      return { rows: [] };
    });

    connectMock.mockResolvedValue(client);

    const res = await request(app).post('/waitlist/holds/h1/accept');

    expect(res.status).toBe(400);
  });

  it('POST /waitlist/holds/:holdId/accept schedules appointment', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockImplementation(async (query: any) => {
      const text = typeof query === 'string' ? query : query.text;
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
      if (text.includes('SELECT wh')) {
        return {
          rows: [
            {
              id: 'h1',
              hold_until: '2099-01-01T00:00:00Z',
              waitlist_id: 'w1',
              patient_id: patientId,
            },
          ],
        };
      }
      return { rows: [] };
    });

    connectMock.mockResolvedValue(client);

    const res = await request(app).post('/waitlist/holds/h1/accept');

    expect(res.status).toBe(200);
    expect(res.body.waitlistId).toBe('w1');
  });

  it('POST /waitlist/holds/:holdId/accept uses system actor when user is missing', async () => {
    authUser = { tenantId: 'tenant-1' };
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockImplementation(async (query: any) => {
      const text = typeof query === 'string' ? query : query.text;
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
      if (text.includes('SELECT wh')) {
        return {
          rows: [
            {
              id: 'h1',
              hold_until: '2099-01-01T00:00:00Z',
              waitlist_id: 'w1',
              patient_id: patientId,
            },
          ],
        };
      }
      return { rows: [] };
    });

    connectMock.mockResolvedValue(client);

    const res = await request(app).post('/waitlist/holds/h1/accept');

    expect(res.status).toBe(200);
  });

  it('POST /waitlist/holds/:holdId/cancel returns 404 when missing', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockImplementation(async (query: any) => {
      const text = typeof query === 'string' ? query : query.text;
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('UPDATE waitlist_holds')) return { rows: [] };
      return { rows: [] };
    });

    connectMock.mockResolvedValue(client);

    const res = await request(app).post('/waitlist/holds/h1/cancel');

    expect(res.status).toBe(404);
  });

  it('POST /waitlist/holds/:holdId/cancel clears hold', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockImplementation(async (query: any) => {
      const text = typeof query === 'string' ? query : query.text;
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
      if (text.includes('UPDATE waitlist_holds')) {
        return { rows: [{ waitlist_id: 'w1' }] };
      }
      if (text.includes('SELECT id FROM waitlist_holds')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    connectMock.mockResolvedValue(client);

    const res = await request(app).post('/waitlist/holds/h1/cancel');

    expect(res.status).toBe(200);
    expect(res.body.waitlistId).toBe('w1');
  });

  it('POST /waitlist/holds/:holdId/cancel uses system actor when user is missing', async () => {
    authUser = { tenantId: 'tenant-1' };
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockImplementation(async (query: any) => {
      const text = typeof query === 'string' ? query : query.text;
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
      if (text.includes('UPDATE waitlist_holds')) {
        return { rows: [{ waitlist_id: 'w1' }] };
      }
      if (text.includes('SELECT id FROM waitlist_holds')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    connectMock.mockResolvedValue(client);

    const res = await request(app).post('/waitlist/holds/h1/cancel');

    expect(res.status).toBe(200);
  });

  it('POST /waitlist/trigger-auto-fill/:appointmentId returns matches', async () => {
    autoFillMock.mockResolvedValue([{ holdId: 'h1', waitlistId: 'w1', score: 0.9 }]);

    const res = await request(app).post('/waitlist/trigger-auto-fill/a1').send({ maxMatches: 2 });

    expect(res.status).toBe(200);
    expect(res.body.matchesCreated).toBe(1);
  });

  it('POST /waitlist/trigger-auto-fill/:appointmentId uses defaults when maxMatches omitted', async () => {
    authUser = { tenantId: 'tenant-1' };
    autoFillMock.mockResolvedValue([]);

    const res = await request(app).post('/waitlist/trigger-auto-fill/a1').send({});

    expect(res.status).toBe(200);
    expect(autoFillMock.mock.calls[0][2]).toBe(5);
  });

  it('POST /waitlist/trigger-auto-fill/:appointmentId returns 500 on error', async () => {
    autoFillMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/waitlist/trigger-auto-fill/a1').send({ maxMatches: 2 });

    expect(res.status).toBe(500);
  });

  it('GET /waitlist/stats/auto-fill returns stats', async () => {
    autoFillStatsMock.mockResolvedValue({ totalMatches: 3 });

    const res = await request(app).get('/waitlist/stats/auto-fill');

    expect(res.status).toBe(200);
    expect(res.body.totalMatches).toBe(3);
  });

  it('GET /waitlist/stats/auto-fill supports date range', async () => {
    autoFillStatsMock.mockResolvedValue({ totalMatches: 1 });

    const res = await request(app).get('/waitlist/stats/auto-fill?startDate=2024-01-01&endDate=2024-01-31');

    expect(res.status).toBe(200);
    expect(autoFillStatsMock.mock.calls[0][1]).toBeInstanceOf(Date);
    expect(autoFillStatsMock.mock.calls[0][2]).toBeInstanceOf(Date);
  });
});
