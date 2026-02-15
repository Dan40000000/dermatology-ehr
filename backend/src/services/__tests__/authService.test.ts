import jwt from 'jsonwebtoken';
import { issueTokens, rotateRefreshToken } from '../authService';
import { pool } from '../../db/pool';
import { userStore } from '../userStore';
import { env } from '../../config/env';

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../userStore', () => ({
  userStore: {
    findById: jest.fn(),
  },
}));

const signMock = jwt.sign as jest.Mock;
const verifyMock = jwt.verify as jest.Mock;
const queryMock = pool.query as jest.Mock;
const findByIdMock = userStore.findById as jest.Mock;

describe('authService', () => {
  const user = {
    id: 'user-1',
    tenantId: 'tenant-1',
    role: 'admin',
    secondaryRoles: ['billing'],
    email: 'user@example.com',
    fullName: 'User Example',
  };

  beforeEach(() => {
    signMock.mockReset();
    verifyMock.mockReset();
    queryMock.mockReset();
    findByIdMock.mockReset();
  });

  it('issues access and refresh tokens', async () => {
    signMock.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');
    queryMock.mockResolvedValueOnce({});

    const tokens = await issueTokens(user as any);

    expect(tokens).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: env.accessTokenTtlSec,
    });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('insert into refresh_tokens'), [
      'refresh-token',
      user.id,
      user.tenantId,
      expect.any(String),
    ]);
  });

  it('returns null when refresh token is invalid', async () => {
    verifyMock.mockReturnValueOnce({ type: 'access' });

    const result = await rotateRefreshToken('bad-token');

    expect(result).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns null for revoked or expired tokens', async () => {
    verifyMock.mockReturnValueOnce({ type: 'refresh', sub: user.id, tenantId: user.tenantId });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          token: 'old-token',
          revoked: true,
          expires_at: new Date(Date.now() + 5000).toISOString(),
        },
      ],
    });

    await expect(rotateRefreshToken('old-token')).resolves.toBeNull();

    verifyMock.mockReturnValueOnce({ type: 'refresh', sub: user.id, tenantId: user.tenantId });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          token: 'old-token',
          revoked: false,
          expires_at: new Date(Date.now() - 5000).toISOString(),
        },
      ],
    });

    await expect(rotateRefreshToken('old-token')).resolves.toBeNull();
  });

  it('returns null when user is missing or tenant mismatched', async () => {
    verifyMock.mockReturnValueOnce({ type: 'refresh', sub: user.id, tenantId: user.tenantId });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          token: 'old-token',
          revoked: false,
          expires_at: new Date(Date.now() + 5000).toISOString(),
        },
      ],
    });
    findByIdMock.mockResolvedValueOnce(null);

    await expect(rotateRefreshToken('old-token')).resolves.toBeNull();

    verifyMock.mockReturnValueOnce({ type: 'refresh', sub: user.id, tenantId: user.tenantId });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          token: 'old-token',
          revoked: false,
          expires_at: new Date(Date.now() + 5000).toISOString(),
        },
      ],
    });
    findByIdMock.mockResolvedValueOnce({ ...user, tenantId: 'tenant-2' });

    await expect(rotateRefreshToken('old-token')).resolves.toBeNull();
  });

  it('rotates refresh tokens for valid sessions', async () => {
    verifyMock.mockReturnValueOnce({
      type: 'refresh',
      sub: user.id,
      tenantId: user.tenantId,
    });
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            token: 'old-token',
            user_id: user.id,
            tenant_id: user.tenantId,
            revoked: false,
            expires_at: new Date(Date.now() + 5000).toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    findByIdMock.mockResolvedValueOnce(user);
    signMock.mockReturnValueOnce('access-new').mockReturnValueOnce('refresh-new');

    const result = await rotateRefreshToken('old-token');

    expect(result).toEqual({
      tokens: {
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
        expiresIn: env.accessTokenTtlSec,
      },
      user: {
        id: user.id,
        tenantId: user.tenantId,
        role: user.role,
        secondaryRoles: ['billing'],
        roles: ['admin', 'billing'],
        email: user.email,
        fullName: user.fullName,
      },
    });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('update refresh_tokens'), ['old-token']);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('insert into refresh_tokens'), [
      'refresh-new',
      user.id,
      user.tenantId,
      expect.any(String),
    ]);
  });

  it('returns null when verification throws', async () => {
    verifyMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const result = await rotateRefreshToken('token');

    expect(result).toBeNull();
  });
});
