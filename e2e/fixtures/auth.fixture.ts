import { test as base, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { TEST_USERS } from './testData';

type AuthFixtures = {
  authenticatedPage: Page;
  loginPage: LoginPage;
};

/**
 * Custom fixture that provides an authenticated page session
 * This helps avoid logging in for every test
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    if (process.env.PLAYWRIGHT_MOCK_AUTH) {
      await page.addInitScript(() => {
        localStorage.setItem(
          'derm_session',
          JSON.stringify({
            tenantId: 'tenant-demo',
            accessToken: 'playwright-token',
            refreshToken: 'playwright-refresh',
            user: {
              id: 'user-1',
              email: 'admin@demo.practice',
              fullName: 'Demo Admin',
              role: 'admin',
            },
          })
        );
      });
      await page.goto('/home');
      await page.waitForURL(/\/home/i);
      await use(page);
      return;
    }

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
    await page.waitForURL(/\/(home|dashboard)/i);
    await use(page);
  },

  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },
});

export { expect } from '@playwright/test';
