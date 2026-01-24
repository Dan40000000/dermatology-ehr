import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Helper to login
async function login(page: any) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('admin@demo.practice');
  await page.getByLabel(/password/i).fill('Password123!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(home|dashboard)/i);
}

test.describe('Accessibility', () => {
  test('login page should be accessible', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('dashboard should be accessible', async ({ page }) => {
    await login(page);
    await page.goto('/home');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('patients page should be accessible', async ({ page }) => {
    await login(page);
    await page.goto('/patients');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('appointments page should be accessible', async ({ page }) => {
    await login(page);
    await page.goto('/schedule');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have proper keyboard navigation', async ({ page }) => {
    await page.goto('/');

    // Start at the first input to avoid optional chrome (language switcher) in the tab order
    await page.getByLabel(/practice id/i).focus();
    await expect(page.getByLabel(/practice id/i)).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/email/i)).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/password/i)).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeFocused();
  });

  test('should have proper ARIA labels', async ({ page }) => {
    await login(page);
    await page.goto('/patients');

    // Check for proper ARIA labels on interactive elements
    const buttons = page.getByRole('button');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');

      // Button should have either text content or aria-label
      expect(text || ariaLabel).toBeTruthy();
    }
  });

  test('images should have alt text', async ({ page }) => {
    await login(page);
    await page.goto('/home');

    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');

      // Images should have alt text or role="presentation"
      expect(alt !== null || role === 'presentation').toBeTruthy();
    }
  });

  test('forms should have proper labels', async ({ page }) => {
    await page.goto('/');

    // All form inputs should have associated labels
    const inputs = page.locator('input[type="text"], input[type="email"], input[type="password"]');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const hasLabel = await input.evaluate((el) => {
        const inputEl = el as HTMLInputElement;
        return !!inputEl.labels && inputEl.labels.length > 0;
      });

      // Input should have a label association or aria labeling
      expect(hasLabel || ariaLabel || ariaLabelledBy).toBeTruthy();
    }
  });
});
