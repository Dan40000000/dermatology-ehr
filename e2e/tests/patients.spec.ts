import { test, expect } from '@playwright/test';

// Helper to login
async function login(page: any) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill('admin@demo.com');
  await page.getByLabel(/password/i).fill('demo123');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/i);
}

test.describe('Patient Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should navigate to patients list', async ({ page }) => {
    await page.getByRole('link', { name: /patients/i }).click();
    await expect(page).toHaveURL(/\/patients/i);
    await expect(page.getByRole('heading', { name: /patients/i })).toBeVisible();
  });

  test('should display patients list', async ({ page }) => {
    await page.goto('/patients');

    // Should show patients table or list
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('should open new patient modal', async ({ page }) => {
    await page.goto('/patients');
    await page.getByRole('button', { name: /new patient|add patient/i }).click();

    // Should show modal
    await expect(page.getByRole('heading', { name: /new patient/i })).toBeVisible();
  });

  test('should create new patient', async ({ page }) => {
    await page.goto('/patients');
    await page.getByRole('button', { name: /new patient|add patient/i }).click();

    // Fill in patient details
    await page.getByLabel(/first name/i).fill('John');
    await page.getByLabel(/last name/i).fill('Doe');
    await page.getByLabel(/date of birth/i).fill('1990-01-01');
    await page.getByLabel(/phone/i).fill('555-123-4567');
    await page.getByLabel(/email/i).fill('john.doe@example.com');

    // Submit form
    await page.getByRole('button', { name: /save|create/i }).click();

    // Should show success message
    await expect(page.getByText(/patient created|success/i)).toBeVisible();
  });

  test('should search for patients', async ({ page }) => {
    await page.goto('/patients');

    // Enter search term
    await page.getByPlaceholder(/search/i).fill('Doe');

    // Should filter results
    await expect(page.getByText(/doe/i).first()).toBeVisible();
  });

  test('should view patient details', async ({ page }) => {
    await page.goto('/patients');

    // Click on first patient
    await page.getByRole('row').nth(1).click();

    // Should navigate to patient detail page
    await expect(page).toHaveURL(/\/patients\/[a-z0-9-]+/i);
    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/patients');
    await page.getByRole('button', { name: /new patient|add patient/i }).click();

    // Try to submit without required fields
    await page.getByRole('button', { name: /save|create/i }).click();

    // Should show validation errors
    await expect(page.getByText(/required|invalid/i).first()).toBeVisible();
  });
});
