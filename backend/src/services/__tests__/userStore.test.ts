import { userStore } from '../userStore';
import { pool } from '../../db/pool';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const queryMock = pool.query as jest.Mock;

describe('userStore', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('finds users by email and tenant with lowercase email', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] });

    const result = await userStore.findByEmailAndTenant('User@Example.com', 'tenant-1');

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('from users'), ['user@example.com', 'tenant-1']);
    expect(result).toEqual({ id: 'user-1', secondaryRoles: [], roles: [] });
  });

  it('falls back to legacy users query when secondary_roles column is missing', async () => {
    queryMock
      .mockRejectedValueOnce({ code: '42703', message: 'column "secondary_roles" does not exist' })
      .mockResolvedValueOnce({ rows: [{ id: 'legacy-user' }] });

    const result = await userStore.findByEmailAndTenant('legacy@example.com', 'tenant-legacy');

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ id: 'legacy-user', secondaryRoles: [], roles: [] });
  });

  it('finds users by id', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'user-2' }] });

    const result = await userStore.findById('user-2');

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('from users'), ['user-2']);
    expect(result).toEqual({ id: 'user-2', secondaryRoles: [], roles: [] });
  });

  it('lists users by tenant', async () => {
    const rows = [{ id: 'user-1' }, { id: 'user-2' }];
    queryMock.mockResolvedValueOnce({ rows });

    const result = await userStore.listByTenant('tenant-1');

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('from users'), ['tenant-1']);
    expect(result).toEqual([
      { id: 'user-1', secondaryRoles: [], roles: [] },
      { id: 'user-2', secondaryRoles: [], roles: [] },
    ]);
  });

  it('masks passwordHash', () => {
    const user = { id: 'user-1', email: 'user@example.com', role: 'provider', secondaryRoles: ['admin'], passwordHash: 'hash' };

    expect(userStore.mask(user as any)).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      role: 'provider',
      secondaryRoles: ['admin'],
      roles: ['provider', 'admin'],
    });
  });

  it('returns default password', () => {
    expect(userStore.getDefaultPassword()).toBe('Password123!');
  });
});
