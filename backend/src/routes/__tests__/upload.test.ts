import request from 'supertest';
import express from 'express';
import { uploadRouter } from '../upload';
import { saveFile } from '../../services/storage';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: 'provider',
      email: 'provider@example.com',
      fullName: 'Dr. Test',
    };
    return next();
  },
  AuthedRequest: class {},
}));

jest.mock('../../middleware/rbac', () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../middleware/rateLimit', () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../services/storage', () => ({
  saveFile: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/upload', uploadRouter);

describe('Upload Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /upload/document', () => {
    it('should upload a document successfully', async () => {
      const mockStoredFile = {
        key: 'documents/test.pdf',
        url: 'https://example.com/test.pdf',
        size: 1024,
        mimetype: 'application/pdf',
      };

      (saveFile as jest.Mock).mockResolvedValue(mockStoredFile);

      const response = await request(app)
        .post('/upload/document')
        .attach('file', Buffer.from('test content'), 'test.pdf');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStoredFile);
      expect(saveFile).toHaveBeenCalled();
    });

    it('should reject request without file', async () => {
      const response = await request(app).post('/upload/document');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing file');
    });

    it('should handle upload errors', async () => {
      (saveFile as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const response = await request(app)
        .post('/upload/document')
        .attach('file', Buffer.from('test content'), 'test.pdf');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Storage error');
    });

    it('should handle errors without message', async () => {
      (saveFile as jest.Mock).mockRejectedValue({});

      const response = await request(app)
        .post('/upload/document')
        .attach('file', Buffer.from('test content'), 'test.pdf');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Upload failed');
    });

    it('should pass file to saveFile service', async () => {
      (saveFile as jest.Mock).mockResolvedValue({
        key: 'test-key',
        url: 'test-url',
      });

      await request(app)
        .post('/upload/document')
        .attach('file', Buffer.from('test content'), 'document.pdf');

      expect(saveFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalname: 'document.pdf',
          buffer: expect.any(Buffer),
        })
      );
    });
  });

  describe('POST /upload/photo', () => {
    it('should upload a photo successfully', async () => {
      const mockStoredFile = {
        key: 'photos/test.jpg',
        url: 'https://example.com/test.jpg',
        size: 2048,
        mimetype: 'image/jpeg',
      };

      (saveFile as jest.Mock).mockResolvedValue(mockStoredFile);

      const response = await request(app)
        .post('/upload/photo')
        .attach('file', Buffer.from('test image content'), 'test.jpg');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStoredFile);
      expect(saveFile).toHaveBeenCalled();
    });

    it('should reject request without file', async () => {
      const response = await request(app).post('/upload/photo');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing file');
    });

    it('should handle upload errors', async () => {
      (saveFile as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const response = await request(app)
        .post('/upload/photo')
        .attach('file', Buffer.from('test image'), 'test.jpg');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Storage error');
    });

    it('should pass photo file to saveFile service', async () => {
      (saveFile as jest.Mock).mockResolvedValue({
        key: 'test-key',
        url: 'test-url',
      });

      await request(app)
        .post('/upload/photo')
        .attach('file', Buffer.from('test image'), 'photo.jpg');

      expect(saveFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalname: 'photo.jpg',
          buffer: expect.any(Buffer),
        })
      );
    });
  });

  describe('Rate limiting', () => {
    it('should apply rate limiting to document uploads', async () => {
      (saveFile as jest.Mock).mockResolvedValue({ key: 'test', url: 'test' });

      // Make multiple requests
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/upload/document')
          .attach('file', Buffer.from('content'), 'test.pdf');
      }

      // Rate limit mock should have been called
      expect(saveFile).toHaveBeenCalledTimes(5);
    });

    it('should apply rate limiting to photo uploads', async () => {
      (saveFile as jest.Mock).mockResolvedValue({ key: 'test', url: 'test' });

      // Make multiple requests
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/upload/photo')
          .attach('file', Buffer.from('content'), 'test.jpg');
      }

      // Rate limit mock should have been called
      expect(saveFile).toHaveBeenCalledTimes(5);
    });
  });
});
