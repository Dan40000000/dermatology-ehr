import { requireModuleAccess } from '../moduleAccess';
import { canAccessModule } from '../../config/moduleAccess';

jest.mock('../../config/moduleAccess', () => ({
  canAccessModule: jest.fn(),
}));

const canAccessModuleMock = canAccessModule as jest.Mock;

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

describe('requireModuleAccess', () => {
  beforeEach(() => {
    canAccessModuleMock.mockReset();
  });

  it('returns 401 when user is missing', () => {
    const req = {} as any;
    const res = makeRes();
    const next = jest.fn();

    requireModuleAccess('home')(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthenticated' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when role is insufficient', () => {
    canAccessModuleMock.mockReturnValue(false);
    const req = { user: { role: 'provider' } } as any;
    const res = makeRes();
    const next = jest.fn();

    requireModuleAccess('admin')(req, res as any, next);

    expect(canAccessModuleMock).toHaveBeenCalledWith(['provider'], 'admin');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient role' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when role is allowed', () => {
    canAccessModuleMock.mockReturnValue(true);
    const req = { user: { role: 'admin' } } as any;
    const res = makeRes();
    const next = jest.fn();

    requireModuleAccess('home')(req, res as any, next);

    expect(canAccessModuleMock).toHaveBeenCalledWith(['admin'], 'home');
    expect(next).toHaveBeenCalled();
  });
});
