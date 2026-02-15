import { test, expect } from '../fixtures/auth.fixture';

test.describe('Text Messages Write Smoke', () => {
  test('conversation send, template create, and scheduling flows persist across UI refresh', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/text-messages');
    await expect(authenticatedPage).toHaveURL(/\/text-messages/i);
    await expect(authenticatedPage.getByRole('heading', { name: /text messages/i })).toBeVisible();

    const mutationResult = await authenticatedPage.evaluate(async () => {
      const sendResponse = await fetch('/api/sms/conversations/patient-smoke-1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Smoke outbound ping',
        }),
      });

      const templateResponse = await fetch('/api/sms/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Smoke Followup',
          category: 'general_communication',
          messageBody: 'Smoke follow-up message for {patientName}',
        }),
      });
      const templatePayload = (await templateResponse.json()) as { templateId?: string };

      const scheduleResponse = await fetch('/api/sms/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: 'patient-smoke-1',
          messageBody: 'Scheduled smoke reminder',
          scheduledSendTime: '2026-02-15T09:30:00.000Z',
        }),
      });
      const schedulePayload = (await scheduleResponse.json()) as { scheduledId?: string };

      const templatesResponse = await fetch('/api/sms/templates');
      const templatesPayload = (await templatesResponse.json()) as {
        templates?: Array<{ id?: string; name?: string }>;
      };
      const scheduledListResponse = await fetch('/api/sms/scheduled?status=scheduled');
      const scheduledListPayload = (await scheduledListResponse.json()) as {
        scheduled?: Array<{ id?: string; messageBody?: string; status?: string }>;
      };
      const auditSummaryResponse = await fetch('/api/sms-audit/summary');
      const auditSummaryPayload = (await auditSummaryResponse.json()) as { messagesSent?: number };

      return {
        sendCode: sendResponse.status,
        templateCode: templateResponse.status,
        scheduleCode: scheduleResponse.status,
        templateId: templatePayload.templateId || '',
        scheduledId: schedulePayload.scheduledId || '',
        hasTemplate:
          (templatesPayload.templates || []).some(
            (template) => template.id === templatePayload.templateId && template.name === 'Smoke Followup'
          ),
        hasScheduledMessage:
          (scheduledListPayload.scheduled || []).some(
            (scheduled) =>
              scheduled.id === schedulePayload.scheduledId &&
              scheduled.messageBody === 'Scheduled smoke reminder' &&
              scheduled.status === 'scheduled'
          ),
        messagesSentCount: Number(auditSummaryPayload.messagesSent) || 0,
      };
    });

    expect(mutationResult.sendCode).toBe(200);
    expect(mutationResult.templateCode).toBe(200);
    expect(mutationResult.scheduleCode).toBe(200);
    expect(mutationResult.templateId).not.toBe('');
    expect(mutationResult.scheduledId).not.toBe('');
    expect(mutationResult.hasTemplate).toBe(true);
    expect(mutationResult.hasScheduledMessage).toBe(true);
    expect(mutationResult.messagesSentCount).toBeGreaterThan(0);

    await authenticatedPage.goto('/text-messages');
    await expect(authenticatedPage.getByText('Smoke outbound ping')).toBeVisible();
  });
});
