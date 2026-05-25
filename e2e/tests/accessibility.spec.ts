import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const APP_A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const INTERNAL_KNOWN_EXCEPTIONS = ['color-contrast'];

// Helper to login
async function login(page: any) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('admin@demo.practice');
  await page.getByRole('textbox', { name: /^password$/i }).fill('Password123!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(home|dashboard)/i);
}

function summarizeViolations(violations: any[]) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 3).map((node: any) => ({
      target: node.target,
      failureSummary: node.failureSummary,
    })),
  }));
}

async function expectNoA11yViolations(page: any, options: { disableKnownInternalRules?: boolean } = {}) {
  let builder = new AxeBuilder({ page }).withTags(APP_A11Y_TAGS);
  if (options.disableKnownInternalRules) {
    builder = builder.disableRules(INTERNAL_KNOWN_EXCEPTIONS);
  }
  const accessibilityScanResults = await builder.analyze();
  expect(summarizeViolations(accessibilityScanResults.violations)).toEqual([]);
}

test.describe('Accessibility', () => {
  test('login page should be accessible', async ({ page }) => {
    await page.goto('/');

    await expectNoA11yViolations(page);
  });

  test('dashboard should be accessible', async ({ page }) => {
    await login(page);
    await page.goto('/home');

    await expectNoA11yViolations(page, { disableKnownInternalRules: true });
  });

  test('patients page should be accessible', async ({ page }) => {
    await login(page);
    await page.goto('/patients');

    await expectNoA11yViolations(page, { disableKnownInternalRules: true });
  });

  test('appointments page should be accessible', async ({ page }) => {
    await login(page);
    await page.goto('/schedule');

    await expectNoA11yViolations(page, { disableKnownInternalRules: true });
  });

  test('post-visit coding review should be accessible', async ({ page }) => {
    await login(page);
    await page.goto('/coding-review');
    await expect(page.getByRole('heading', { name: /post-visit coding review/i })).toBeVisible();

    await expectNoA11yViolations(page, { disableKnownInternalRules: true });
  });

  test('patient access needs workflow should be accessible', async ({ page }) => {
    await login(page);
    await page.goto('/patients/demo-patient-2?tab=accessibility');
    await expect(page.getByText(/access needs & accommodations/i)).toBeVisible();

    await expectNoA11yViolations(page, { disableKnownInternalRules: true });
  });

  test('new patient access needs form should be accessible', async ({ page }) => {
    await login(page);
    await page.goto('/patients/new');
    await page.getByRole('button', { name: /access needs/i }).click();
    await expect(page.getByText(/optional, patient-requested accommodation details/i)).toBeVisible();

    await expectNoA11yViolations(page, { disableKnownInternalRules: true });
  });

  test('public booking entry should be accessible', async ({ page }) => {
    await page.goto('/book-appointment/guest');
    await expect(page.locator('body')).toBeVisible();

    await expectNoA11yViolations(page, { disableKnownInternalRules: true });
  });

  test('should have proper keyboard navigation', async ({ page }) => {
    await page.goto('/login?fresh=1');

    // Start at the first login input to avoid optional chrome in the tab order.
    await page.getByLabel(/practice id/i).focus();
    await expect(page.getByLabel(/practice id/i)).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/email/i)).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: /^password$/i })).toBeFocused();

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
