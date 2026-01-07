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
    expect(result).toEqual({ id: 'user-1' });
  });

  it('finds users by id', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'user-2' }] });

    const result = await userStore.findById('user-2');

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('from users'), ['user-2']);
    expect(result).toEqual({ id: 'user-2' });
  });

  it('lists users by tenant', async () => {
    const rows = [{ id: 'user-1' }, { id: 'user-2' }];
    queryMock.mockResolvedValueOnce({ rows });

    const result = await userStore.listByTenant('tenant-1');

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('from users'), ['tenant-1']);
    expect(result).toBe(rows);
  });

  it('masks passwordHash', () => {
    const user = { id: 'user-1', email: 'user@example.com', passwordHash: 'hash' };

    expect(userStore.mask(user as any)).toEqual({ id: 'user-1', email: 'user@example.com' });
  });

  it('returns default password', () => {
    expect(userStore.getDefaultPassword()).toBe('Password123!');
  });
});
