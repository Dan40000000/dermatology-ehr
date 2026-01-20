import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { HomePage } from '../pages/HomePage';
import { TEST_USERS } from '../fixtures/testData';

test.describe('Authentication - Comprehensive Tests', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test.describe('Login Page Display', () => {
    test('should display login page with all elements', async ({ page }) => {
      await loginPage.assertLoginPageVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('should have proper page title', async ({ page }) => {
      await expect(page).toHaveTitle(/Dermatology|EHR|DermApp/i);
    });
  });

  test.describe('Login Validation', () => {
    test('should show validation errors for empty credentials', async () => {
      await loginPage.submitEmptyForm();
      await loginPage.assertEmailValidationError();
    });

    test('should show error for invalid email format', async ({ page }) => {
      await page.getByLabel(/email/i).fill('invalid-email');
      await page.getByLabel(/password/i).fill('password123');
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should show validation or error message
      const errorMessage = page.getByText(/invalid|error/i);
      await expect(errorMessage.first()).toBeVisible();
    });

    test('should show error for missing password', async ({ page }) => {
      await page.getByLabel(/email/i).fill('test@example.com');
      await page.getByRole('button', { name: /sign in/i }).click();

      const errorMessage = page.getByText(/password.*required|required.*password/i);
      await expect(errorMessage.first()).toBeVisible();
    });
  });

  test.describe('Invalid Login Attempts', () => {
    test('should show error for invalid credentials', async () => {
      await loginPage.login(TEST_USERS.invalid.email, TEST_USERS.invalid.password);
      await loginPage.assertErrorVisible();
    });

    test('should show error for non-existent user', async () => {
      await loginPage.login('nonexistent@example.com', 'password123');
      await loginPage.assertErrorVisible();
    });

    test('should show error for correct email but wrong password', async () => {
      await loginPage.login(TEST_USERS.admin.email, 'wrongpassword');
      await loginPage.assertErrorVisible();
    });

    test('should remain on login page after failed login', async ({ page }) => {
      await loginPage.login(TEST_USERS.invalid.email, TEST_USERS.invalid.password);
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Successful Login', () => {
    test('should successfully login with valid admin credentials', async ({ page }) => {
      await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      await loginPage.waitForLoginSuccess();
      await expect(page).toHaveURL(/\/(home|dashboard)/i);
    });

    test('should redirect to home/dashboard after successful login', async ({ page }) => {
      await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      await page.waitForURL(/\/(home|dashboard)/i, { timeout: 10000 });

      const homePage = new HomePage(page);
      await homePage.assertHomePageVisible();
    });

    test('should display user information after login', async ({ page }) => {
      await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      await page.waitForURL(/\/(home|dashboard)/i);

      // Check for user name or role display
      const userInfo = page.locator('text=/admin|user|doctor/i').first();
      await expect(userInfo).toBeVisible();
    });
  });

  test.describe('Session Persistence', () => {
    test('should persist session on page reload', async ({ page }) => {
      await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      await page.waitForURL(/\/(home|dashboard)/i);

      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should still be on home/dashboard, not redirected to login
      await expect(page).toHaveURL(/\/(home|dashboard)/i);
    });

    test('should persist session when navigating between pages', async ({ page }) => {
      await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      await page.waitForURL(/\/(home|dashboard)/i);

      const homePage = new HomePage(page);

      // Navigate to different pages
      await homePage.goToPatients();
      await expect(page).toHaveURL(/\/patients/);

      await page.goBack();
      await expect(page).toHaveURL(/\/(home|dashboard)/i);

      // Should still be authenticated
      await homePage.assertUserLoggedIn();
    });

    test('should maintain session after browser navigation', async ({ page, context }) => {
      await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      await page.waitForURL(/\/(home|dashboard)/i);

      // Open new tab with same session
      const newPage = await context.newPage();
      await newPage.goto('/patients');

      // Should be authenticated in new tab
      await expect(newPage).toHaveURL(/\/patients/);
      await newPage.close();
    });
  });

  test.describe('Logout', () => {
    test('should successfully logout', async ({ page }) => {
      await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      await page.waitForURL(/\/(home|dashboard)/i);

      const homePage = new HomePage(page);
      await homePage.logout();

      // Should redirect to login page
      await expect(page).toHaveURL(/\/login|\//);
    });

    test('should clear session after logout', async ({ page }) => {
      await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      await page.waitForURL(/\/(home|dashboard)/i);

      const homePage = new HomePage(page);
      await homePage.logout();

      // Try to access protected page
      await page.goto('/patients');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test('should require login after logout and reload', async ({ page }) => {
      await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      await page.waitForURL(/\/(home|dashboard)/i);

      const homePage = new HomePage(page);
      await homePage.logout();

      await page.reload();

      // Should still be on login page
      await expect(page).toHaveURL(/\/login|\//);
      await loginPage.assertLoginPageVisible();
    });
  });

  test.describe('Security', () => {
    test('should not expose password in DOM', async ({ page }) => {
      const passwordInput = page.getByLabel(/password/i);
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });

    test('should redirect to login when accessing protected route without auth', async ({ page }) => {
      await page.goto('/patients');
      await page.waitForLoadState('networkidle');

      // Should redirect to login page
      await expect(page).toHaveURL(/\/login/);
    });

    test('should handle concurrent login attempts gracefully', async ({ page }) => {
      // Start multiple login attempts
      const login1 = loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
      const login2 = loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);

      await Promise.all([login1, login2]);

      // Should still end up authenticated
      await page.waitForURL(/\/(home|dashboard)/i, { timeout: 10000 });
    });
  });
});
