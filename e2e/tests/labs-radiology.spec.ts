import { test, expect } from '../fixtures/auth.fixture';
import type { Page, Route } from '@playwright/test';

const demoSession = {
  tenantId: 'tenant-demo',
  accessToken: 'playwright-token',
  refreshToken: 'playwright-refresh',
  user: {
    id: 'user-1',
    email: 'admin@demo.practice',
    fullName: 'Demo Admin',
    role: 'admin',
  },
};

const basePatients = [
  {
    id: 'patient-1',
    firstName: 'Riley',
    lastName: 'Stone',
    insurance: { planName: 'Aetna Gold' },
  },
  {
    id: 'patient-2',
    firstName: 'Avery',
    lastName: 'Klein',
    insurance: 'BCBS PPO',
  },
];

const baseEligibilityHistory = {
  'patient-1': {
    verification_status: 'active',
    verified_at: new Date().toISOString(),
    has_issues: false,
  },
  'patient-2': {
    verification_status: 'active',
    verified_at: new Date().toISOString(),
    has_issues: false,
  },
};

async function mockApi(
  page: Page,
  {
    orders,
    patients = basePatients,
    providers = [{ id: 'provider-1', name: 'Dr Demo' }],
    eligibilityHistory = baseEligibilityHistory,
  }: {
    orders: any[];
    patients?: any[];
    providers?: any[];
    eligibilityHistory?: Record<string, any | null>;
  }
) {
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (!url.pathname.startsWith('/api/')) {
      return route.continue();
    }

    if (url.pathname === '/api/orders' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ orders }),
      });
    }

    if (url.pathname === '/api/orders' && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'order-new' }),
      });
    }

    if (url.pathname.startsWith('/api/orders/') && url.pathname.endsWith('/status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }

    if (url.pathname === '/api/patients') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ patients }),
      });
    }

    if (url.pathname === '/api/providers') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ providers }),
      });
    }

    if (url.pathname === '/api/eligibility/history/batch') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, history: eligibilityHistory }),
      });
    }

    if (url.pathname === '/api/messaging/unread-count') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0 }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

test.describe('Labs + Radiology Flows', () => {
  test('labs page loads and manual entry creates an order', async ({ page }) => {
    const orders = [
      {
        id: 'order-path-1',
        patientId: 'patient-1',
        type: 'pathology',
        status: 'pending',
        details: 'Shave Biopsy',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'order-lab-1',
        patientId: 'patient-2',
        type: 'lab',
        status: 'pending',
        details: 'CBC with differential',
        createdAt: new Date().toISOString(),
      },
    ];

    await mockApi(page, { orders });
    await page.addInitScript((session) => {
      localStorage.setItem('derm_session', JSON.stringify(session));
    }, demoSession);

    await page.goto('/labs');

    await expect(page.getByRole('heading', { name: 'Pathology & Lab Orders' })).toBeVisible();
    await expect(page.getByText('Verified Active')).toBeVisible();

    await page.getByRole('button', { name: 'Lab' }).click();
    await expect(page.getByRole('button', { name: 'Lab' })).toBeVisible();

    await page.getByRole('button', { name: /Add Manual Entry/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add Manual Entry')).toBeVisible();

    const selects = dialog.locator('select');
    await selects.nth(0).selectOption('patient-1');
    await selects.nth(1).selectOption('Shave Biopsy');

    const createPromise = page.waitForResponse((resp) =>
      resp.url().includes('/api/orders') && resp.request().method() === 'POST'
    );
    await dialog.getByRole('button', { name: /Create Entry/i }).click();
    await createPromise;
  });

  test('radiology page loads and creates imaging order', async ({ page }) => {
    const orders = [
      {
        id: 'order-img-1',
        patientId: 'patient-1',
        type: 'imaging',
        status: 'ordered',
        details: 'Chest X-Ray\nIndication: Metastatic workup',
        createdAt: new Date().toISOString(),
      },
    ];

    await mockApi(page, { orders });
    await page.addInitScript((session) => {
      localStorage.setItem('derm_session', JSON.stringify(session));
    }, demoSession);

    await page.goto('/radiology');

    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
    await expect(page.getByText('Verified Active')).toBeVisible();

    await page.getByRole('button', { name: /New Order/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('New Imaging Order')).toBeVisible();

    const selects = dialog.locator('select');
    await selects.nth(0).selectOption('patient-1');
    await selects.nth(2).selectOption('Chest X-Ray');
    await dialog.getByPlaceholder('Reason for imaging...').fill('Routine baseline imaging');

    const createPromise = page.waitForResponse((resp) =>
      resp.url().includes('/api/orders') && resp.request().method() === 'POST'
    );
    await dialog.getByRole('button', { name: /Create Imaging Order/i }).click();
    await createPromise;
  });
});
