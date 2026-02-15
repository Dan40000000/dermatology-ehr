import { test, expect } from '../fixtures/auth.fixture';

test.describe('Referrals Write Smoke', () => {
  test('create and update referral mutations are reflected in referrals UI', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/referrals');
    await expect(authenticatedPage).toHaveURL(/\/referrals/i);
    await expect(authenticatedPage.getByRole('heading', { name: /^referrals$/i })).toBeVisible();

    const seededRow = authenticatedPage.locator('tr', { hasText: 'Smoke' });
    await expect(seededRow).toContainText(/new/i);

    const mutationResult = await authenticatedPage.evaluate(async () => {
      const createResponse = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: 'patient-smoke-1',
          direction: 'outgoing',
          status: 'scheduled',
          priority: 'urgent',
          referredToProvider: 'Dr. Rheumatology',
          referredToOrganization: 'Rheumatology Group',
          reason: 'Rheumatology consult',
          notes: 'Created by referral smoke test',
        }),
      });

      const createPayload = await createResponse.json() as { referral?: { id?: string } };
      const createdReferralId = createPayload.referral?.id || '';

      const updateResponse = createdReferralId
        ? await fetch(`/api/referrals/${createdReferralId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'in_progress',
              priority: 'stat',
              notes: 'Escalated by referral smoke test',
            }),
          })
        : null;

      const filteredListResponse = await fetch('/api/referrals?status=in_progress');
      const filteredListPayload = await filteredListResponse.json() as {
        referrals?: Array<{ id?: string; status?: string; priority?: string; reason?: string }>;
      };

      const matchingReferral = filteredListPayload.referrals?.find((item) => item.id === createdReferralId);

      return {
        createCode: createResponse.status,
        updateCode: updateResponse?.status ?? 0,
        createdReferralId,
        updatedStatus: matchingReferral?.status || '',
        updatedPriority: matchingReferral?.priority || '',
      };
    });

    expect(mutationResult.createCode).toBe(200);
    expect(mutationResult.updateCode).toBe(200);
    expect(mutationResult.createdReferralId).not.toBe('');
    expect(mutationResult.updatedStatus).toBe('in_progress');
    expect(mutationResult.updatedPriority).toBe('stat');

    await authenticatedPage.goto('/referrals');
    const updatedRow = authenticatedPage.locator('tr', { hasText: 'Rheumatology consult' });
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow).toContainText(/in progress/i);
    await expect(updatedRow).toContainText(/STAT/i);
  });
});
