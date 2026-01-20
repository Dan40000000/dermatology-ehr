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
