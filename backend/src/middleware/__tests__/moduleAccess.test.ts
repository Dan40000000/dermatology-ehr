import { requireModuleAccess } from '../moduleAccess';
import { canAccessTenantModule } from '../../services/accessSettings';

jest.mock('../../services/accessSettings', () => ({
  canAccessTenantModule: jest.fn(),
}));

const canAccessTenantModuleMock = canAccessTenantModule as jest.Mock;

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

describe('requireModuleAccess', () => {
  beforeEach(() => {
    canAccessTenantModuleMock.mockReset();
  });

  it('returns 401 when user is missing', async () => {
    const req = {} as any;
    const res = makeRes();
    const next = jest.fn();

    await requireModuleAccess('home')(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthenticated' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when role is insufficient', async () => {
    canAccessTenantModuleMock.mockResolvedValue(false);
    const req = { user: { role: 'provider', tenantId: 'tenant-1' } } as any;
    const res = makeRes();
    const next = jest.fn();

    await requireModuleAccess('admin')(req, res as any, next);

    expect(canAccessTenantModuleMock).toHaveBeenCalledWith('tenant-1', ['provider'], 'admin');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient role' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when role is allowed', async () => {
    canAccessTenantModuleMock.mockResolvedValue(true);
    const req = { user: { role: 'admin', tenantId: 'tenant-1' } } as any;
    const res = makeRes();
    const next = jest.fn();

    await requireModuleAccess('home')(req, res as any, next);

    expect(canAccessTenantModuleMock).toHaveBeenCalledWith('tenant-1', ['admin'], 'home');
    expect(next).toHaveBeenCalled();
  });
});
