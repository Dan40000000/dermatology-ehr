import express from 'express';
import request from 'supertest';
import { mipsRouter } from '../mips';
import { mipsReadinessRouter } from '../mipsReadiness';
import { canAccessTenantModule } from '../../services/accessSettings';
import { pool } from '../../db/pool';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const role = String(req.headers['x-test-role'] || 'admin');
    const tenantId = String(req.headers['x-test-tenant'] || 'tenant-default');
    req.user = { id: 'user-a', tenantId, role };
    req.tenantId = tenantId;
    return next();
  },
}));

jest.mock('../../middleware/rateLimit', () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../services/accessSettings', () => ({
  canAccessTenantModule: jest.fn(),
}));

jest.mock('../../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

const app = express();
app.use(express.json());
app.use('/api/mips/readiness', mipsReadinessRouter);
app.use('/api/mips', mipsRouter);

const canAccessTenantModuleMock = canAccessTenantModule as jest.Mock;
const queryMock = pool.query as jest.Mock;

const REPORTING_ROLES = ['admin', 'provider', 'manager', 'compliance_officer'];
const DEFAULT_QUALITY_ROLES = new Set(REPORTING_ROLES);

beforeEach(() => {
  canAccessTenantModuleMock.mockReset();
  canAccessTenantModuleMock.mockImplementation((tenantId: string, roleOrRoles: string[], moduleKey: string) => {
    if (moduleKey !== 'quality') return false;
    const allowed = tenantId === 'tenant-provider-removed'
      ? new Set(['admin', 'manager', 'compliance_officer'])
      : tenantId === 'tenant-ma-granted'
        ? new Set(['admin', 'ma'])
        : DEFAULT_QUALITY_ROLES;
    return roleOrRoles.some((role) => allowed.has(role));
  });
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('MIPS reporting and tenant quality-module access', () => {
  it.each(REPORTING_ROLES)('retains default reporting access for %s', async (role) => {
    const legacyResponse = await request(app)
      .get('/api/mips/measures')
      .set('X-Test-Role', role)
      .set('X-Test-Tenant', 'tenant-default');
    const readinessResponse = await request(app)
      .get('/api/mips/readiness/profile?year=2026')
      .set('X-Test-Role', role)
      .set('X-Test-Tenant', 'tenant-default');

    expect(legacyResponse.status).toBe(200);
    expect(readinessResponse.status).toBe(200);
  });

  it('denies a provider removed from tenant quality access on legacy and readiness APIs', async () => {
    const legacyResponse = await request(app)
      .get('/api/mips/measures')
      .set('X-Test-Role', 'provider')
      .set('X-Test-Tenant', 'tenant-provider-removed');
    const readinessResponse = await request(app)
      .get('/api/mips/readiness/profile?year=2026')
      .set('X-Test-Role', 'provider')
      .set('X-Test-Tenant', 'tenant-provider-removed');

    expect(legacyResponse.status).toBe(403);
    expect(readinessResponse.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('does not let a tenant quality grant give MA reporting access', async () => {
    const legacyResponse = await request(app)
      .get('/api/mips/measures')
      .set('X-Test-Role', 'ma')
      .set('X-Test-Tenant', 'tenant-ma-granted');
    const readinessResponse = await request(app)
      .get('/api/mips/readiness/profile?year=2026')
      .set('X-Test-Role', 'ma')
      .set('X-Test-Tenant', 'tenant-ma-granted');

    expect(legacyResponse.status).toBe(403);
    expect(readinessResponse.status).toBe(403);
    expect(canAccessTenantModuleMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it.each(['nurse', 'billing', 'front_desk', 'staff'])('keeps unauthorized role %s denied', async (role) => {
    const response = await request(app)
      .get('/api/mips/measures')
      .set('X-Test-Role', role)
      .set('X-Test-Tenant', 'tenant-default');

    expect(response.status).toBe(403);
    expect(canAccessTenantModuleMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('keeps clinical itch capture independent from reporting access', async () => {
    const response = await request(app)
      .post('/api/mips/readiness/itch-assessments')
      .set('X-Test-Role', 'ma')
      .set('X-Test-Tenant', 'tenant-provider-removed')
      .send({});

    expect(response.status).toBe(400);
    expect(canAccessTenantModuleMock).not.toHaveBeenCalled();
  });
});
