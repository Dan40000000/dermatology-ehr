import crypto from 'crypto';
import { presignUpload } from '../presign';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';

var sendMock: jest.Mock;

jest.mock('@aws-sdk/client-s3', () => {
  sendMock = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: jest.fn((input) => ({ input })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('presignUpload', () => {
  const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('uuid');

  beforeEach(() => {
    sendMock.mockReset();
    (getSignedUrl as jest.Mock).mockResolvedValue('https://signed.example.com');
    (PutObjectCommand as jest.Mock).mockClear();
  });

  afterAll(() => {
    nowSpy.mockRestore();
    uuidSpy.mockRestore();
  });

  it('returns a signed url and storage key', async () => {
    const result = await presignUpload('image/png', 'photo.png', 'tenant-1');

    expect(result).toEqual({
      url: 'https://signed.example.com',
      key: 'tenants/tenant-1/1700000000000-uuid-photo.png',
    });
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: expect.any(String),
      Key: 'tenants/tenant-1/1700000000000-uuid-photo.png',
      ContentType: 'image/png',
    });
    expect(getSignedUrl).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), { expiresIn: 900 });
  });
});
