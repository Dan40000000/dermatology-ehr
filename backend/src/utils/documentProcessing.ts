/**
 * Document Processing Utilities
 * Handles thumbnail generation, OCR text extraction, and document preview
 */

import crypto from "crypto";
import path from "path";

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
}

export interface OCRResult {
  text: string;
  confidence: number;
  language: string;
}

/**
 * Generate thumbnail for document
 * This is a placeholder - in production, you would use libraries like:
 * - pdf-thumbnail for PDFs
 * - sharp for images
 */
export async function generateThumbnail(
  filePath: string,
  mimeType: string,
  options: ThumbnailOptions = {},
): Promise<string | null> {
  const { width = 200, height = 200, quality = 80 } = options;

  try {
    // For PDFs, you would use pdf-thumbnail or pdf-poppler
    if (mimeType === "application/pdf") {
      // TODO: Implement PDF thumbnail generation
      // const thumbnail = await pdfThumbnail(filePath, { width, height });
      // return thumbnail path
      return null; // Placeholder
    }

    // For images, you would use sharp
    if (mimeType.startsWith("image/")) {
      // TODO: Implement image thumbnail generation
      // const sharp = require('sharp');
      // await sharp(filePath)
      //   .resize(width, height, { fit: 'inside' })
      //   .jpeg({ quality })
      //   .toFile(thumbnailPath);
      // return thumbnail path
      return null; // Placeholder
    }

    return null;
  } catch (error) {
    console.error("Thumbnail generation failed:", error);
    return null;
  }
}

/**
 * Extract text from document using OCR
 * This is a placeholder - in production, you would use:
 * - Tesseract.js for local OCR
 * - AWS Textract for cloud OCR
 * - Google Cloud Vision API
 */
export async function extractTextOCR(filePath: string, mimeType: string): Promise<OCRResult | null> {
  try {
    // For PDFs with text layer
    if (mimeType === "application/pdf") {
      // TODO: Implement PDF text extraction
      // const pdfParse = require('pdf-parse');
      // const dataBuffer = fs.readFileSync(filePath);
      // const data = await pdfParse(dataBuffer);
      // return { text: data.text, confidence: 1.0, language: 'eng' };
      return null; // Placeholder
    }

    // For images using Tesseract
    if (mimeType.startsWith("image/")) {
      // TODO: Implement OCR for images
      // const Tesseract = require('tesseract.js');
      // const { data } = await Tesseract.recognize(filePath, 'eng');
      // return { text: data.text, confidence: data.confidence, language: 'eng' };
      return null; // Placeholder
    }

    return null;
  } catch (error) {
    console.error("OCR extraction failed:", error);
    return null;
  }
}

/**
 * Check if document is signable (e.g., consent forms)
 */
export function isSignableDocument(category: string, mimeType: string): boolean {
  const signableCategories = ["Consent Forms", "Authorization Forms", "Treatment Plans"];
  const signableMimeTypes = ["application/pdf"];

  return signableCategories.includes(category) && signableMimeTypes.includes(mimeType);
}

/**
 * Generate document preview URL
 */
export function generatePreviewUrl(
  documentUrl: string,
  mimeType: string,
  thumbnailUrl?: string,
): { previewUrl: string; previewType: "thumbnail" | "full" | "viewer" } {
  // If thumbnail exists, use it for preview
  if (thumbnailUrl) {
    return { previewUrl: thumbnailUrl, previewType: "thumbnail" };
  }

  // For images, use full image
  if (mimeType.startsWith("image/")) {
    return { previewUrl: documentUrl, previewType: "full" };
  }

  // For PDFs, use PDF viewer
  if (mimeType === "application/pdf") {
    return { previewUrl: documentUrl, previewType: "viewer" };
  }

  // Default to document URL
  return { previewUrl: documentUrl, previewType: "full" };
}

/**
 * Get document icon based on file type
 */
export function getDocumentIcon(mimeType: string): string {
  const iconMap: Record<string, string> = {
    "application/pdf": "file-pdf",
    "image/jpeg": "file-image",
    "image/jpg": "file-image",
    "image/png": "file-image",
    "image/tiff": "file-image",
    "image/tif": "file-image",
  };

  return iconMap[mimeType] || "file";
}

/**
 * Get badge color for document category
 */
export function getCategoryBadgeColor(category: string): string {
  const colorMap: Record<string, string> = {
    "Lab Results": "blue",
    "Pathology Reports": "purple",
    "Imaging": "teal",
    "Insurance Cards": "green",
    "Consent Forms": "orange",
    "Referrals": "pink",
    "Correspondence": "gray",
    "Other": "gray",
  };

  return colorMap[category] || "gray";
}

/**
 * Sanitize filename for security
 */
export function sanitizeFilename(filename: string): string {
  // Remove path traversal attempts
  const sanitized = filename.replace(/\.\./g, "").replace(/[\/\\]/g, "");

  // Remove special characters except alphanumeric, dash, underscore, and dot
  return sanitized.replace(/[^a-zA-Z0-9-_\.]/g, "_");
}

/**
 * Check if file is potentially malicious
 */
export function isFileSecure(filename: string, mimeType: string): { secure: boolean; reason?: string } {
  // Check for executable extensions
  const dangerousExtensions = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".vbs", ".js", ".jar"];
  const extension = path.extname(filename).toLowerCase();

  if (dangerousExtensions.includes(extension)) {
    return { secure: false, reason: "Executable files are not allowed" };
  }

  // Check MIME type mismatch
  const expectedExtensions: Record<string, string[]> = {
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/tiff": [".tiff", ".tif"],
  };

  const allowedExtensions = expectedExtensions[mimeType];
  if (allowedExtensions && !allowedExtensions.includes(extension)) {
    return { secure: false, reason: "File extension does not match MIME type" };
  }

  return { secure: true };
}
