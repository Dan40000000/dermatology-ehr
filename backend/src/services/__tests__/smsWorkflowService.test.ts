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

  it('uses scheduled_start for appointment reminder timestamps when present', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await smsWorkflowService.sendAppointmentReminder('tenant-1', 'appt-1', '24h');

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(a.scheduled_start, a.start_time) as start_time'),
      ['appt-1', 'tenant-1']
    );
  });
});
