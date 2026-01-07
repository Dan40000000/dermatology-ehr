import { requireKioskAuth, optionalKioskAuth } from '../kioskAuth';
import { pool } from '../../db/pool';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../config/env', () => ({
  env: { tenantHeader: 'x-tenant-id' },
}));

const queryMock = pool.query as jest.Mock;

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

describe('kioskAuth middleware', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('rejects missing kiosk code', async () => {
    const req = { header: jest.fn(), ip: '1.1.1.1' } as any;
    const res = makeRes();
    const next = jest.fn();

    await requireKioskAuth(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing kiosk device code' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects missing tenant header', async () => {
    const req = { header: jest.fn().mockReturnValueOnce('device-code').mockReturnValueOnce(undefined) } as any;
    const res = makeRes();
    const next = jest.fn();

    await requireKioskAuth(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing tenant ID' });
  });

  it('rejects invalid device code', async () => {
    const req = { header: jest.fn().mockReturnValueOnce('device-code').mockReturnValueOnce('tenant-1') } as any;
    const res = makeRes();
    const next = jest.fn();
    queryMock.mockResolvedValueOnce({ rows: [] });

    await requireKioskAuth(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid kiosk device code' });
  });

  it('rejects inactive device', async () => {
    const req = { header: jest.fn().mockReturnValueOnce('device-code').mockReturnValueOnce('tenant-1') } as any;
    const res = makeRes();
    const next = jest.fn();
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'k1', isActive: false }] });

    await requireKioskAuth(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Kiosk device is inactive' });
  });

  it('authenticates active device', async () => {
    const req = { header: jest.fn().mockReturnValueOnce('device-code').mockReturnValueOnce('tenant-1'), ip: '1.1.1.1' } as any;
    const res = makeRes();
    const next = jest.fn();
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'k1',
            tenantId: 'tenant-1',
            locationId: 'loc-1',
            deviceName: 'Front Desk',
            deviceCode: 'device-code',
            isActive: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await requireKioskAuth(req, res as any, next);

    expect(req.kiosk).toEqual({
      id: 'k1',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      deviceName: 'Front Desk',
      deviceCode: 'device-code',
    });
    expect(next).toHaveBeenCalled();
  });

  it('skips optional auth without kiosk code', async () => {
    const req = { header: jest.fn().mockReturnValue(undefined) } as any;
    const res = makeRes();
    const next = jest.fn();

    await optionalKioskAuth(req, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
