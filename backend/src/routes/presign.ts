import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { presignUpload } from "../services/presign";
import { fetchObjectBuffer, getSignedObjectUrl } from "../services/s3";
import { scanBuffer } from "../services/virusScan";
import { loadEnv } from "../config/validate";

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

function tenantPrefix(tenantId: string): string {
  return `tenants/${tenantId}/`;
}

function isTenantKey(key: string, tenantId: string): boolean {
  return key.startsWith(tenantPrefix(tenantId));
}

presignRouter.post("/s3", requireAuth, async (req: AuthedRequest, res) => {
  const envVars = loadEnv();
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  if (!envVars.AWS_S3_BUCKET) return res.status(400).json({ error: "S3 not configured" });
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Invalid tenant" });
  const signed = await presignUpload(parsed.data.contentType, parsed.data.filename, tenantId);
  res.json(signed);
});

// After client uploads via presigned PUT, call this to verify the object and return a signed GET.
presignRouter.post("/s3/complete", requireAuth, async (req: AuthedRequest, res) => {
  const envVars = loadEnv();
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });
  if (!envVars.AWS_S3_BUCKET) return res.status(400).json({ error: "S3 not configured" });
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Invalid tenant" });
  if (!isTenantKey(parsed.data.key, tenantId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

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
  const envVars = loadEnv();
  if (!envVars.AWS_S3_BUCKET) return res.status(400).json({ error: "S3 not configured" });
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) return res.status(403).json({ error: "Invalid tenant" });
  const key = decodeURIComponent(req.params.key!);
  if (!isTenantKey(key, tenantId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const url = await getSignedObjectUrl(key, 120);
    res.json({ url, expiresIn: 120 });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to sign access" });
  }
});
