import { test, expect, type Page } from '../fixtures/auth.fixture';
import type { Route } from '@playwright/test';

const TENANT_ID = 'tenant-demo';
const PRIMARY_PATIENT_ID = 'patient-smoke-1';
const UNRELATED_PATIENT_ID = 'patient-unrelated-smoke-1';
const ESTIMATE_ID = 'estimate-insurance-smoke-1';
const REVISED_ESTIMATE_ID = 'estimate-insurance-smoke-2';
const MOCK_COOKIE_TOKEN = '__http_only_cookie__';

type EstimateStatus =
  | 'draft'
  | 'shared'
  | 'acknowledged'
  | 'billing_question'
  | 'reconciled'
  | 'revoked'
  | 'superseded';

interface EstimateState {
  id: string;
  patientId: string;
  serviceType: string;
  cptCodes: Array<{ code: string; fee: number; description: string }>;
  totalCharges: number;
  insuranceAllowedAmount: number;
  insurancePays: number;
  patientResponsibility: number;
  breakdown: {
    copay: number;
    deductible: number;
    coinsurance: number;
    notCovered: number;
    contractualAdjustment: number;
  };
  isCosmetic: boolean;
  insuranceVerified: boolean;
  validUntil: string;
  status: EstimateStatus;
  version: number;
  confidenceLevel: 'high' | 'medium' | 'planning';
  confidenceScore: number;
  confidenceFactors: string[];
  pricingBasis: 'contract_rate' | 'mixed' | 'percentage_fallback' | 'self_pay';
  pricingDetails: Array<{
    code: string;
    charge: number;
    allowedAmount: number;
    basis: 'contract_rate' | 'percentage_fallback' | 'self_pay';
    payerName: string;
  }>;
  sharedAt: string | null;
  reconciliation: {
    actualAllowedAmount: number;
    actualInsurancePayment: number;
    actualPatientResponsibility: number;
    allowedVariance: number;
    patientVariance: number;
    accuracyPercent: number;
    reconciledAt: string;
  } | null;
  shownToPatient: boolean;
}

function makeEstimate(id: string, version = 1): EstimateState {
  const isRevision = version > 1;
  const cptCodes = isRevision
    ? [{ code: '99213', fee: 200, description: 'Established patient office visit' }]
    : [
        { code: '99213', fee: 200, description: 'Established patient office visit' },
        { code: '11102', fee: 175, description: 'Tangential biopsy' },
      ];
  const pricingDetails = isRevision
    ? [{ code: '99213', charge: 200, allowedAmount: 150, basis: 'contract_rate' as const, payerName: 'Demo Health' }]
    : [
        { code: '99213', charge: 200, allowedAmount: 150, basis: 'contract_rate' as const, payerName: 'Demo Health' },
        { code: '11102', charge: 175, allowedAmount: 100, basis: 'contract_rate' as const, payerName: 'Demo Health' },
      ];
  const totalCharges = cptCodes.reduce((sum, item) => sum + item.fee, 0);
  const insuranceAllowedAmount = pricingDetails.reduce((sum, item) => sum + item.allowedAmount, 0);
  const copay = 25;
  const deductible = 50;
  const coinsurance = isRevision ? 15 : 35;
  const patientResponsibility = copay + deductible + coinsurance;

  return {
    id,
    patientId: PRIMARY_PATIENT_ID,
    serviceType: 'medical',
    cptCodes,
    totalCharges,
    insuranceAllowedAmount,
    insurancePays: insuranceAllowedAmount - patientResponsibility,
    patientResponsibility,
    breakdown: {
      copay,
      deductible,
      coinsurance,
      notCovered: 0,
      contractualAdjustment: totalCharges - insuranceAllowedAmount,
    },
    isCosmetic: false,
    insuranceVerified: true,
    validUntil: '2030-12-31',
    status: 'draft',
    version,
    confidenceLevel: 'high',
    confidenceScore: 90,
    confidenceFactors: ['Current payer contract rate for every procedure', 'Current production eligibility response'],
    pricingBasis: 'contract_rate',
    pricingDetails,
    sharedAt: null,
    reconciliation: null,
    shownToPatient: false,
  };
}

function toStaffEstimate(estimate: EstimateState) {
  return {
    id: estimate.id,
    patientId: estimate.patientId,
    serviceType: estimate.serviceType,
    totalCharges: estimate.totalCharges,
    insuranceAllowedAmount: estimate.insuranceAllowedAmount,
    insurancePays: estimate.insurancePays,
    patientResponsibility: estimate.patientResponsibility,
    breakdown: estimate.breakdown,
    isCosmetic: estimate.isCosmetic,
    insuranceVerified: estimate.insuranceVerified,
    validUntil: estimate.validUntil,
    status: estimate.status,
    version: estimate.version,
    confidenceLevel: estimate.confidenceLevel,
    confidenceScore: estimate.confidenceScore,
    confidenceFactors: estimate.confidenceFactors,
    pricingBasis: estimate.pricingBasis,
    pricingDetails: estimate.pricingDetails,
  };
}

function toPortalEstimate(estimate: EstimateState) {
  return {
    id: estimate.id,
    appointmentId: null,
    serviceType: estimate.serviceType,
    procedures: estimate.cptCodes.map((item) => ({ code: item.code, description: item.description })),
    totalCharges: estimate.totalCharges,
    insuranceAllowedAmount: estimate.insuranceAllowedAmount,
    insurancePays: estimate.insurancePays,
    patientResponsibility: estimate.patientResponsibility,
    breakdown: estimate.breakdown,
    isCosmetic: estimate.isCosmetic,
    insuranceVerified: estimate.insuranceVerified,
    validUntil: estimate.validUntil,
    sharedAt: estimate.sharedAt,
    createdAt: '2026-08-07T15:00:00.000Z',
    status: estimate.status,
    version: estimate.version,
    confidenceLevel: estimate.confidenceLevel,
    confidenceScore: estimate.confidenceScore,
    confidenceFactors: estimate.confidenceFactors,
    pricingBasis: estimate.pricingBasis,
    pricingDetails: estimate.pricingDetails,
    reconciliation: estimate.reconciliation,
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installInsuranceEstimateRoutes(page: Page) {
  let activePortalPatientId = PRIMARY_PATIENT_ID;
  const estimates = new Map<string, EstimateState>();
  const initialEstimate = makeEstimate(ESTIMATE_ID);
  estimates.set(initialEstimate.id, initialEstimate);

  await page.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;

    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      // The smoke test must never reach a payer, font CDN, or other external service.
      await route.abort();
      return;
    }

    if (!path.startsWith('/api/')) {
      await route.fallback();
      return;
    }

    if (path.startsWith('/api/auth/')) {
      await route.fallback();
      return;
    }

    if (method === 'GET' && path === `/api/patients/${PRIMARY_PATIENT_ID}`) {
      await fulfillJson(route, {
        patient: {
          id: PRIMARY_PATIENT_ID,
          firstName: 'Smoke',
          lastName: 'Patient',
          dateOfBirth: '1985-01-01',
          dob: '1985-01-01',
          phone: '5550101000',
          email: 'smoke.patient@example.com',
          mrn: 'SMK001',
        },
      });
      return;
    }

    if (method === 'GET' && path === '/api/appointments') {
      await fulfillJson(route, { appointments: [] });
      return;
    }

    if (method === 'GET' && path === '/api/encounters') {
      await fulfillJson(route, { encounters: [] });
      return;
    }

    const estimateMatch = path.match(/^\/api\/collections\/estimate\/([^/]+)(?:\/(share|revise|revoke|reconcile))?$/);
    const estimateId = estimateMatch?.[1] || '';
    const estimateAction = estimateMatch?.[2];

    if (method === 'GET' && path === '/api/external-integrations/eligibility') {
      await fulfillJson(route, {
        integration: {
          type: 'eligibility',
          provider: 'mock',
          isConfigured: true,
          isActive: true,
          connectionStatus: 'connected',
        },
      });
      return;
    }

    if (method === 'GET' && path === '/api/external-integrations/eprescribe') {
      await fulfillJson(route, {
        integration: {
          type: 'eprescribe',
          provider: 'mock',
          isConfigured: false,
          isActive: false,
          connectionStatus: 'disconnected',
        },
      });
      return;
    }

    if (method === 'POST' && path === '/api/collections/estimate') {
      const payload = request.postDataJSON() as { patientId?: string; cptCodes?: string[]; serviceType?: string };
      const codes = payload.cptCodes || [];
      if (payload.patientId !== PRIMARY_PATIENT_ID || codes.join(',') !== '99213,11102') {
        await fulfillJson(route, { error: 'Unexpected estimate payload' }, 400);
        return;
      }
      const estimate = makeEstimate(ESTIMATE_ID);
      estimate.serviceType = payload.serviceType || estimate.serviceType;
      estimates.set(estimate.id, estimate);
      await fulfillJson(route, { estimate: toStaffEstimate(estimate) });
      return;
    }

    if (method === 'GET' && estimateMatch && !estimateAction) {
      const estimate = estimates.get(estimateId);
      if (!estimate) {
        await fulfillJson(route, { error: 'Estimate not found' }, 404);
        return;
      }
      await fulfillJson(route, { estimate: toStaffEstimate(estimate) });
      return;
    }

    if (method === 'POST' && estimateMatch && estimateAction) {
      const estimate = estimates.get(estimateId);
      if (!estimate) {
        await fulfillJson(route, { error: 'Estimate not found' }, 404);
        return;
      }

      if (estimateAction === 'share') {
        if (estimate.status === 'revoked' || estimate.status === 'superseded') {
          await fulfillJson(route, { error: 'Estimate not found' }, 404);
          return;
        }
        estimate.status = 'shared';
        estimate.shownToPatient = true;
        estimate.sharedAt = '2026-08-07T15:10:00.000Z';
        await fulfillJson(route, {
          success: true,
          estimateId: estimate.id,
          patientId: estimate.patientId,
          sharedAt: estimate.sharedAt,
        });
        return;
      }

      if (estimateAction === 'revise') {
        if (estimate.status === 'revoked' || estimate.status === 'superseded') {
          await fulfillJson(route, { error: 'Estimate not found or cannot be revised' }, 404);
          return;
        }
        const revised = makeEstimate(REVISED_ESTIMATE_ID, estimate.version + 1);
        estimates.set(estimate.id, { ...estimate, status: 'superseded', shownToPatient: false });
        estimates.set(revised.id, revised);
        await fulfillJson(route, { estimate: toStaffEstimate(revised) }, 201);
        return;
      }

      if (estimateAction === 'reconcile') {
        const payload = request.postDataJSON() as {
          actualAllowedAmount?: number;
          actualInsurancePayment?: number;
          actualPatientResponsibility?: number;
        };
        const actualAllowedAmount = Number(payload.actualAllowedAmount);
        const actualInsurancePayment = Number(payload.actualInsurancePayment);
        const actualPatientResponsibility = Number(payload.actualPatientResponsibility);
        const reconciliation = {
          actualAllowedAmount,
          actualInsurancePayment,
          actualPatientResponsibility,
          allowedVariance: actualAllowedAmount - estimate.insuranceAllowedAmount,
          patientVariance: actualPatientResponsibility - estimate.patientResponsibility,
          accuracyPercent: 100 - (Math.abs(actualPatientResponsibility - estimate.patientResponsibility) / Math.max(actualPatientResponsibility, estimate.patientResponsibility, 1)) * 100,
          reconciledAt: '2026-08-07T16:00:00.000Z',
        };
        estimate.reconciliation = reconciliation;
        estimate.status = 'reconciled';
        await fulfillJson(route, { reconciliation });
        return;
      }

      if (estimateAction === 'revoke') {
        const payload = request.postDataJSON() as { reason?: string };
        if (!payload.reason || payload.reason.trim().length < 3) {
          await fulfillJson(route, { error: 'A revocation reason is required' }, 400);
          return;
        }
        estimate.status = 'revoked';
        estimate.shownToPatient = false;
        await fulfillJson(route, { success: true, patientId: estimate.patientId });
        return;
      }
    }

    if (method === 'GET' && path === '/api/patient-portal-data/insurance-summary') {
      const estimate = estimates.get(ESTIMATE_ID);
      const visibleEstimate = activePortalPatientId === PRIMARY_PATIENT_ID
        && estimate
        && estimate.shownToPatient
        && !['revoked', 'superseded'].includes(estimate.status)
        ? [toPortalEstimate(estimate)]
        : [];
      await fulfillJson(route, {
        coverage: {
          planName: 'Demo Health PPO',
          planType: 'PPO',
          status: 'active',
          active: true,
          verified: true,
          verifiedAt: '2026-08-01T00:00:00.000Z',
          expiresAt: '2030-12-31T00:00:00.000Z',
          effectiveDate: '2026-01-01',
          terminationDate: null,
          copay: 25,
          deductibleRemaining: 50,
          coinsurancePercent: 20,
          outOfPocketRemaining: 5000,
          priorAuthRequired: false,
          referralRequired: false,
          inNetwork: true,
          networkName: 'Demo Health Network',
          provider: 'mock',
          environment: 'mock',
        },
        estimates: visibleEstimate,
        prescriptionEstimates: [],
        prescriptionPricingAvailable: false,
      });
      return;
    }

    const portalResponseMatch = path.match(/^\/api\/patient-portal-data\/insurance-estimates\/([^/]+)\/respond$/);
    if (method === 'POST' && portalResponseMatch) {
      const estimate = estimates.get(portalResponseMatch[1] || '');
      const payload = request.postDataJSON() as { action?: string; message?: string };
      if (
        activePortalPatientId !== PRIMARY_PATIENT_ID
        || !estimate
        || estimate.patientId !== activePortalPatientId
        || !estimate.shownToPatient
        || ['revoked', 'superseded'].includes(estimate.status)
      ) {
        await fulfillJson(route, { error: 'Active shared estimate not found' }, 404);
        return;
      }
      const statusByAction: Record<string, EstimateStatus> = {
        acknowledge: 'acknowledged',
        billing_question: 'billing_question',
      };
      const status = statusByAction[payload.action || ''];
      if (!status) {
        await fulfillJson(route, { error: 'Unsupported estimate action' }, 400);
        return;
      }
      estimate.status = status;
      await fulfillJson(route, { success: true, status, respondedAt: '2026-08-07T15:30:00.000Z' });
      return;
    }

    if (method === 'GET' && path.startsWith('/api/patient-portal/billing/')) {
      if (path.endsWith('/charges')) {
        await fulfillJson(route, { charges: [] });
      } else if (path.endsWith('/statements')) {
        await fulfillJson(route, { statements: [] });
      } else if (path.endsWith('/payments')) {
        await fulfillJson(route, { payments: [] });
      } else if (path.endsWith('/payment-methods')) {
        await fulfillJson(route, { paymentMethods: [] });
      } else {
        await fulfillJson(route, {});
      }
      return;
    }

    if (method === 'GET' && path === '/api/patient-portal-data/dashboard') {
      await fulfillJson(route, { dashboard: {} });
      return;
    }

    await fulfillJson(route, {});
  });

  return {
    setPortalPatient(patientId: string) {
      activePortalPatientId = patientId;
    },
  };
}

test.describe('Insurance Estimate Write Smoke', () => {
  test('staff creates and shares an exact multi-code estimate, the patient responds, and lifecycle mutations remain scoped', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const portalState = await installInsuranceEstimateRoutes(page);
    const staffSession = await page.evaluate(() => JSON.parse(localStorage.getItem('derm_session') || 'null') as {
      accessToken?: string;
      refreshToken?: string;
    });
    expect(staffSession.accessToken).toBe(MOCK_COOKIE_TOKEN);
    expect(staffSession.refreshToken).toBe(MOCK_COOKIE_TOKEN);

    await page.goto(`/patients/${PRIMARY_PATIENT_ID}?tab=account`);
    await expect(page.getByRole('heading', { name: /patient cost estimate/i })).toBeVisible();
    await expect(page.getByText(/medical eligibility: connected/i)).toBeVisible();

    await page.getByLabel('CPT codes').fill('99213, 11102');
    await page.getByRole('button', { name: /estimate procedure cost/i }).click();

    await expect(page.getByText('$375.00', { exact: true })).toBeVisible();
    await expect(page.getByText('$250.00', { exact: true })).toBeVisible();
    await expect(page.getByText('$140.00', { exact: true })).toBeVisible();
    await expect(page.getByText('$110.00', { exact: true })).toBeVisible();
    await expect(page.getByText(/high confidence · 90\/100/i)).toBeVisible();
    await expect(page.getByText(/configured payer contract rate for every procedure/i)).toBeVisible();
    await expect(page.getByText(/allowed-amount basis: configured payer contract rate for every procedure/i)).toBeVisible();

    await page.getByRole('button', { name: /share with patient portal/i }).click();
    await expect(page.getByRole('button', { name: /shared with patient portal/i })).toBeVisible();

    await page.evaluate(({ patientId, token, tenantId }) => {
      localStorage.setItem('patientPortalToken', token);
      localStorage.setItem('patientPortalTenantId', tenantId);
      localStorage.setItem('patientPortalPatient', JSON.stringify({
        id: patientId,
        firstName: 'Smoke',
        lastName: 'Patient',
        email: 'smoke.patient@example.com',
        practiceName: 'Dermatology Demo Office',
      }));
    }, { patientId: PRIMARY_PATIENT_ID, token: MOCK_COOKIE_TOKEN, tenantId: TENANT_ID });
    await page.goto('/portal/billing');
    await expect(page.getByRole('heading', { name: /billing & payments/i })).toBeVisible();
    await expect(page.getByText(/shared procedure estimates/i)).toBeVisible();
    await expect(page.getByText('$110.00', { exact: true })).toBeVisible();
    await expect(page.getByText(/contract rate for every procedure/i).first()).toBeVisible();

    const portalSession = await page.evaluate(() => ({
      token: localStorage.getItem('patientPortalToken'),
      tenantId: localStorage.getItem('patientPortalTenantId'),
    }));
    expect(portalSession).toEqual({ token: MOCK_COOKIE_TOKEN, tenantId: TENANT_ID });

    await page.getByRole('button', { name: /i understand this estimate/i }).click();
    await expect(page.getByText(/status: acknowledged/i)).toBeVisible();

    await page.getByRole('button', { name: /ask a billing question/i }).click();
    await page.getByLabel(/what would you like the billing team to answer/i).fill('Please confirm whether the deductible amount is current.');
    await page.getByRole('button', { name: /send request/i }).click();
    await expect(page.getByText(/status: billing question/i)).toBeVisible();

    portalState.setPortalPatient(UNRELATED_PATIENT_ID);
    await page.evaluate((patientId) => {
      localStorage.setItem('patientPortalPatient', JSON.stringify({
        id: patientId,
        firstName: 'Unrelated',
        lastName: 'Patient',
        email: 'unrelated@example.com',
        practiceName: 'Dermatology Demo Office',
      }));
    }, UNRELATED_PATIENT_ID);
    await page.goto('/portal/billing');
    await expect(page.getByText(/no cost estimate has been shared by your care team yet/i)).toBeVisible();
    const isolationResponse = await page.evaluate(async (estimateId) => {
      const response = await fetch(`/api/patient-portal-data/insurance-estimates/${estimateId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'tenant-demo' },
        body: JSON.stringify({ action: 'acknowledge' }),
      });
      return response.status;
    }, ESTIMATE_ID);
    expect(isolationResponse).toBe(404);

    await page.goto(`/patients/${PRIMARY_PATIENT_ID}?tab=account`);
    const lifecycle = await page.evaluate(async ({ estimateId, revisedEstimateId }) => {
      const headers = { 'Content-Type': 'application/json', 'X-Tenant-ID': 'tenant-demo' };
      const reviseResponse = await fetch(`/api/collections/estimate/${estimateId}/revise`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ serviceType: 'medical', cptCodes: ['99213'] }),
      });
      const revised = await reviseResponse.json() as { estimate?: { id?: string; version?: number; pricingBasis?: string } };
      const reconcileResponse = await fetch(`/api/collections/estimate/${revisedEstimateId}/reconcile`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          actualAllowedAmount: 145,
          actualInsurancePayment: 55,
          actualPatientResponsibility: 90,
          notes: 'Matched to final EOB in smoke test',
        }),
      });
      const reconciliation = await reconcileResponse.json() as { reconciliation?: { actualPatientResponsibility?: number } };
      const revokeResponse = await fetch(`/api/collections/estimate/${revisedEstimateId}/revoke`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: 'Procedure changed after EOB review' }),
      });
      const revoked = await revokeResponse.json() as { success?: boolean; patientId?: string };
      return {
        reviseCode: reviseResponse.status,
        revisedId: revised.estimate?.id,
        revisedVersion: revised.estimate?.version,
        revisedPricingBasis: revised.estimate?.pricingBasis,
        reconcileCode: reconcileResponse.status,
        reconciledPatient: reconciliation.reconciliation?.actualPatientResponsibility,
        revokeCode: revokeResponse.status,
        revokeSuccess: revoked.success,
        revokePatientId: revoked.patientId,
      };
    }, { estimateId: ESTIMATE_ID, revisedEstimateId: REVISED_ESTIMATE_ID });

    expect(lifecycle).toEqual({
      reviseCode: 201,
      revisedId: REVISED_ESTIMATE_ID,
      revisedVersion: 2,
      revisedPricingBasis: 'contract_rate',
      reconcileCode: 200,
      reconciledPatient: 90,
      revokeCode: 200,
      revokeSuccess: true,
      revokePatientId: PRIMARY_PATIENT_ID,
    });
  });
});
