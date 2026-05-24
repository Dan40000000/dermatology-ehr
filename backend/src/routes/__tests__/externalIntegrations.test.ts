import express from 'express';
import request from 'supertest';
import { externalIntegrationsRouter } from '../externalIntegrations';

const configureIntegrationMock = jest.fn();
const testConnectionMock = jest.fn();
const getIntegrationTypeStatusMock = jest.fn();
const getStripeConnectStatusMock = jest.fn();
const createStripeConnectOnboardingLinkMock = jest.fn();
const refreshStripeConnectStatusMock = jest.fn();
const createPracticeSubscriptionCheckoutMock = jest.fn();
const refreshPracticeSubscriptionStatusMock = jest.fn();
const getIntegrationServiceMock = jest.fn(() => ({
  configureIntegration: configureIntegrationMock,
  testConnection: testConnectionMock,
  getIntegrationTypeStatus: getIntegrationTypeStatusMock,
  getStripeConnectStatus: getStripeConnectStatusMock,
  createStripeConnectOnboardingLink: createStripeConnectOnboardingLinkMock,
  refreshStripeConnectStatus: refreshStripeConnectStatusMock,
  createPracticeSubscriptionCheckout: createPracticeSubscriptionCheckoutMock,
  refreshPracticeSubscriptionStatus: refreshPracticeSubscriptionStatusMock,
}));
const auditLogMock = jest.fn();

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', tenantId: 'tenant-demo', role: 'admin' };
    return next();
  },
}));

jest.mock('../../middleware/rbac', () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../services/audit', () => ({
  auditLog: (...args: any[]) => auditLogMock(...args),
}));

jest.mock('../../services/integrationService', () => ({
  getIntegrationService: (...args: any[]) => getIntegrationServiceMock(...args),
  IntegrationService: class IntegrationService {},
}));

const app = express();
app.use(express.json());
app.use('/api/external-integrations', externalIntegrationsRouter);

beforeEach(() => {
  configureIntegrationMock.mockReset();
  testConnectionMock.mockReset();
  getIntegrationTypeStatusMock.mockReset();
  getStripeConnectStatusMock.mockReset();
  createStripeConnectOnboardingLinkMock.mockReset();
  refreshStripeConnectStatusMock.mockReset();
  createPracticeSubscriptionCheckoutMock.mockReset();
  refreshPracticeSubscriptionStatusMock.mockReset();
  getIntegrationServiceMock.mockClear();
  auditLogMock.mockReset();

  configureIntegrationMock.mockResolvedValue({ configId: 'cfg-1' });
  testConnectionMock.mockResolvedValue({ success: true, message: 'Connected to Stripe (mock mode)' });
  getIntegrationTypeStatusMock.mockResolvedValue({
    type: 'eligibility',
    provider: 'stedi',
    isConfigured: true,
    isActive: true,
    connectionStatus: 'connected',
  });
  getStripeConnectStatusMock.mockResolvedValue({
    mode: 'test',
    platformConfigured: true,
    connectedAccountId: 'acct_123',
    onboardingStatus: 'pending',
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: true,
    requirementsDue: ['external_account'],
    subscription: { status: 'not_started' },
  });
  createStripeConnectOnboardingLinkMock.mockResolvedValue({
    mode: 'test',
    accountId: 'acct_123',
    url: 'https://connect.stripe.com/setup/s/acct_123',
    expiresAt: '2026-05-24T04:00:00.000Z',
  });
  refreshStripeConnectStatusMock.mockResolvedValue({
    mode: 'test',
    platformConfigured: true,
    connectedAccountId: 'acct_123',
    onboardingStatus: 'complete',
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    requirementsDue: [],
    subscription: { status: 'not_started' },
  });
  createPracticeSubscriptionCheckoutMock.mockResolvedValue({
    mode: 'test',
    sessionId: 'cs_test_123',
    url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    customerId: 'cus_123',
  });
  refreshPracticeSubscriptionStatusMock.mockResolvedValue({
    mode: 'test',
    platformConfigured: true,
    onboardingStatus: 'complete',
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    requirementsDue: [],
    subscription: { status: 'active', subscriptionId: 'sub_123' },
  });
});

describe('External integrations Stripe setup routes', () => {
  it('GET /api/external-integrations/eligibility returns read-only connection status', async () => {
    const response = await request(app).get('/api/external-integrations/eligibility');

    expect(response.status).toBe(200);
    expect(response.body.integration).toMatchObject({
      type: 'eligibility',
      provider: 'stedi',
      connectionStatus: 'connected',
    });
    expect(getIntegrationTypeStatusMock).toHaveBeenCalledWith('eligibility');
  });

  it('POST /api/external-integrations/payments/stripe/configure rejects invalid key formats', async () => {
    const response = await request(app)
      .post('/api/external-integrations/payments/stripe/configure')
      .send({
        secretKey: 'not-a-stripe-key',
        publishableKey: 'also-not-a-key',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid Stripe key format');
    expect(configureIntegrationMock).not.toHaveBeenCalled();
  });

  it('POST /api/external-integrations/payments/stripe/configure rejects mismatched key modes', async () => {
    const response = await request(app)
      .post('/api/external-integrations/payments/stripe/configure')
      .send({
        secretKey: 'sk_test_12345',
        publishableKey: 'pk_live_12345',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('must both be test or both be live');
    expect(configureIntegrationMock).not.toHaveBeenCalled();
  });

  it('POST /api/external-integrations/payments/stripe/configure stores Stripe test credentials', async () => {
    testConnectionMock.mockResolvedValueOnce({ success: true, message: 'Connected to Stripe (test mode)' });

    const response = await request(app)
      .post('/api/external-integrations/payments/stripe/configure')
      .send({
        secretKey: 'sk_test_12345',
        publishableKey: 'pk_test_67890',
        syncFrequencyMinutes: 120,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      mode: 'test',
      noLiveCharges: true,
    });
    expect(configureIntegrationMock).toHaveBeenCalledWith(
      'payment',
      expect.objectContaining({
        provider: 'stripe',
        config: expect.objectContaining({
          environment: 'stripe',
          mode: 'test',
          publishableKey: 'pk_test_67890',
        }),
        credentials: expect.objectContaining({
          stripeSecretKey: 'sk_test_12345',
          stripePublishableKey: 'pk_test_67890',
        }),
        isActive: true,
        syncFrequencyMinutes: 120,
      })
    );
    expect(testConnectionMock).toHaveBeenCalledWith('payment');
    expect(auditLogMock).toHaveBeenCalledWith(
      'tenant-demo',
      'user-1',
      'integration.configured',
      'integration',
      'payment:stripe'
    );
  });

  it('POST /api/external-integrations/payments/stripe/use-mock enables no-charge payment mode', async () => {
    const response = await request(app).post('/api/external-integrations/payments/stripe/use-mock').send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      mode: 'mock',
      noLiveCharges: true,
    });
    expect(configureIntegrationMock).toHaveBeenCalledWith(
      'payment',
      expect.objectContaining({
        provider: 'stripe',
        config: expect.objectContaining({
          environment: 'mock',
          mode: 'test',
        }),
        isActive: true,
        syncFrequencyMinutes: 60,
      })
    );
    expect(testConnectionMock).toHaveBeenCalledWith('payment');
    expect(auditLogMock).toHaveBeenCalledWith(
      'tenant-demo',
      'user-1',
      'integration.configured',
      'integration',
      'payment:mock'
    );
  });

  it('GET /api/external-integrations/payments/stripe/connect/status returns Connect and subscription status', async () => {
    const response = await request(app).get('/api/external-integrations/payments/stripe/connect/status');

    expect(response.status).toBe(200);
    expect(response.body.status).toMatchObject({
      mode: 'test',
      connectedAccountId: 'acct_123',
      onboardingStatus: 'pending',
      subscription: { status: 'not_started' },
    });
    expect(getStripeConnectStatusMock).toHaveBeenCalledTimes(1);
  });

  it('POST /api/external-integrations/payments/stripe/connect/onboarding-link creates hosted Stripe onboarding link', async () => {
    const response = await request(app)
      .post('/api/external-integrations/payments/stripe/connect/onboarding-link')
      .send({
        returnUrl: 'https://app.example.com/integrations?stripe=return',
        refreshUrl: 'https://app.example.com/integrations?stripe=refresh',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      mode: 'test',
      accountId: 'acct_123',
      url: 'https://connect.stripe.com/setup/s/acct_123',
    });
    expect(createStripeConnectOnboardingLinkMock).toHaveBeenCalledWith({
      returnUrl: 'https://app.example.com/integrations?stripe=return',
      refreshUrl: 'https://app.example.com/integrations?stripe=refresh',
      userEmail: undefined,
    });
    expect(auditLogMock).toHaveBeenCalledWith(
      'tenant-demo',
      'user-1',
      'stripe.connect_onboarding_started',
      'integration',
      'payment:stripe-connect'
    );
  });

  it('POST /api/external-integrations/payments/stripe/subscription/checkout creates subscription checkout', async () => {
    const response = await request(app)
      .post('/api/external-integrations/payments/stripe/subscription/checkout')
      .send({
        returnUrl: 'https://app.example.com/integrations?subscription=success',
        cancelUrl: 'https://app.example.com/integrations?subscription=cancelled',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      mode: 'test',
      sessionId: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
    expect(createPracticeSubscriptionCheckoutMock).toHaveBeenCalledWith({
      returnUrl: 'https://app.example.com/integrations?subscription=success',
      cancelUrl: 'https://app.example.com/integrations?subscription=cancelled',
      priceId: undefined,
      userEmail: undefined,
    });
    expect(auditLogMock).toHaveBeenCalledWith(
      'tenant-demo',
      'user-1',
      'stripe.subscription_checkout_started',
      'integration',
      'payment:stripe-subscription'
    );
  });
});
