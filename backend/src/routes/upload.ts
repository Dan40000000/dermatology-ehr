import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { rateLimit } from "../middleware/rateLimit";
import { saveFile } from "../services/storage";
import { MAX_FILE_SIZE, SUPPORTED_MIME_TYPES, validateFile } from "../utils/fileUpload";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (Object.prototype.hasOwnProperty.call(SUPPORTED_MIME_TYPES, file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported file type"));
  },
});

export const uploadRouter = Router();

function validateUploadedFile(file: Express.Multer.File, res: Response): boolean {
  const validation = validateFile(file);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error || "Invalid file" });
    return false;
  }
  return true;
}

uploadRouter.post("/document", requireAuth, requireRoles(["admin", "provider", "ma"]), rateLimit({ windowMs: 60_000, max: 60 }), upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });
  if (!validateUploadedFile(req.file, res)) return;
  try {
    const stored = await saveFile(req.file);
    res.json(stored);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Upload failed" });
  }
});

uploadRouter.post("/photo", requireAuth, requireRoles(["admin", "provider", "ma"]), rateLimit({ windowMs: 60_000, max: 60 }), upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });
  if (!validateUploadedFile(req.file, res)) return;
  try {
    const stored = await saveFile(req.file);
    res.json(stored);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Upload failed" });
  }
});

uploadRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`
      : err.message;
    return res.status(400).json({ error: message });
  }
  if (err instanceof Error && err.message === "Unsupported file type") {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});
