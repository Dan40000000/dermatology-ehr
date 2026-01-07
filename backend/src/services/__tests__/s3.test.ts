import crypto from 'crypto';
import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { putObject, getSignedObjectUrl, fetchObjectBuffer } from '../s3';

var sendMock: jest.Mock;

jest.mock('@aws-sdk/client-s3', () => {
  sendMock = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: jest.fn((input) => ({ input })),
    GetObjectCommand: jest.fn((input) => ({ input })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('s3 service', () => {
  const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('uuid');

  beforeEach(() => {
    sendMock.mockReset();
    (getSignedUrl as jest.Mock).mockReset();
    (PutObjectCommand as jest.Mock).mockClear();
    (GetObjectCommand as jest.Mock).mockClear();
  });

  afterAll(() => {
    nowSpy.mockRestore();
    uuidSpy.mockRestore();
  });

  it('uploads objects and returns a signed url', async () => {
    sendMock.mockResolvedValueOnce({});
    (getSignedUrl as jest.Mock).mockResolvedValueOnce('https://signed.example.com');

    const buffer = Buffer.from('hello');
    const result = await putObject(buffer, 'text/plain', 'note.txt');

    expect(result).toEqual({
      key: '1700000000000-uuid-note.txt',
      signedUrl: 'https://signed.example.com',
    });
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: expect.any(String),
      Key: '1700000000000-uuid-note.txt',
      Body: buffer,
      ContentType: 'text/plain',
    });
    expect(getSignedUrl).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), { expiresIn: 900 });
  });

  it('creates signed urls for existing objects', async () => {
    (getSignedUrl as jest.Mock).mockResolvedValueOnce('https://signed.get.example.com');

    const result = await getSignedObjectUrl('object-key', 120);

    expect(result).toBe('https://signed.get.example.com');
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: expect.any(String),
      Key: 'object-key',
    });
    expect(getSignedUrl).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), { expiresIn: 120 });
  });

  it('fetches object buffers from streams', async () => {
    sendMock.mockResolvedValueOnce({ Body: Readable.from(['hello']) });

    const result = await fetchObjectBuffer('object-key');

    expect(result).toEqual(Buffer.from('hello'));
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: expect.any(String),
      Key: 'object-key',
    });
  });
});
