import { Request, Response, NextFunction } from "express";

type RateBucket = { count: number; resetAt: number };

export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  if (process.env.DISABLE_RATE_LIMIT === "true") {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  const buckets = new Map<string, RateBucket>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || "unknown"}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > max) {
      return res.status(429).json({ error: "Too many requests" });
    }
    return next();
  };
}
