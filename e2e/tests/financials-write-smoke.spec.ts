import { test, expect } from '../fixtures/auth.fixture';

test.describe('Financials Write Smoke', () => {
  test('claims status update and payment posting complete successfully', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/claims');
    await expect(authenticatedPage).toHaveURL(/\/claims/i);

    const claimRow = authenticatedPage.locator('tr', { hasText: 'CLM-SMOKE-001' });
    await expect(claimRow).toBeVisible();
    await expect(claimRow).toContainText(/submitted/i);

    const mutationResult = await authenticatedPage.evaluate(async () => {
      const statusResponse = await fetch('/api/claims/claim-smoke-1/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'accepted',
          notes: 'financials smoke status update',
        }),
      });

      const paymentResponse = await fetch('/api/claims/claim-smoke-1/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: 20000,
          paymentDate: '2026-02-14',
          paymentMethod: 'eft',
          payer: 'Demo Payer',
          checkNumber: 'SMOKE-CHK-1',
          notes: 'financials smoke payment',
        }),
      });

      return {
        statusCode: statusResponse.status,
        paymentCode: paymentResponse.status,
      };
    });

    expect(mutationResult.statusCode).toBe(200);
    expect(mutationResult.paymentCode).toBe(200);

    await authenticatedPage.goto('/claims');
    const paidClaimRow = authenticatedPage.locator('tr', { hasText: 'CLM-SMOKE-001' });
    await expect(paidClaimRow).toContainText(/paid/i);
    await expect(paidClaimRow.getByRole('button', { name: /post payment/i })).toHaveCount(0);
  });
});
