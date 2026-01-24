import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login page', async ({ page }) => {
    await expect(page).toHaveTitle(/DermEHR|Mountain Pine Dermatology/i);
    await expect(page.getByRole('heading', { name: /mountain pine dermatology/i })).toBeVisible();
  });

  test('should show validation errors for empty credentials', async ({ page }) => {
    await page.getByLabel(/practice id/i).fill('');
    await page.getByLabel(/email/i).fill('');
    await page.getByLabel(/password/i).fill('');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('input:invalid')).toHaveCount(3);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show error message
    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // Use demo credentials
    await page.getByLabel(/email/i).fill('admin@demo.practice');
    await page.getByLabel(/password/i).fill('Password123!');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/(home|dashboard)/i);
    await expect(page.locator('.section-title-bar', { hasText: /today's overview/i })).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.getByLabel(/email/i).fill('admin@demo.practice');
    await page.getByLabel(/password/i).fill('Password123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/(home|dashboard)/i);

    // Logout
    await page.getByRole('button', { name: /logout|sign out/i }).click();

    // Should redirect to login
    await expect(page).toHaveURL(/\/login|\/$/);
  });

  test('should persist session on page reload', async ({ page }) => {
    // Login
    await page.getByLabel(/email/i).fill('admin@demo.practice');
    await page.getByLabel(/password/i).fill('Password123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/(home|dashboard)/i);

    // Reload page
    await page.reload();

    // Should still be logged in
    await expect(page).toHaveURL(/\/(home|dashboard)/i);
    await expect(page.locator('.section-title-bar', { hasText: /today's overview/i })).toBeVisible();
  });
});
