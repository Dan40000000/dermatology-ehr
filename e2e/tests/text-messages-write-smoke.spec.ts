import { test, expect } from '../fixtures/auth.fixture';

test.describe('Text Messages Write Smoke', () => {
  test('conversation, templates, scheduling, rules, and settings flows persist across UI refresh', async ({
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

      const settingsBeforeResponse = await fetch('/api/sms/settings');
      const settingsBefore = (await settingsBeforeResponse.json()) as {
        reminderHoursBefore?: number;
        isTestMode?: boolean;
        allowPatientReplies?: boolean;
      };

      const settingsUpdateResponse = await fetch('/api/sms/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reminderHoursBefore: 36,
          isTestMode: false,
          allowPatientReplies: false,
          reminderTemplate: 'Smoke reminder template v2',
        }),
      });

      const settingsAfterResponse = await fetch('/api/sms/settings');
      const settingsAfter = (await settingsAfterResponse.json()) as {
        reminderHoursBefore?: number;
        isTestMode?: boolean;
        allowPatientReplies?: boolean;
        reminderTemplate?: string;
      };

      const autoResponsesResponse = await fetch('/api/sms/auto-responses');
      const autoResponsesPayload = (await autoResponsesResponse.json()) as {
        autoResponses?: Array<{ id?: string; keyword?: string; isSystemKeyword?: boolean }>;
      };
      const editableRule = (autoResponsesPayload.autoResponses || []).find((rule) => !rule.isSystemKeyword);

      let autoResponseUpdateCode = 0;
      if (editableRule?.id) {
        const autoResponseUpdateResponse = await fetch(`/api/sms/auto-responses/${editableRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            responseText: 'Smoke HELP response updated',
            isActive: false,
          }),
        });
        autoResponseUpdateCode = autoResponseUpdateResponse.status;
      }

      const autoResponsesAfterResponse = await fetch('/api/sms/auto-responses');
      const autoResponsesAfterPayload = (await autoResponsesAfterResponse.json()) as {
        autoResponses?: Array<{ id?: string; responseText?: string; isActive?: boolean }>;
      };

      const reminderWorkflowResponse = await fetch('/api/sms/workflow/process-reminders', { method: 'POST' });
      const reminderWorkflowPayload = (await reminderWorkflowResponse.json()) as { sent?: number };

      const followupWorkflowResponse = await fetch('/api/sms/workflow/process-followups', { method: 'POST' });
      const followupWorkflowPayload = (await followupWorkflowResponse.json()) as { sent?: number };

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
        settingsBeforeCode: settingsBeforeResponse.status,
        settingsUpdateCode: settingsUpdateResponse.status,
        settingsAfterCode: settingsAfterResponse.status,
        settingsChanged:
          settingsBefore.reminderHoursBefore !== settingsAfter.reminderHoursBefore &&
          settingsAfter.reminderHoursBefore === 36 &&
          settingsAfter.isTestMode === false &&
          settingsAfter.allowPatientReplies === false &&
          settingsAfter.reminderTemplate === 'Smoke reminder template v2',
        autoResponsesCode: autoResponsesResponse.status,
        autoResponseUpdateCode,
        hasUpdatedAutoResponse:
          (autoResponsesAfterPayload.autoResponses || []).some(
            (rule) =>
              rule.id === editableRule?.id &&
              rule.responseText === 'Smoke HELP response updated' &&
              rule.isActive === false
          ),
        reminderWorkflowCode: reminderWorkflowResponse.status,
        reminderWorkflowSent: Number(reminderWorkflowPayload.sent) || 0,
        followupWorkflowCode: followupWorkflowResponse.status,
        followupWorkflowSent: Number(followupWorkflowPayload.sent) || 0,
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
    expect(mutationResult.settingsBeforeCode).toBe(200);
    expect(mutationResult.settingsUpdateCode).toBe(200);
    expect(mutationResult.settingsAfterCode).toBe(200);
    expect(mutationResult.settingsChanged).toBe(true);
    expect(mutationResult.autoResponsesCode).toBe(200);
    expect(mutationResult.autoResponseUpdateCode).toBe(200);
    expect(mutationResult.hasUpdatedAutoResponse).toBe(true);
    expect(mutationResult.reminderWorkflowCode).toBe(200);
    expect(mutationResult.reminderWorkflowSent).toBeGreaterThan(0);
    expect(mutationResult.followupWorkflowCode).toBe(200);
    expect(mutationResult.followupWorkflowSent).toBeGreaterThan(0);
    expect(mutationResult.templateId).not.toBe('');
    expect(mutationResult.scheduledId).not.toBe('');
    expect(mutationResult.hasTemplate).toBe(true);
    expect(mutationResult.hasScheduledMessage).toBe(true);
    expect(mutationResult.messagesSentCount).toBeGreaterThan(0);

    await authenticatedPage.goto('/text-messages');
    await expect(authenticatedPage.getByText('Smoke outbound ping')).toBeVisible();
    const persistedResult = await authenticatedPage.evaluate(async () => {
      const settingsRes = await fetch('/api/sms/settings');
      const settingsPayload = (await settingsRes.json()) as {
        reminderHoursBefore?: number;
        isTestMode?: boolean;
        allowPatientReplies?: boolean;
        reminderTemplate?: string;
      };

      const rulesRes = await fetch('/api/sms/auto-responses');
      const rulesPayload = (await rulesRes.json()) as {
        autoResponses?: Array<{ keyword?: string; responseText?: string; isActive?: boolean }>;
      };
      const helpRule = (rulesPayload.autoResponses || []).find((rule) => rule.keyword === 'HELP');

      return {
        settingsCode: settingsRes.status,
        rulesCode: rulesRes.status,
        settingsPersisted:
          settingsPayload.reminderHoursBefore === 36 &&
          settingsPayload.isTestMode === false &&
          settingsPayload.allowPatientReplies === false &&
          settingsPayload.reminderTemplate === 'Smoke reminder template v2',
        helpRulePersisted:
          helpRule?.responseText === 'Smoke HELP response updated' &&
          helpRule?.isActive === false,
      };
    });

    expect(persistedResult.settingsCode).toBe(200);
    expect(persistedResult.rulesCode).toBe(200);
    expect(persistedResult.settingsPersisted).toBe(true);
    expect(persistedResult.helpRulePersisted).toBe(true);
  });
});
