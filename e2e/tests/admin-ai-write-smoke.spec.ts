import { test, expect } from '../fixtures/auth.fixture';

test.describe('Admin AI Config Write Smoke', () => {
  test('create and update AI agent config mutations persist across admin page reload', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/admin/ai-agents');
    await expect(authenticatedPage).toHaveURL(/\/admin\/ai-agents/i);
    await expect(authenticatedPage.getByRole('heading', { name: /ai agent configurations/i })).toBeVisible();

    const mutationResult = await authenticatedPage.evaluate(async () => {
      const createResponse = await fetch('/api/ai-agent-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Smoke AI Config',
          description: 'Created by admin write smoke',
          specialtyFocus: 'general',
          aiModel: 'claude-3-5-sonnet-20241022',
          temperature: 0.25,
          maxTokens: 3000,
          systemPrompt: 'You are a dermatology assistant focused on concise clinical notes.',
          promptTemplate: 'Summarize transcript into SOAP sections: {{transcript}}',
          noteSections: ['chiefComplaint', 'hpi', 'assessment', 'plan'],
          outputFormat: 'soap',
          verbosityLevel: 'standard',
          includeCodes: true,
        }),
      });
      const createPayload = (await createResponse.json()) as { configuration?: { id?: string } };
      const configId = createPayload.configuration?.id || '';

      const updateResponse = configId
        ? await fetch(`/api/ai-agent-configs/${configId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'Smoke AI Config Updated',
              isActive: false,
            }),
          })
        : null;

      const listResponse = await fetch('/api/ai-agent-configs?activeOnly=false');
      const listPayload = (await listResponse.json()) as {
        configurations?: Array<{ id?: string; name?: string; isActive?: boolean }>;
      };
      const updatedConfig = (listPayload.configurations || []).find((item) => item.id === configId);

      return {
        createCode: createResponse.status,
        updateCode: updateResponse?.status ?? 0,
        configId,
        updatedName: updatedConfig?.name || '',
        updatedActive: updatedConfig?.isActive ?? null,
      };
    });

    expect(mutationResult.createCode).toBe(201);
    expect(mutationResult.updateCode).toBe(200);
    expect(mutationResult.configId).not.toBe('');
    expect(mutationResult.updatedName).toBe('Smoke AI Config Updated');
    expect(mutationResult.updatedActive).toBe(false);

    await authenticatedPage.goto('/admin/ai-agents');
    const updatedRow = authenticatedPage.locator('tr', { hasText: 'Smoke AI Config Updated' }).first();
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow).toContainText('Inactive');
  });
});
