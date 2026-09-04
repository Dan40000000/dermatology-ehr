import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures/auth.fixture';
import { installMipsReadinessRoutes } from '../fixtures/mipsReadiness.fixture';

const MIPS_HEADING = 'MIPS Readiness Center';
const EXTERNAL_REGISTRY = /(?:qpp|cms\.gov|dataderm|aad\.org)/i;

async function openMips(page: Parameters<typeof installMipsReadinessRoutes>[0]) {
  await installMipsReadinessRoutes(page);
  await page.goto('/mips-readiness');
  await expect(page.getByRole('heading', { name: MIPS_HEADING, level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save practice profile' })).toBeEnabled();
}

test.describe('MIPS readiness release qualification', () => {
  test('shows source-targeted evidence and keeps registry preview internal', async ({ authenticatedPage: page }) => {
    await openMips(page);

    await expect(page.getByRole('heading', { name: /^pi:/i })).toHaveCount(0);
    const biopsyLink = page.getByRole('link', { name: /Open biopsy workflow for source synthetic-biopsy-440/i });
    await expect(biopsyLink).toHaveAttribute('href', '/biopsies?search=synthetic-biopsy-440');
    const therapyLink = page.getByRole('link', { name: /Open chronic therapy registry for source synthetic-therapy-176/i });
    await expect(therapyLink).toHaveAttribute(
      'href',
      '/registry?tab=chronic-therapy&sourceId=synthetic-therapy-176',
    );
    await expect(biopsyLink).not.toHaveAttribute('href', /patient/i);
    await expect(therapyLink).not.toHaveAttribute('href', /patient/i);

    const previewRequests: string[] = [];
    const listener = (request: { url(): string; resourceType(): string }) => {
      if (['fetch', 'xhr'].includes(request.resourceType())) previewRequests.push(request.url());
    };
    page.on('request', listener);
    await page.getByRole('button', { name: 'Preview draft registry export' }).click();
    await expect(page.getByRole('heading', { name: 'Draft registry preview', level: 2 })).toBeVisible();
    await expect(page.getByText(/Nothing was submitted or sent/i)).toBeVisible();
    page.off('request', listener);

    expect(previewRequests.some((url) => new URL(url).pathname === '/api/mips/readiness/preview')).toBe(true);
    expect(previewRequests.filter((url) => EXTERNAL_REGISTRY.test(url))).toEqual([]);
  });

  test('supports keyboard menu behavior and announces dynamic state', async ({ authenticatedPage: page }) => {
    await openMips(page);

    const language = page.getByRole('button', { name: /Change language.*English.*EN/i });
    await expect(language).toHaveAttribute('aria-expanded', 'false');
    await language.focus();
    await page.keyboard.press('Enter');
    await expect(language).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(language).toHaveAttribute('aria-expanded', 'false');
    await expect(language).toBeFocused();

    const liveRegion = page.getByRole('status').filter({ hasText: /loaded/i });
    await expect(liveRegion).toBeAttached();
  });

  test('has no automated WCAG A/AA violations or 320px overflow', async ({ authenticatedPage: page }) => {
    const consoleErrors: string[] = [];
    const failedResponses: Array<{ status: number; url: string }> = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
    });

    await openMips(page);
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      scan.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);

    await page.setViewportSize({ width: 320, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(failedResponses.filter(({ url }) => !new URL(url).pathname.startsWith('/socket.io/'))).toEqual([]);
    expect(
      consoleErrors.filter((message) => (
        !message.startsWith('WebSocket connection error:')
        && message !== 'Failed to load resource: the server responded with a status of 500 (Internal Server Error)'
      )),
    ).toEqual([]);
  });
});
