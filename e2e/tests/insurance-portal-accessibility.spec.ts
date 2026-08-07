import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const APP_A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const INTERNAL_KNOWN_EXCEPTIONS = ['color-contrast'];
const PORTAL_COOKIE_TOKEN_PLACEHOLDER = '__http_only_cookie__';

type InsuranceState = 'loading' | 'empty' | 'populated' | 'error';

const portalPatient = {
  id: 'patient-a',
  firstName: 'Portal',
  lastName: 'Patient',
  email: 'portal.patient@example.test',
  practiceName: 'Dermatology Demo Office',
};

const emptyBillingResponses: Record<string, unknown> = {
  '/api/patient-portal/billing/balance': {
    totalCharges: 0,
    totalPayments: 0,
    totalAdjustments: 0,
    currentBalance: 0,
    lastPaymentDate: null,
    lastPaymentAmount: null,
  },
  '/api/patient-portal/billing/charges': { charges: [] },
  '/api/patient-portal/billing/statements': { statements: [] },
  '/api/patient-portal/billing/payment-history': { payments: [] },
  '/api/patient-portal/billing/payment-methods': { paymentMethods: [] },
};

function populatedInsuranceSummary() {
  return {
    coverage: {
      planName: 'Demo PPO',
      planType: 'PPO',
      status: 'active',
      active: true,
      verified: true,
      verifiedAt: '2026-08-03T17:00:00.000Z',
      expiresAt: null,
      effectiveDate: '2026-01-01',
      terminationDate: null,
      copay: 40,
      deductibleRemaining: 1200,
      coinsurancePercent: 20,
      outOfPocketRemaining: 3500,
      priorAuthRequired: false,
      referralRequired: false,
      inNetwork: true,
      networkName: 'Demo Network',
      provider: 'stedi',
      environment: 'sandbox',
    },
    estimates: [{
      id: 'estimate-a',
      appointmentId: null,
      serviceType: 'office_visit',
      procedures: [{ code: '99203', description: 'New patient visit' }],
      totalCharges: 165,
      insuranceAllowedAmount: 132,
      insurancePays: 60.6,
      patientResponsibility: 71.4,
      breakdown: {
        copay: 40,
        deductible: 20,
        coinsurance: 6.4,
        notCovered: 0,
        contractualAdjustment: 33,
      },
      isCosmetic: false,
      insuranceVerified: true,
      validUntil: '2026-09-02',
      sharedAt: '2026-08-03T18:00:00.000Z',
      createdAt: '2026-08-03T18:00:00.000Z',
      status: 'shared',
      version: 1,
      confidenceLevel: 'high',
      confidenceScore: 85,
      confidenceFactors: ['Contract rate configured'],
      pricingBasis: 'contract_rate',
      pricingDetails: [{ code: '99203', charge: 165, allowedAmount: 132, basis: 'contract_rate' }],
      reconciliation: null,
    }],
    prescriptionEstimates: [],
    prescriptionPricingAvailable: false,
  };
}

function insuranceResponse(state: InsuranceState): { status: number; body: unknown } {
  if (state === 'error') {
    return { status: 503, body: { error: 'temporarily unavailable' } };
  }
  if (state === 'empty') {
    return {
      status: 200,
      body: { coverage: null, estimates: [], prescriptionEstimates: [], prescriptionPricingAvailable: false },
    };
  }
  return { status: 200, body: populatedInsuranceSummary() };
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Install a closed network boundary for the portal. Every API request is
 * fulfilled locally, so the accessibility checks never depend on a backend,
 * payer, or third-party network call.
 */
interface LoadingControl {
  waitUntilStarted: () => Promise<void>;
  release: () => void;
}

async function installPortalApiMocks(page: Page, state: InsuranceState): Promise<LoadingControl | null> {
  let releaseLoading: (() => void) | null = null;
  let loadingStartedResolve: (() => void) | null = null;
  const loadingStarted = new Promise<void>((resolve) => {
    loadingStartedResolve = resolve;
  });
  const loadingReleased = new Promise<void>((resolve) => {
    releaseLoading = resolve;
  });

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    // Playwright's glob also matches Vite module paths such as /src/api/*;
    // those are application assets and must continue to the dev server.
    if (!pathname.startsWith('/api/')) {
      await route.fallback();
      return;
    }

    if (pathname === '/api/patient-portal-data/dashboard') {
      await fulfillJson(route, { dashboard: { actionNeededCount: 0, currentBalance: 0 } });
      return;
    }

    if (pathname === '/api/patient-portal-data/insurance-summary') {
      if (state === 'loading') {
        loadingStartedResolve?.();
        await loadingReleased;
      }
      const response = insuranceResponse(state);
      await fulfillJson(route, response.body, response.status);
      return;
    }

    const billingResponse = emptyBillingResponses[pathname];
    if (billingResponse !== undefined) {
      await fulfillJson(route, billingResponse);
      return;
    }

    // Keep unexpected portal requests local and explicit rather than allowing
    // a real network call to make a test flaky.
    await fulfillJson(route, { error: `Unexpected test request: ${pathname}` }, 404);
  });

  if (state !== 'loading') return null;
  return {
    waitUntilStarted: () => loadingStarted,
    release: () => releaseLoading?.(),
  };
}

async function seedPortalSession(page: Page): Promise<void> {
  await page.addInitScript(({ token, patient }) => {
    localStorage.setItem('patientPortalToken', token);
    localStorage.setItem('patientPortalTenantId', 'tenant-demo');
    localStorage.setItem('patientPortalPatient', JSON.stringify(patient));
  }, { token: PORTAL_COOKIE_TOKEN_PLACEHOLDER, patient: portalPatient });
}

async function openBilling(page: Page, state: InsuranceState): Promise<(() => void) | null> {
  await seedPortalSession(page);
  const loadingControl = await installPortalApiMocks(page, state);
  await page.goto('/portal/billing');
  await expect(page.getByRole('heading', { name: 'Insurance Coverage & Cost Estimates' })).toBeVisible();
  await loadingControl?.waitUntilStarted();
  return loadingControl?.release || null;
}

async function expectInsuranceBoxAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include('.insurance-summary-card')
    .withTags(APP_A11Y_TAGS)
    .disableRules(INTERNAL_KNOWN_EXCEPTIONS)
    .analyze();

  expect(results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.slice(0, 3).map((node) => node.target),
  }))).toEqual([]);
}

test.describe('Insurance Coverage & Cost Estimates portal accessibility', () => {
  test('loading state has no accessibility violations', async ({ page }) => {
    const releaseLoading = await openBilling(page, 'loading');
    await expect(page.locator('[aria-label="Loading insurance coverage"]')).toBeVisible();
    await expectInsuranceBoxAccessible(page);
    releaseLoading?.();
  });

  test('empty state has no accessibility violations', async ({ page }) => {
    await openBilling(page, 'empty');
    await expect(page.getByText(/No insurance coverage information is on file/i)).toBeVisible();
    await expectInsuranceBoxAccessible(page);
  });

  test('populated state has no accessibility violations', async ({ page }) => {
    await openBilling(page, 'populated');
    await expect(page.getByText('Demo PPO')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask a billing question' })).toBeVisible();
    await expectInsuranceBoxAccessible(page);
  });

  test('error state has no accessibility violations', async ({ page }) => {
    await openBilling(page, 'error');
    await expect(page.locator('.insurance-unavailable')).toContainText(/temporarily unavailable/i);
    await expectInsuranceBoxAccessible(page);
  });

  test('estimate response lifecycle is keyboard accessible', async ({ page }) => {
    await openBilling(page, 'populated');

    const askQuestion = page.getByRole('button', { name: 'Ask a billing question' });
    await askQuestion.focus();
    await expect(askQuestion).toBeFocused();
    await page.keyboard.press('Enter');

    const message = page.getByRole('textbox', { name: /What would you like the billing team to answer/i });
    await expect(message).toBeVisible();
    await message.focus();
    await expect(message).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Send request' })).toBeFocused();
    await expectInsuranceBoxAccessible(page);
  });

  test('populated insurance box remains usable and accessible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBilling(page, 'populated');

    const box = page.locator('.insurance-summary-card');
    await expect(box).toBeVisible();
    const boxWidth = await box.evaluate((element) => element.getBoundingClientRect().width);
    expect(boxWidth).toBeLessThanOrEqual(390);
    await expectInsuranceBoxAccessible(page);
  });
});
