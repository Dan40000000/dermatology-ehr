import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import config from "./config";
import { logger } from "./lib/logger";
import { swaggerSpec } from "./config/swagger";
import { securityHeaders } from "./middleware/security";
import { sanitizeInputs } from "./middleware/sanitization";
import { initializeWebSocket } from "./websocket";
import { registerRoutes } from "./routes/registerRoutes";
import path from "path";
import fs from "fs";
import { waitlistAutoFillService } from "./services/waitlistAutoFillService";
import { initializeJobScheduler, stopJobScheduler } from "./services/jobRunner";

const app = express();

// Trust proxy for Railway/cloud deployments (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware (apply early in the chain)
app.use(securityHeaders);
app.use(cookieParser());
app.use(sanitizeInputs);

// CORS configuration - support explicit origin allowlist
const allowedOrigins = config.cors.origin;
const allowAnyOrigin = allowedOrigins.includes('*');
const allowedOriginUrls = allowedOrigins
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0 && origin !== '*')
  .map((origin) => {
    try {
      return new URL(origin);
    } catch (error) {
      logger.warn('Invalid CORS origin ignored', { origin });
      return null;
    }
  })
  .filter((origin): origin is URL => origin !== null);

function isOriginAllowed(origin: string): boolean {
  if (allowAnyOrigin && !config.cors.credentials) {
    return true;
  }
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  return allowedOriginUrls.some((allowed) => {
    if (allowed.port) {
      return originUrl.origin === allowed.origin;
    }
    return originUrl.protocol === allowed.protocol && originUrl.hostname === allowed.hostname;
  });
}
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    return callback(null, isOriginAllowed(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', env.tenantHeader],
}));

// Body parsing
app.use(express.json({ limit: "10mb" })); // Increased limit for base64 images
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Setup upload directory
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
// File serving is handled via signed routes (see serveUploadsRouter).

// Request logging middleware
app.use((req, _res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Swagger API Documentation
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "Dermatology EHR API Documentation",
  customCss: '.swagger-ui .topbar { display: none }',
}));

// Serve OpenAPI JSON spec
app.get("/api/openapi.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

registerRoutes(app);

// Frontend is served by separate derm-frontend service on Railway
// No need for backend to serve static files in production

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Don't leak error details in production
  const message = config.isProduction
    ? 'Internal server error'
    : err.message;

  res.status(err.status || 500).json({ error: message });
});

// Create HTTP server (required for Socket.IO)
const httpServer = http.createServer(app);

// Initialize WebSocket server
initializeWebSocket(httpServer);

httpServer.listen(env.port, () => {
  logger.info(`API server started on port ${env.port}`, {
    nodeEnv: config.env,
    port: env.port,
  });

  // Start waitlist hold expiration worker (runs every 15 minutes)
  waitlistAutoFillService.startExpirationWorker(15).then(() => {
    logger.info('Waitlist hold expiration worker started');
  }).catch((error: any) => {
    logger.error('Failed to start waitlist hold expiration worker', {
      error: error.message,
    });
  });

  // Initialize and start the job scheduler
  // Only start in production or if explicitly enabled
  const enableJobScheduler = process.env.ENABLE_JOB_SCHEDULER !== 'false';
  if (enableJobScheduler) {
    initializeJobScheduler().then(() => {
      logger.info('Job scheduler system initialized and running');
    }).catch((error: any) => {
      logger.error('Failed to initialize job scheduler', {
        error: error.message,
      });
    });
  } else {
    logger.info('Job scheduler disabled by configuration');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  stopJobScheduler();
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  stopJobScheduler();
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
