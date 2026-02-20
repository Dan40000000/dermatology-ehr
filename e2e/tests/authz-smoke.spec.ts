import { test, expect, type Page } from '@playwright/test';

type MockRole = 'admin' | 'provider' | 'front_desk' | 'ma' | 'billing';

interface MockSessionOptions {
  role: MockRole;
  secondaryRoles?: MockRole[];
}

const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6ImF1dGh6LXNtb2tlLXVzZXIifQ.signature';

async function installMockSession(page: Page, options: MockSessionOptions) {
  const { role, secondaryRoles = [] } = options;
  const effectiveRoles = [role, ...secondaryRoles.filter((candidate) => candidate !== role)];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/auth/refresh') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tokens: {
            accessToken: MOCK_ACCESS_TOKEN,
            refreshToken: 'playwright-refresh',
            expiresIn: 3600,
          },
          user: {
            id: 'user-authz-smoke',
            email: `${role}@demo.practice`,
            fullName: `Smoke ${role}`,
            role,
            secondaryRoles,
            roles: effectiveRoles,
            tenantId: 'tenant-demo',
          },
        }),
      });
      return;
    }

    if (path === '/api/patients') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ patients: [] }),
      });
      return;
    }

    if (path === '/api/ambient/recordings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recordings: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.addInitScript(
    ({ token, userRole, userSecondaryRoles, userRoles }: {
      token: string;
      userRole: MockRole;
      userSecondaryRoles: MockRole[];
      userRoles: MockRole[];
    }) => {
      localStorage.setItem(
        'derm_session',
        JSON.stringify({
          tenantId: 'tenant-demo',
          accessToken: token,
          refreshToken: 'playwright-refresh',
          user: {
            id: 'user-authz-smoke',
            email: `${userRole}@demo.practice`,
            fullName: `Smoke ${userRole}`,
            role: userRole,
            secondaryRoles: userSecondaryRoles,
            roles: userRoles,
          },
        })
      );
    },
    {
      token: MOCK_ACCESS_TOKEN,
      userRole: role,
      userSecondaryRoles: secondaryRoles,
      userRoles: effectiveRoles,
    }
  );
}

test.describe('AuthZ Smoke', () => {
  test('unauthenticated users are redirected to login on protected routes', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/i);
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('provider role is blocked from admin and redirected to home', async ({ page }) => {
    await installMockSession(page, { role: 'provider' });
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/home/i);
  });

  test('provider role is blocked from financials without a financial secondary role', async ({ page }) => {
    await installMockSession(page, { role: 'provider' });
    await page.goto('/financials');

    await expect(page).toHaveURL(/\/home/i);
  });

  test('provider role can access ambient scribe workspace', async ({ page }) => {
    await installMockSession(page, { role: 'provider' });
    await page.goto('/ambient-scribe');

    await expect(page).toHaveURL(/\/ambient-scribe/i);
    await expect(page.getByRole('heading', { name: /ambient ai medical scribe/i })).toBeVisible();
  });

  test('provider role with billing secondary role can access financials', async ({ page }) => {
    await installMockSession(page, { role: 'provider', secondaryRoles: ['billing'] });
    await page.goto('/financials');

    await expect(page).toHaveURL(/\/financials/i);
    await expect(page.getByRole('heading', { name: /financial management/i })).toBeVisible();
  });

  test('medical assistant role is blocked from financials', async ({ page }) => {
    await installMockSession(page, { role: 'ma' });
    await page.goto('/financials');

    await expect(page).toHaveURL(/\/home/i);
  });

  test('front desk role can access financials', async ({ page }) => {
    await installMockSession(page, { role: 'front_desk' });
    await page.goto('/financials');

    await expect(page).toHaveURL(/\/financials/i);
    await expect(page.getByRole('heading', { name: /financial management/i })).toBeVisible();
  });

  test('front desk role is blocked from ambient scribe', async ({ page }) => {
    await installMockSession(page, { role: 'front_desk' });
    await page.goto('/ambient-scribe');

    await expect(page).toHaveURL(/\/home/i);
  });

  test('admin role can access admin settings', async ({ page }) => {
    await installMockSession(page, { role: 'admin' });
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/admin/i);
    await expect(page.getByText(/admin settings/i)).toBeVisible();
  });
});
