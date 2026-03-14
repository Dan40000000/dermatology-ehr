import express from 'express';
import request from 'supertest';
import { externalIntegrationsRouter } from '../externalIntegrations';

const configureIntegrationMock = jest.fn();
const testConnectionMock = jest.fn();
const getIntegrationServiceMock = jest.fn(() => ({
  configureIntegration: configureIntegrationMock,
  testConnection: testConnectionMock,
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
  getIntegrationServiceMock.mockClear();
  auditLogMock.mockReset();

  configureIntegrationMock.mockResolvedValue({ configId: 'cfg-1' });
  testConnectionMock.mockResolvedValue({ success: true, message: 'Connected to Stripe (mock mode)' });
});

describe('External integrations Stripe setup routes', () => {
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
});
