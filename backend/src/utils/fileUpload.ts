/**
 * File Upload and Storage Utilities
 * Handles file uploads, validation, and storage (local/S3)
 */

import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

// Supported file types (whitelist for HIPAA compliance)
export const SUPPORTED_MIME_TYPES = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/tiff": ".tiff",
  "image/tif": ".tif",
  "image/gif": ".gif",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
} as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB default

// Magic numbers for file type validation (prevents MIME type spoofing)
const FILE_SIGNATURES: { [key: string]: number[][] } = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]], // GIF8
};

export interface FileUploadResult {
  url: string;
  objectKey: string;
  fileSize: number;
  mimeType: string;
  thumbnailUrl?: string;
}

/**
 * Validate file signature (magic numbers) to prevent MIME type spoofing
 */
function validateFileSignature(buffer: Buffer, mimeType: string): boolean {
  const signatures = FILE_SIGNATURES[mimeType];
  if (!signatures) {
    return true; // No signature check for this type
  }

  return signatures.some(signature => {
    return signature.every((byte, index) => buffer[index] === byte);
  });
}

/**
 * Validate file upload
 */
export function validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  // Check for empty files
  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  // Check MIME type
  if (!Object.keys(SUPPORTED_MIME_TYPES).includes(file.mimetype)) {
    return {
      valid: false,
      error: `Unsupported file type. Supported types: ${Object.keys(SUPPORTED_MIME_TYPES).join(", ")}`,
    };
  }

  // Validate file signature if buffer is available
  if (file.buffer && !validateFileSignature(file.buffer, file.mimetype)) {
    return { valid: false, error: 'File type does not match content (potential spoofing detected)' };
  }

  // Validate filename - prevent directory traversal
  const filename = file.originalname;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, error: 'Invalid filename' };
  }

  return { valid: true };
}

/**
 * Sanitize filename by removing dangerous characters
 */
function sanitizeFilename(filename: string): string {
  // Remove any path components
  const basename = path.basename(filename);
  // Remove special characters, keep only alphanumeric, dash, underscore, and dot
  return basename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Generate secure filename
 */
export function generateSecureFilename(originalFilename: string, mimeType: string): string {
  const extension = SUPPORTED_MIME_TYPES[mimeType as keyof typeof SUPPORTED_MIME_TYPES] || path.extname(originalFilename);
  const randomId = crypto.randomBytes(16).toString("hex");
  const timestamp = Date.now();
  // Use sanitized original filename for reference (optional)
  const sanitizedName = sanitizeFilename(originalFilename);
  const nameWithoutExt = sanitizedName.replace(path.extname(sanitizedName), '').substring(0, 50);
  return `${timestamp}-${randomId}-${nameWithoutExt}${extension}`;
}

/**
 * Store file locally
 */
export async function storeFileLocally(
  file: Express.Multer.File,
  tenantId: string,
  uploadDir: string = "/uploads/documents",
): Promise<FileUploadResult> {
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const secureFilename = generateSecureFilename(file.originalname, file.mimetype);
  const tenantDir = path.join(uploadDir, tenantId);
  const fullPath = path.join(tenantDir, secureFilename);

  // Ensure directory exists
  await fs.mkdir(tenantDir, { recursive: true });

  // Write file
  await fs.writeFile(fullPath, file.buffer);

  return {
    url: `/uploads/documents/${tenantId}/${secureFilename}`,
    objectKey: `${tenantId}/${secureFilename}`,
    fileSize: file.size,
    mimeType: file.mimetype,
  };
}

/**
 * Store file in S3 (placeholder for future implementation)
 */
export async function storeFileS3(
  file: Express.Multer.File,
  tenantId: string,
  bucket: string = "derm-app-documents",
): Promise<FileUploadResult> {
  // TODO: Implement S3 upload using AWS SDK
  // For now, fall back to local storage
  throw new Error("S3 storage not yet implemented. Use local storage.");
}

/**
 * Delete file from local storage
 */
export async function deleteFileLocally(objectKey: string, uploadDir: string = "/uploads/documents"): Promise<void> {
  const fullPath = path.join(uploadDir, objectKey);
  try {
    await fs.unlink(fullPath);
  } catch (error) {
    // Ignore if file doesn't exist
    console.error(`Failed to delete file: ${fullPath}`, error);
  }
}

/**
 * Get file info
 */
export function getFileInfo(filename: string): { extension: string; mimeType: string } {
  const extension = path.extname(filename).toLowerCase();
  const mimeType = Object.entries(SUPPORTED_MIME_TYPES).find(([, ext]) => ext === extension)?.[0] || "application/octet-stream";

  return { extension, mimeType };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
