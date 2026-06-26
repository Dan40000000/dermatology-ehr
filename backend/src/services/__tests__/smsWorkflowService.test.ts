process.env.PATIENT_SCHEDULING_TIME_ZONE = 'America/Denver';

import { pool } from '../../db/pool';
import { SMS_TEMPLATES, smsWorkflowService } from '../smsWorkflowService';
import { assertSmsContentSafe, normalizeSmsTemplateForMinimumNecessary } from '../../utils/smsPrivacyGuard';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

describe('smsWorkflowService templates', () => {
  beforeEach(() => {
    queryMock.mockReset();
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

    const result = await smsWorkflowService.sendAppointmentConfirmation('tenant-1', 'appt-1');

    expect(result.success).toBe(true);
    const insertCall = queryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO sms_messages'));
    expect(insertCall?.[1][6]).toContain('Monday, June 29 at 10:00 AM');
    expect(insertCall?.[1][6]).not.toContain('4:00 PM');
  });

  it('uses scheduled_start for appointment reminder timestamps when present', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await smsWorkflowService.sendAppointmentReminder('tenant-1', 'appt-1', '24h');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(a.scheduled_start, a.start_time) as start_time'),
      ['appt-1', 'tenant-1']
    );
  });
});
