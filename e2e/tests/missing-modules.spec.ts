import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const session = {
    tenantId: 'demo-tenant',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    user: {
      id: 'test-user',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'admin',
    },
  };

  await page.addInitScript((value) => {
    localStorage.setItem('derm_session', value);
  }, JSON.stringify(session));
});

test('Registry module loads', async ({ page }) => {
  await page.goto('/registry');
  await expect(page.getByRole('heading', { name: 'Registry' })).toBeVisible();
});

test('Referrals module loads', async ({ page }) => {
  await page.goto('/referrals');
  await expect(page.getByRole('heading', { name: 'Referrals' })).toBeVisible();
});

test('Forms module loads', async ({ page }) => {
  await page.goto('/forms');
  await expect(page.getByRole('heading', { name: 'Forms' })).toBeVisible();
});

test('Protocols module loads', async ({ page }) => {
  await page.goto('/protocols');
  await expect(page.getByRole('heading', { name: 'Protocols' })).toBeVisible();
});

test('Templates module loads', async ({ page }) => {
  await page.goto('/templates');
  await expect(page.getByRole('heading', { name: 'Note Templates' })).toBeVisible();
});

test('Preferences module loads', async ({ page }) => {
  await page.goto('/preferences');
  await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
});

test('Help module loads', async ({ page }) => {
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
});

test('Recalls module loads', async ({ page }) => {
  await page.goto('/recalls');
  await expect(page.getByRole('heading', { name: 'Recalls' })).toBeVisible();
});
