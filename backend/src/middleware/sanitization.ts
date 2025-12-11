import { RequestHandler } from 'express';

// Note: express-mongo-sanitize disabled due to incompatibility with Node.js v22+
// The package tries to set req.query which is now a read-only property
// Alternative: Use Zod validation on all routes (already implemented)

// No-op middleware - sanitization handled by Zod schemas in routes
export const sanitizeInputs: RequestHandler = (req, res, next) => {
  next();
};
