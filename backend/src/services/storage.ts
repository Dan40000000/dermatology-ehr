import fs from "fs";
import path from "path";
import { env } from "../config/env";
import config from "../config";
import { scanBuffer } from "./virusScan";
import { putObject } from "./s3";

export interface StoredFile {
  url: string;
  storage: "local" | "s3";
  objectKey?: string;
}

let warnedLocalFallback = false;
let warnedS3UploadFallback = false;

async function ensureBuffer(file: Express.Multer.File): Promise<Buffer> {
  if (file.buffer && file.buffer.length) return file.buffer;
  if (file.path && fs.existsSync(file.path)) {
    return fs.promises.readFile(file.path);
  }
  return Buffer.from("");
}

export async function saveFileLocal(file: Express.Multer.File, buffer?: Buffer): Promise<StoredFile> {
  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const safeName = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${file.originalname}`;
  const contents = buffer || (await ensureBuffer(file));
  await fs.promises.writeFile(path.join(uploadDir, safeName), contents);
  return { url: `/uploads/${safeName}`, storage: "local", objectKey: safeName };
}

export async function saveFile(file: Express.Multer.File): Promise<StoredFile> {
  const buffer = await ensureBuffer(file);
  const ok = await scanBuffer(buffer);
  if (!ok) {
    throw new Error("File failed virus scan");
  }
  if (env.storageProvider === "s3" && env.s3Bucket) {
    try {
      const { key, signedUrl } = await putObject(buffer, file.mimetype || "application/octet-stream", file.originalname);
      return { url: signedUrl, storage: "s3", objectKey: key };
    } catch (error: any) {
      const allowLocalFallback = config.isDevelopment || config.isTest;
      if (!allowLocalFallback) {
        throw error;
      }
      if (!warnedS3UploadFallback) {
        warnedS3UploadFallback = true;
        // eslint-disable-next-line no-console
        console.warn(`⚠️  S3 upload failed (${error?.message || "unknown error"}); falling back to local storage in non-production mode.`);
      }
      return saveFileLocal(file, buffer);
    }
  }
  if (env.storageProvider === "s3" && !warnedLocalFallback) {
    warnedLocalFallback = true;
    // eslint-disable-next-line no-console
    console.warn("⚠️  STORAGE_PROVIDER=s3 but bucket not configured; falling back to local storage.");
  }
  return saveFileLocal(file, buffer);
}
