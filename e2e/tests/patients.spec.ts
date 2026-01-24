import { test, expect } from '@playwright/test';

// Helper to login
async function login(page: any) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill('admin@demo.practice');
  await page.getByLabel(/password/i).fill('Password123!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(home|dashboard)/i);
}

test.describe('Patient Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should navigate to patients list', async ({ page }) => {
    await page.getByRole('link', { name: /patients/i }).click();
    await expect(page).toHaveURL(/\/patients/i);
    await expect(page.locator('.ema-section-header', { hasText: /patient search\s*$/i })).toBeVisible();
  });

  test('should display patients list', async ({ page }) => {
    await page.goto('/patients');

    // Should show patients table or list
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('should open new patient modal', async ({ page }) => {
    await page.goto('/patients');
    await page.getByRole('button', { name: /new patient|add patient/i }).click();

    await expect(page).toHaveURL(/\/patients\/(new|register)/i);
    await expect(page.getByText(/new patient registration/i)).toBeVisible();
  });

  test('should create new patient', async ({ page }) => {
    await page.goto('/patients');
    await page.getByRole('button', { name: /new patient|add patient/i }).click();

    await expect(page).toHaveURL(/\/patients\/(new|register)/i);

    await page.getByLabel(/first name/i).fill('John');
    await page.getByLabel(/last name/i).fill('Doe');
    await page.getByLabel(/date of birth/i).fill('1990-01-01');
    await page.getByRole('button', { name: /^contact info$/i }).click();
    await page.getByLabel(/home phone/i).fill('555-123-4567');
    await page.getByLabel(/email/i).fill('john.doe@example.com');

    // Submit form
    await page.getByRole('button', { name: /^save patient$/i }).click();

    await expect(page).toHaveURL(/\/patients\/[a-z0-9-]+/i);
  });

  test('should search for patients', async ({ page }) => {
    await page.goto('/patients');

    const rows = page.locator('tbody tr');
    const emptyState = rows.filter({ hasText: /no patients found/i });
    if (await emptyState.count()) {
      await expect(emptyState.first()).toBeVisible();
      return;
    }

    const firstRow = rows.first();
    const lastName = (await firstRow.locator('a.ema-patient-link').first().textContent())?.trim();
    if (!lastName) {
      return;
    }

    // Enter search term based on existing row data
    await page.getByPlaceholder(/enter search term/i).fill(lastName);

    // Should filter results
    await expect(page.locator('tbody')).toContainText(lastName);
  });

  test('should view patient details', async ({ page }) => {
    await page.goto('/patients');

    // Click on first patient
    const rows = page.locator('tbody tr');
    const emptyState = rows.filter({ hasText: /no patients found/i });
    if (await emptyState.count()) {
      await expect(emptyState.first()).toBeVisible();
      return;
    }

    await rows.first().locator('a.ema-patient-link').first().click();

    // Should navigate to patient detail page
    await expect(page).toHaveURL(/\/patients\/[a-z0-9-]+/i);
    await expect(page.getByRole('heading')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/patients');
    await page.getByRole('button', { name: /new patient|add patient/i }).click();

    // Try to submit without required fields
    await page.getByRole('button', { name: /^save patient$/i }).click();

    await expect(page.getByText(/please fill in required fields|required/i).first()).toBeVisible();
  });
});
