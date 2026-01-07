import { requireRoles } from '../rbac';

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
});
