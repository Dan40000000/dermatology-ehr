import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const session = {
    tenantId: 'tenant-demo',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    user: {
      id: 'test-user',
      email: 'admin@demo.practice',
      fullName: 'Admin User',
      role: 'admin',
    },
  };

  await page.addInitScript((value) => {
    localStorage.setItem('derm_session', value);
  }, JSON.stringify(session));
});

test('Registry module loads', async ({ page }) => {
  await page.goto('/registry');
  await expect(page.getByRole('heading', { name: /^Patient Registries$/i })).toBeVisible();
});

test('Referrals module loads', async ({ page }) => {
  await page.goto('/referrals');
  await expect(page.getByRole('heading', { name: /^Referrals$/i })).toBeVisible();
});

test('Forms module loads', async ({ page }) => {
  await page.goto('/forms');
  await expect(page.getByRole('heading', { name: /^Forms$/i })).toBeVisible();
});

test('Protocols module loads', async ({ page }) => {
  await page.goto('/protocols');
  await expect(page.getByRole('heading', { name: /^Treatment Protocols$/i })).toBeVisible();
});

test('Templates module loads', async ({ page }) => {
  await page.goto('/templates');
  await expect(page.getByRole('heading', { name: /^Note Templates$/i })).toBeVisible();
});

test('Preferences module loads', async ({ page }) => {
  await page.goto('/preferences');
  await expect(page.getByRole('heading', { name: /^Preferences$/i })).toBeVisible();
});

test('Help module loads', async ({ page }) => {
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: /^Help$/i })).toBeVisible();
});

test('Recalls module loads', async ({ page }) => {
  await page.goto('/recalls');
  await expect(page.getByRole('heading', { name: /^Recalls$/i })).toBeVisible();
});
