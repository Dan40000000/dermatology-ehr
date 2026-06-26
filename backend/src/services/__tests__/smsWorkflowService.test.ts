process.env.PATIENT_SCHEDULING_TIME_ZONE = 'America/Denver';

import { pool } from '../../db/pool';
import { SMS_TEMPLATES, processScheduledReminders, smsWorkflowService } from '../smsWorkflowService';
import { assertSmsContentSafe, normalizeSmsTemplateForMinimumNecessary } from '../../utils/smsPrivacyGuard';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;
const connectMock = pool.connect as jest.Mock;
const clientQueryMock = jest.fn();
const clientReleaseMock = jest.fn();

describe('smsWorkflowService templates', () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectMock.mockReset();
    clientQueryMock.mockReset();
    clientReleaseMock.mockReset();
    connectMock.mockResolvedValue({
      query: clientQueryMock,
      release: clientReleaseMock,
    });
    clientQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('keeps all default outbound SMS templates minimum necessary', () => {
    const unsafeTemplates: string[] = [];

    for (const [name, template] of Object.entries(SMS_TEMPLATES)) {
      const normalized = normalizeSmsTemplateForMinimumNecessary(template);
      try {
        assertSmsContentSafe(normalized);
      } catch {
        unsafeTemplates.push(name);
      }
    }

    expect(unsafeTemplates).toEqual([]);
  });

  it('uses scheduled_start for appointment confirmation timestamps when present', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await smsWorkflowService.sendAppointmentConfirmation('tenant-1', 'appt-1');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(a.scheduled_start, a.start_time) as start_time'),
      ['appt-1', 'tenant-1']
    );
  });

  it('formats appointment confirmations in the practice timezone', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: 'appt-1',
          patient_id: 'patient-1',
          start_time: new Date('2026-06-29T16:00:00.000Z'),
          provider_name: 'Dr. Smith',
          location_name: 'Home Clinic',
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{
          tenant_id: 'tenant-1',
          twilio_phone_number: '+15550001111',
          is_test_mode: true,
          clinic_name: 'Clinic',
          clinic_phone: '541-754-9454',
          portal_url: '',
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ opted_in: true, appointment_reminders: true }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: 'patient-1', first_name: 'Daniel', last_name: 'Perry', phone: '5412318693', email: 'dan@example.com' }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    clientQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await smsWorkflowService.sendAppointmentConfirmation('tenant-1', 'appt-1');

    expect(result.success).toBe(true);
    const insertCall = queryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO sms_messages'));
    expect(insertCall?.[1][6]).toContain('Monday, June 29 at 10:00 AM');
    expect(insertCall?.[1][6]).not.toContain('4:00 PM');
  });

  it('does not send duplicate appointment confirmations for the same appointment', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'appt-1',
        patient_id: 'patient-1',
        start_time: new Date('2026-06-29T16:00:00.000Z'),
        provider_name: 'Dr. Smith',
        location_name: 'Home Clinic',
      }],
      rowCount: 1,
    });
    clientQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-message-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await smsWorkflowService.sendAppointmentConfirmation('tenant-1', 'appt-1');

    expect(result).toEqual({ success: true, messageId: 'existing-message-1', duplicate: true });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(clientReleaseMock).toHaveBeenCalled();
  });

  it('uses scheduled_start for appointment reminder timestamps when present', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await smsWorkflowService.sendAppointmentReminder('tenant-1', 'appt-1', '24h');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(a.scheduled_start, a.start_time) as start_time'),
      ['appt-1', 'tenant-1']
    );
  });

  it('marks failed scheduled reminders when older clean schemas lack error_message', async () => {
    const sendReminderSpy = jest
      .spyOn(smsWorkflowService, 'sendAppointmentReminder')
      .mockResolvedValueOnce({ success: false, error: 'Twilio not ready' });

    queryMock.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM scheduled_reminders sr')) {
        return Promise.resolve({
          rows: [{
            id: 'reminder-1',
            tenant_id: 'tenant-1',
            appointment_id: 'appt-1',
            reminder_type: '24h',
            patient_id: 'patient-1',
            appointment_status: 'scheduled',
          }],
          rowCount: 1,
        });
      }

      if (sql.includes("error_message = $1")) {
        return Promise.reject({ code: '42703', message: 'column "error_message" does not exist' });
      }

      if (sql.includes("UPDATE scheduled_reminders SET status = 'failed' WHERE id = $1")) {
        expect(params).toEqual(['reminder-1']);
        return Promise.resolve({ rows: [], rowCount: 1 });
      }

      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    await expect(processScheduledReminders()).resolves.toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(sendReminderSpy).toHaveBeenCalledWith('tenant-1', 'appt-1', '24h');

    sendReminderSpy.mockRestore();
  });
});
