import { requireRoles } from '../rbac';
import { FINANCIAL_ROLES } from '../../lib/roles';

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

describe('requireRoles', () => {
  it('returns 401 when user missing', () => {
    const req = {} as any;
    const res = makeRes();
    const next = jest.fn();

    requireRoles(['admin'])(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthenticated' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when role is not allowed', () => {
    const req = { user: { role: 'ma' } } as any;
    const res = makeRes();
    const next = jest.fn();

    requireRoles(['admin', 'provider'])(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient role' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when role allowed', () => {
    const req = { user: { role: 'provider' } } as any;
    const res = makeRes();
    const next = jest.fn();

    requireRoles(['provider'])(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it('calls next when allowed via secondary role', () => {
    const req = { user: { role: 'provider', secondaryRoles: ['admin'] } } as any;
    const res = makeRes();
    const next = jest.fn();

    requireRoles(['admin'])(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it('denies provider-only user for financial role gate', () => {
    const req = { user: { role: 'provider' } } as any;
    const res = makeRes();
    const next = jest.fn();

    requireRoles(FINANCIAL_ROLES)(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows provider with secondary financial role', () => {
    const req = { user: { role: 'provider', secondaryRoles: ['billing'] } } as any;
    const res = makeRes();
    const next = jest.fn();

    requireRoles(FINANCIAL_ROLES)(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });
});
