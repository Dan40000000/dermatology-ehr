import { requireRoles } from '../rbac';
import { CHARGE_CAPTURE_ROLES, FINANCIAL_ROLES } from '../../lib/roles';

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

  it('allows canonical alias roles through normalization', () => {
    const req = { user: { role: 'medical_assistant' } } as any;
    const res = makeRes();
    const next = jest.fn();

    requireRoles(['ma'])(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows normalized front desk aliases for financial role gates', () => {
    const req = { user: { role: 'receptionist' } } as any;
    const res = makeRes();
    const next = jest.fn();

    requireRoles(FINANCIAL_ROLES)(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows provider charge capture without granting full financial access', () => {
    const chargeReq = { user: { role: 'provider' } } as any;
    const financialReq = { user: { role: 'provider' } } as any;
    const chargeRes = makeRes();
    const financialRes = makeRes();
    const chargeNext = jest.fn();
    const financialNext = jest.fn();

    requireRoles(CHARGE_CAPTURE_ROLES)(chargeReq, chargeRes as any, chargeNext);
    requireRoles(FINANCIAL_ROLES)(financialReq, financialRes as any, financialNext);

    expect(chargeNext).toHaveBeenCalled();
    expect(financialRes.status).toHaveBeenCalledWith(403);
    expect(financialNext).not.toHaveBeenCalled();
  });

  it('allows medical assistants to capture charges', () => {
    const req = { user: { role: 'ma' } } as any;
    const res = makeRes();
    const next = jest.fn();

    requireRoles(CHARGE_CAPTURE_ROLES)(req, res as any, next);

    expect(next).toHaveBeenCalled();
  });
});
