import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { presignUpload } from "../services/presign";
import { fetchObjectBuffer, getSignedObjectUrl } from "../services/s3";
import { scanBuffer } from "../services/virusScan";

const presignSchema = z.object({
  contentType: z.string(),
  filename: z.string(),
});

const completeSchema = z.object({
  key: z.string(),
  contentType: z.string().optional(),
  filename: z.string().optional(),
});

export const presignRouter = Router();

presignRouter.post("/s3", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  if (!process.env.AWS_S3_BUCKET) return res.status(400).json({ error: "S3 not configured" });
  const signed = await presignUpload(parsed.data.contentType, parsed.data.filename);
  res.json(signed);
});

// After client uploads via presigned PUT, call this to verify the object and return a signed GET.
presignRouter.post("/s3/complete", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  if (!process.env.AWS_S3_BUCKET) return res.status(400).json({ error: "S3 not configured" });

  try {
    const buffer = await fetchObjectBuffer(parsed.data.key);
    const clean = await scanBuffer(buffer);
    if (!clean) return res.status(400).json({ error: "File failed virus scan" });
    const url = await getSignedObjectUrl(parsed.data.key, 900);
    res.json({ url, storage: "s3", objectKey: parsed.data.key });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to finalize upload" });
  }
});

presignRouter.get("/s3/access/:key", requireAuth, async (req: AuthedRequest, res) => {
  if (!process.env.AWS_S3_BUCKET) return res.status(400).json({ error: "S3 not configured" });
  const key = decodeURIComponent(req.params.key!);
  try {
    const url = await getSignedObjectUrl(key, 120);
    res.json({ url, expiresIn: 120 });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to sign access" });
  }
});
