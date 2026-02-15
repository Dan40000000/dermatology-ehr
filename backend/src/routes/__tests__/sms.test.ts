import request from 'supertest';
import express from 'express';
import { smsRouter } from '../sms';
import { pool } from '../../db/pool';
import { auditLog } from '../../services/audit';
import { createTwilioService } from '../../services/twilioService';
import { processIncomingSMS, updateSMSStatus } from '../../services/smsProcessor';
import { sendImmediateReminder } from '../../services/smsReminderScheduler';
import { formatPhoneE164 } from '../../utils/phone';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1' };
    return next();
  },
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../services/audit', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../services/twilioService', () => ({
  createTwilioService: jest.fn(),
}));

jest.mock('../../services/smsProcessor', () => ({
  processIncomingSMS: jest.fn(),
  updateSMSStatus: jest.fn(),
}));

jest.mock('../../services/smsReminderScheduler', () => ({
  sendImmediateReminder: jest.fn(),
}));

jest.mock('../../utils/phone', () => ({
  formatPhoneE164: jest.fn(),
  validateAndFormatPhone: jest.fn(),
  formatPhoneDisplay: jest.fn(),
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
app.use('/sms', smsRouter);

const queryMock = pool.query as jest.Mock;
const auditLogMock = auditLog as jest.Mock;
const createTwilioServiceMock = createTwilioService as jest.Mock;
const processIncomingMock = processIncomingSMS as jest.Mock;
const updateStatusMock = updateSMSStatus as jest.Mock;
const sendReminderMock = sendImmediateReminder as jest.Mock;
const formatPhoneMock = formatPhoneE164 as jest.Mock;

const twilioServiceMock = {
  sendSMS: jest.fn(),
  testConnection: jest.fn(),
  validateWebhookSignature: jest.fn(),
};

beforeEach(() => {
  queryMock.mockReset();
  auditLogMock.mockReset();
  createTwilioServiceMock.mockReset();
  processIncomingMock.mockReset();
  updateStatusMock.mockReset();
  sendReminderMock.mockReset();
  formatPhoneMock.mockReset();
  twilioServiceMock.sendSMS.mockReset();
  twilioServiceMock.testConnection.mockReset();
  twilioServiceMock.validateWebhookSignature.mockReset();

  queryMock.mockResolvedValue({ rows: [] });
  createTwilioServiceMock.mockReturnValue(twilioServiceMock);
  formatPhoneMock.mockImplementation((value: string) => value ? '+15550100' : null);
  twilioServiceMock.sendSMS.mockResolvedValue({ sid: 'sid-1', status: 'sent', numSegments: 1 });
  twilioServiceMock.testConnection.mockResolvedValue({ success: true });
  twilioServiceMock.validateWebhookSignature.mockReturnValue(true);
  processIncomingMock.mockResolvedValue({ messageId: 'msg-1', autoResponseSent: false });
  sendReminderMock.mockResolvedValue({ success: true });
});

describe('SMS routes', () => {
  it('GET /sms/settings returns defaults when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/sms/settings');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('isActive', false);
    expect(res.body).toHaveProperty('isTestMode', true);
  });

  it('GET /sms/settings returns settings when configured', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 's1',
          tenantId: 'tenant-1',
          twilioPhoneNumber: '+15550100',
          appointmentRemindersEnabled: true,
          reminderHoursBefore: 24,
          allowPatientReplies: true,
          isActive: true,
          isTestMode: false,
        },
      ],
    });

    const res = await request(app).get('/sms/settings');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('s1');
  });

  it('PUT /sms/settings rejects invalid phone', async () => {
    formatPhoneMock.mockReturnValueOnce(null);

    const res = await request(app).put('/sms/settings').send({ twilioPhoneNumber: 'bad' });

    expect(res.status).toBe(400);
  });

  it('PUT /sms/settings updates settings', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 's1' }] });

    const res = await request(app).put('/sms/settings').send({
      isActive: true,
      twilioPhoneNumber: '5550100',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it('PUT /sms/settings rejects empty updates', async () => {
    const res = await request(app).put('/sms/settings').send({});

    expect(res.status).toBe(400);
  });

  it('POST /sms/test-connection returns 400 when missing credentials', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/sms/test-connection').send({});

    expect(res.status).toBe(400);
  });

  it('POST /sms/test-connection returns test results', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ twilio_account_sid: 'sid', twilio_auth_token: 'token' }],
    });

    const res = await request(app).post('/sms/test-connection').send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /sms/send returns 404 when patient missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/sms/send').send({
      patientId: '00000000-0000-4000-8000-000000000001',
      messageBody: 'Hello',
    });

    expect(res.status).toBe(404);
  });

  it('POST /sms/send returns 400 when patient has no phone', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ phone: null, first_name: 'Pat', last_name: 'Lee' }],
    });

    const res = await request(app).post('/sms/send').send({
      patientId: '00000000-0000-4000-8000-000000000001',
      messageBody: 'Hello',
    });

    expect(res.status).toBe(400);
  });

  it('POST /sms/send returns 400 when patient opted out', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ phone: '5550100', first_name: 'Pat', last_name: 'Lee' }],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: false }],
      });

    const res = await request(app).post('/sms/send').send({
      patientId: '00000000-0000-4000-8000-000000000001',
      messageBody: 'Hello',
    });

    expect(res.status).toBe(400);
  });

  it('POST /sms/send returns 400 when settings inactive', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ phone: '5550100', first_name: 'Pat', last_name: 'Lee' }],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ is_active: false }],
      });

    const res = await request(app).post('/sms/send').send({
      patientId: '00000000-0000-4000-8000-000000000001',
      messageBody: 'Hello',
    });

    expect(res.status).toBe(400);
  });

  it('POST /sms/send sends message', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ phone: '5550100', first_name: 'Pat', last_name: 'Lee' }],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ twilio_account_sid: 'sid', twilio_auth_token: 'token', twilio_phone_number: '+1555', is_active: true }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/sms/send').send({
      patientId: '00000000-0000-4000-8000-000000000001',
      messageBody: 'Hello',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditLogMock).toHaveBeenCalled();
  });

  it('GET /sms/messages returns paginated results', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'm1' }] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });

    const res = await request(app).get('/sms/messages');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('GET /sms/messages/patient/:id returns history', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'm1' }] });

    const res = await request(app).get('/sms/messages/patient/p1');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it('GET /sms/conversations returns conversations', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ patientId: 'p1' }] });

    const res = await request(app).get('/sms/conversations');

    expect(res.status).toBe(200);
    expect(res.body.conversations).toHaveLength(1);
  });

  it('GET /sms/conversations/:patientId returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/sms/conversations/p1');

    expect(res.status).toBe(404);
  });

  it('GET /sms/conversations/:patientId returns messages', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'p1', firstName: 'Pat', lastName: 'Lee', phone: '5550100' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'm1' }] });

    const res = await request(app).get('/sms/conversations/p1');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it('POST /sms/conversations/:patientId/send sends message', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ phone: '5550100', first_name: 'Pat', last_name: 'Lee' }],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ twilio_account_sid: 'sid', twilio_auth_token: 'token', twilio_phone_number: '+1555', is_active: true }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/sms/conversations/p1/send').send({ message: 'Hi' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /sms/conversations/:patientId/send rejects invalid payload', async () => {
    const res = await request(app).post('/sms/conversations/p1/send').send({});

    expect(res.status).toBe(400);
  });

  it('PUT /sms/conversations/:patientId/mark-read marks read', async () => {
    const res = await request(app).put('/sms/conversations/p1/mark-read');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /sms/auto-responses returns list', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'a1' }] });

    const res = await request(app).get('/sms/auto-responses');

    expect(res.status).toBe(200);
    expect(res.body.autoResponses).toHaveLength(1);
  });

  it('PUT /sms/auto-responses/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/sms/auto-responses/a1').send({ responseText: 'Hi' });

    expect(res.status).toBe(404);
  });

  it('PUT /sms/auto-responses/:id rejects system keyword change', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ is_system_keyword: true }] });

    const res = await request(app).put('/sms/auto-responses/a1').send({ responseText: 'Hi' });

    expect(res.status).toBe(400);
  });

  it('PUT /sms/auto-responses/:id rejects empty updates', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ is_system_keyword: false }] });

    const res = await request(app).put('/sms/auto-responses/a1').send({});

    expect(res.status).toBe(400);
  });

  it('PUT /sms/auto-responses/:id updates', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ is_system_keyword: false }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/sms/auto-responses/a1').send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /sms/patient-preferences/:id returns defaults', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/sms/patient-preferences/p1');

    expect(res.status).toBe(200);
    expect(res.body.optedIn).toBe(true);
  });

  it('GET /sms/patient-preferences/:id returns row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ optedIn: false }] });

    const res = await request(app).get('/sms/patient-preferences/p1');

    expect(res.status).toBe(200);
    expect(res.body.optedIn).toBe(false);
  });

  it('PUT /sms/patient-preferences/:id creates new record', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/sms/patient-preferences/p1').send({ optedIn: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PUT /sms/patient-preferences/:id updates existing record', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'pref-1' }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/sms/patient-preferences/p1').send({ optedIn: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /sms/send-reminder returns 400 on failure', async () => {
    sendReminderMock.mockResolvedValueOnce({ success: false, error: 'No appointment' });

    const res = await request(app).post('/sms/send-reminder/a1');

    expect(res.status).toBe(400);
  });

  it('POST /sms/send-reminder sends reminder', async () => {
    const res = await request(app).post('/sms/send-reminder/a1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /sms/templates returns templates', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 't1' }] });

    const res = await request(app).get('/sms/templates');

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });

  it('POST /sms/templates creates template', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/sms/templates').send({
      name: 'Reminder',
      messageBody: 'Hello',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH /sms/templates/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).patch('/sms/templates/t1').send({ name: 'Updated' });

    expect(res.status).toBe(404);
  });

  it('PATCH /sms/templates/:id rejects system template updates', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ is_system_template: true }] });

    const res = await request(app).patch('/sms/templates/t1').send({ name: 'Updated' });

    expect(res.status).toBe(400);
  });

  it('PATCH /sms/templates/:id updates template', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ is_system_template: false }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).patch('/sms/templates/t1').send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /sms/templates/:id rejects system templates', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ is_system_template: true }] });

    const res = await request(app).delete('/sms/templates/t1');

    expect(res.status).toBe(400);
  });

  it('DELETE /sms/templates/:id deletes template', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ is_system_template: false }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete('/sms/templates/t1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /sms/send-bulk schedules messages', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ twilio_account_sid: 'sid', twilio_auth_token: 'token', twilio_phone_number: '+1555', is_active: true }],
    });

    const res = await request(app).post('/sms/send-bulk').send({
      patientIds: ['00000000-0000-4000-8000-000000000001'],
      messageBody: 'Hello',
      scheduleTime: '2024-01-01T10:00:00Z',
    });

    expect(res.status).toBe(200);
    expect(res.body.scheduled).toBe(true);
  });

  it('POST /sms/send-bulk sends messages immediately', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ twilio_account_sid: 'sid', twilio_auth_token: 'token', twilio_phone_number: '+1555', is_active: true }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'p1', phone: '5550100', first_name: 'Pat', last_name: 'Lee' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: true }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/sms/send-bulk').send({
      patientIds: ['00000000-0000-4000-8000-000000000001'],
      messageBody: 'Hello {firstName}',
      templateId: '00000000-0000-4000-8000-000000000002',
    });

    expect(res.status).toBe(200);
    expect(res.body.results.sent).toBe(1);
  });

  it('GET /sms/scheduled returns scheduled messages', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 's1' }] });

    const res = await request(app).get('/sms/scheduled');

    expect(res.status).toBe(200);
    expect(res.body.scheduled).toHaveLength(1);
  });

  it('POST /sms/scheduled rejects missing patient targets', async () => {
    const res = await request(app).post('/sms/scheduled').send({
      messageBody: 'Hello',
      scheduledSendTime: '2024-01-01T10:00:00Z',
    });

    expect(res.status).toBe(400);
  });

  it('POST /sms/scheduled creates scheduled message', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/sms/scheduled').send({
      patientId: '00000000-0000-4000-8000-000000000001',
      messageBody: 'Hello',
      scheduledSendTime: '2024-01-01T10:00:00Z',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /sms/scheduled/:id cancels message', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete('/sms/scheduled/s1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /sms/webhook/incoming returns 404 when number unknown', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/sms/webhook/incoming')
      .send({ To: '+15550100', From: '+15550200', Body: 'Hello', MessageSid: 'sid' });

    expect(res.status).toBe(404);
  });

  it('POST /sms/webhook/incoming returns 403 for invalid signature', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ tenant_id: 'tenant-1', twilio_account_sid: 'sid', twilio_auth_token: 'token' }],
    });
    twilioServiceMock.validateWebhookSignature.mockReturnValueOnce(false);

    const res = await request(app)
      .post('/sms/webhook/incoming')
      .set('Host', 'example.com')
      .send({ To: '+15550100', From: '+15550200', Body: 'Hello', MessageSid: 'sid' });

    expect(res.status).toBe(403);
  });

  it('POST /sms/webhook/incoming processes message', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ tenant_id: 'tenant-1', twilio_account_sid: 'sid', twilio_auth_token: 'token' }],
    });

    const res = await request(app)
      .post('/sms/webhook/incoming')
      .set('Host', 'example.com')
      .send({ To: '+15550100', From: '+15550200', Body: 'Hello', MessageSid: 'sid', NumMedia: '0' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('<Response>');
  });

  it('POST /sms/webhook/status returns 400 when missing MessageSid', async () => {
    const res = await request(app).post('/sms/webhook/status').send({});

    expect(res.status).toBe(400);
  });

  it('POST /sms/webhook/status returns 404 for unknown message', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/sms/webhook/status').send({ MessageSid: 'sid' });

    expect(res.status).toBe(404);
  });

  it('POST /sms/webhook/status returns 403 for invalid signature', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ tenant_id: 'tenant-1', twilio_account_sid: 'sid', twilio_auth_token: 'token' }],
    });
    twilioServiceMock.validateWebhookSignature.mockReturnValueOnce(false);

    const res = await request(app)
      .post('/sms/webhook/status')
      .set('Host', 'example.com')
      .send({ MessageSid: 'sid', MessageStatus: 'delivered' });

    expect(res.status).toBe(403);
  });

  it('POST /sms/webhook/status updates status', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ tenant_id: 'tenant-1', twilio_account_sid: 'sid', twilio_auth_token: 'token' }],
    });

    const res = await request(app)
      .post('/sms/webhook/status')
      .set('Host', 'example.com')
      .send({ MessageSid: 'sid', MessageStatus: 'delivered' });

    expect(res.status).toBe(200);
    expect(updateStatusMock).toHaveBeenCalled();
  });

  it('GET /sms/settings returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/sms/settings');

    expect(res.status).toBe(500);
  });

  it('PUT /sms/settings rejects invalid payload', async () => {
    const res = await request(app).put('/sms/settings').send({ reminderHoursBefore: 'bad' });

    expect(res.status).toBe(400);
  });

  it('PUT /sms/settings returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/sms/settings').send({ isActive: true });

    expect(res.status).toBe(404);
  });

  it('PUT /sms/settings returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).put('/sms/settings').send({ isActive: true });

    expect(res.status).toBe(500);
  });

  it('POST /sms/test-connection returns 500 on error', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ twilio_account_sid: 'sid', twilio_auth_token: 'token' }],
    });
    twilioServiceMock.testConnection.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/sms/test-connection').send({});

    expect(res.status).toBe(500);
  });

  it('POST /sms/send rejects invalid payload', async () => {
    const res = await request(app).post('/sms/send').send({ messageBody: 'Hello' });

    expect(res.status).toBe(400);
  });

  it('POST /sms/send returns 500 on error', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ phone: '5550100', first_name: 'Pat', last_name: 'Lee' }],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ twilio_account_sid: 'sid', twilio_auth_token: 'token', twilio_phone_number: '+1555', is_active: true }],
      });
    twilioServiceMock.sendSMS.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/sms/send').send({
      patientId: '00000000-0000-4000-8000-000000000001',
      messageBody: 'Hello',
    });

    expect(res.status).toBe(500);
  });

  it('GET /sms/messages supports filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'm1' }] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });

    const res = await request(app)
      .get('/sms/messages')
      .query({
        patientId: 'p1',
        direction: 'inbound',
        messageType: 'reminder',
        status: 'sent',
        limit: '10',
        offset: '5',
      });

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it('GET /sms/messages returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/sms/messages');

    expect(res.status).toBe(500);
  });

  it('GET /sms/messages/patient/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/sms/messages/patient/p1');

    expect(res.status).toBe(500);
  });

  it('GET /sms/conversations returns 500 on error', async () => {
    queryMock.mockRejectedValue(new Error('boom'));

    const res = await request(app).get('/sms/conversations');

    expect(res.status).toBe(500);
  });

  it('GET /sms/conversations/:patientId returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/sms/conversations/p1');

    expect(res.status).toBe(500);
  });

  it('POST /sms/conversations/:patientId/send returns 404 when patient missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/sms/conversations/p1/send').send({ message: 'Hi' });

    expect(res.status).toBe(404);
  });

  it('POST /sms/conversations/:patientId/send returns 400 when no phone', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ phone: null, first_name: 'Pat', last_name: 'Lee' }],
    });

    const res = await request(app).post('/sms/conversations/p1/send').send({ message: 'Hi' });

    expect(res.status).toBe(400);
  });

  it('POST /sms/conversations/:patientId/send returns 400 when opted out', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ phone: '5550100', first_name: 'Pat', last_name: 'Lee' }],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: false }],
      });

    const res = await request(app).post('/sms/conversations/p1/send').send({ message: 'Hi' });

    expect(res.status).toBe(400);
  });

  it('POST /sms/conversations/:patientId/send returns 400 when settings inactive', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ phone: '5550100', first_name: 'Pat', last_name: 'Lee' }],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ is_active: false }],
      });

    const res = await request(app).post('/sms/conversations/p1/send').send({ message: 'Hi' });

    expect(res.status).toBe(400);
  });

  it('POST /sms/conversations/:patientId/send returns 500 on error', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ phone: '5550100', first_name: 'Pat', last_name: 'Lee' }],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: true }],
      })
      .mockResolvedValueOnce({
        rows: [{ twilio_account_sid: 'sid', twilio_auth_token: 'token', twilio_phone_number: '+1555', is_active: true }],
      });
    twilioServiceMock.sendSMS.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/sms/conversations/p1/send').send({ message: 'Hi' });

    expect(res.status).toBe(500);
  });

  it('PUT /sms/conversations/:patientId/mark-read returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).put('/sms/conversations/p1/mark-read');

    expect(res.status).toBe(500);
  });

  it('GET /sms/auto-responses returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/sms/auto-responses');

    expect(res.status).toBe(500);
  });

  it('PUT /sms/auto-responses/:id rejects invalid payload', async () => {
    const res = await request(app).put('/sms/auto-responses/a1').send({ responseText: '' });

    expect(res.status).toBe(400);
  });

  it('PUT /sms/auto-responses/:id updates response text', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ is_system_keyword: false }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/sms/auto-responses/a1').send({ responseText: 'Updated response' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PUT /sms/auto-responses/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).put('/sms/auto-responses/a1').send({ responseText: 'Updated response' });

    expect(res.status).toBe(500);
  });

  it('GET /sms/patient-preferences/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/sms/patient-preferences/p1');

    expect(res.status).toBe(500);
  });

  it('PUT /sms/patient-preferences/:id rejects invalid payload', async () => {
    const res = await request(app).put('/sms/patient-preferences/p1').send({ optedIn: 'yes' });

    expect(res.status).toBe(400);
  });

  it('PUT /sms/patient-preferences/:id updates opt-in details', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'pref-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/sms/patient-preferences/p1').send({
      optedIn: true,
      appointmentReminders: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PUT /sms/patient-preferences/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).put('/sms/patient-preferences/p1').send({ optedIn: false });

    expect(res.status).toBe(500);
  });

  it('POST /sms/send-reminder returns 500 on error', async () => {
    sendReminderMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/sms/send-reminder/a1');

    expect(res.status).toBe(500);
  });

  it('GET /sms/templates supports filters', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 't1' }] });

    const res = await request(app).get('/sms/templates').query({ category: 'reminder', activeOnly: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });

  it('GET /sms/templates returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/sms/templates');

    expect(res.status).toBe(500);
  });

  it('POST /sms/templates rejects invalid payload', async () => {
    const res = await request(app).post('/sms/templates').send({});

    expect(res.status).toBe(400);
  });

  it('POST /sms/templates rejects legacy body field', async () => {
    const res = await request(app).post('/sms/templates').send({
      name: 'Reminder',
      body: 'Legacy payload',
    });

    expect(res.status).toBe(400);
  });

  it('POST /sms/templates returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/sms/templates').send({
      name: 'Reminder',
      messageBody: 'Hello',
    });

    expect(res.status).toBe(500);
  });

  it('PATCH /sms/templates/:id rejects invalid payload', async () => {
    const res = await request(app).patch('/sms/templates/t1').send({ name: 123 });

    expect(res.status).toBe(400);
  });

  it('PATCH /sms/templates/:id updates fields', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ is_system_template: false }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).patch('/sms/templates/t1').send({
      name: 'Updated',
      description: 'Updated desc',
      messageBody: 'Updated body',
      category: 'alerts',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH /sms/templates/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).patch('/sms/templates/t1').send({ isActive: false });

    expect(res.status).toBe(500);
  });

  it('DELETE /sms/templates/:id returns 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete('/sms/templates/t1');

    expect(res.status).toBe(404);
  });

  it('DELETE /sms/templates/:id returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).delete('/sms/templates/t1');

    expect(res.status).toBe(500);
  });

  it('POST /sms/send-bulk rejects invalid payload', async () => {
    const res = await request(app).post('/sms/send-bulk').send({ messageBody: 'Hello' });

    expect(res.status).toBe(400);
  });

  it('POST /sms/send-bulk rejects legacy message field', async () => {
    const res = await request(app).post('/sms/send-bulk').send({
      patientIds: ['00000000-0000-4000-8000-000000000001'],
      message: 'Legacy payload',
    });

    expect(res.status).toBe(400);
  });

  it('POST /sms/send-bulk returns 400 when settings inactive', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ is_active: false }],
    });

    const res = await request(app).post('/sms/send-bulk').send({
      patientIds: ['00000000-0000-4000-8000-000000000001'],
      messageBody: 'Hello',
    });

    expect(res.status).toBe(400);
  });

  it('POST /sms/send-bulk counts failures for no phone and opted out', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ twilio_account_sid: 'sid', twilio_auth_token: 'token', twilio_phone_number: '+1555', is_active: true }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'p1', phone: null, first_name: 'Pat', last_name: 'Lee' },
          { id: 'p2', phone: '5550100', first_name: 'Sam', last_name: 'Lee' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: false }],
      });

    const res = await request(app).post('/sms/send-bulk').send({
      patientIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'],
      messageBody: 'Hello',
    });

    expect(res.status).toBe(200);
    expect(res.body.results.failed).toBe(2);
  });

  it('POST /sms/send-bulk handles send errors', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ twilio_account_sid: 'sid', twilio_auth_token: 'token', twilio_phone_number: '+1555', is_active: true }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'p1', phone: '5550100', first_name: 'Pat', last_name: 'Lee' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ opted_in: true }],
      });
    twilioServiceMock.sendSMS.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/sms/send-bulk').send({
      patientIds: ['00000000-0000-4000-8000-000000000001'],
      messageBody: 'Hello',
    });

    expect(res.status).toBe(200);
    expect(res.body.results.failed).toBe(1);
  });

  it('POST /sms/send-bulk returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/sms/send-bulk').send({
      patientIds: ['00000000-0000-4000-8000-000000000001'],
      messageBody: 'Hello',
    });

    expect(res.status).toBe(500);
  });

  it('GET /sms/scheduled supports status filter', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 's1' }] });

    const res = await request(app).get('/sms/scheduled').query({ status: 'scheduled' });

    expect(res.status).toBe(200);
    expect(res.body.scheduled).toHaveLength(1);
  });

  it('GET /sms/scheduled returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/sms/scheduled');

    expect(res.status).toBe(500);
  });

  it('POST /sms/scheduled rejects invalid payload', async () => {
    const res = await request(app).post('/sms/scheduled').send({
      messageBody: '',
      scheduledSendTime: 'bad',
    });

    expect(res.status).toBe(400);
  });

  it('POST /sms/scheduled rejects legacy scheduledFor field', async () => {
    const res = await request(app).post('/sms/scheduled').send({
      patientId: '00000000-0000-4000-8000-000000000001',
      messageBody: 'Hello',
      scheduledFor: '2024-01-01T10:00:00Z',
    });

    expect(res.status).toBe(400);
  });

  it('POST /sms/scheduled returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/sms/scheduled').send({
      patientId: '00000000-0000-4000-8000-000000000001',
      messageBody: 'Hello',
      scheduledSendTime: '2024-01-01T10:00:00Z',
    });

    expect(res.status).toBe(500);
  });

  it('DELETE /sms/scheduled returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).delete('/sms/scheduled/s1');

    expect(res.status).toBe(500);
  });
});
