import { notificationService } from '../integrations/notificationService';
import { pool } from '../../db/pool';
import { slackService } from '../integrations/slackService';
import { teamsService } from '../integrations/teamsService';
import { logger } from '../../lib/logger';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../integrations/slackService', () => ({
  slackService: {
    sendNotification: jest.fn(),
    testConnection: jest.fn(),
  },
}));

jest.mock('../integrations/teamsService', () => ({
  teamsService: {
    sendNotification: jest.fn(),
    testConnection: jest.fn(),
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;
const slackSendMock = slackService.sendNotification as jest.Mock;
const teamsSendMock = teamsService.sendNotification as jest.Mock;
const slackTestMock = slackService.testConnection as jest.Mock;
const teamsTestMock = teamsService.testConnection as jest.Mock;

const context = {
  tenantId: 'tenant-1',
  notificationType: 'appointment_booked',
  data: { patientName: 'Pat' },
} as const;

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns early when no integrations are enabled', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await notificationService.sendNotification(context);

    expect(slackSendMock).not.toHaveBeenCalled();
    expect(teamsSendMock).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      'No integrations configured for notification',
      expect.objectContaining({
        tenantId: context.tenantId,
        notificationType: context.notificationType,
      })
    );
  });

  it('sends notifications to configured integrations', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'int-1',
            tenant_id: 'tenant-1',
            type: 'slack',
            webhook_url: 'https://slack',
            channel_name: 'alerts',
            enabled: true,
            notification_types: ['appointment_booked'],
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: 'int-2',
            tenant_id: 'tenant-1',
            type: 'teams',
            webhook_url: 'https://teams',
            channel_name: 'alerts',
            enabled: true,
            notification_types: ['appointment_booked'],
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      })
      .mockResolvedValue({ rows: [] });

    slackSendMock.mockResolvedValueOnce(undefined);
    teamsSendMock.mockResolvedValueOnce(undefined);

    await notificationService.sendNotification(context);

    expect(slackSendMock).toHaveBeenCalledWith('https://slack', context);
    expect(teamsSendMock).toHaveBeenCalledWith('https://teams', context);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO integration_notification_logs'),
      expect.any(Array)
    );
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it('returns not found when integration is missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await notificationService.testIntegration('int-1', 'tenant-1');

    expect(result).toEqual({ success: false, error: 'Integration not found' });
    expect(slackTestMock).not.toHaveBeenCalled();
    expect(teamsTestMock).not.toHaveBeenCalled();
  });

  it('tests a slack integration and logs the attempt', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'int-1',
            tenant_id: 'tenant-1',
            type: 'slack',
            webhook_url: 'https://slack',
            channel_name: 'alerts',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    slackTestMock.mockResolvedValueOnce(true);

    const result = await notificationService.testIntegration('int-1', 'tenant-1');

    expect(result).toEqual({ success: true });
    expect(slackTestMock).toHaveBeenCalledWith('https://slack');
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO integration_notification_logs'),
      expect.any(Array)
    );
  });

  it('returns logs and total counts with filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'log-1' }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] });

    const result = await notificationService.getNotificationLogs('tenant-1', {
      limit: 10,
      offset: 5,
      integrationId: 'int-1',
      success: true,
    });

    expect(result.logs).toEqual([{ id: 'log-1' }]);
    expect(result.total).toBe(2);
    expect(queryMock.mock.calls[0][0]).toContain('integration_id');
    expect(queryMock.mock.calls[0][0]).toContain('success =');
    expect(queryMock.mock.calls[0][1]).toEqual(['tenant-1', 'int-1', true, 10, 5]);
    expect(queryMock.mock.calls[1][1]).toEqual(['tenant-1', 'int-1', true]);
  });

  it('returns integration stats', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total_notifications: '5' }] });

    const result = await notificationService.getIntegrationStats('tenant-1', 'int-1');

    expect(result.total_notifications).toBe('5');
    expect(queryMock.mock.calls[0][0]).toContain('integration_notification_logs');
    expect(queryMock.mock.calls[0][0]).toContain('WHERE tenant_id = $1 AND integration_id = $2');
    expect(queryMock.mock.calls[0][1]).toEqual(['tenant-1', 'int-1']);
  });
});
