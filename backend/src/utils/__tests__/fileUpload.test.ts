import fs from 'fs/promises';
import path from 'path';
import {
  validateFile,
  generateSecureFilename,
  SUPPORTED_MIME_TYPES,
  MAX_FILE_SIZE,
  storeFileLocally,
  deleteFileLocally,
  getFileInfo,
  formatFileSize,
} from '../fileUpload';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

const mkdirMock = fs.mkdir as jest.Mock;
const writeFileMock = fs.writeFile as jest.Mock;
const unlinkMock = fs.unlink as jest.Mock;

beforeEach(() => {
  mkdirMock.mockReset();
  writeFileMock.mockReset();
  unlinkMock.mockReset();
  mkdirMock.mockResolvedValue(undefined);
  writeFileMock.mockResolvedValue(undefined);
  unlinkMock.mockResolvedValue(undefined);
});

describe('File Upload Utilities', () => {
  describe('validateFile', () => {
    it('should reject files exceeding max size', () => {
      const mockFile = {
        size: MAX_FILE_SIZE + 1,
        mimetype: 'application/pdf',
        originalname: 'test.pdf',
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
      } as Express.Multer.File;

      const result = validateFile(mockFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File size exceeds');
    });

    it('should reject empty files', () => {
      const mockFile = {
        size: 0,
        mimetype: 'application/pdf',
        originalname: 'test.pdf',
        buffer: Buffer.from([]),
      } as Express.Multer.File;

      const result = validateFile(mockFile);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File is empty');
    });

    it('should reject unsupported file types', () => {
      const mockFile = {
        size: 1024,
        mimetype: 'application/exe',
        originalname: 'malware.exe',
        buffer: Buffer.from([0x4D, 0x5A]),
      } as Express.Multer.File;

      const result = validateFile(mockFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });

    it('should reject files with directory traversal in filename', () => {
      const mockFile = {
        size: 1024,
        mimetype: 'application/pdf',
        originalname: '../../../etc/passwd',
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
      } as Express.Multer.File;

      const result = validateFile(mockFile);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid filename');
    });

    it('should reject filenames with backslashes', () => {
      const mockFile = {
        size: 1024,
        mimetype: 'application/pdf',
        originalname: 'C:\\temp\\evil.pdf',
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
      } as Express.Multer.File;

      const result = validateFile(mockFile);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid filename');
    });

    it('should accept valid PDF file', () => {
      const mockFile = {
        size: 1024,
        mimetype: 'application/pdf',
        originalname: 'document.pdf',
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]),
      } as Express.Multer.File;

      const result = validateFile(mockFile);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept supported types without signatures', () => {
      const mockFile = {
        size: 1024,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalname: 'document.docx',
        buffer: Buffer.from([0x00, 0x01, 0x02]),
      } as Express.Multer.File;

      const result = validateFile(mockFile);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid JPEG file', () => {
      const mockFile = {
        size: 1024,
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
        buffer: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
      } as Express.Multer.File;

      const result = validateFile(mockFile);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect MIME type spoofing for PDF', () => {
      // Claim to be PDF but has wrong signature
      const mockFile = {
        size: 1024,
        mimetype: 'application/pdf',
        originalname: 'fake.pdf',
        buffer: Buffer.from([0xFF, 0xD8, 0xFF]), // Actually JPEG signature
      } as Express.Multer.File;

      const result = validateFile(mockFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('potential spoofing detected');
    });
  });

  describe('generateSecureFilename', () => {
    it('should generate filename with timestamp and random ID', () => {
      const filename = generateSecureFilename('test.pdf', 'application/pdf');

      expect(filename).toMatch(/^\d+-[a-f0-9]{32}-.*\.pdf$/);
    });

    it('should sanitize original filename', () => {
      const filename = generateSecureFilename('my doc!@#$.pdf', 'application/pdf');

      expect(filename).toContain('my_doc');
      expect(filename).not.toContain('!');
      expect(filename).not.toContain('@');
      expect(filename).not.toContain('#');
    });

    it('should use correct extension for MIME type', () => {
      const pdfFile = generateSecureFilename('test.pdf', 'application/pdf');
      expect(pdfFile).toMatch(/\.pdf$/);

      const jpgFile = generateSecureFilename('test.jpg', 'image/jpeg');
      expect(jpgFile).toMatch(/\.jpg$/);

      const pngFile = generateSecureFilename('test.png', 'image/png');
      expect(pngFile).toMatch(/\.png$/);
    });

    it('should handle long filenames by truncating', () => {
      const longName = 'a'.repeat(100) + '.pdf';
      const filename = generateSecureFilename(longName, 'application/pdf');

      // Should be truncated to reasonable length
      const parts = filename.split('-');
      expect(parts[2].length).toBeLessThanOrEqual(54); // 50 chars + .pdf
    });
  });

  describe('storeFileLocally', () => {
    it('should write file to tenant directory and return metadata', async () => {
      const mockFile = {
        size: 1024,
        mimetype: 'application/pdf',
        originalname: 'document.pdf',
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]),
      } as Express.Multer.File;

      const result = await storeFileLocally(mockFile, 'tenant-1', '/uploads');

      expect(mkdirMock).toHaveBeenCalledWith(path.join('/uploads', 'tenant-1'), { recursive: true });
      expect(writeFileMock).toHaveBeenCalledWith(expect.stringContaining(path.join('/uploads', 'tenant-1')), mockFile.buffer);
      expect(result.url).toContain('/uploads/documents/tenant-1/');
      expect(result.objectKey).toContain('tenant-1/');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.fileSize).toBe(1024);
    });
  });

  describe('deleteFileLocally', () => {
    it('should ignore missing file errors', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      unlinkMock.mockRejectedValueOnce(new Error('missing'));
      await expect(deleteFileLocally('missing.pdf', '/uploads')).resolves.toBeUndefined();
      expect(unlinkMock).toHaveBeenCalledWith(path.join('/uploads', 'missing.pdf'));
      errorSpy.mockRestore();
    });
  });

  describe('getFileInfo', () => {
    it('should return mime type for known extensions', () => {
      const info = getFileInfo('report.pdf');
      expect(info).toEqual({ extension: '.pdf', mimeType: 'application/pdf' });
    });

    it('should default to octet-stream for unknown extensions', () => {
      const info = getFileInfo('report.bin');
      expect(info).toEqual({ extension: '.bin', mimeType: 'application/octet-stream' });
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes into human readable size', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });
});
