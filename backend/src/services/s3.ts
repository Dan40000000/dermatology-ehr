import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { Readable } from "stream";
import { env } from "../config/env";

let client: S3Client | null = null;

function getClient() {
  if (client) return client;

  const config: {
    region: string;
    credentials?: { accessKeyId: string; secretAccessKey: string };
  } = {
    region: env.s3Region || "us-east-1",
  };

  if (env.s3AccessKeyId && env.s3SecretAccessKey) {
    config.credentials = {
      accessKeyId: env.s3AccessKeyId,
      secretAccessKey: env.s3SecretAccessKey,
    };
  }

  client = new S3Client(config);
  return client;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function putObject(buffer: Buffer, contentType: string, originalName: string): Promise<{ key: string; signedUrl: string }> {
  const key = `${Date.now()}-${crypto.randomUUID()}-${originalName}`;
  const cli = getClient();
  await cli.send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  const signedUrl = await getSignedUrl(
    cli,
    new GetObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
    }),
    { expiresIn: 900 },
  );
  return { key, signedUrl };
}

export async function getSignedObjectUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const cli = getClient();
  return getSignedUrl(
    cli,
    new GetObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function fetchObjectBuffer(key: string): Promise<Buffer> {
  const cli = getClient();
  const res = await cli.send(
    new GetObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
    }),
  );
  const bodyStream = res.Body as Readable | undefined;
  if (!bodyStream) return Buffer.from("");
  return streamToBuffer(bodyStream);
}
