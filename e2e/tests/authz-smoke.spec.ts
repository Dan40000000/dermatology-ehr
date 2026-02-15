import { test, expect, type Page } from '@playwright/test';

type MockRole = 'admin' | 'provider' | 'front_desk';

const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6ImF1dGh6LXNtb2tlLXVzZXIifQ.signature';

async function installMockSession(page: Page, role: MockRole) {
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
            tenantId: 'tenant-demo',
          },
        }),
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
    ({ token, userRole }: { token: string; userRole: MockRole }) => {
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
          },
        })
      );
    },
    { token: MOCK_ACCESS_TOKEN, userRole: role }
  );
}

test.describe('AuthZ Smoke', () => {
  test('unauthenticated users are redirected to login on protected routes', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/i);
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('provider role is blocked from admin and redirected to home', async ({ page }) => {
    await installMockSession(page, 'provider');
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/home/i);
  });

  test('front desk role can access financials', async ({ page }) => {
    await installMockSession(page, 'front_desk');
    await page.goto('/financials');

    await expect(page).toHaveURL(/\/financials/i);
    await expect(page.getByRole('heading', { name: /financial management/i })).toBeVisible();
  });

  test('admin role can access admin settings', async ({ page }) => {
    await installMockSession(page, 'admin');
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/admin/i);
    await expect(page.getByText(/admin settings/i)).toBeVisible();
  });
});
