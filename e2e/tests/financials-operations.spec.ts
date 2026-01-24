import { test, expect } from '../fixtures/auth.fixture';

test.describe('Financials & Operations', () => {
  test('financials hub tabs and quick actions respond', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/financials');
    await expect(
      authenticatedPage.getByRole('heading', { name: /financial management/i })
    ).toBeVisible();

    await authenticatedPage.getByRole('button', { name: /quick actions/i }).click();
    await expect(authenticatedPage.getByText(/quick actions menu opened/i)).toBeVisible();

    await authenticatedPage.getByRole('button', { name: /generate report/i }).click();
    await expect(
      authenticatedPage.getByRole('heading', { name: /financial reports/i })
    ).toBeVisible();

    const tabChecks = [
      { label: 'Overview', heading: /revenue cycle management/i },
      { label: 'Bills', heading: /patient bills/i },
      { label: 'Payments', heading: /patient payments/i },
      { label: 'Analytics', heading: /premium analytics/i },
      { label: 'Fee Schedule', heading: /fee schedule management/i },
      { label: 'Statements', heading: /patient statements/i },
      { label: 'Reports', heading: /financial reports/i },
    ];

    const nav = authenticatedPage.locator('nav');
    for (const tab of tabChecks) {
      await nav.getByRole('button', { name: new RegExp(`^${tab.label}`, 'i') }).click();
      await expect(authenticatedPage.getByRole('heading', { name: tab.heading })).toBeVisible();
    }
  });

  test('claims page tabs and claim detail modal', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/claims');
    await expect(
      authenticatedPage.getByRole('heading', { name: /claims management/i })
    ).toBeVisible();

    await authenticatedPage.getByRole('button', { name: /payment posting/i }).click();
    await expect(authenticatedPage.getByText(/recent payments/i)).toBeVisible();

    await authenticatedPage.getByRole('button', { name: /claims list/i }).click();
    await expect(authenticatedPage.getByText(/status filter/i)).toBeVisible();

    const viewButtons = authenticatedPage.getByRole('button', { name: /^view$/i });
    if ((await viewButtons.count()) > 0) {
      await viewButtons.first().click();
      await expect(authenticatedPage.getByRole('dialog')).toBeVisible();
      await authenticatedPage.getByLabel(/close modal/i).click();
    } else {
      await expect(authenticatedPage.getByText(/no claims found/i)).toBeVisible();
    }
  });

  test('inventory modals and cabinets toggles respond', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/inventory');
    await expect(
      authenticatedPage.getByRole('heading', { name: /inventory management/i })
    ).toBeVisible();

    await authenticatedPage.getByRole('button', { name: /record usage/i }).click();
    await expect(
      authenticatedPage.getByRole('heading', { name: /record inventory usage/i })
    ).toBeVisible();
    await authenticatedPage.getByLabel(/close modal/i).click();

    await authenticatedPage.getByRole('button', { name: /add item/i }).click();
    await expect(
      authenticatedPage.getByRole('heading', { name: /add inventory item/i })
    ).toBeVisible();
    await authenticatedPage.getByRole('button', { name: /^cancel$/i }).click();

    await authenticatedPage.getByRole('button', { name: /preferred cabinets/i }).click();
    await expect(
      authenticatedPage.locator('.panel-title', { hasText: 'Preferred Cabinets' })
    ).toBeVisible();

    const addButtons = authenticatedPage.getByRole('button', { name: /^add$/i });
    if ((await addButtons.count()) > 0) {
      await addButtons.first().click();
      await expect(authenticatedPage.getByText(/added .* to preferred cabinets/i)).toBeVisible();

      const removeButtons = authenticatedPage.getByRole('button', { name: /^remove$/i });
      if ((await removeButtons.count()) > 0) {
        await removeButtons.first().click();
        await expect(authenticatedPage.getByText(/removed .* from preferred cabinets/i)).toBeVisible();
      }
    }
  });
});
