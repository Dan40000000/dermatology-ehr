/**
 * S3 Storage Adapter
 *
 * Adapter that wraps the existing S3 service to implement IStorageService interface.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { Readable } from "stream";
import { IStorageService, StorageUploadResult } from "../../types/services";
import { logger } from "../../logger";
import { env } from "../../../config/env";

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class S3StorageAdapter implements IStorageService {
  private client: S3Client;
  private bucket: string;

  constructor(config?: Partial<S3StorageConfig>) {
    const bucket = config?.bucket || env.s3Bucket;
    const region = config?.region || env.s3Region || "us-east-1";

    if (!bucket) {
      throw new Error("S3 bucket is required. Set AWS_S3_BUCKET environment variable.");
    }

    this.bucket = bucket;

    const clientConfig: {
      region: string;
      credentials?: { accessKeyId: string; secretAccessKey: string };
    } = { region };

    const accessKeyId = config?.accessKeyId || env.s3AccessKeyId;
    const secretAccessKey = config?.secretAccessKey || env.s3SecretAccessKey;

    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }

    this.client = new S3Client(clientConfig);

    logger.info("S3StorageAdapter initialized", { bucket: this.bucket, region });
  }

  async putObject(buffer: Buffer, contentType: string, originalName: string): Promise<StorageUploadResult> {
    const key = `${Date.now()}-${crypto.randomUUID()}-${originalName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const signedUrl = await this.getSignedUrl(key);

    logger.debug("S3: file uploaded", { key, contentType, size: buffer.length });

    return { key, signedUrl };
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds }
    );
  }

  async fetchObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    const bodyStream = response.Body as Readable | undefined;
    if (!bodyStream) {
      return Buffer.from("");
    }

    return this.streamToBuffer(bodyStream);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    logger.debug("S3: file deleted", { key });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name === "NotFound") {
        return false;
      }
      throw error;
    }
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }
}
