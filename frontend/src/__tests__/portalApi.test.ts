import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchPortalBalance,
  fetchPortalCharges,
  fetchPortalPaymentMethods,
  addPortalPaymentMethod,
  deletePortalPaymentMethod,
  makePortalPayment,
  fetchPortalPaymentHistory,
  fetchPortalPaymentPlans,
  fetchPortalPaymentPlanInstallments,
  fetchPortalAutoPay,
  enrollPortalAutoPay,
  cancelPortalAutoPay,
  fetchPortalIntakeForms,
  fetchPortalIntakeForm,
  startPortalIntakeForm,
  savePortalIntakeResponse,
  fetchPortalIntakeHistory,
  fetchPortalConsents,
  fetchPortalRequiredConsents,
  signPortalConsent,
  fetchPortalSignedConsents,
  startPortalCheckin,
  fetchPortalCheckinSession,
  updatePortalCheckinSession,
  uploadPortalInsuranceCard,
} from '../portalApi';

const baseUrl = 'http://localhost:4000';
const tenantId = 'tenant-1';
const token = 'token-1';

const paymentMethodData = {
  paymentType: 'credit_card' as const,
  cardNumber: '4111111111111111',
  cardBrand: 'visa',
  expiryMonth: 1,
  expiryYear: 2030,
  cardholderName: 'Test User',
  billingAddress: {
    street: '1 Main',
    city: 'Town',
    state: 'ST',
    zip: '12345',
  },
};

const autopayData = {
  paymentMethodId: 'pm-1',
  chargeDay: 5,
  termsAccepted: true,
};

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

const okResponse = (data: unknown = {}) =>
  ({ ok: true, json: vi.fn().mockResolvedValue(data) }) as Response;

describe('portalApi', () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    {
      name: 'fetchPortalBalance',
      call: () => fetchPortalBalance(tenantId, token),
      url: `${baseUrl}/api/patient-portal/billing/balance`,
    },
    {
      name: 'fetchPortalCharges',
      call: () => fetchPortalCharges(tenantId, token),
      url: `${baseUrl}/api/patient-portal/billing/charges`,
    },
    {
      name: 'fetchPortalPaymentMethods',
      call: () => fetchPortalPaymentMethods(tenantId, token),
      url: `${baseUrl}/api/patient-portal/billing/payment-methods`,
    },
    {
      name: 'addPortalPaymentMethod',
      call: () => addPortalPaymentMethod(tenantId, token, paymentMethodData),
      url: `${baseUrl}/api/patient-portal/billing/payment-methods`,
      method: 'POST',
      body: JSON.stringify(paymentMethodData),
      contentType: true,
    },
    {
      name: 'deletePortalPaymentMethod',
      call: () => deletePortalPaymentMethod(tenantId, token, 'pm-1'),
      url: `${baseUrl}/api/patient-portal/billing/payment-methods/pm-1`,
      method: 'DELETE',
    },
    {
      name: 'makePortalPayment',
      call: () => makePortalPayment(tenantId, token, { amount: 25 }),
      url: `${baseUrl}/api/patient-portal/billing/payments`,
      method: 'POST',
      body: JSON.stringify({ amount: 25 }),
      contentType: true,
    },
    {
      name: 'fetchPortalPaymentHistory',
      call: () => fetchPortalPaymentHistory(tenantId, token),
      url: `${baseUrl}/api/patient-portal/billing/payment-history`,
    },
    {
      name: 'fetchPortalPaymentPlans',
      call: () => fetchPortalPaymentPlans(tenantId, token),
      url: `${baseUrl}/api/patient-portal/billing/payment-plans`,
    },
    {
      name: 'fetchPortalPaymentPlanInstallments',
      call: () => fetchPortalPaymentPlanInstallments(tenantId, token, 'plan-1'),
      url: `${baseUrl}/api/patient-portal/billing/payment-plans/plan-1/installments`,
    },
    {
      name: 'fetchPortalAutoPay',
      call: () => fetchPortalAutoPay(tenantId, token),
      url: `${baseUrl}/api/patient-portal/billing/autopay`,
    },
    {
      name: 'enrollPortalAutoPay',
      call: () => enrollPortalAutoPay(tenantId, token, autopayData),
      url: `${baseUrl}/api/patient-portal/billing/autopay`,
      method: 'POST',
      body: JSON.stringify(autopayData),
      contentType: true,
    },
    {
      name: 'cancelPortalAutoPay',
      call: () => cancelPortalAutoPay(tenantId, token),
      url: `${baseUrl}/api/patient-portal/billing/autopay`,
      method: 'DELETE',
    },
    {
      name: 'fetchPortalIntakeForms',
      call: () => fetchPortalIntakeForms(tenantId, token),
      url: `${baseUrl}/api/patient-portal/intake/forms`,
    },
    {
      name: 'fetchPortalIntakeForm',
      call: () => fetchPortalIntakeForm(tenantId, token, 'assignment-1'),
      url: `${baseUrl}/api/patient-portal/intake/forms/assignment-1`,
    },
    {
      name: 'startPortalIntakeForm',
      call: () => startPortalIntakeForm(tenantId, token, 'assignment-1'),
      url: `${baseUrl}/api/patient-portal/intake/forms/assignment-1/start`,
      method: 'POST',
    },
    {
      name: 'savePortalIntakeResponse',
      call: () =>
        savePortalIntakeResponse(tenantId, token, 'response-1', {
          responseData: { field: 'value' },
          submit: true,
        }),
      url: `${baseUrl}/api/patient-portal/intake/responses/response-1`,
      method: 'PUT',
      body: JSON.stringify({ responseData: { field: 'value' }, submit: true }),
      contentType: true,
    },
    {
      name: 'fetchPortalIntakeHistory',
      call: () => fetchPortalIntakeHistory(tenantId, token),
      url: `${baseUrl}/api/patient-portal/intake/history`,
    },
    {
      name: 'fetchPortalConsents',
      call: () => fetchPortalConsents(tenantId, token),
      url: `${baseUrl}/api/patient-portal/intake/consents`,
    },
    {
      name: 'fetchPortalRequiredConsents',
      call: () => fetchPortalRequiredConsents(tenantId, token),
      url: `${baseUrl}/api/patient-portal/intake/consents/required`,
    },
    {
      name: 'signPortalConsent',
      call: () =>
        signPortalConsent(tenantId, token, 'consent-1', {
          signatureData: 'sig',
          signerName: 'Test User',
        }),
      url: `${baseUrl}/api/patient-portal/intake/consents/consent-1/sign`,
      method: 'POST',
      body: JSON.stringify({ signatureData: 'sig', signerName: 'Test User' }),
      contentType: true,
    },
    {
      name: 'fetchPortalSignedConsents',
      call: () => fetchPortalSignedConsents(tenantId, token),
      url: `${baseUrl}/api/patient-portal/intake/consents/signed`,
    },
    {
      name: 'startPortalCheckin',
      call: () =>
        startPortalCheckin(tenantId, token, {
          appointmentId: 'appt-1',
        }),
      url: `${baseUrl}/api/patient-portal/intake/checkin`,
      method: 'POST',
      body: JSON.stringify({ appointmentId: 'appt-1' }),
      contentType: true,
    },
    {
      name: 'fetchPortalCheckinSession',
      call: () => fetchPortalCheckinSession(tenantId, token, 'session-1'),
      url: `${baseUrl}/api/patient-portal/intake/checkin/session-1`,
    },
    {
      name: 'updatePortalCheckinSession',
      call: () =>
        updatePortalCheckinSession(tenantId, token, 'session-1', {
          demographicsConfirmed: true,
        }),
      url: `${baseUrl}/api/patient-portal/intake/checkin/session-1`,
      method: 'PUT',
      body: JSON.stringify({ demographicsConfirmed: true }),
      contentType: true,
    },
    {
      name: 'uploadPortalInsuranceCard',
      call: () =>
        uploadPortalInsuranceCard(tenantId, token, 'session-1', {
          frontImageUrl: 'front',
          backImageUrl: 'back',
        }),
      url: `${baseUrl}/api/patient-portal/intake/checkin/session-1/upload-insurance`,
      method: 'POST',
      body: JSON.stringify({ frontImageUrl: 'front', backImageUrl: 'back' }),
      contentType: true,
    },
  ])('calls $name with expected request details', async ({ call, url, method, body, contentType }) => {
    fetchMock.mockResolvedValueOnce(okResponse({}));

    await call();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(options?.credentials).toBe('include');

    if (method) {
      expect(options?.method).toBe(method);
    } else {
      expect(options?.method).toBeUndefined();
    }

    if (body) {
      expect(options?.body).toBe(body);
    }

    const headers = options?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${token}`);
    expect(headers['x-tenant-id']).toBe(tenantId);
    if (contentType) {
      expect(headers['Content-Type']).toBe('application/json');
    }
  });

  it('throws when balance fetch fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);

    await expect(fetchPortalBalance(tenantId, token)).rejects.toThrow('Failed to fetch balance');
  });
});
