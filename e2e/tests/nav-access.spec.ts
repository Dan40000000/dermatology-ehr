import { test, expect } from '@playwright/test';

const setSession = async (page, role: string) => {
  const session = {
    tenantId: 'demo-tenant',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    user: {
      id: 'test-user',
      email: 'test@example.com',
      fullName: 'Test User',
      role,
    },
  };

  await page.addInitScript((value) => {
    localStorage.setItem('derm_session', value);
  }, JSON.stringify(session));
};

test('admin can access admin and quality pages', async ({ page }) => {
  await setSession(page, 'admin');

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin Settings' })).toBeVisible();

  await page.goto('/quality');
  await expect(page.getByRole('heading', { name: 'Quality Measures & MIPS Reporting' })).toBeVisible();
});

test('front desk is redirected away from admin and quality pages', async ({ page }) => {
  await setSession(page, 'front_desk');

  await page.goto('/admin');
  await page.waitForURL('**/home');
  await expect(page.getByRole('heading', { name: 'Admin Settings' })).not.toBeVisible();

  await page.goto('/quality');
  await page.waitForURL('**/home');
  await expect(page.getByRole('heading', { name: 'Quality Measures & MIPS Reporting' })).not.toBeVisible();
});
