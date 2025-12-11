import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { env } from "../config/env";

let presignClient: S3Client | null = null;

function getPresignClient() {
  if (presignClient) return presignClient;
  presignClient = new S3Client({
    region: env.s3Region || "us-east-1",
    credentials:
      env.s3AccessKeyId && env.s3SecretAccessKey
        ? { accessKeyId: env.s3AccessKeyId, secretAccessKey: env.s3SecretAccessKey }
        : undefined,
  } as any);
  return presignClient;
}

export async function presignUpload(contentType: string, filename: string) {
  const key = `${Date.now()}-${crypto.randomUUID()}-${filename}`;
  const client = getPresignClient();
  const command = new PutObjectCommand({
    Bucket: env.s3Bucket,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(client, command, { expiresIn: 900 });
  return { url, key };
}
