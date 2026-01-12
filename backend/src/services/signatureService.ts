import crypto from "crypto";
import sharp from "sharp";
import { saveFileLocal } from "./storage";
import { scanBuffer } from "./virusScan";

export interface SignatureData {
  url: string;
  thumbnailUrl?: string;
  storage: "local" | "s3";
  objectKey: string;
}

/**
 * Validates base64 signature data
 */
export function validateSignatureData(base64Data: string): boolean {
  if (!base64Data || typeof base64Data !== "string") {
    return false;
  }

  // Check if it's a valid data URL
  const dataUrlPattern = /^data:image\/(png|jpeg|jpg|svg\+xml);base64,/;
  if (!dataUrlPattern.test(base64Data)) {
    return false;
  }

  // Extract base64 content
  const base64Content = base64Data.split(",")[1];
  if (!base64Content || base64Content.length < 100) {
    return false; // Too small to be a real signature
  }

  try {
    // Verify it's valid base64
    Buffer.from(base64Content, "base64");
    return true;
  } catch {
    return false;
  }
}

/**
 * Process and save signature image
 * Accepts base64 data URL (data:image/png;base64,...)
 */
export async function saveSignature(base64Data: string, patientId: string): Promise<SignatureData> {
  // Validate signature data
  if (!validateSignatureData(base64Data)) {
    throw new Error("Invalid signature data");
  }

  // Extract mime type and base64 content
  const matches = base64Data.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!matches || matches.length !== 3 || !matches[1] || !matches[2]) {
    throw new Error("Invalid data URL format");
  }

  const mimeType = matches[1];
  const base64Content = matches[2];
  const buffer = Buffer.from(base64Content, "base64");

  // Virus scan
  const scanOk = await scanBuffer(buffer);
  if (!scanOk) {
    throw new Error("Signature failed security scan");
  }

  // Determine file extension
  const extension = mimeType === "image/svg+xml" ? "svg" : "png";
  const timestamp = Date.now();
  const randomId = crypto.randomBytes(8).toString("hex");
  const filename = `signature-${patientId}-${timestamp}-${randomId}.${extension}`;

  // Create multer-like file object for saveFileLocal
  const fakeFile = {
    buffer,
    originalname: filename,
    mimetype: mimeType,
    size: buffer.length,
  } as Express.Multer.File;

  // Save original signature
  const savedFile = await saveFileLocal(fakeFile, buffer);

  // Generate thumbnail for PNG/JPEG (not for SVG)
  let thumbnailUrl: string | undefined;
  if (extension === "png") {
    try {
      const thumbnailBuffer = await sharp(buffer)
        .resize(200, 100, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();

      const thumbnailFilename = `signature-thumb-${patientId}-${timestamp}-${randomId}.png`;
      const thumbnailFile = {
        buffer: thumbnailBuffer,
        originalname: thumbnailFilename,
        mimetype: "image/png",
        size: thumbnailBuffer.length,
      } as Express.Multer.File;

      const savedThumbnail = await saveFileLocal(thumbnailFile, thumbnailBuffer);
      thumbnailUrl = savedThumbnail.url;
    } catch (err) {
      console.error("Error generating signature thumbnail:", err);
      // Don't fail if thumbnail generation fails
    }
  }

  return {
    url: savedFile.url,
    thumbnailUrl,
    storage: savedFile.storage,
    objectKey: savedFile.objectKey || filename,
  };
}

/**
 * Process and save insurance card photo
 */
export async function saveInsuranceCardPhoto(
  base64Data: string,
  patientId: string,
  side: "front" | "back"
): Promise<SignatureData> {
  // Validate data
  const dataUrlPattern = /^data:image\/(png|jpeg|jpg);base64,/;
  if (!dataUrlPattern.test(base64Data)) {
    throw new Error("Invalid insurance card photo format");
  }

  const matches = base64Data.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!matches || matches.length !== 3 || !matches[1] || !matches[2]) {
    throw new Error("Invalid data URL format");
  }

  const mimeType = matches[1];
  const base64Content = matches[2];
  const buffer = Buffer.from(base64Content, "base64");

  // Virus scan
  const scanOk = await scanBuffer(buffer);
  if (!scanOk) {
    throw new Error("Insurance card photo failed security scan");
  }

  const extension = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "jpg" : "png";
  const timestamp = Date.now();
  const randomId = crypto.randomBytes(8).toString("hex");
  const filename = `insurance-${side}-${patientId}-${timestamp}-${randomId}.${extension}`;

  // Create multer-like file object
  const fakeFile = {
    buffer,
    originalname: filename,
    mimetype: mimeType,
    size: buffer.length,
  } as Express.Multer.File;

  // Save insurance card photo
  const savedFile = await saveFileLocal(fakeFile, buffer);

  // Generate thumbnail
  let thumbnailUrl: string | undefined;
  try {
    const thumbnailBuffer = await sharp(buffer)
      .resize(400, 250, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const thumbnailFilename = `insurance-${side}-thumb-${patientId}-${timestamp}-${randomId}.jpg`;
    const thumbnailFile = {
      buffer: thumbnailBuffer,
      originalname: thumbnailFilename,
      mimetype: "image/jpeg",
      size: thumbnailBuffer.length,
    } as Express.Multer.File;

    const savedThumbnail = await saveFileLocal(thumbnailFile, thumbnailBuffer);
    thumbnailUrl = savedThumbnail.url;
  } catch (err) {
    console.error("Error generating insurance card thumbnail:", err);
  }

  return {
    url: savedFile.url,
    thumbnailUrl,
    storage: savedFile.storage,
    objectKey: savedFile.objectKey || filename,
  };
}
